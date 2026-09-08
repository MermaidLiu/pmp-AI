"""Password hashing + lightweight signed tokens (no extra JWT dependency)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from app.core.config import settings


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256$120000${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds_s, salt, hexdigest = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        rounds = int(rounds_s)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds)
        return hmac.compare_digest(digest.hex(), hexdigest)
    except Exception:
        return False


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def create_access_token(payload: dict[str, Any], *, expires_hours: int = 24 * 14) -> str:
    body = {**payload, "exp": int(time.time()) + expires_hours * 3600}
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(settings.auth_secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return f"{_b64url(raw)}.{_b64url(sig)}"


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        raw_b64, sig_b64 = token.split(".", 1)
        raw = _b64url_decode(raw_b64)
        expected = hmac.new(settings.auth_secret.encode("utf-8"), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url(expected), sig_b64):
            return None
        data = json.loads(raw.decode("utf-8"))
        if int(data.get("exp") or 0) < int(time.time()):
            return None
        return data
    except Exception:
        return None
