"""Expand local OBO ontology terms from `.okf/languages/*.yaml` and detect file extensions / unknowns.

Combines:
- The 17 frozen `domain_taxonomy_v1` concepts (`ATLASDOM:*`)
- All `.okf/languages/*.yaml` profiles (`ATLASLANG:*` + file extensions `ATLASEXT:*`)
- Longest-suffix file-extension/LSP detection (`detect_file_extension_language_v1`)
- Unknown-term separation (`classify_terms_with_unknowns_v1` -> `potentialUnknowns`)

Strictly non-canonical proposal/lookup tooling (`canonicalAuthority: False`,
`writesPerformed: False` to any database).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from atlas_graph_runtime.golden_label_workbench_v1 import FROZEN_17_DOMAIN_IDS

SAFE_OBO_ID_RE = re.compile(r"[^a-zA-Z0-9_.-]+")
CUDA_EXTENSION_OVERRIDES: dict[str, tuple[str, str]] = {
    ".cu": ("cuda_cpp", "CUDA C++"),
    ".cuh": ("cuda_cpp", "CUDA C++"),
    ".ptx": ("ptx", "PTX Virtual ISA"),
}


def _safe_obo_id(prefix: str, raw: str) -> str:
    cleaned = SAFE_OBO_ID_RE.sub("_", raw.strip().lstrip(".")).strip("_")
    return f"{prefix}:{cleaned or 'unknown'}"


def load_okf_language_profiles_v1(languages_dir: str | Path = ".okf/languages") -> list[dict[str, Any]]:
    """Read all `.okf/languages/*.yaml` profiles deterministically."""
    root = Path(languages_dir)
    profiles: list[dict[str, Any]] = []
    for yml_path in sorted(root.glob("*.yaml")):
        data = yaml.safe_load(yml_path.read_text(encoding="utf-8")) or {}
        lang = str(data.get("language") or yml_path.stem).strip()
        name = str(data.get("name") or lang).strip()
        exts = [str(e).strip().lower() for e in (data.get("extensions") or []) if str(e).strip()]
        sym_kinds = list((data.get("symbol_kinds") or {}).keys()) if isinstance(data.get("symbol_kinds"), dict) else []
        profiles.append(
            {
                "language": lang,
                "name": name,
                "extensions": exts,
                "symbolKinds": sym_kinds,
                "profileFile": yml_path.name,
            }
        )
    return profiles


def detect_file_extension_language_v1(
    file_path: str,
    profiles: list[dict[str, Any]],
) -> dict[str, Any]:
    """Detect language/LSP profile by longest matching extension, or report UNKNOWN_EXTENSION."""
    lower_path = str(file_path).strip().lower()
    for ext, (lang_id, lang_name) in sorted(CUDA_EXTENSION_OVERRIDES.items(), key=lambda kv: -len(kv[0])):
        if lower_path.endswith(ext):
            return {
                "filePath": file_path,
                "status": "KNOWN_LANGUAGE",
                "language": lang_id,
                "name": lang_name,
                "matchedExtension": ext,
                "potentialUnknown": None,
            }
    candidates: list[tuple[int, str, dict[str, Any]]] = []
    for prof in profiles:
        for ext in prof.get("extensions") or []:
            if lower_path.endswith(ext):
                candidates.append((len(ext), ext, prof))
    if not candidates:
        suffix = Path(lower_path).suffix or "<no_extension>"
        return {
            "filePath": file_path,
            "status": "UNKNOWN_EXTENSION",
            "language": None,
            "matchedExtension": None,
            "potentialUnknown": suffix,
        }
    candidates.sort(key=lambda item: (-item[0], item[2]["language"]))
    _, matched_ext, best = candidates[0]
    return {
        "filePath": file_path,
        "status": "KNOWN_LANGUAGE",
        "language": best["language"],
        "name": best["name"],
        "matchedExtension": matched_ext,
        "potentialUnknown": None,
    }


def classify_terms_with_unknowns_v1(
    tokens: list[str],
    known_terms: set[str],
) -> dict[str, list[str]]:
    """Split candidate tokens into known ontology/profile terms and potentialUnknowns."""
    known_norm = {t.strip().lower() for t in known_terms if t.strip()}
    matched: list[str] = []
    unknowns: list[str] = []
    for tok in tokens:
        t = tok.strip().lower()
        if not t:
            continue
        if t in known_norm:
            if t not in matched:
                matched.append(t)
        else:
            if t not in unknowns:
                unknowns.append(t)
    return {"matchedTerms": matched, "potentialUnknowns": unknowns}


def build_expanded_domain_and_language_obo_v1(
    *,
    languages_dir: str | Path = ".okf/languages",
    out_path: str | Path = ".okf/ontologies/atlas-domain-and-language-terms-v1.obo",
) -> dict[str, Any]:
    """Generate a self-contained OBO 1.2 file combining 17 domains + 23 OKF languages + extensions."""
    profiles = load_okf_language_profiles_v1(languages_dir)
    lines = [
        "format-version: 1.2",
        "ontology: atlas-domain-and-language-terms-v1",
        "remark: Self-contained OBO vocabulary combining 17 domain_taxonomy_v1 terms, .okf/languages/*.yaml profiles, and CUDA/PTX/RTX concepts.",
        "",
        "[Typedef]",
        "id: associated_language",
        "name: associated language",
        "",
        "[Typedef]",
        "id: targets_platform",
        "name: targets platform",
        "",
        "[Typedef]",
        "id: compiles_to",
        "name: compiles to",
        "",
        "[Term]",
        "id: ATLASHW:rtx_gpu",
        "name: NVIDIA RTX GPU",
        "",
        "[Term]",
        "id: ATLASPLAT:cuda",
        "name: NVIDIA CUDA Platform",
        "",
        "[Term]",
        "id: ATLASISA:ptx",
        "name: PTX Virtual ISA",
        "relationship: targets_platform ATLASPLAT:cuda",
        "",
        "[Term]",
        "id: ATLASLANG:cuda_cpp",
        "name: CUDA C++",
        "is_a: ATLASLANG:cpp",
        "relationship: targets_platform ATLASPLAT:cuda",
        "relationship: compiles_to ATLASISA:ptx",
        "",
    ]

    term_count = 4
    for dom in FROZEN_17_DOMAIN_IDS:
        lines.append("[Term]")
        lines.append(f"id: ATLASDOM:{dom}")
        lines.append(f"name: {dom}")
        if "." in dom:
            parent = dom.split(".", 1)[0]
            lines.append(f"is_a: ATLASDOM:{parent}")
        lines.append("")
        term_count += 1

    seen_ext_ids: set[str] = set()
    ext_count = 0
    for prof in profiles:
        lang = prof["language"]
        lang_id = _safe_obo_id("ATLASLANG", lang)
        lines.append("[Term]")
        lines.append(f"id: {lang_id}")
        lines.append(f"name: {prof['name']}")
        lines.append("")
        term_count += 1

        for ext in prof["extensions"]:
            ext_id = _safe_obo_id("ATLASEXT", ext)
            if ext_id in seen_ext_ids:
                continue
            seen_ext_ids.add(ext_id)
            target_lang = "ATLASLANG:cuda_cpp" if ext in (".cu", ".cuh") else lang_id
            lines.append("[Term]")
            lines.append(f"id: {ext_id}")
            lines.append(f"name: {ext}")
            lines.append(f"relationship: associated_language {target_lang}")
            lines.append("")
            term_count += 1
            ext_count += 1

    for extra_ext, extra_lang in ((".cuh", "ATLASLANG:cuda_cpp"), (".ptx", "ATLASISA:ptx")):
        ext_id = _safe_obo_id("ATLASEXT", extra_ext)
        if ext_id not in seen_ext_ids:
            seen_ext_ids.add(ext_id)
            lines.append("[Term]")
            lines.append(f"id: {ext_id}")
            lines.append(f"name: {extra_ext}")
            lines.append(f"relationship: associated_language {extra_lang}")
            lines.append("")
            term_count += 1
            ext_count += 1

    dest = Path(out_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(lines), encoding="utf-8")
    return {
        "schema": "atlas.okf-expanded-obo-receipt.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "outPath": str(dest),
        "domainCount": len(FROZEN_17_DOMAIN_IDS),
        "languageCount": len(profiles),
        "extensionCount": ext_count,
        "totalTerms": term_count,
    }
