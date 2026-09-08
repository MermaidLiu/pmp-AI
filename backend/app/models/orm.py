"""SQLAlchemy ORM: flattened patient base columns + JSON for nested interview sections."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DiseaseORM(Base):
    __tablename__ = "diseases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(256))
    category: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")


class PetCtCaseORM(Base):
    __tablename__ = "pet_ct_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # patient_base_info (flattened for query / index)
    name: Mapped[str] = mapped_column(String(128), default="")
    gender: Mapped[str] = mapped_column(String(16), default="")
    age: Mapped[int] = mapped_column(Integer, default=0)
    phone: Mapped[str] = mapped_column(String(32), default="")
    source: Mapped[str] = mapped_column(String(64), default="")
    exam_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    medical_record_id: Mapped[str] = mapped_column(String(64), default="")
    admission_id: Mapped[str] = mapped_column(String(64), default="")
    outpatient_id: Mapped[str] = mapped_column(String(64), default="")
    department: Mapped[str] = mapped_column(String(256), default="")
    doctor_phone: Mapped[str] = mapped_column(String(32), default="")
    exam_item: Mapped[str] = mapped_column(String(256), default="")
    height_cm: Mapped[float] = mapped_column(Float, default=0.0)
    weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    interview_doctor: Mapped[str] = mapped_column(String(128), default="")
    interview_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    patient_type: Mapped[list[Any]] = mapped_column(JSON, default=list)
    is_free_report: Mapped[bool] = mapped_column(Boolean, default=False)

    # Nested sections as JSONB (matches InterviewInfo / SupplementaryInterviewInfo)
    interview_info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    supplementary_interview_info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # 以病为中心与科研扩展
    disease_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("diseases.id"), nullable=True, index=True)
    patient_internal_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    research_extensions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ResearchProjectORM(Base):
    __tablename__ = "research_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text, default="")
    research_topic: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    linked_exam_ids: Mapped[list[Any]] = mapped_column(JSON, default=list)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class PlatformUserORM(Base):
    """Email-registered account; free tier or PRO subscription."""

    __tablename__ = "platform_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    email: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    display_name: Mapped[str] = mapped_column(String(128), default="")
    plan: Mapped[str] = mapped_column(String(32), default="free", index=True)  # free | pro
    llm_used: Mapped[int] = mapped_column(Integer, default=0)
    pro_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GuestQuotaORM(Base):
    """Anonymous device quota before login."""

    __tablename__ = "guest_quotas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    guest_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    llm_used: Mapped[int] = mapped_column(Integer, default=0)


class PaymentOrderORM(Base):
    """Mock HK company QR checkout orders."""

    __tablename__ = "payment_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("platform_users.id"), index=True)
    amount_usd: Mapped[float] = mapped_column(Float, default=199.0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    plan: Mapped[str] = mapped_column(String(32), default="pro")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)  # pending|paid|cancelled
    merchant_name: Mapped[str] = mapped_column(String(256), default="Hong Kong LingX Medical Tech Ltd")
    qr_payload: Mapped[str] = mapped_column(Text, default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
