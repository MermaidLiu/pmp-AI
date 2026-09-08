"""PET-CT interview form extraction: OCR hook + Pydantic validation."""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.models.domain import PetCtInterviewRecord


class DataExtractor:
    """Pluggable OCR + rule/LLM form parser; validates against ``PetCtInterviewRecord``."""

    def __init__(self) -> None:
        self._ocr_backend = self._detect_ocr()

    def _detect_ocr(self) -> str | None:
        try:
            import pytesseract  # noqa: F401

            return "tesseract"
        except ImportError:
            return None

    def _load_ocr_model(self) -> str | None:
        return self._ocr_backend

    def _load_form_parser(self) -> None:
        return None

    def extract_from_image(self, image_path: str | Path, source_name: str | None = None) -> dict[str, Any]:
        path = Path(image_path)
        if not path.is_file():
            raise FileNotFoundError(str(path))
        label = source_name or path.name
        if path.suffix.lower() == ".pdf":
            return self.extract_from_pdf(path, source_name=label)
        ocr_text = self._run_ocr(path)
        structured = self._heuristic_parse(ocr_text, source_filename=label)
        validated = self._validate_data(structured)
        return validated

    def extract_from_pdf(self, pdf_path: str | Path, source_name: str = "") -> dict[str, Any]:
        """从 PDF 抽取文本（可复制文本的 PDF）；扫描件需先转图片走 OCR。"""
        path = Path(pdf_path)
        if not path.is_file():
            raise FileNotFoundError(str(path))
        try:
            from pypdf import PdfReader
        except ImportError as e:
            raise RuntimeError("缺少依赖 pypdf，请在 backend 目录执行：pip install pypdf") from e
        reader = PdfReader(str(path))
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        full_raw = "\n".join(parts)
        if not full_raw.strip():
            raise ValueError(
                "该 PDF 未提取到文本（多为纯扫描件）。请将报告导出为 JPG/PNG 上传，或安装 Tesseract 后对单页图片做 OCR。"
            )
        name = source_name or path.name
        structured = self._heuristic_parse(full_raw, source_filename=name)
        return self._validate_data(structured)

    def extract_from_json_file(self, json_path: str | Path) -> dict[str, Any]:
        raw = json.loads(Path(json_path).read_text(encoding="utf-8"))
        return self._validate_data(raw)

    def extract_from_dicom_bytes(self, content: bytes, source_name: str = "") -> dict[str, Any]:
        """从 DICOM 文件字节解析元数据，映射为 ``PetCtInterviewRecord``（不做像素级 SUV 计算）。"""
        try:
            import pydicom
        except ImportError as e:
            raise RuntimeError("缺少依赖 pydicom，请在 backend 目录执行：pip install pydicom") from e
        try:
            ds = pydicom.dcmread(io.BytesIO(content), stop_before_pixels=True, force=True)
        except Exception as e:
            raise ValueError(f"无法解析为 DICOM：{e}") from e
        structured = self._record_from_dicom_dataset(ds, source_name=source_name or "upload.dcm")
        return self._validate_data(structured)

    def iter_records_from_zip_bytes(self, content: bytes, archive_name: str) -> list[tuple[str, dict[str, Any]]]:
        """解压 ZIP，对其中的每个 ``.dcm`` 生成一条已校验的记录 ``(展示名, model_dump)``。"""
        label = Path(archive_name).name or "archive.zip"
        try:
            zf = zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile as e:
            raise ValueError("不是有效的 ZIP 压缩包") from e
        with zf:
            names = [n for n in zf.namelist() if n.lower().endswith(".dcm") and not n.endswith("/")]
            if not names:
                raise ValueError("压缩包内未发现 .dcm 文件（请上传仅含或包含 DICOM 的 ZIP）")
            out: list[tuple[str, dict[str, Any]]] = []
            for member in names:
                raw = zf.read(member)
                display = f"{label}/{member}"
                out.append((display, self.extract_from_dicom_bytes(raw, source_name=display)))
            return out

    def extract_batch(self, paths: list[Path]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for path in paths:
            try:
                if path.suffix.lower() == ".json":
                    results.append(self.extract_from_json_file(path))
                elif path.suffix.lower() == ".pdf":
                    results.append(self.extract_from_pdf(path))
                elif path.suffix.lower() == ".dcm":
                    results.append(self.extract_from_dicom_bytes(path.read_bytes(), source_name=path.name))
                else:
                    results.append(self.extract_from_image(path))
            except Exception as e:
                results.append({"_ingest_error": str(e), "filename": path.name})
        return results

    def _run_ocr(self, path: Path) -> str:
        if self._ocr_backend == "tesseract":
            from PIL import Image
            import pytesseract

            img = Image.open(path)
            return pytesseract.image_to_string(img, lang="chi_sim+eng") or ""
        # Demo path: no OCR — caller should use JSON upload or plug Tesseract/EasyOCR.
        return ""

    def _heuristic_parse(self, ocr_text: str, source_filename: str = "") -> dict[str, Any]:
        """从 OCR / PDF 文本中做轻量字段抽取（各院版式不同，仅作录入辅助）。"""
        text = re.sub(r"\s+", " ", ocr_text.replace("\n", " "))
        out: dict[str, Any] = {
            "patient_base_info": {},
            "interview_info": {},
            "supplementary_interview_info": {},
        }
        m_exam = re.search(r"PET\d{6,}\d*", text)
        if m_exam:
            out["patient_base_info"]["exam_id"] = m_exam.group(0)
        m_phone = re.search(r"1\d{10}", text)
        if m_phone:
            out["patient_base_info"]["phone"] = m_phone.group(0)
        m_name = re.search(r"(?:姓名|患者姓名)[:：\s]*([\u4e00-\u9fff·]{2,8})", text)
        if m_name:
            out["patient_base_info"]["name"] = m_name.group(1).replace("·", "").strip()
        m_age = re.search(r"(?:年龄|年岁)[:：\s]*(\d{1,3})\s*岁?", text)
        if m_age:
            out["patient_base_info"]["age"] = int(m_age.group(1))
        m_gender = re.search(r"性别[:：\s]*(男|女)", text)
        if m_gender:
            out["patient_base_info"]["gender"] = m_gender.group(1)
        m_dept = re.search(r"(?:科室|入院科室|检查科室|申请科室)[:：\s]*([^\s；;]{2,24})", text)
        if m_dept:
            out["patient_base_info"]["department"] = m_dept.group(1).strip()
        m_mrn = re.search(r"(?:病历号|病案号|住院号)[:：\s]*([A-Za-z0-9\-]{4,20})", text)
        if m_mrn:
            out["patient_base_info"]["medical_record_id"] = m_mrn.group(1)
        m_dx = re.search(r"(?:临床诊断|出院诊断|诊断意见)[:：\s]*([^\n;；]{2,80})", text)
        if m_dx:
            out["interview_info"]["clinical_diagnosis"] = m_dx.group(1).strip()[:200]

        rx: dict[str, Any] = {}
        if re.search(r"SUV|18F|PET|代谢|显像|FDG", ocr_text, re.I):
            snip = ocr_text.strip()
            if len(snip) > 8000:
                snip = snip[:8000] + "\n…（截断）"
            rx["pet_ct_report_narrative"] = snip
        m_suv = re.search(r"SUV(?:max)?[：:\s=]*([0-9]+\.?[0-9]*)", text, re.I)
        if m_suv:
            rx["global_quant"] = {"suv_max": float(m_suv.group(1))}
        m_mtv = re.search(r"MTV[：:\s≈=]*([0-9]+\.?[0-9]*)", text, re.I)
        if m_mtv:
            gq = rx.setdefault("global_quant", {})
            gq["mtv"] = float(m_mtv.group(1))
        m_tlg = re.search(r"TLG[：:\s≈=]*([0-9]+\.?[0-9]*)", text, re.I)
        if m_tlg:
            gq = rx.setdefault("global_quant", {})
            gq["tlg"] = float(m_tlg.group(1))
        if source_filename:
            rx["document_uploads"] = [
                {"filename": source_filename, "kind": "pdf" if source_filename.lower().endswith(".pdf") else "image", "text_excerpt": ocr_text[:1500]}
            ]
        if rx:
            out["research_extensions"] = rx
        return out

    def _validate_data(self, data: dict[str, Any]) -> dict[str, Any]:
        rec = PetCtInterviewRecord.model_validate(data)
        return rec.model_dump(mode="json")

    def _record_from_dicom_dataset(self, ds: Any, source_name: str) -> dict[str, Any]:
        """将 ``pydicom.Dataset`` 转为与 OCR 路径一致的字典结构（再经 ``_validate_data``）。"""
        pn = ds.get("PatientName")
        name = ""
        if pn is not None:
            name = str(pn).replace("^", "").strip()
        pid = str(ds.get("PatientID", "") or "").strip()
        sex_raw = str(ds.get("PatientSex", "") or "").strip().upper()
        gender = {"M": "男", "F": "女"}.get(sex_raw, sex_raw if sex_raw in ("男", "女") else "")
        birth = self._parse_dicom_date(getattr(ds, "PatientBirthDate", None))
        study_d = self._parse_dicom_date(getattr(ds, "StudyDate", None))
        age = 0
        if birth and study_d:
            age = max(0, study_d.year - birth.year - ((study_d.month, study_d.day) < (birth.month, birth.day)))
        elif getattr(ds, "PatientAge", None):
            pa = str(ds.PatientAge).strip()
            m = re.match(r"(\d{1,3})", pa)
            if m:
                age = int(m.group(1))

        acc = str(ds.get("AccessionNumber", "") or "").strip()
        suid = str(ds.get("StudyInstanceUID", "") or "").strip()
        exam_id = acc or (suid[-16:] if len(suid) >= 16 else suid)
        modality = str(ds.get("Modality", "") or "").strip()
        study_desc = str(ds.get("StudyDescription", "") or "").strip()
        series_desc = str(ds.get("SeriesDescription", "") or "").strip()
        institution = str(ds.get("InstitutionName", "") or "").strip()

        tag_lines = [
            f"Modality: {modality}" if modality else "",
            f"StudyDate: {getattr(ds, 'StudyDate', '')}" if getattr(ds, "StudyDate", None) else "",
            f"StudyDescription: {study_desc}" if study_desc else "",
            f"SeriesDescription: {series_desc}" if series_desc else "",
            f"AccessionNumber: {acc}" if acc else "",
            f"StudyInstanceUID: {suid}" if suid else "",
        ]
        narrative = "\n".join(line for line in tag_lines if line)

        rx: dict[str, Any] = {
            "patient_internal_id": pid,
            "imaging_report_text": narrative,
            "document_uploads": [
                {
                    "filename": source_name,
                    "kind": "dicom",
                    "text_excerpt": narrative[:4000] if narrative else "(无主要标签文本)",
                }
            ],
        }
        if re.search(r"PET|PT", modality, re.I) or "PET" in study_desc.upper() or "PET" in series_desc.upper():
            rx["pet_ct_report_narrative"] = narrative

        out: dict[str, Any] = {
            "patient_base_info": {
                "name": name,
                "gender": gender,
                "age": age,
                "exam_id": exam_id,
                "medical_record_id": pid,
                "department": institution,
                "exam_item": " / ".join(x for x in (modality, study_desc) if x),
                "source": "DICOM",
            },
            "interview_info": {},
            "supplementary_interview_info": {},
            "research_extensions": rx,
        }
        return out

    @staticmethod
    def _parse_dicom_date(val: Any) -> date | None:
        if val is None:
            return None
        s = str(val).strip()
        if len(s) >= 8 and s[:8].isdigit():
            try:
                return datetime.strptime(s[:8], "%Y%m%d").date()
            except ValueError:
                return None
        return None

    def extract_from_tabular_bytes(self, content: bytes, source_name: str) -> dict[str, Any]:
        """Parse CSV / Excel clinical table into a minimal PetCtInterviewRecord."""
        import io

        suffix = Path(source_name).suffix.lower()
        try:
            if suffix == ".csv":
                df = __import__("pandas").read_csv(io.BytesIO(content))
            else:
                df = __import__("pandas").read_excel(io.BytesIO(content))
        except Exception as e:
            raise ValueError(f"无法读取表格文件：{e}") from e
        if df.empty:
            raise ValueError("表格为空")
        row = df.iloc[0].to_dict()
        out: dict[str, Any] = {"patient_base_info": {}, "interview_info": {}, "supplementary_interview_info": {}}
        lower_cols = {str(c).strip().lower(): c for c in df.columns}

        def pick(*keys: str) -> Any:
            for k in keys:
                if k in row and row[k] is not None and str(row[k]).strip():
                    return row[k]
                if k.lower() in lower_cols:
                    v = row.get(lower_cols[k.lower()])
                    if v is not None and str(v).strip():
                        return v
            return None

        if pick("姓名", "name", "患者姓名", "patient_name"):
            out["patient_base_info"]["name"] = str(pick("姓名", "name", "患者姓名", "patient_name"))
        if pick("性别", "gender"):
            out["patient_base_info"]["gender"] = str(pick("性别", "gender"))
        age = pick("年龄", "age")
        if age is not None:
            try:
                out["patient_base_info"]["age"] = int(float(age))
            except (TypeError, ValueError):
                pass
        if pick("检查号", "exam_id", "accession"):
            out["patient_base_info"]["exam_id"] = str(pick("检查号", "exam_id", "accession"))
        if pick("科室", "department"):
            out["patient_base_info"]["department"] = str(pick("科室", "department"))
        if pick("病历号", "medical_record_id", "mrn"):
            out["patient_base_info"]["medical_record_id"] = str(pick("病历号", "medical_record_id", "mrn"))
        if pick("临床诊断", "诊断", "diagnosis", "clinical_diagnosis"):
            out["interview_info"]["clinical_diagnosis"] = str(
                pick("临床诊断", "诊断", "diagnosis", "clinical_diagnosis")
            )
        text_blob = " | ".join(str(v) for v in row.values() if v is not None)
        out["research_extensions"] = {
            "document_uploads": [{"filename": source_name, "kind": "tabular", "text_excerpt": text_blob[:2000]}],
            "imaging_report_text": text_blob[:4000],
        }
        if not out["patient_base_info"].get("exam_id"):
            out["patient_base_info"]["exam_id"] = f"XLS{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return self._validate_data(out)

    def extract_from_docx_bytes(self, content: bytes, source_name: str = "") -> dict[str, Any]:
        """Extract text from Word .docx and heuristic-parse fields."""
        import io
        import zipfile
        import xml.etree.ElementTree as ET

        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                xml = zf.read("word/document.xml")
        except Exception as e:
            raise ValueError(f"无法读取 Word 文档：{e}") from e
        root = ET.fromstring(xml)
        parts = []
        for node in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
            if node.text:
                parts.append(node.text)
        full_text = "\n".join(parts)
        if not full_text.strip():
            raise ValueError("Word 文档未提取到文本")
        structured = self._heuristic_parse(full_text, source_filename=source_name or "upload.docx")
        structured.setdefault("research_extensions", {})
        structured["research_extensions"].setdefault(
            "document_uploads",
            [{"filename": source_name or "upload.docx", "kind": "docx", "text_excerpt": full_text[:2000]}],
        )
        return self._validate_data(structured)
