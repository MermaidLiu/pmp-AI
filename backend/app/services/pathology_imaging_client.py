"""External pathology grading from DICOM via classmate CT module API."""

from __future__ import annotations

import asyncio
import io
import re
import zipfile
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings

DEFAULT_PATHOLOGY_IMAGING_API_URL = "http://42.81.102.195:8000/ct-module/dicom/upload"
DICOM_SUFFIXES = frozenset({".dcm", ".dicom"})
IMAGING_GRADE_TASK_IDS = frozenset({"grade-pred", "grade-subtype"})

_GRADE_KEY_HINTS = (
    "grade",
    "grade_label",
    "pathology_grade",
    "prediction",
    "predicted_class",
    "class",
    "class_name",
    "label",
    "diagnosis",
    "level",
    "risk",
    "subtype",
    "tumor_grade",
)
_CONF_KEY_HINTS = ("confidence", "score", "probability", "prob", "certainty", "risk_score")
# CT module per-slice API: resultBase64 = annotated PNG, pngBase64 = raw slice preview
_CT_MODULE_RESULT_IMAGE_KEYS = ("resultBase64", "result_base64")
_CT_MODULE_PREVIEW_IMAGE_KEYS = ("pngBase64", "png_base64")
# Prefer annotated / overlay PNG keys returned by the CT module API
_ANNOTATED_IMAGE_KEYS = (
    "result_base64",
    "resultBase64",
    "annotated_image",
    "annotatedImage",
    "annotated_image_base64",
    "annotatedImageBase64",
    "annotation_image",
    "annotationImage",
    "marked_image",
    "markedImage",
    "overlay_image",
    "overlayImage",
    "visualization_image",
    "visualizationImage",
    "visualization_png",
    "visualizationPng",
    "result_image",
    "resultImage",
    "result_png",
    "resultPng",
    "output_image",
    "outputImage",
    "image_base64",
    "imageBase64",
    "base64_png",
    "base64Png",
    "visualization",
    "heatmap",
    "mask_overlay",
    "maskOverlay",
    "image",
)
# Raw / preview images — only use when no annotated key exists
_RAW_IMAGE_KEY_FRAGMENTS = (
    "original",
    "source",
    "input",
    "raw",
    "preview",
    "thumbnail",
    "dicom",
    "slice",
    "before",
    "pngbase64",
    "png_base64",
)
_TOP_GRADE_KEYS = (
    "grade",
    "grade_label",
    "gradelevel",
    "pathology_grade",
    "pathologygrade",
    "prediction",
    "predicted_class",
    "predicted_label",
    "predicted_grade",
    "class",
    "class_name",
    "classname",
    "diagnosis",
    "diagnosis_result",
    "level",
    "label",
    "risk",
    "risk_level",
    "subtype",
    "tumor_grade",
    "who_grade",
    "病理分级",
    "病理",
    "诊断",
    "分级",
)
_CT_MODULE_SUMMARY_KEYS = ("summary", "study", "aggregate", "overall", "study_result", "studyResult")
_CT_RESULTS_KEYS = ("results", "ctResults", "ct_results")
_CT_COUNT_KEYS = ("count", "ctCount", "ct_count")


def normalize_ct_api_payload(data: Any) -> dict[str, Any]:
    """Unify legacy (results/count) and merged CT+PCI API (ctResults/ctCount/pci)."""
    if not isinstance(data, dict):
        return {}
    out = dict(data)
    if not isinstance(out.get("results"), list):
        for key in _CT_RESULTS_KEYS[1:]:
            block = out.get(key)
            if isinstance(block, list):
                out["results"] = block
                break
    if out.get("count") is None:
        for key in _CT_COUNT_KEYS[1:]:
            if out.get(key) is not None:
                out["count"] = out[key]
                break
    return out


def get_ct_results(data: dict[str, Any]) -> list[Any]:
    normalized = normalize_ct_api_payload(data)
    results = normalized.get("results")
    return results if isinstance(results, list) else []


def is_imaging_grade_task(task_id: str) -> bool:
    return task_id in IMAGING_GRADE_TASK_IDS


