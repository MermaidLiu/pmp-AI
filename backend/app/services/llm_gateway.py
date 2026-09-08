"""OpenAI-compatible LLM gateway with selectable providers (ReachAPI / DeepSeek)."""

from __future__ import annotations

import logging
from typing import Any, Literal

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_REACHAPI_BASE = "https://direct.reachapi.ai/v1"
DEFAULT_REACHAPI_MODEL = "gpt-5.6-sol"
DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"

LlmProviderId = Literal["reachapi", "deepseek"]
PROVIDER_IDS: tuple[str, ...] = ("reachapi", "deepseek")


def normalize_provider(name: str | None) -> str:
    n = (name or "").strip().lower().replace("-", "").replace("_", "")
    if n in ("deepseek", "ds"):
        return "deepseek"
    return "reachapi"


def provider_config(name: str | None = None) -> dict[str, Any]:
    """Resolve credentials + default model for a named provider."""
    pid = normalize_provider(name)
    if pid == "deepseek":
        key = (settings.deepseek_api_key or "").strip()
        base = (settings.deepseek_base_url or DEFAULT_DEEPSEEK_BASE).strip().rstrip("/")
        model = (settings.deepseek_chat_model or DEFAULT_DEEPSEEK_MODEL).strip()
        label = "DeepSeek"
    else:
        key = (settings.reachapi_api_key or settings.openai_api_key or "").strip()
        base = (settings.reachapi_base_url or settings.openai_base_url or DEFAULT_REACHAPI_BASE)
        base = str(base).strip().rstrip("/")
        model = (settings.reachapi_chat_model or settings.research_llm_model or DEFAULT_REACHAPI_MODEL).strip()
        label = "ReachAPI"
    return {
        "id": pid,
        "label": label,
        "key": key,
        "base": base,
        "model": model,
        "configured": bool(key) and not settings.demo_mode,
    }


def default_provider() -> str:
    reach = provider_config("reachapi")
    if reach["configured"]:
        return "reachapi"
    ds = provider_config("deepseek")
    if ds["configured"]:
        return "deepseek"
    return "reachapi"


def list_provider_summaries() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for pid in PROVIDER_IDS:
        cfg = provider_config(pid)
        out.append(
            {
                "id": cfg["id"],
                "label": cfg["label"],
                "model": cfg["model"],
                "configured": cfg["configured"],
                "base_url": cfg["base"],
            }
        )
    return out


def llm_api_key(provider: str | None = None) -> str:
    return str(provider_config(provider or default_provider()).get("key") or "")


def llm_base_url(provider: str | None = None) -> str:
    return str(provider_config(provider or default_provider()).get("base") or "")


def llm_chat_model(provider: str | None = None) -> str:
    return str(provider_config(provider or default_provider()).get("model") or "")


def is_llm_available(provider: str | None = None) -> bool:
    if settings.demo_mode:
        return False
    if provider:
        return bool(provider_config(provider)["configured"])
    return any(provider_config(p)["configured"] for p in PROVIDER_IDS)


def llm_auth_headers(provider: str | None = None) -> dict[str, str]:
    key = llm_api_key(provider)
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _uses_strict_chat_params(model_id: str) -> bool:
    mid = model_id.lower()
    return any(x in mid for x in ("gpt-5.6", "gpt-5.5", "o1", "o3", "o4"))


async def chat_completions(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 2048,
    timeout: float = 120.0,
) -> tuple[str, str]:
    """Return (content, model_id). Raises on HTTP / empty response."""
    cfg = provider_config(provider or default_provider())
    if settings.demo_mode:
        raise RuntimeError("演示模式已关闭大模型调用")
    if not cfg["key"]:
        raise RuntimeError(
            f"{cfg['label']} API Key 未配置（请在 backend/.env 设置 "
            f"{'DEEPSEEK_API_KEY' if cfg['id'] == 'deepseek' else 'REACHAPI_API_KEY'}）"
        )

    model_id = (model or cfg["model"]).strip()
    url = f"{cfg['base']}/chat/completions"
    headers = llm_auth_headers(cfg["id"])
    strict_chat = _uses_strict_chat_params(model_id)
    token_key = "max_completion_tokens" if strict_chat else "max_tokens"
    body: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        token_key: max_tokens,
    }
    if not strict_chat:
        body["temperature"] = temperature

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            detail = (resp.text or "")[:800]
            if token_key == "max_tokens" and "max_completion_tokens" in detail:
                body.pop("max_tokens", None)
                body["max_completion_tokens"] = max_tokens
                resp = await client.post(url, headers=headers, json=body)
                detail = (resp.text or "")[:800]
            if "temperature" in detail and "Unsupported" in detail:
                body.pop("temperature", None)
                resp = await client.post(url, headers=headers, json=body)
                detail = (resp.text or "")[:800]
        if resp.status_code >= 400:
            detail = (resp.text or "")[:800]
            logger.error(
                "LLM chat failed provider=%s status=%s url=%s model=%s body=%s",
                cfg["id"],
                resp.status_code,
                url,
                model_id,
                detail,
            )
            raise RuntimeError(f"{cfg['label']} HTTP {resp.status_code}: {detail}")
        data = resp.json()
    if isinstance(data, dict) and data.get("error"):
        err = data["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise RuntimeError(f"{cfg['label']} error: {msg}")
    choices = data.get("choices") or []
    if not choices:
        raise ValueError(f"LLM 返回空 choices: {str(data)[:400]}")
    content = (choices[0].get("message") or {}).get("content") or ""
    content = str(content).strip()
    if not content:
        raise ValueError("LLM 返回空内容")
    return content, model_id


async def list_models(*, provider: str | None = None, timeout: float = 20.0) -> list[dict[str, Any]]:
    cfg = provider_config(provider or default_provider())
    if not cfg["configured"]:
        return []
    url = f"{cfg['base']}/models"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=llm_auth_headers(cfg["id"]))
            resp.raise_for_status()
            data = resp.json()
        rows = data.get("data") if isinstance(data, dict) else data
        if not isinstance(rows, list):
            return []
        return [r for r in rows if isinstance(r, dict) and r.get("id")]
    except Exception as exc:
        logger.warning("%s /models failed: %s", cfg["label"], exc)
        return []


async def count_models() -> int:
    rows = await list_models(provider="reachapi")
    if rows:
        return len(rows)
    return len(await list_models(provider="deepseek"))
