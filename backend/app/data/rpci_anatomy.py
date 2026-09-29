"""Radiological PCI (rPCI) region definitions — Tops-Welten et al., Eur Radiol 2025.

DOI: 10.1007/s00330-025-11762-3
Delphi consensus on CT-applicable region boundaries (13 regions, score 0–3 each, sum 0–39).
"""

from __future__ import annotations

from typing import Any

RPCI_CITATION = (
    "Tops-Welten M et al. Defining region boundaries to assess the peritoneal cancer index on imaging: "
    "a Delphi study. European Radiology 2025;35:7856–7866. doi:10.1007/s00330-025-11762-3"
)

RPCI_ANATOMY_REFERENCE = (
    "影像 rPCI 13 区（Delphi 共识）：按 CT 可识别的解剖边界划分，每区最大结节 0–3 分，总分 0–39。"
    "9–12 区为空肠/回肠，由 Treitz 水平肠系膜根发出的前后位平面均分小肠体积。"
)

# key aliases must stay compatible with genpci / CT module field names
RPCI_REGIONS: list[dict[str, Any]] = [
    {
        "index": 0,
        "key": "pci0Central",
        "label": "0_横结肠与大网膜",
        "structures": "Transverse colon; greater omentum",
        "boundaries": "Anterior: rectus abdominis; upper: regions 1–3 and greater curvature of stomach",
    },
    {
        "index": 1,
        "key": "pci1RightUpper",
        "label": "1_右肝叶与胆囊",
        "structures": "Right liver lobe; gallbladder; retrohepatic space (excl. kidney)",
        "boundaries": "Upper: right hemidiaphragm; anterior: abdominal wall to hepatic flexure; posterior: right renal fascia",
    },
    {
        "index": 2,
        "key": "pci2Epigastrium",
        "label": "2_左肝与胰头体",
        "structures": "Left liver (incl. caudate); pancreatic head/body; falciform; lesser omentum",
        "boundaries": "Anterior: abdominal wall",
    },
    {
        "index": 3,
        "key": "pci3LeftUpper",
        "label": "3_脾与胃胰尾",
        "structures": "Spleen; stomach; pancreatic tail",
        "boundaries": "Upper: left hemidiaphragm; anterior: abdominal wall to greater curvature; posterior: left renal fascia",
    },
    {
        "index": 4,
        "key": "pci4LeftFlank",
        "label": "4_降结肠上段",
        "structures": "Cranial descending colon; abdominal gutter",
        "boundaries": "Upper: splenic flexure; lateral: lateral abdominal wall; lower: top of iliac crest",
    },
    {
        "index": 5,
        "key": "pci5LeftLower",
        "label": "5_降结肠下段",
        "structures": "Caudal descending colon",
        "boundaries": "Upper: iliac crest; medial: left common/external iliac artery; lateral: lateral pelvic wall; "
        "lower: left iliac arteries and pelvic wall",
    },
    {
        "index": 6,
        "key": "pci6Pelvis",
        "label": "6_直肠乙状结肠与盆腔",
        "structures": "Rectosigmoid (medial to external iliac a. to levator); bladder; female genitalia; Douglas pouch",
        "boundaries": "Upper: aortic bifurcation; lateral: external iliac arteries; lower: caudal pelvic wall medial to EIA",
    },
    {
        "index": 7,
        "key": "pci7RightLower",
        "label": "7_升结肠下段",
        "structures": "Caudal ascending colon from ileocecal valve (Bauhin)",
        "boundaries": "Upper: iliac crest; medial: right common/external iliac artery; lateral: lateral pelvic wall; "
        "lower: right iliac arteries and pelvic wall",
    },
    {
        "index": 8,
        "key": "pci8RightFlank",
        "label": "8_升结肠上段",
        "structures": "Cranial ascending colon; abdominal gutter",
        "boundaries": "Upper: hepatic flexure; lateral: lateral abdominal wall; lower: top of iliac crest",
    },
    {
        "index": 9,
        "key": "pci9UpperJejunum",
        "label": "9_小肠 rPCI Ⅰ",
        "structures": "Small bowel (segment 1 of 4)",
        "boundaries": "AP planes from mesenteric root at ligament of Treitz; equal small-bowel volumes",
    },
    {
        "index": 10,
        "key": "pci10LowerJejunum",
        "label": "10_小肠 rPCI Ⅱ",
        "structures": "Small bowel (segment 2 of 4)",
        "boundaries": "Same as regions 9–12 division",
    },
    {
        "index": 11,
        "key": "pci11UpperIleum",
        "label": "11_小肠 rPCI Ⅲ",
        "structures": "Small bowel (segment 3 of 4)",
        "boundaries": "Same as regions 9–12 division",
    },
    {
        "index": 12,
        "key": "pci12LowerIleum",
        "label": "12_小肠 rPCI Ⅳ",
        "structures": "Small bowel (segment 4 of 4)",
        "boundaries": "Same as regions 9–12 division",
    },
]

# Legacy genpci / CT aliases per index (unchanged for parsing)
RPCI_KEY_ALIASES: dict[str, tuple[str, ...]] = {
    "pci0Central": ("pci0Central", "pci0"),
    "pci1RightUpper": ("pci1RightUpper", "pci1"),
    "pci2Epigastrium": ("pci2Epigastrium", "pci2"),
    "pci3LeftUpper": ("pci3LeftUpper", "pci3"),
    "pci4LeftFlank": ("pci4LeftFlank", "pci4RightLower", "pci4"),
    "pci5LeftLower": ("pci5LeftLower", "pci5RightFlank", "pci5"),
    "pci6Pelvis": ("pci6Pelvis", "pci6RightLowerAbdomen", "pci6"),
    "pci7RightLower": ("pci7RightLower", "pci7LowerAbdomen", "pci7"),
    "pci8RightFlank": ("pci8RightFlank", "pci8LeftLowerAbdomen", "pci8"),
    "pci9UpperJejunum": ("pci9UpperJejunum", "pci9LeftFlank", "pci9"),
    "pci10LowerJejunum": ("pci10LowerJejunum", "pci10LeftUpperAbdomen", "pci10"),
    "pci11UpperIleum": ("pci11UpperIleum", "pci11Jejunum", "pci11"),
    "pci12LowerIleum": ("pci12LowerIleum", "pci12"),
}


def list_rpci_region_defs() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in RPCI_REGIONS:
        key = row["key"]
        out.append(
            {
                **row,
                "aliases": list(RPCI_KEY_ALIASES.get(key, (key,))),
            }
        )
    return out


def rpci_region_order_for_pci_client() -> list[tuple[str, str, tuple[str, ...]]]:
    return [
        (r["key"], r["label"], RPCI_KEY_ALIASES.get(r["key"], (r["key"],)))
        for r in RPCI_REGIONS
    ]
