"""PCI scoring via external genpci service (after CT segmentation)."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.services.pathology_imaging_client import normalize_ct_api_payload

DEFAULT_PCI_API_URL = "http://42.81.102.195:8509/genpci"
DEFAULT_DCM_UPLOAD_ROOT = "/mc/opt/PMPPredict/temp_data/dcm_uploads"

_DCM_PATH_KEYS = (
    "dcm_path",
    "dcmPath",
    "dicom_path",
    "dicomPath",
    "upload_path",
    "uploadPath",
    "save_path",
    "savePath",
    "data_path",
    "dataPath",
    "dicom_dir",
    "dicomDir",
    "dicomUrl",
    "dicom_url",
    "folder",
    "folder_path",
    "folderPath",
)

_SESSION_ID_KEYS = (
    "sessionId",
    "session_id",
    "uploadId",
    "upload_id",
    "folderId",
    "case_id",
)

# Do NOT scan raw JSON / base64 for path-like substrings (false positives on "dcm" in base64).
_PATH_SEGMENT_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def _is_valid_server_path(path: str) -> bool:
    """Reject base64 fragments and other non-filesystem paths."""
    p = path.strip().rstrip("/")
    if not p.startswith("/") or len(p) < 3 or len(p) > 512:
        return False
    if any(c in p for c in " \t\n\r\"'<>|*?;,"):
        return False
    parts = [seg for seg in p.split("/") if seg]
    if not parts:
        return False
    for seg in parts:
        if len(seg) > 128:
            return False
        if len(seg) > 40 and re.fullmatch(r"[A-Za-z0-9+/=_-]+", seg):
            return False
        if not _PATH_SEGMENT_RE.match(seg):
            return False
    return True


def _is_valid_session_token(token: str) -> bool:
    t = token.strip()
    if not t or len(t) < 4 or len(t) > 128:
        return False
    if re.match(r"^IMG\d", t, re.I):
        return False
    if not re.match(r"^[A-Za-z0-9_-]+$", t):
        return False
    if len(t) > 36 and re.search(r"[+/=]", t):
        return False
    return True


def _format_paths_tried(paths: list[str], *, max_show: int = 3) -> str:
    shown: list[str] = []
    for p in paths[:max_show]:
        shown.append(p if len(p) <= 96 else f"{p[:93]}...")
    if len(paths) > max_show:
        shown.append(f"共 {len(paths)} 条")
    return "; ".join(shown)

_PCI_EMBEDDED_KEYS = (
    "pciScore",
    "pci_score",
    "isPositive",
    "is_positive",
    "positiveRate",
    "positive_rate",
    "mesentericContracture",
    "mesenteric_contracture",
    "pmp_sc",
)

_PCI_REGION_ORDER: list[tuple[str, str, tuple[str, ...]]] = [
    ("pci0Central", "0_中央区域", ("pci0Central", "pci0")),
    ("pci1RightUpper", "1_右上区域", ("pci1RightUpper", "pci1")),
    ("pci2Epigastrium", "2_上腹部区域", ("pci2Epigastrium", "pci2")),
    ("pci3LeftUpper", "3_左上区域", ("pci3LeftUpper", "pci3")),
    ("pci4LeftFlank", "4_左侧腹部区域", ("pci4LeftFlank", "pci4RightLower", "pci4")),
    ("pci5LeftLower", "5_左下区域", ("pci5LeftLower", "pci5RightFlank", "pci5")),
    ("pci6Pelvis", "6_盆腔区域", ("pci6Pelvis", "pci6RightLowerAbdomen", "pci6")),
    ("pci7RightLower", "7_右下区域", ("pci7RightLower", "pci7LowerAbdomen", "pci7")),
    ("pci8RightFlank", "8_右侧腹部区域", ("pci8RightFlank", "pci8LeftLowerAbdomen", "pci8")),
    ("pci9UpperJejunum", "9_空肠上部区域", ("pci9UpperJejunum", "pci9LeftFlank", "pci9")),
    ("pci10LowerJejunum", "10_空肠下部区域", ("pci10LowerJejunum", "pci10LeftUpperAbdomen", "pci10")),
    ("pci11UpperIleum", "11_回肠上部区域", ("pci11UpperIleum", "pci11Jejunum", "pci11")),
    ("pci12LowerIleum", "12_回肠下部区域", ("pci12LowerIleum", "pci12")),
]


def _find_dcm_path_in_obj(obj: Any) -> str:
    if isinstance(obj, dict):
        for key in _DCM_PATH_KEYS:
            if key in obj and obj[key]:
                return str(obj[key]).strip()
        lower_map = {str(k).lower(): k for k in obj.keys()}
        for key in _DCM_PATH_KEYS:
            lk = key.lower()
            if lk in lower_map and obj[lower_map[lk]]:
                return str(obj[lower_map[lk]]).strip()
    return ""


def _path_from_template(token: str, *, exam_id: str = "") -> str:
    template = (settings.pci_dcm_path_template or "").strip()
    if not template or not token:
        return ""
    try:
        return template.format(session_id=token, sessionId=token, exam_id=exam_id or token, id=token)
    except KeyError:
        return template.replace("{session_id}", token).replace("{exam_id}", exam_id or token).replace("{id}", token)


def build_explicit_dcm_paths(payload: dict[str, Any], *, override: str = "") -> list[str]:
    """Paths explicitly returned by CT module (never guessed from sessionId)."""
    seen: set[str] = set()
    out: list[str] = []

    def add(path: str) -> None:
        p = path.strip().rstrip("/")
        if not p or p in seen or not _is_valid_server_path(p):
            return
        seen.add(p)
        out.append(p)

    if override.strip():
        add(override.strip())
    add(_find_dcm_path_in_obj(payload))
    for block_key in ("result", "data", "payload", "output", "study", "summary", "meta", "upload"):
        block = payload.get(block_key)
        if isinstance(block, dict):
            add(_find_dcm_path_in_obj(block))
    return out


def build_upload_name_dcm_paths(upload_names: list[str] | None) -> list[str]:
    """Guess server DICOM dir from uploaded ZIP / folder names."""
    if not upload_names:
        return []
    seen: set[str] = set()
    out: list[str] = []
    root = DEFAULT_DCM_UPLOAD_ROOT
    if settings.pci_dcm_path_template and "/" in settings.pci_dcm_path_template:
        root = settings.pci_dcm_path_template.rsplit("/", 1)[0]

    def add(path: str) -> None:
        p = path.strip().rstrip("/")
        if not p or p in seen or not _is_valid_server_path(p):
            return
        seen.add(p)
        out.append(p)

    for name in upload_names:
        stem = Path(name).stem.strip()
        if not stem or len(stem) > 128:
            continue
        if not re.match(r"^[A-Za-z0-9_.-]+$", stem):
            continue
        add(f"{root}/{stem}")
        add(_path_from_template(stem, exam_id=stem))
    return out


def build_guessed_dcm_paths(
    payload: dict[str, Any],
    *,
    exam_id: str = "",
    upload_names: list[str] | None = None,
) -> list[str]:
    """Fallback: sessionId / upload name + template (opt-in via PCI_PATH_GUESS)."""
    seen: set[str] = set()
    out: list[str] = []

    def add(path: str) -> None:
        p = path.strip().rstrip("/")
        if not p or p in seen or not _is_valid_server_path(p):
            return
        seen.add(p)
        out.append(p)

    id_tokens: list[str] = []
    for key in _SESSION_ID_KEYS:
        val = payload.get(key)
        if val is not None:
            token = str(val).strip()
            if _is_valid_session_token(token):
                id_tokens.append(token)
    if exam_id and _is_valid_session_token(exam_id.strip()):
        id_tokens.append(exam_id.strip())

    root = DEFAULT_DCM_UPLOAD_ROOT
    if settings.pci_dcm_path_template and "/" in settings.pci_dcm_path_template:
        root = settings.pci_dcm_path_template.rsplit("/", 1)[0]

    for token in id_tokens:
        add(_path_from_template(token, exam_id=token))
        add(f"{root}/{token}")
    for path in build_upload_name_dcm_paths(upload_names):
        add(path)
    return out


def build_dcm_path_candidates(
    payload: dict[str, Any],
    *,
    exam_id: str = "",
    upload_names: list[str] | None = None,
) -> list[str]:
    """Explicit CT paths first; optional template guess if enabled."""
    out = build_explicit_dcm_paths(payload)
    if settings.pci_path_guess:
        for path in build_guessed_dcm_paths(payload, exam_id=exam_id, upload_names=upload_names):
            if path not in out:
                out.append(path)
    return out


def extract_dcm_path_from_ct_payload(payload: dict[str, Any], *, exam_id: str = "") -> str:
    candidates = build_dcm_path_candidates(payload, exam_id=exam_id)
    return candidates[0] if candidates else ""


_SLICE_SC_KEYS = ("sc", "slice_score", "sliceScore", "SC")
_SLICE_REGION_KEYS = (
    "e",
    "E",
    "rg",
    "region",
    "regionId",
    "region_id",
    "pciRegion",
    "pci_region",
    "zone",
    "pci_idx",
    "pciIndex",
    "r",
)


def _build_pci_from_regions(
    region_scores: dict[int, int],
    *,
    payload: dict[str, Any] | None = None,
    source: str = "ct_region_list",
) -> dict[str, Any]:
    """Build PCI result from region index → score map (e.g. list[{e, sc}])."""
    payload = payload or {}
    regions: list[dict[str, Any]] = []
    for region_idx, (canonical_key, label, _aliases) in enumerate(_PCI_REGION_ORDER):
        regions.append(
            {
                "index": region_idx,
                "key": canonical_key,
                "label": label,
                "score": region_scores.get(region_idx),
            }
        )
    pci_score = sum(region_scores.values())
    return {
        "status": "ok",
        "message": f"PCI 总分 {pci_score}/36（CT 返回 list · {len(region_scores)} 区有评分）",
        "pci_score": pci_score,
        "is_positive": _to_int(payload.get("isPositive") or payload.get("is_positive")),
        "positive_rate": _to_float(payload.get("positiveRate") or payload.get("positive_rate")),
        "mesenteric_contracture": _to_int(payload.get("mesentericContracture") or payload.get("mesenteric_contracture")),
        "regions": regions,
        "slice_scores": [],
        "conclusion": _build_pci_conclusion(
            payload,
            is_positive=_to_int(payload.get("isPositive") or payload.get("is_positive")),
            positive_rate=_to_float(payload.get("positiveRate") or payload.get("positive_rate")),
            mesenteric=_to_int(payload.get("mesentericContracture") or payload.get("mesenteric_contracture")),
        ),
        "dcm_path_used": "",
        "raw": {
            "source": source,
            "region_list": [{"e": e, "sc": s} for e, s in sorted(region_scores.items())],
            "sessionId": payload.get("sessionId") or payload.get("session_id"),
        },
        "source": source,
    }


def _parse_region_list_array(items: list[Any]) -> dict[int, int] | None:
    region_scores: dict[int, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        sc_raw = item.get("sc") if "sc" in item else _pick_item_scalar(item, _SLICE_SC_KEYS)
        if sc_raw is None:
            continue
        sc = _to_int(sc_raw)
        if sc is None:
            continue
        e_raw = item.get("e") if "e" in item else _pick_item_scalar(item, _SLICE_REGION_KEYS)
        e = _to_int(e_raw)
        if e is None or not (0 <= e <= 12):
            continue
        region_scores[e] = max(region_scores.get(e, 0), sc)
    return region_scores if region_scores else None


def try_parse_pci_from_region_list(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """Parse CT/genpci region PCI: list[{e: 0..12, sc: 0..3}, ...]."""
    if not isinstance(payload, dict):
        return None

    list_keys = ("list", "pciList", "pci_list", "regionList", "region_list", "pciRegions", "regions")
    for key in list_keys:
        block = payload.get(key)
        if isinstance(block, list):
            region_scores = _parse_region_list_array(block)
            if region_scores:
                return _build_pci_from_regions(region_scores, payload=payload)

    for block_key in ("result", "data", "pci", "summary", "output"):
        block = payload.get(block_key)
        if isinstance(block, dict):
            nested = try_parse_pci_from_region_list(block)
            if nested:
                return nested
    return None


def _pick_item_scalar(item: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in item and item[key] is not None and str(item[key]).strip() != "":
            return item[key]
    lower_map = {str(k).lower(): k for k in item.keys()}
    for key in keys:
        lk = key.lower()
        if lk in lower_map and item[lower_map[lk]] is not None and str(item[lower_map[lk]]).strip() != "":
            return item[lower_map[lk]]
    return None


def build_pci_from_slice_scores(
    slice_scores: list[dict[str, Any]],
    *,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Aggregate PCI display payload from per-slice sc records."""
    if not slice_scores:
        return {}

    region_max: dict[int, int] = {}
    for row in slice_scores:
        sc = _to_int(row.get("sc"))
        if sc is None:
            continue
        region = _to_int(row.get("region"))
        if region is not None and 0 <= region <= 12:
            region_max[region] = max(region_max.get(region, 0), sc)

    regions: list[dict[str, Any]] = []
    for region_idx, (canonical_key, label, _aliases) in enumerate(_PCI_REGION_ORDER):
        regions.append(
            {
                "index": region_idx,
                "key": canonical_key,
                "label": label,
                "score": region_max.get(region_idx) if region_idx in region_max else None,
            }
        )

    has_regions = bool(region_max)
    pci_score: int | None = sum(region_max.values()) if has_regions else None
    payload = payload or {}
    if pci_score is None:
        embedded = try_parse_embedded_pci(payload)
        if embedded and embedded.get("pci_score") is not None:
            pci_score = embedded.get("pci_score")
            if embedded.get("regions"):
                regions = embedded["regions"]

    positive_slices = sum(1 for s in slice_scores if (_to_int(s.get("sc")) or 0) > 0)
    msg = f"已读取 {len(slice_scores)} 层 sc 评分"
    if has_regions and pci_score is not None:
        msg += f" · PCI 总分 {pci_score}/36（按 rg/region 聚合）"
    elif pci_score is not None:
        msg += f" · PCI 总分 {pci_score}/36"
    else:
        msg += f" · {positive_slices} 层 sc>0"

    return {
        "status": "ok",
        "message": msg,
        "pci_score": pci_score,
        "is_positive": _to_int(payload.get("isPositive") or payload.get("is_positive")),
        "positive_rate": _to_float(payload.get("positiveRate") or payload.get("positive_rate")),
        "mesenteric_contracture": _to_int(payload.get("mesentericContracture") or payload.get("mesenteric_contracture")),
        "regions": regions,
        "slice_scores": slice_scores,
        "conclusion": _build_pci_conclusion(
            payload,
            is_positive=_to_int(payload.get("isPositive") or payload.get("is_positive")),
            positive_rate=_to_float(payload.get("positiveRate") or payload.get("positive_rate")),
            mesenteric=_to_int(payload.get("mesentericContracture") or payload.get("mesenteric_contracture")),
        ),
        "dcm_path_used": "",
        "raw": {
            "source": "ct_slices",
            "slice_count": len(slice_scores),
            "slices_with_sc_gt0": positive_slices,
            "sessionId": payload.get("sessionId") or payload.get("session_id"),
        },
        "source": "ct_slices",
    }