def collect_dicom_files(file_items: list[tuple[str, bytes]] | None) -> list[tuple[str, bytes]]:
    """Extract .dcm / .dicom from uploads and ZIP archives.

    Also accepts extension-less ZIP members that look like DICOM (DICM magic at offset 128),
    which is common for PACS exports.
    """
    if not file_items:
        return []
    out: list[tuple[str, bytes]] = []

    def _looks_like_dicom(name: str, content: bytes) -> bool:
        suffix = Path(name).suffix.lower()
        if suffix in DICOM_SUFFIXES:
            return True
        if suffix in {".nii", ".gz", ".xlsx", ".xls", ".csv", ".json", ".pdf", ".png", ".jpg", ".jpeg", ".txt"}:
            return False
        if name.lower().endswith(".nii.gz"):
            return False
        # Part 10 DICOM: "DICM" at byte 128
        if len(content) > 132 and content[128:132] == b"DICM":
            return True
        return False

    for name, content in file_items:
        suffix = Path(name).suffix.lower()
        if suffix in DICOM_SUFFIXES or (suffix not in {".zip"} and _looks_like_dicom(name, content)):
            out.append((name, content))
        elif suffix == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    for member in zf.namelist():
                        if member.endswith("/"):
                            continue
                        data = zf.read(member)
                        if _looks_like_dicom(member, data):
                            out.append((member, data))
            except zipfile.BadZipFile:
                continue
    # 去重：避免前端重复上传同一文件导致数量翻倍
    seen: set[tuple[str, int]] = set()
    unique: list[tuple[str, bytes]] = []
    for name, content in out:
        key = (Path(name).name.lower(), len(content))
        if key in seen:
            continue
        seen.add(key)
        unique.append((name, content))
    return unique


def _single_zip_upload(file_items: list[tuple[str, bytes]] | None) -> tuple[str, bytes] | None:
    if not file_items or len(file_items) != 1:
        return None
    name, content = file_items[0]
    if Path(name).suffix.lower() == ".zip" and content:
        return Path(name).name or "study.zip", content
    return None


