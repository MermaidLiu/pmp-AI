"""Free-tier LLM quota and PRO membership helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.orm import GuestQuotaORM, PlatformUserORM
from app.services.auth_security import decode_access_token


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_pro_active(user: PlatformUserORM | None) -> bool:
    if user is None or user.plan != "pro":
        return False
    if user.pro_expires_at is None:
        return True
    exp = user.pro_expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > _utc_now()


def free_quota_limit() -> int:
    return max(1, int(settings.free_llm_quota))


def get_user_by_token(db: Session, authorization: str | None) -> PlatformUserORM | None:
    if not authorization:
        return None
    token = authorization.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("uid"):
        return None
    return db.get(PlatformUserORM, int(payload["uid"]))


def get_or_create_guest(db: Session, guest_id: str) -> GuestQuotaORM:
    gid = (guest_id or "").strip()[:64]
    if not gid:
        raise HTTPException(status_code=400, detail="缺少访客标识 X-Guest-Id")
    row = db.query(GuestQuotaORM).filter(GuestQuotaORM.guest_id == gid).one_or_none()
    if row:
        return row
    row = GuestQuotaORM(guest_id=gid, llm_used=0)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def quota_snapshot(
    *,
    user: PlatformUserORM | None = None,
    guest: GuestQuotaORM | None = None,
) -> dict[str, Any]:
    limit = free_quota_limit()
    if is_pro_active(user):
        return {
            "plan": "pro",
            "is_pro": True,
            "llm_limit": None,
            "llm_used": int(user.llm_used if user else 0),
            "llm_remaining": None,
            "simple_qa_only": False,
            "pro_expires_at": user.pro_expires_at.isoformat() if user and user.pro_expires_at else None,
            "pro_price_usd": settings.pro_price_usd,
            "upgrade_required": False,
        }
    used = int(user.llm_used if user else (guest.llm_used if guest else 0))
    remaining = max(0, limit - used)
    return {
        "plan": "free",
        "is_pro": False,
        "llm_limit": limit,
        "llm_used": used,
        "llm_remaining": remaining,
        "simple_qa_only": True,
        "pro_expires_at": None,
        "pro_price_usd": settings.pro_price_usd,
        "upgrade_required": remaining <= 0,
        "email": user.email if user else None,
        "display_name": (user.display_name or user.email.split("@")[0]) if user else None,
    }


def resolve_identity(
    db: Session,
    *,
    authorization: str | None,
    guest_id: str | None,
) -> tuple[PlatformUserORM | None, GuestQuotaORM | None, dict[str, Any]]:
    user = get_user_by_token(db, authorization)
    guest = None
    if user is None:
        guest = get_or_create_guest(db, guest_id or "")
    snap = quota_snapshot(user=user, guest=guest)
    if user:
        snap["email"] = user.email
        snap["display_name"] = user.display_name or user.email.split("@")[0]
        snap["user_id"] = user.id
    elif guest:
        snap["guest_id"] = guest.guest_id
    return user, guest, snap


def require_llm_quota(
    db: Session,
    *,
    authorization: str | None,
    guest_id: str | None,
) -> tuple[PlatformUserORM | None, GuestQuotaORM | None, dict[str, Any]]:
    user, guest, snap = resolve_identity(db, authorization=authorization, guest_id=guest_id)
    if snap.get("is_pro"):
        return user, guest, snap
    if int(snap.get("llm_remaining") or 0) <= 0:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "QUOTA_EXCEEDED",
                "message": f"免费额度已用尽（{free_quota_limit()} 次模型调用）。开通 PRO（${settings.pro_price_usd:.0f}/月）可继续使用。",
                "quota": snap,
                "login_path": "/account/login",
                "billing_path": "/account/billing",
            },
        )
    return user, guest, snap


def consume_llm_quota(
    db: Session,
    *,
    user: PlatformUserORM | None,
    guest: GuestQuotaORM | None,
) -> dict[str, Any]:
    if is_pro_active(user):
        # still count for analytics, no hard limit
        if user:
            user.llm_used = int(user.llm_used or 0) + 1
            db.add(user)
            db.commit()
            db.refresh(user)
        return quota_snapshot(user=user, guest=guest)
    if user is not None:
        user.llm_used = int(user.llm_used or 0) + 1
        db.add(user)
        db.commit()
        db.refresh(user)
        return quota_snapshot(user=user, guest=guest)
    if guest is None:
        raise HTTPException(status_code=400, detail="无法扣减额度：缺少访客或用户")
    guest.llm_used = int(guest.llm_used or 0) + 1
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return quota_snapshot(user=None, guest=guest)


def activate_pro(db: Session, user: PlatformUserORM, *, days: int | None = None) -> PlatformUserORM:
    days = days if days is not None else settings.pro_duration_days
    now = _utc_now()
    base = now
    if user.pro_expires_at:
        exp = user.pro_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > now:
            base = exp
    user.plan = "pro"
    user.pro_expires_at = base + timedelta(days=days)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


async def identity_deps(
    request: Request,
    db: Session,
    authorization: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> tuple[PlatformUserORM | None, GuestQuotaORM | None, dict[str, Any]]:
    return resolve_identity(db, authorization=authorization, guest_id=x_guest_id)