def try_parse_pci_from_manifest(manifest: dict[str, Any]) -> dict[str, Any] | None:
    slices = manifest.get("slices")
    if not isinstance(slices, list):
        return None
    slice_scores = [
        {
            "index": int(s.get("index") or 0),
            "filename": str(s.get("filename") or ""),
            "sc": _to_int(s.get("sc")),
            "region": _to_int(s.get("region")),
        }
        for s in slices
        if isinstance(s, dict) and s.get("sc") is not None
    ]
    slice_scores = [s for s in slice_scores if s.get("sc") is not None]
    if not slice_scores:
        return None
    payload = {"sessionId": manifest.get("session_id"), "session_id": manifest.get("session_id")}
    return build_pci_from_slice_scores(slice_scores, payload=payload)


def try_parse_pci_from_ct_slices(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """Build PCI / slice scores from CT module results[].sc (per-slice score)."""
    if not isinstance(payload, dict):
        return None
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return None

    slice_scores: list[dict[str, Any]] = []
    region_max: dict[int, int] = {}

    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue
        sc_raw = _pick_item_scalar(item, _SLICE_SC_KEYS)
        region_raw = _pick_item_scalar(item, _SLICE_REGION_KEYS)
        nested = item.get("result")
        if sc_raw is None and isinstance(nested, dict):
            sc_raw = _pick_item_scalar(nested, _SLICE_SC_KEYS)
            if region_raw is None:
                region_raw = _pick_item_scalar(nested, _SLICE_REGION_KEYS)
        if sc_raw is None:
            for k, v in item.items():
                if str(k).lower() == "sc" and v is not None and str(v).strip() != "":
                    sc_raw = v
                    break
        if sc_raw is None:
            continue
        sc = _to_int(sc_raw)
        if sc is None:
            continue
        region_raw = (
            item.get("e")
            if "e" in item
            else (_pick_item_scalar(item, _SLICE_REGION_KEYS) if region_raw is None else region_raw)
        )
        if region_raw is None and isinstance(nested, dict):
            region_raw = nested.get("e") if "e" in nested else _pick_item_scalar(nested, _SLICE_REGION_KEYS)
        region = _to_int(region_raw) if region_raw is not None else None
        filename = str(item.get("filename") or item.get("fileName") or f"slice_{idx + 1}.dcm")
        slice_scores.append(
            {
                "index": idx,
                "filename": filename,
                "sc": sc,
                "region": region if region is not None and 0 <= region <= 12 else None,
            }
        )
        if region is not None and 0 <= region <= 12:
            region_max[region] = max(region_max.get(region, 0), sc)

    if not slice_scores:
        return None

    return build_pci_from_slice_scores(slice_scores, payload=payload)


def try_parse_embedded_pci(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """If CT module already returned PCI fields, parse them directly."""
    if not isinstance(payload, dict):
        return None

    pci_block = payload.get("pci")
    if isinstance(pci_block, dict):
        parsed = parse_pci_response(pci_block)
        if parsed.get("status") == "ok" and (
            parsed.get("pci_score") is not None
            or any(r.get("score") is not None for r in parsed.get("regions") or [])
            or parsed.get("is_positive") is not None
            or parsed.get("conclusion")
        ):
            parsed["source"] = "ct_merged_pci"
            parsed["raw"] = {**(parsed.get("raw") or {}), "ct_merged": True}
            return parsed

    flat_pci_keys = any(k in payload for k in _PCI_EMBEDDED_KEYS) or any(
        str(k).lower().startswith("pci") and str(k).lower() != "pci" and not isinstance(payload.get(k), dict)
        for k in payload
    )
    if flat_pci_keys:
        parsed = parse_pci_response(payload)
        if parsed.get("status") == "ok" and (
            parsed.get("pci_score") is not None
            or any(r.get("score") is not None for r in parsed.get("regions") or [])
            or parsed.get("is_positive") is not None
        ):
            parsed["source"] = "ct_payload"
            return parsed

    for block_key in ("pci_result", "pmp", "score", "result", "data"):
        block = payload.get(block_key)
        if isinstance(block, dict):
            nested = try_parse_embedded_pci(block)
            if nested:
                return nested
    return None


def _to_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _to_int(val: Any) -> int | None:
    f = _to_float(val)
    if f is None:
        return None
    return int(round(f))


def _region_score_from_data(data: dict[str, Any], aliases: tuple[str, ...]) -> int | None:
    for key in aliases:
        if key in data:
            return _to_int(data.get(key))
    lower_map = {str(k).lower(): k for k in data.keys()}
    for key in aliases:
        lk = key.lower()
        if lk in lower_map:
            return _to_int(data.get(lower_map[lk]))
    return None


def _build_pci_conclusion(
    data: dict[str, Any],
    *,
    is_positive: int | None,
    positive_rate: float | None,
    mesenteric: int | None,
) -> str:
    for key in ("conclusion", "report", "summary", "diagnosis", "pathologyReport", "pathology_report"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    parts: list[str] = []
    if is_positive is not None:
        rate_text = "—"
        if positive_rate is not None:
            rate_text = f"{positive_rate:.1f}" if positive_rate <= 1 else f"{positive_rate:.1f}%"
        parts.append(f"检测结果为：{'阳性' if is_positive else '阴性'}（阳性概率为 {rate_text}）。")

    grade = (
        data.get("pathologyGrade")
        or data.get("pathology_grade")
        or data.get("gradeLabel")
        or data.get("grade_label")
        or data.get("pathologyGradeLabel")
    )
    if isinstance(grade, str) and grade.strip():
        parts.append(f"病理分级为 {grade.strip()}。")

    detail = data.get("pathologyDetail") or data.get("pathology_detail") or data.get("lesionDescription")
    if isinstance(detail, str) and detail.strip():
        parts.append(detail.strip())

    if mesenteric:
        parts.append("存在肠系膜挛缩现象。")
    elif mesenteric == 0:
        parts.append("未见明显肠系膜挛缩。")

    return "".join(parts)


def parse_pci_response(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {
            "status": "error",
            "message": "PCI 接口返回非 JSON 对象",
            "pci_score": None,
            "regions": [],
            "raw": data,
        }

    result_flag = str(data.get("result") or data.get("status") or "").lower()
    ok = result_flag in ("ok", "success", "done") or data.get("pmp_sc") in (200, "200")

    pci_score = _to_int(data.get("pciScore") or data.get("pci_score"))
    is_positive = _to_int(data.get("isPositive") or data.get("is_positive"))
    positive_rate = _to_float(data.get("positiveRate") or data.get("positive_rate"))
    mesenteric = _to_int(data.get("mesentericContracture") or data.get("mesenteric_contracture"))

    regions: list[dict[str, Any]] = []
    known_keys: set[str] = set()
    for canonical_key, label, aliases in _PCI_REGION_ORDER:
        known_keys.update(aliases)
        known_keys.add(canonical_key)
        score = _region_score_from_data(data, aliases)
        regions.append({"index": len(regions), "key": canonical_key, "label": label, "score": score})

    for k, v in data.items():
        if not isinstance(k, str):
            continue
        if k in known_keys or k in ("pciScore", "pci_score"):
            continue
        if re.match(r"^pci\d+", k, re.I):
            idx_match = re.match(r"^pci(\d+)", k, re.I)
            idx = int(idx_match.group(1)) if idx_match else -1
            if 0 <= idx < len(_PCI_REGION_ORDER) and regions[idx]["score"] is None:
                regions[idx]["score"] = _to_int(v)

    if pci_score is None and any(r.get("score") is not None for r in regions):
        pci_score = sum(int(r["score"] or 0) for r in regions)

    conclusion = _build_pci_conclusion(
        data,
        is_positive=is_positive,
        positive_rate=positive_rate,
        mesenteric=mesenteric,
    )

    report_image = ""
    for key in (
        "pciReportImage",
        "pci_report_image",
        "reportImageBase64",
        "report_image_base64",
        "pciImageBase64",
        "pci_image_base64",
    ):
        val = data.get(key)
        if isinstance(val, str) and len(val.strip()) > 80:
            report_image = val.strip()
            break

    msg_parts: list[str] = []
    if pci_score is not None:
        msg_parts.append(f"PCI 总分 {pci_score}/36")
    if is_positive is not None:
        msg_parts.append("阳性" if is_positive else "阴性")
    if positive_rate is not None:
        msg_parts.append(f"阳性概率 {(positive_rate * 100):.1f}%")
    if mesenteric is not None:
        msg_parts.append("肠系膜挛缩(+)" if mesenteric else "肠系膜挛缩(-)")

    has_pci_data = (
        pci_score is not None
        or any(r.get("score") is not None for r in regions)
        or is_positive is not None
    )
    if not has_pci_data:
        list_pci = try_parse_pci_from_region_list(data)
        if list_pci:
            list_pci["dcm_path_used"] = str(data.get("_dcm_path_used") or "")
            list_pci["source"] = "genpci"
            list_pci["raw"] = {
                **(list_pci.get("raw") or {}),
                **{k: v for k, v in data.items() if not str(k).startswith("_")},
            }
            return list_pci

    if ok and not has_pci_data:
        status = "ok"
        msg_parts.append("PCI 接口已响应（pmp_sc=200），但未返回 pciScore 等评分字段，请确认 genpci 完整输出")
    elif ok or has_pci_data:
        status = "ok"
    else:
        status = "error"
        msg_parts.append(str(data.get("message") or data.get("detail") or "PCI 评分失败"))

    return {
        "status": status,
        "message": " · ".join(msg_parts) if msg_parts else "PCI 评分完成",
        "pci_score": pci_score,
        "is_positive": is_positive,
        "positive_rate": positive_rate,
        "mesenteric_contracture": mesenteric,
        "regions": regions,
        "conclusion": conclusion,
        "report_image_base64": report_image,
        "dcm_path_used": str(data.get("_dcm_path_used") or ""),
        "raw": {k: v for k, v in data.items() if not str(k).startswith("_")},
    }


async def predict_pci_score(dcm_path: str) -> dict[str, Any]:
    path = dcm_path.strip()
    if not path:
        return {
            "status": "skipped",
            "message": "未获取 DICOM 目录路径",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "paths_tried": [],
        }
    if not _is_valid_server_path(path):
        return {
            "status": "error",
            "message": f"无效的 DICOM 路径（已跳过）：{path[:96]}{'…' if len(path) > 96 else ''}",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "dcm_path_used": path,
            "paths_tried": [path],
        }

    url = (settings.pci_api_url or DEFAULT_PCI_API_URL).strip()
    timeout = httpx.Timeout(connect=30.0, read=max(120.0, float(settings.pci_api_timeout)), write=60.0, pool=30.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json={"dcm_path": path})
            resp.raise_for_status()
            payload = resp.json()
    except httpx.TimeoutException:
        return {
            "status": "error",
            "message": f"PCI 接口超时（{int(settings.pci_api_timeout)}s）",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "dcm_path_used": path,
            "paths_tried": [path],
        }
    except httpx.HTTPStatusError as e:
        detail = e.response.text[:500] if e.response is not None else str(e)
        return {
            "status": "error",
            "message": f"PCI HTTP {e.response.status_code}：{detail}",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "dcm_path_used": path,
            "paths_tried": [path],
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"PCI 调用失败：{e}",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "dcm_path_used": path,
            "paths_tried": [path],
        }

    if isinstance(payload, dict):
        payload = {**payload, "_dcm_path_used": path}
    parsed = parse_pci_response(payload)
    parsed["dcm_path_used"] = path
    parsed["paths_tried"] = [path]
    parsed["source"] = "genpci"
    return parsed


def _pci_has_score_data(result: dict[str, Any]) -> bool:
    return bool(
        result.get("status") == "ok"
        and (
            result.get("pci_score") is not None
            or any(r.get("score") is not None for r in result.get("regions") or [])
            or result.get("is_positive") is not None
            or (result.get("slice_scores") or [])
        )
    )


def _is_retryable_pci_error(message: str) -> bool:
    msg = message.lower()
    return any(
        hint in msg
        for hint in (
            "path not found",
            "no such file",
            "not found",
            "need at least one array",
            "stack",
            "empty",
            "no dicom",
            "timeout",
            "connection",
        )
    )


async def predict_pci_score_with_polling(
    candidates: list[str],
    *,
    poll_interval: float | None = None,
    max_attempts: int | None = None,
) -> dict[str, Any]:
    """Try genpci on candidate paths; poll when DICOM may still be landing on disk."""
    paths = [p.strip() for p in candidates if p.strip()]
    if not paths:
        return {
            "status": "skipped",
            "message": "未获取 DICOM 目录路径",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "paths_tried": [],
        }

    interval = poll_interval if poll_interval is not None else settings.pci_poll_interval_seconds
    attempts = max(1, max_attempts if max_attempts is not None else settings.pci_poll_max_attempts)
    tried: list[str] = []
    last: dict[str, Any] | None = None

    for attempt in range(attempts):
        for path in paths[:5]:
            if path not in tried:
                tried.append(path)
            result = await predict_pci_score(path)
            result["paths_tried"] = list(dict.fromkeys(tried))
            if _pci_has_score_data(result):
                result["message"] = (
                    f"{result.get('message', '')} · 轮询第 {attempt + 1}/{attempts} 次成功"
                ).strip(" ·")
                result["raw"] = {**(result.get("raw") or {}), "poll_attempt": attempt + 1}
                return result
            last = result
            if result.get("status") == "error" and not _is_retryable_pci_error(str(result.get("message") or "")):
                return result

        if attempt + 1 < attempts:
            await asyncio.sleep(max(1.0, interval))

    tried_summary = _format_paths_tried(list(dict.fromkeys(tried)))
    if last:
        last["paths_tried"] = list(dict.fromkeys(tried))
        last["message"] = (
            f"genpci 轮询 {attempts} 次仍未获得 PCI 评分（{tried_summary}）。"
            f"最后错误：{last.get('message', '')}"
        )
        last["raw"] = {**(last.get("raw") or {}), "poll_attempts": attempts}
        return last

    return {
        "status": "error",
        "message": f"genpci 轮询失败（{tried_summary}）",
        "pci_score": None,
        "regions": [],
        "raw": {"poll_attempts": attempts},
        "paths_tried": list(dict.fromkeys(tried)),
    }


async def predict_pci_after_segmentation(
    ct_payload: dict[str, Any] | None,
    *,
    exam_id: str = "",
    dcm_path_override: str = "",
    upload_names: list[str] | None = None,
    segmentation_complete: bool = False,
    ct_run_pci: bool = False,
) -> dict[str, Any]:
    """Run PCI scoring after CT module segmentation completes."""
    payload = normalize_ct_api_payload(ct_payload or {})
    if not settings.pci_enabled:
        return {
            "status": "skipped",
            "message": "PCI 评分未启用（PCI_ENABLED=0）",
            "pci_score": None,
            "regions": [],
            "raw": {},
            "paths_tried": [],
        }

    # 1) Merged CT API: top-level pci { pciScore, pci0Central, ... }
    embedded = try_parse_embedded_pci(payload)
    if embedded and (
        embedded.get("pci_score") is not None
        or any(r.get("score") is not None for r in embedded.get("regions") or [])
        or embedded.get("is_positive") is not None
        or embedded.get("conclusion")
    ):
        embedded["source"] = embedded.get("source") or "ct_payload"
        return embedded

    # 2) 13 区 PCI：list[{e, sc}, ...]
    region_list_pci = try_parse_pci_from_region_list(payload)
    if region_list_pci:
        return region_list_pci

    # 3) Per-slice sc from CT results
    ct_slices = try_parse_pci_from_ct_slices(payload)
    if ct_slices and ct_slices.get("slice_scores"):
        return ct_slices

    session_hint = str(payload.get("sessionId") or payload.get("session_id") or "").strip()
    pending_status = "pending" if segmentation_complete else "skipped"
    pending_prefix = "分割与勾画已完成。" if segmentation_complete else ""

    if ct_run_pci:
        return {
            "status": pending_status,
            "message": (
                f"{pending_prefix}CT 合并接口已请求 runPci，但响应中未包含 pci 评分字段。"
                "请确认 CT 服务已更新并在响应中返回 pci 对象（pciScore、pci0Central 等）。"
            ),
            "pci_score": None,
            "regions": [],
            "slice_scores": [],
            "raw": {
                "sessionId": session_hint,
                "segmentation_complete": segmentation_complete,
                "ct_run_pci": True,
                "pci_keys_in_response": sorted(str(k) for k in payload.keys()),
            },
            "paths_tried": [],
        }

    explicit_paths = build_explicit_dcm_paths(payload, override=dcm_path_override.strip())
    candidates = list(explicit_paths)
    if settings.pci_path_guess:
        for path in build_guessed_dcm_paths(payload, exam_id=exam_id, upload_names=upload_names):
            if path not in candidates:
                candidates.append(path)

    if not candidates:
        return {
            "status": pending_status,
            "message": (
                f"{pending_prefix}PCI（genpci）需在 CT 服务端 DICOM 落盘后才能调用。"
                f"请让 CT 分割接口返回 dcm_path / dicomUrl，或在分析时传入 dcm_path（当前 sessionId={session_hint or '—'}）。"
            ),
            "pci_score": None,
            "regions": [],
            "slice_scores": [],
            "raw": {
                "sessionId": session_hint,
                "segmentation_complete": segmentation_complete,
                "upload_names": upload_names or [],
                "ct_first_result_keys": (
                    sorted(str(k) for k in payload["results"][0].keys())
                    if isinstance(payload.get("results"), list)
                    and payload["results"]
                    and isinstance(payload["results"][0], dict)
                    else []
                ),
            },
            "paths_tried": [],
        }

    poll = segmentation_complete and settings.pci_poll_max_attempts > 1
    if poll:
        result = await predict_pci_score_with_polling(candidates)
    else:
        tried: list[str] = []
        last: dict[str, Any] | None = None
        for path in candidates[:5]:
            tried.append(path)
            result = await predict_pci_score(path)
            result["paths_tried"] = list(tried)
            if _pci_has_score_data(result):
                return result
            last = result
        result = last or {
            "status": "error",
            "message": "genpci 未返回 PCI 评分",
            "pci_score": None,
            "regions": [],
            "paths_tried": tried,
        }

    if _pci_has_score_data(result):
        result["source"] = "genpci"
        return result

    ct_slices = try_parse_pci_from_ct_slices(payload)
    if ct_slices and ct_slices.get("slice_scores"):
        ct_slices["message"] = (
            f"genpci 不可用（{result.get('message', '')}），"
            f"已改用 CT 分割 sc（{len(ct_slices['slice_scores'])} 层）"
        )
        ct_slices["raw"] = {**(ct_slices.get("raw") or {}), "paths_tried": result.get("paths_tried", [])}
        return ct_slices

    tried_summary = _format_paths_tried(result.get("paths_tried") or [])
    return {
        "status": pending_status if segmentation_complete else "error",
        "message": (
            f"{pending_prefix}genpci 未找到有效 DICOM 目录或尚未落盘（{tried_summary}）。"
            "请确认 ZIP 在服务端的路径规则，并在 .env 设置 PCI_DCM_PATH_TEMPLATE，或分析时传入 dcm_path。"
            + (f" sessionId={session_hint}。" if session_hint else "")
        ),
        "pci_score": None,
        "regions": [],
        "slice_scores": [],
        "raw": {
            "sessionId": session_hint,
            "genpci_error": result.get("message"),
            "paths_tried": result.get("paths_tried", []),
            "segmentation_complete": segmentation_complete,
            "upload_names": upload_names or [],
        },
        "paths_tried": result.get("paths_tried", []),
    }
