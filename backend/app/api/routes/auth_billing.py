"""Auth (email) + mock PRO billing (HK merchant QR)."""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.orm import PaymentOrderORM, PlatformUserORM
from app.services.auth_security import create_access_token, hash_password, verify_password
from app.services.billing_quota import (
    activate_pro,
    get_user_by_token,
    quota_snapshot,
    resolve_identity,
)

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterBody(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)
    display_name: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


class CheckoutBody(BaseModel):
    plan: str = "pro"


def _normalize_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not _EMAIL_RE.match(e):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")
    return e


def _user_public(user: PlatformUserORM) -> dict[str, Any]:
    snap = quota_snapshot(user=user)
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name or user.email.split("@")[0],
        **snap,
    }


@router.get("/quota")
def get_quota(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> dict[str, Any]:
    _user, _guest, snap = resolve_identity(db, authorization=authorization, guest_id=x_guest_id or "anonymous")
    return snap


@router.post("/register")
def register(body: RegisterBody, db: Session = Depends(get_db)) -> dict[str, Any]:
    email = _normalize_email(body.email)
    exists = db.query(PlatformUserORM).filter(PlatformUserORM.email == email).one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="该邮箱已注册，请直接登录")
    user = PlatformUserORM(
        email=email,
        password_hash=hash_password(body.password),
        display_name=(body.display_name or "").strip() or email.split("@")[0],
        plan="free",
        llm_used=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"uid": user.id, "email": user.email})
    return {"token": token, "user": _user_public(user)}


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)) -> dict[str, Any]:
    email = _normalize_email(body.email)
    user = db.query(PlatformUserORM).filter(PlatformUserORM.email == email).one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    token = create_access_token({"uid": user.id, "email": user.email})
    return {"token": token, "user": _user_public(user)}


@router.get("/me")
def me(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = get_user_by_token(db, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")
    return _user_public(user)


@router.post("/billing/checkout")
def billing_checkout(
    body: CheckoutBody,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = get_user_by_token(db, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录/注册后再开通 PRO")
    order_id = f"ORD-{uuid.uuid4().hex[:12].upper()}"
    amount = float(settings.pro_price_usd)
    merchant = settings.billing_merchant_name
    # Mock HK FPS / WeChat Pay style payload — replace with real QR from HK company later
    qr_payload = (
        f"MOCK-HK-QR|merchant={merchant}|order={order_id}|amount_usd={amount:.2f}|"
        f"plan=pro|{secrets.token_hex(8)}"
    )
    order = PaymentOrderORM(
        order_id=order_id,
        user_id=user.id,
        amount_usd=amount,
        currency="USD",
        plan="pro",
        status="pending",
        merchant_name=merchant,
        qr_payload=qr_payload,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return {
        "order_id": order.order_id,
        "amount_usd": order.amount_usd,
        "currency": order.currency,
        "plan": order.plan,
        "status": order.status,
        "merchant_name": order.merchant_name,
        "qr_payload": order.qr_payload,
        "qr_image_url": f"/api/v1/auth/billing/qr/{order.order_id}",
        "note": "演示收款码：由香港公司主体出具，当前为 Mock。点击「我已支付」即可开通 PRO。",
        "duration_days": settings.pro_duration_days,
    }


@router.get("/billing/qr/{order_id}")
def billing_qr_svg(order_id: str, db: Session = Depends(get_db)):
    from fastapi.responses import Response

    oid = order_id.removesuffix(".svg")
    order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == oid).one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    label = f"${order.amount_usd:.0f} PRO"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="280" height="320" viewBox="0 0 280 320">
  <rect width="280" height="320" fill="#fff"/>
  <rect x="20" y="20" width="240" height="240" fill="#0f172a"/>
  <rect x="36" y="36" width="208" height="208" fill="#fff"/>
  <g fill="#0f172a">
    <rect x="52" y="52" width="48" height="48"/>
    <rect x="180" y="52" width="48" height="48"/>
    <rect x="52" y="180" width="48" height="48"/>
    <rect x="112" y="112" width="56" height="56"/>
    <rect x="180" y="180" width="16" height="16"/>
    <rect x="204" y="180" width="16" height="16"/>
    <rect x="180" y="204" width="16" height="16"/>
    <rect x="68" y="128" width="12" height="12"/>
    <rect x="140" y="68" width="12" height="12"/>
    <rect x="156" y="156" width="12" height="12"/>
  </g>
  <text x="140" y="290" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#334155">{label} · Mock QR</text>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/billing/order/{order_id}")
def billing_order_status(
    order_id: str,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = get_user_by_token(db, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")
    order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    return {
        "order_id": order.order_id,
        "status": order.status,
        "amount_usd": order.amount_usd,
        "merchant_name": order.merchant_name,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "user": _user_public(user),
    }


@router.post("/billing/confirm-mock")
def billing_confirm_mock(
    body: dict[str, Any],
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Mock webhook: mark order paid and activate PRO (replace with HK payment callback)."""
    user = get_user_by_token(db, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")
    order_id = str(body.get("order_id") or "").strip()
    order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).one_or_none()
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status != "paid":
        order.status = "paid"
        order.paid_at = datetime.now(timezone.utc)
        db.add(order)
        db.commit()
        user = activate_pro(db, user)
    else:
        db.refresh(user)
    return {
        "ok": True,
        "order_id": order.order_id,
        "status": "paid",
        "user": _user_public(user),
        "message": f"PRO 已开通，有效期至 {user.pro_expires_at.isoformat() if user.pro_expires_at else '—'}",
    }