def pack_dicom_as_zip(dicom_files: list[tuple[str, bytes]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as zf:
        used: set[str] = set()
        for idx, (name, content) in enumerate(dicom_files):
            arc = Path(name).name or f"slice_{idx + 1}.dcm"
            if Path(arc).suffix.lower() not in DICOM_SUFFIXES:
                arc = f"{arc}.dcm"
            base, ext = Path(arc).stem, Path(arc).suffix
            candidate = arc
            n = 2
            while candidate.lower() in used:
                candidate = f"{base}_{n}{ext}"
                n += 1
            used.add(candidate.lower())
            zf.writestr(candidate, content)
    return buf.getvalue()


def _is_valid_dicom_bytes(content: bytes) -> bool:
    return len(content) > 132 and content[128:132] == b"DICM"


def build_ct_multipart_files(
    dicom_files: list[tuple[str, bytes]],
) -> tuple[list[tuple[str, tuple[str, bytes, str]]], dict[str, Any]]:
    """Build multipart payload: one `files` part per .dcm (CT API rejects ZIP uploads)."""
    with_dicm: list[tuple[str, bytes]] = []
    without_dicm: list[tuple[str, bytes]] = []
    for name, content in dicom_files:
        if not content:
            continue
        if _is_valid_dicom_bytes(content):
            with_dicm.append((name, content))
        else:
            without_dicm.append((name, content))
    upload_files = with_dicm if with_dicm else without_dicm

    multipart: list[tuple[str, tuple[str, bytes, str]]] = []
    used: set[str] = set()
    for idx, (name, content) in enumerate(upload_files):
        fname = Path(name).name or f"slice_{idx + 1}.dcm"
        if Path(fname).suffix.lower() not in DICOM_SUFFIXES:
            fname = f"{fname}.dcm"
        base, ext = Path(fname).stem, Path(fname).suffix
        candidate = fname
        n = 2
        while candidate.lower() in used:
            candidate = f"{base}_{n}{ext}"
            n += 1
        used.add(candidate.lower())
        # Match curl `-F files=@*.dcm` (octet-stream); CT service rejects application/zip.
        multipart.append(("files", (candidate, content, "application/octet-stream")))
    meta = {
        "upload_format": "multipart_dcm",
        "multipart_count": len(multipart),
        "dicom_with_dicm_header": len(with_dicm),
        "dicom_without_dicm_header": len(without_dicm),
    }
    return multipart, meta


def subsample_dicom_files(
    files: list[tuple[str, bytes]],
    max_count: int,
) -> tuple[list[tuple[str, bytes]], bool]:
    """Evenly sample DICOM slices to cap memory use on the CT analysis server."""
    if max_count <= 0 or len(files) <= max_count:
        return files, False
    step = len(files) / max_count
    indices = sorted({min(int(i * step), len(files) - 1) for i in range(max_count)})
    return [files[i] for i in indices], True


def _is_memory_error(detail: str) -> bool:
    text = detail.lower()
    return any(
        token in text
        for token in (
            "cannot allocate memory",
            "bad alloc",
            "out of memory",
            "alloc_cpu",
            "defaultcpuallocator",
            "error code 12",
        )
    )


def _is_gateway_error(detail: str) -> bool:
    text = detail.lower()
    return any(token in text for token in ("http 502", "http 503", "http 504", "bad gateway", "service unavailable", "gateway timeout"))


def _is_retryable_imaging_error(detail: str) -> bool:
    text = detail.lower()
    return _is_memory_error(detail) or _is_gateway_error(detail) or any(
        token in text
        for token in (
            "timeout",
            "timed out",
            "connection reset",
            "connection refused",
            "connection error",
            "remote end closed",
            "http 500",
            "http 429",
        )
    )


def _is_dicom_rejected_error(detail: str) -> bool:
    text = detail.lower()
    return "no valid dicom" in text or ("http 400" in text and "dicom" in text)


def _friendly_imaging_error(detail: str, *, dicom_count: int, dicom_sent: int | None = None) -> str:
    sent_note = f"，本次发送 {dicom_sent} 层" if dicom_sent is not None and dicom_sent != dicom_count else ""
    if _is_dicom_rejected_error(detail):
        return (
            f"CT 服务未识别到有效 DICOM（上传共 {dicom_count} 个{sent_note}）。"
            "平台会解压 ZIP 后逐层上传 .dcm；请勿将整包 ZIP 直接发给 CT 接口。"
            "若仍失败，请确认压缩包内为真实 DICOM（含 DICM 头或 .dcm 扩展名）。"
            f" 技术详情：{detail[:280]}"
        )
    if _is_gateway_error(detail):
        return (
            f"影像诊断服务器网关异常（502/503/504，上传共 {dicom_count} 个 DICOM{sent_note}）。"
            "常见原因：CT 分析进程崩溃、nginx 反代超时或服务重启。"
            "建议等待 1–2 分钟后重试，或联系维护 CT 服务的同学。"
            f" 技术详情：{detail[:200] or 'empty response'}"
        )
    if _is_memory_error(detail):
        return (
            f"影像诊断服务器内存不足（上传共 {dicom_count} 个 DICOM{sent_note}）。"
            "建议：稍后重试；或上传更小序列/ZIP；或联系管理员为 CT 分析服务扩容/释放内存。"
            f" 技术详情：{detail[:280]}"
        )
    return detail[:500] if detail.strip() else "远端 CT 服务未返回错误详情（可能为 nginx 502 空响应）"


async def _post_pathology_imaging(
    dicom_files: list[tuple[str, bytes]],
    *,
    run_pci: bool,
    return_base64: bool = True,
) -> tuple[dict[str, Any] | None, str | None, dict[str, Any]]:
    """POST multipart to CT module — files=@*.dcm (multiple) + runPci + returnBase64."""
    url = (settings.pathology_imaging_api_url or DEFAULT_PATHOLOGY_IMAGING_API_URL).strip()
    read_timeout = max(60.0, float(settings.pathology_imaging_api_timeout))
    timeout = httpx.Timeout(connect=30.0, read=read_timeout, write=600.0, pool=30.0)
    max_attempts = max(1, int(settings.pathology_imaging_retry_count or 3))

    multipart_files, upload_meta = build_ct_multipart_files(dicom_files)
    if not multipart_files:
        return None, "HTTP 400：No valid DICOM files（本地未解析到有效 DICOM 字节）", upload_meta

    form_data: dict[str, str] = {"runPci": "true" if run_pci else "false"}
    if return_base64:
        form_data["returnBase64"] = "true"

    last_error = ""
    for attempt in range(1, max_attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, files=multipart_files, data=form_data)
                resp.raise_for_status()
                payload = normalize_ct_api_payload(resp.json())
                if isinstance(payload, dict):
                    payload["_upload_meta"] = upload_meta
                return payload, None, upload_meta
        except httpx.TimeoutException:
            last_error = (
                f"影像诊断分析接口超时（连接 30s / 读取 {int(read_timeout)}s）。"
                f"CT 合并接口同学侧约 5 分钟，若本地总耗时更长，多为浏览器→本地上传 DICOM 耗时：{url}"
            )
        except httpx.HTTPStatusError as e:
            code = e.response.status_code if e.response is not None else 0
            body = (e.response.text or "").strip()[:500] if e.response is not None else str(e)
            last_error = f"HTTP {code}：{body}"
        except Exception as e:
            last_error = str(e)

        if attempt >= max_attempts or not _is_retryable_imaging_error(last_error):
            break
        await asyncio.sleep(min(8.0, 2.0 * attempt))

    return None, last_error, upload_meta


def _slim_raw_for_client(data: Any, *, max_str_len: int = 400) -> Any:
    """Remove large base64 / binary blobs from API payload before sending to the browser."""
    if isinstance(data, dict):
        out: dict[str, Any] = {}
        for key, value in data.items():
            key_lower = str(key).lower()
            if any(h in key_lower for h in ("base64", "image", "png", "jpg", "jpeg", "dicom", "slice", "buffer", "bytes")):
                if isinstance(value, str) and len(value) > max_str_len:
                    out[key] = f"<omitted {len(value)} chars>"
                    continue
                if isinstance(value, list) and len(value) > 3:
                    out[key] = f"<omitted list len={len(value)}>"
                    continue
            slimmed = _slim_raw_for_client(value, max_str_len=max_str_len)
            if isinstance(slimmed, str) and len(slimmed) > max_str_len * 2:
                out[key] = f"<omitted {len(slimmed)} chars>"
            else:
                out[key] = slimmed
        return out
    if isinstance(data, list):
        if len(data) > 20:
            return f"<omitted list len={len(data)}>"
        return [_slim_raw_for_client(item, max_str_len=max_str_len) for item in data]
    if isinstance(data, str) and len(data) > max_str_len:
        return f"<omitted {len(data)} chars>"
    return data


def _normalize_grade_text(raw: Any) -> str:
    if raw is None:
        return ""
    text = str(raw).strip()
    if not text:
        return ""
    if re.search(r"高|high|G3|III", text, re.I):
        return "高级别"
    if re.search(r"低|low|G1|I级|良性", text, re.I):
        return "低级别"
    return text


def _looks_like_base64_image(text: str) -> bool:
    s = text.strip()
    if len(s) < 80:
        return False
    if s.startswith("data:image"):
        return True
    if s.startswith("iVBOR") or s.startswith("/9j/"):
        return True
    sample = s[:256].replace("\n", "").replace("\r", "")
    return len(s) >= 200 and bool(re.fullmatch(r"[A-Za-z0-9+/=\s]+", sample))


def _normalize_base64_image(text: str) -> str:
    s = text.strip()
    if s.startswith("data:image"):
        s = s.split(",", 1)[-1]
    return s.replace("\n", "").replace("\r", "").replace(" ", "")


def _normalize_confidence(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        confidence = float(raw)
    except (TypeError, ValueError):
        return None
    if confidence > 1.0:
        confidence = confidence / 100.0
    return max(0.0, min(1.0, confidence))


def _key_matches(key: str, hints: tuple[str, ...]) -> bool:
    lower = str(key).lower().replace("-", "_")
    hint_set = {h.lower().replace("-", "_") for h in hints}
    return lower in hint_set


def _key_is_raw_image(key: str) -> bool:
    lower = str(key).lower().replace("-", "_")
    if lower in {k.lower() for k in _CT_MODULE_PREVIEW_IMAGE_KEYS}:
        return True
    if _key_matches(lower, _ANNOTATED_IMAGE_KEYS):
        return False
    return any(fragment in lower for fragment in _RAW_IMAGE_KEY_FRAGMENTS)


def _extract_ct_module_item_image(item: dict[str, Any]) -> str:
    """CT module slice item: always use resultBase64 (annotated), never pngBase64 (preview)."""
    for key in _CT_MODULE_RESULT_IMAGE_KEYS:
        val = item.get(key)
        if isinstance(val, str) and _looks_like_base64_image(val):
            return _normalize_base64_image(val)
    return ""


def _is_ct_module_slice_result(item: dict[str, Any]) -> bool:
    return any(key in item for key in _CT_MODULE_RESULT_IMAGE_KEYS)


def _pick_representative_ct_slice(results: list[Any]) -> tuple[int, dict[str, Any] | None, str]:
    """Pick the slice whose annotated output differs most from the preview (likely lesion slice)."""
    indexed: list[tuple[int, dict[str, Any], str]] = []
    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue
        image = _extract_ct_module_item_image(item)
        if image:
            indexed.append((idx, item, image))

    if not indexed:
        return -1, None, ""

    def slice_score(entry: tuple[int, dict[str, Any], str]) -> int:
        _, item, image = entry
        preview = item.get("pngBase64") or item.get("png_base64") or ""
        if preview and image != preview:
            return len(image) + 2_000_000
        return len(image)

    idx, item, image = max(indexed, key=slice_score)
    return idx, item, image


def _grade_from_probabilities(obj: dict[str, Any]) -> tuple[Any, float | None]:
    for key in ("probabilities", "probability", "probs", "class_probs", "scores"):
        probs = obj.get(key)
        if not isinstance(probs, dict) or not probs:
            continue
        best_label = ""
        best_conf: float | None = None
        for label, val in probs.items():
            conf = _normalize_confidence(val)
            if conf is None:
                continue
            if best_conf is None or conf > best_conf:
                best_conf = conf
                best_label = str(label)
        if best_label:
            return best_label, best_conf
    return None, None


def _extract_base64_from_value(value: Any, *, allow_raw_fallback: bool = True) -> str:
    """Extract image base64; prefer annotated keys and avoid raw slice previews."""
    if isinstance(value, str) and _looks_like_base64_image(value):
        return _normalize_base64_image(value)
    if isinstance(value, list):
        preferred = ""
        fallback = ""
        for item in value:
            found = _extract_base64_from_value(item, allow_raw_fallback=allow_raw_fallback)
            if not found:
                continue
            if not fallback:
                fallback = found
            preferred = preferred or found
        return preferred or fallback
    if isinstance(value, dict):
        for key in _ANNOTATED_IMAGE_KEYS:
            for k, v in value.items():
                if str(k).lower() == key.lower():
                    found = _extract_base64_from_value(v, allow_raw_fallback=False)
                    if found:
                        return found
        preferred = ""
        fallback = ""
        for k, v in value.items():
            if _key_is_raw_image(str(k)):
                if allow_raw_fallback:
                    found = _extract_base64_from_value(v, allow_raw_fallback=True)
                    if found and not fallback:
                        fallback = found
                continue
            found = _extract_base64_from_value(v, allow_raw_fallback=allow_raw_fallback)
            if found and not preferred:
                preferred = found
        return preferred or fallback
    return ""


def _extract_result_image_b64(data: dict[str, Any]) -> str:
    """Extract annotated PNG/JPEG base64 from API JSON (prefer overlay/annotation keys)."""
    for block_key in ("result", "data", "payload", "output", *_CT_MODULE_SUMMARY_KEYS):
        block = data.get(block_key)
        if isinstance(block, dict):
            found = _extract_base64_from_value(block, allow_raw_fallback=False)
            if found:
                return found
    results = get_ct_results(data)
    if isinstance(results, list) and results:
        if any(isinstance(x, dict) and _is_ct_module_slice_result(x) for x in results):
            _, _, image = _pick_representative_ct_slice(results)
            if image:
                return image
        best_image = ""
        best_score = -1.0
        for item in results:
            if not isinstance(item, dict):
                continue
            image = _parse_result_item(item)[2]
            if not image:
                continue
            conf = _extract_confidence_from_block(item)
            conf_f = _normalize_confidence(conf)
            score = conf_f if conf_f is not None else 0.0
            if score > best_score:
                best_score = score
                best_image = image
        if best_image:
            return best_image
    for key in _ANNOTATED_IMAGE_KEYS:
        for k, v in data.items():
            if str(k).lower() == key.lower():
                found = _extract_base64_from_value(v, allow_raw_fallback=False)
                if found:
                    return found
    return _extract_base64_from_value(data, allow_raw_fallback=True)


def _extract_grade_from_block(block: dict[str, Any]) -> Any:
    for key in _TOP_GRADE_KEYS:
        for k, v in block.items():
            if _key_matches(str(k), (key,)) and v is not None and str(v).strip() and not isinstance(v, (dict, list)):
                return v
    grade_from_probs, _ = _grade_from_probabilities(block)
    if grade_from_probs:
        return grade_from_probs
    nested = block.get("result")
    if isinstance(nested, dict):
        nested_grade = _extract_grade_from_block(nested)
        if nested_grade is not None:
            return nested_grade
    return None


def _extract_confidence_from_block(block: dict[str, Any]) -> Any:
    for key in _CONF_KEY_HINTS:
        for k, v in block.items():
            if _key_matches(str(k), (key,)) and v is not None and str(v).strip() and not isinstance(v, (dict, list)):
                return v
    _, conf = _grade_from_probabilities(block)
    if conf is not None:
        return conf
    nested = block.get("result")
    if isinstance(nested, dict):
        nested_conf = _extract_confidence_from_block(nested)
        if nested_conf is not None:
            return nested_conf
    return None


def _parse_result_item(item: dict[str, Any]) -> tuple[Any, Any, str]:
    grade = _extract_grade_from_block(item) or _find_in_obj(item, _GRADE_KEY_HINTS)
    conf = _extract_confidence_from_block(item) or _find_in_obj(item, _CONF_KEY_HINTS)
    if _is_ct_module_slice_result(item):
        image = _extract_ct_module_item_image(item)
    else:
        image = _extract_base64_from_value(item, allow_raw_fallback=False)
    return grade, conf, image


def _pick_best_from_results(results: list[Any]) -> tuple[Any, Any, str]:
    best_grade: Any = None
    best_conf_raw: Any = None
    best_image = ""
    best_score = -1.0

    if any(isinstance(x, dict) and _is_ct_module_slice_result(x) for x in results):
        _, _, best_image = _pick_representative_ct_slice(results)

    for item in results:
        if not isinstance(item, dict):
            continue
        grade, conf, image = _parse_result_item(item)
        conf_f = _normalize_confidence(conf)
        score = conf_f if conf_f is not None else (0.5 if grade else 0.0)
        if image and not best_image:
            best_image = image
        if score >= best_score:
            best_score = score
            if grade is not None and str(grade).strip():
                best_grade = grade
            if conf is not None:
                best_conf_raw = conf
    return best_grade, best_conf_raw, best_image


def _extract_top_level_fields(data: dict[str, Any]) -> tuple[Any, Any]:
    top = {k: v for k, v in data.items() if k != "results"}
    grade = _extract_grade_from_block(top) or _find_in_obj(top, _GRADE_KEY_HINTS)
    conf = _extract_confidence_from_block(top) or _find_in_obj(top, _CONF_KEY_HINTS)
    return grade, conf


def _summarize_api_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Compact view of external API payload for UI debugging."""
    summary: dict[str, Any] = {
        "status": data.get("status"),
        "message": data.get("message") or data.get("msg"),
        "sessionId": data.get("sessionId") or data.get("session_id"),
        "count": data.get("count") or data.get("ctCount"),
        "ctCount": data.get("ctCount"),
    }
    pci_block = data.get("pci")
    if isinstance(pci_block, dict):
        summary["pci_preview"] = {
            "pciScore": pci_block.get("pciScore") or pci_block.get("pci_score"),
            "isPositive": pci_block.get("isPositive") or pci_block.get("is_positive"),
            "positiveRate": pci_block.get("positiveRate") or pci_block.get("positive_rate"),
            "conclusion": (
                str(pci_block.get("conclusion") or "")[:200]
                if pci_block.get("conclusion")
                else None
            ),
        }
    results = get_ct_results(data)
    if isinstance(results, list):
        preview: list[dict[str, Any]] = []
        for idx, item in enumerate(results[:5]):
            if not isinstance(item, dict):
                preview.append({"index": idx, "type": type(item).__name__})
                continue
            grade, conf, image = _parse_result_item(item)
            preview.append(
                {
                    "index": idx,
                    "keys": sorted(str(k) for k in item.keys()),
                    "parsed_grade": _normalize_grade_text(grade) or (str(grade).strip() if grade else ""),
                    "parsed_confidence": _normalize_confidence(conf),
                    "has_annotated_image": bool(image),
                    "uses_resultBase64": bool(item.get("resultBase64") or item.get("result_base64")),
                    "uses_pngBase64_preview": bool(item.get("pngBase64") or item.get("png_base64")),
                    "scalar_fields": {
                        str(k): v
                        for k, v in item.items()
                        if not isinstance(v, (dict, list)) and not _looks_like_base64_image(str(v))
                    },
                    "sc": item.get("sc"),
                }
            )
        summary["results_preview"] = preview
        if len(results) > 5:
            summary["results_truncated"] = len(results) - 5
    for list_key in ("list", "pciList", "pci_list", "regionList"):
        lst = data.get(list_key)
        if isinstance(lst, list) and lst:
            preview_items: list[dict[str, Any]] = []
            for item in lst[:13]:
                if isinstance(item, dict):
                    preview_items.append({k: item.get(k) for k in ("e", "E", "sc", "rg", "region") if k in item})
            summary[f"{list_key}_preview"] = preview_items
            if len(lst) > 13:
                summary[f"{list_key}_truncated"] = len(lst) - 13
            break
    if isinstance(results, list) and any(
        isinstance(x, dict) and _is_ct_module_slice_result(x) for x in results
    ):
        idx, item, _ = _pick_representative_ct_slice(results)
        if item is not None:
            summary["selected_slice"] = {
                "index": idx,
                "filename": item.get("filename"),
                "image_field": "resultBase64",
                "note": "pngBase64=原始切片预览，resultBase64=标注图",
            }
    for block_key in _CT_MODULE_SUMMARY_KEYS:
        block = data.get(block_key)
        if isinstance(block, dict):
            grade = _extract_grade_from_block(block)
            conf = _extract_confidence_from_block(block)
            summary[block_key] = {
                "keys": sorted(str(k) for k in block.keys()),
                "parsed_grade": _normalize_grade_text(grade) or (str(grade).strip() if grade else ""),
                "parsed_confidence": _normalize_confidence(conf),
                "has_annotated_image": bool(_extract_base64_from_value(block, allow_raw_fallback=False)),
            }
    return summary


def _find_in_obj(obj: Any, key_hints: tuple[str, ...]) -> Any:
    if isinstance(obj, dict):
        lower_map = {str(k).lower(): k for k in obj.keys()}
        for hint in key_hints:
            h = hint.lower()
            if h in lower_map:
                val = obj[lower_map[h]]
                if val is not None and str(val).strip() != "":
                    return val
        for v in obj.values():
            found = _find_in_obj(v, key_hints)
            if found is not None and str(found).strip() != "":
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_in_obj(item, key_hints)
            if found is not None and str(found).strip() != "":
                return found
    return None


def parse_grading_response(data: Any) -> dict[str, Any]:
    """Map unknown API JSON into a stable internal shape."""
    if not isinstance(data, dict):
        return {
            "status": "error",
            "message": "外部接口返回非 JSON 对象",
            "grade_label": "",
            "confidence": None,
            "result_image_base64": "",
            "raw": data,
        }

    grade_raw: Any = None
    conf_raw: Any = None
    image_b64 = ""
    selected_slice_meta: dict[str, Any] = {}

    top_grade, top_conf = _extract_top_level_fields(data)
    grade_raw = top_grade
    conf_raw = top_conf

    results = get_ct_results(data)
    if isinstance(results, list) and results:
        slice_grade, slice_conf, slice_image = _pick_best_from_results(results)
        grade_raw = grade_raw or slice_grade
        conf_raw = conf_raw or slice_conf
        if any(isinstance(x, dict) and _is_ct_module_slice_result(x) for x in results):
            idx, item, slice_image = _pick_representative_ct_slice(results)
            if slice_image:
                image_b64 = slice_image
            if item is not None:
                selected_slice_meta = {
                    "selected_slice_index": idx,
                    "selected_slice_filename": item.get("filename"),
                    "image_field": "resultBase64",
                }
        elif slice_image:
            image_b64 = slice_image

    for block_key in ("result", "data", "payload", "output", *_CT_MODULE_SUMMARY_KEYS):
        block = data.get(block_key)
        if isinstance(block, dict):
            grade_raw = grade_raw or _extract_grade_from_block(block)
            conf_raw = conf_raw or _extract_confidence_from_block(block)
            if not image_b64:
                image_b64 = _extract_base64_from_value(block, allow_raw_fallback=False)

    if grade_raw is None:
        grade_raw = _extract_grade_from_block(data) or _find_in_obj(data, _GRADE_KEY_HINTS)
    if conf_raw is None:
        conf_raw = _extract_confidence_from_block(data) or _find_in_obj(data, _CONF_KEY_HINTS)
    if not image_b64:
        image_b64 = _extract_result_image_b64(data)

    grade_label = _normalize_grade_text(grade_raw) or (str(grade_raw).strip() if grade_raw else "")
    confidence = _normalize_confidence(conf_raw)

    msg_parts: list[str] = []
    pci_block = data.get("pci")
    pci_conclusion = ""
    if isinstance(pci_block, dict):
        raw_conc = pci_block.get("conclusion")
        if isinstance(raw_conc, str) and raw_conc.strip():
            pci_conclusion = raw_conc.strip()

    if pci_conclusion:
        msg_parts.append(pci_conclusion)
    elif grade_label:
        msg_parts.append(f"影像诊断分析：{grade_label}")
    if confidence is not None and not pci_conclusion:
        msg_parts.append(f"置信度 {(confidence * 100):.0f}%")
    api_msg = data.get("message") or data.get("msg") or data.get("detail")
    if api_msg and not pci_conclusion and str(api_msg) not in msg_parts:
        msg_parts.append(str(api_msg))

    api_status = str(data.get("status") or "").lower()
    result_count = data.get("count") if data.get("count") is not None else data.get("ctCount")
    if isinstance(results, list) and not results and result_count not in (None, 0):
        msg_parts.append(f"接口声明 count={result_count} 但 results 为空，请让同学确认 CT 模块返回结构")

    status = "ok"
    if api_status in ("error", "failed", "failure"):
        status = "error"
    elif not grade_label and not image_b64:
        if api_status in ("done", "success", "ok") or data.get("success") is True or data.get("code") in (0, 200, "0", "200"):
            status = "ok"
            if not msg_parts:
                msg_parts.append("分析已完成，但未解析到诊断分级或标注图，请展开查看接口原始返回")
        else:
            status = "error"

    raw_debug = _summarize_api_payload(data)
    raw_debug.update(selected_slice_meta)
    raw_debug["slim_payload"] = _slim_raw_for_client(data)

    return {
        "status": status,
        "message": " · ".join(msg_parts) if msg_parts else "DICOM 已提交至影像诊断分析服务",
        "grade_label": grade_label,
        "confidence": confidence,
        "result_image_base64": image_b64,
        "raw": raw_debug,
    }


_PCI_REPORT_IMAGE_KEYS = (
    "pciReportImage",
    "pci_report_image",
    "reportImageBase64",
    "report_image_base64",
    "pciImageBase64",
    "pci_image_base64",
    "reportImage",
    "report_image",
)


def _extract_pci_report_image(pci_block: dict[str, Any]) -> str:
    for key in _PCI_REPORT_IMAGE_KEYS:
        val = pci_block.get(key)
        if isinstance(val, str) and _looks_like_base64_image(val):
            return _normalize_base64_image(val)
    return _extract_base64_from_value(pci_block, allow_raw_fallback=False)


def _grade_from_pci_payload(payload: dict[str, Any], pci_block: dict[str, Any]) -> str:
    for source in (pci_block, payload):
        for key in (
            "pathologyGrade",
            "pathology_grade",
            "gradeLabel",
            "grade_label",
            "pathologyGradeLabel",
        ):
            val = source.get(key)
            if val is not None and str(val).strip():
                normalized = _normalize_grade_text(val)
                return normalized or str(val).strip()
    return ""


def enrich_with_merged_ct_pci(parsed: dict[str, Any], payload: dict[str, Any], *, run_pci: bool) -> dict[str, Any]:
    """CT 合并接口：一次响应内同时含 ctResults 分割图与 pci 报告。"""
    if not run_pci or not isinstance(payload, dict):
        return parsed

    from app.services.pci_scoring_client import try_parse_embedded_pci

    embedded = try_parse_embedded_pci(payload)
    if not embedded:
        return parsed

    parsed["pci"] = embedded
    raw = dict(parsed.get("raw") or {})
    raw["pci"] = embedded
    raw["pci_merged_api"] = True
    if payload.get("sessionId"):
        raw["sessionId"] = payload.get("sessionId")
    parsed["raw"] = raw

    pci_block = payload.get("pci")
    if isinstance(pci_block, dict):
        if not parsed.get("result_image_base64"):
            seg_img = _extract_pci_report_image(pci_block)
            if seg_img:
                parsed["result_image_base64"] = seg_img
        report_img = ""
        for key in _PCI_REPORT_IMAGE_KEYS:
            val = pci_block.get(key)
            if isinstance(val, str) and _looks_like_base64_image(val):
                report_img = _normalize_base64_image(val)
                break
        if report_img:
            embedded["report_image_base64"] = report_img
            raw["pci"] = embedded
            parsed["raw"] = raw

    pci_grade = _grade_from_pci_payload(payload, pci_block if isinstance(pci_block, dict) else {})
    if pci_grade and not parsed.get("grade_label"):
        parsed["grade_label"] = pci_grade

    pci_score = embedded.get("pci_score")
    if pci_score is not None and not parsed.get("grade_label"):
        parsed["grade_label"] = f"PCI {pci_score}/36"

    msg = str(parsed.get("message") or "")
    conclusion = str(embedded.get("conclusion") or "").strip()
    if conclusion:
        msg = conclusion
    elif pci_score is not None and not parsed.get("grade_label"):
        msg = f"PCI {pci_score}/36"
    parsed["message"] = msg

    return parsed


async def predict_grade_from_imaging(
    files: list[tuple[str, bytes]] | None = None,
    *,
    return_base64: bool | None = None,  # 控制 CT 接口是否回传标注 PNG（可视化必需）
    run_pci: bool = True,
) -> dict[str, Any]:
    """Upload DICOM files to external pathology grading service."""
    if return_base64 is None:
        return_base64 = settings.pathology_imaging_return_base64_default
    dicom_files = collect_dicom_files(files)
    if not dicom_files:
        return {
            "status": "skipped",
            "message": "未检测到 DICOM 文件（.dcm / .dicom 或含 DICOM 的 ZIP），跳过影像诊断分析。",
            "grade_label": "",
            "confidence": None,
            "result_image_base64": "",
            "dicom_count": 0,
            "raw": {},
        }

    original_count = len(dicom_files)
    max_dicom = int(settings.pathology_imaging_max_dicom_files or 0)

    def _build_plans() -> list[tuple[list[tuple[str, bytes]], bool, str]]:
        plans: list[tuple[list[tuple[str, bytes]], bool, str]] = []
        primary, sampled = (
            subsample_dicom_files(dicom_files, max_dicom)
            if max_dicom > 0 and original_count > max_dicom
            else (dicom_files, False)
        )
        preface = f"已从 {original_count} 层均匀抽样 {len(primary)} 层" if sampled else ""

        plans.append((primary, run_pci, preface or "逐层 DICOM 上传"))
        if run_pci:
            plans.append((primary, False, "已跳过 PCI 联合分析以降低内存"))
        for cap in (120, 80, 48):
            if original_count > cap:
                reduced, _ = subsample_dicom_files(dicom_files, cap)
                plans.append((reduced, False, f"已均匀抽样至 {len(reduced)} 层并重试"))

        seen: set[tuple[int, bool]] = set()
        unique_plans: list[tuple[list[tuple[str, bytes]], bool, str]] = []
        for batch, pci, note in plans:
            key = (len(batch), pci)
            if key in seen:
                continue
            seen.add(key)
            unique_plans.append((batch, pci, note))
        return unique_plans

    last_error = ""
    last_sent = original_count
    last_upload_meta: dict[str, Any] = {}
    for batch, pci, note in _build_plans():
        last_sent = len(batch)
        payload, err, upload_meta = await _post_pathology_imaging(
            batch, run_pci=pci, return_base64=return_base64
        )
        last_upload_meta = upload_meta
        if payload is not None:
            parsed = parse_grading_response(payload)
            parsed = enrich_with_merged_ct_pci(parsed, payload, run_pci=pci)
            parsed["dicom_count"] = original_count
            parsed["dicom_sent"] = len(batch)
            parsed["_api_payload"] = payload
            if note:
                base_msg = str(parsed.get("message") or "")
                parsed["message"] = f"{note} · {base_msg}".strip(" ·") if base_msg else note
            if parsed["status"] == "ok" and not parsed.get("message"):
                parsed["message"] = f"已分析 {original_count} 个 DICOM 切片"
            return parsed
        last_error = err or "未知错误"
        if _is_dicom_rejected_error(last_error):
            break
        if not _is_retryable_imaging_error(last_error):
            break

    friendly = _friendly_imaging_error(last_error, dicom_count=original_count, dicom_sent=last_sent)
    return {
        "status": "error",
        "message": f"影像诊断分析接口调用失败：{friendly}",
        "grade_label": "",
        "confidence": None,
        "result_image_base64": "",
        "dicom_count": original_count,
        "dicom_sent": last_sent,
        "raw": {"last_error": last_error[:500], "upload_meta": last_upload_meta},
    }
