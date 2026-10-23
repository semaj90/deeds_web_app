#!/usr/bin/env python3
"""ast_chunk_routing_helpers.py — AST Procedural Memory, Linked Lists, Tuples & PyTorch MMap Tensor Creation.

Implements:
1. AstChunkRouteTuple: Immutable NamedTuple for K/V Routing & NES LUT Palette Tagging.
2. AstChunkDomainRouter: Dict + Intrusive Linked-List Router for :8095 /ast/chunk.
3. Exact, crosswalk-driven domain resolution (no hard-coded aliases; unresolved is a first-class result).
4. LSP UTF-16 to Tree-sitter UTF-8 byte offset converter.
5. Procedural mmap slab for zero-copy [B, 25] float32 tensor creation with PyTorch pin_memory=True.
6. Non-AST 53% corpus routing (JSON/YAML, Markdown/Text, SQL, C/Null).
"""

from __future__ import annotations

import mmap
import os
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional, Sequence, Tuple, Union

try:
    import numpy as np
    HAVE_NUMPY = True
except ImportError:
    np = None  # type: ignore
    HAVE_NUMPY = False

try:
    import torch
    HAVE_TORCH = True
except ImportError:
    torch = None  # type: ignore
    HAVE_TORCH = False


# ═══════════════════════════════════════════════════════════════════
# 1. Immutable Python NamedTuple for K/V Routing & NES LUT Palette
# ═══════════════════════════════════════════════════════════════════

class AstChunkRouteTuple(NamedTuple):
    """Immutable Python Tuple for K/V Routing & NES LUT Palette Tagging.
    
    NOTE: nes_lut_byte (e.g., 0x2A for Svelte 5 runes) is derived metadata only.
    It must never be used as canonical identity or database primary keys.
    """
    source_ref: str          # Canonical file path / URI
    source_revision: str     # Git SHA / revision gate (defer writes pre-P20)
    start_byte: int          # UTF-8 byte offset from Tree-sitter CST
    end_byte: int            # UTF-8 byte offset
    lang_id: int             # 0..7 for the 8 supported AST languages, 255 for non-AST
    nes_lut_byte: int        # 0x00..0x0F (or 0x2A rune sub-palette)
    prev_ordinal: int        # O(1) intrusive linked-list prev index (-1 if head)
    next_ordinal: int        # O(1) intrusive linked-list next index (-1 if tail)


# ═══════════════════════════════════════════════════════════════════
# 2. 76-Domain Arithmetic & Router for /ast/chunk
# ═══════════════════════════════════════════════════════════════════

class AstChunkDomainRouter:
    """Dict + Intrusive Linked-List Router for /ast/chunk.
    
    Resolves the 17 + 40 + 18 = 75 (+ UNRESOLVED = 76) domain arithmetic:
    - 17 slugs from domain_taxonomy_v1
    - 40 distinct domain classes from ontology_domain_tuples / feature_domain
    - 18 domains from codebase_chunk_index.domain
    - 1 UNRESOLVED fallback = 76 total mapped domain entities.
    """

    # NES 8-bit palette mapping (0x00..0x0F, with 0x2A for Svelte 5 runes)
    NES_DOMAIN_LUT: Dict[str, int] = {
        "auth": 0x01,
        "ui": 0x02,
        "retrieval": 0x03,
        "network": 0x04,
        "database": 0x05,
        "cache": 0x06,
        "agent": 0x07,
        "graph": 0x08,
        "ml": 0x09,
        "svelte5_runes": 0x2A,
        "unresolved": 0x00,
    }

    # Supported AST Languages (0..7)
    AST_LANGUAGES: Dict[str, int] = {
        "typescript": 0,
        "javascript": 1,
        "svelte": 2,
        "python": 3,
        "go": 4,
        "rust": 5,
        "java": 6,
        "tsx": 7,
    }

    # Extension to Language ID (0..7 for AST, 255 for non-AST)
    EXTENSION_LANG_MAP: Dict[str, int] = {
        ".ts": 0,
        ".mts": 0,
        ".js": 1,
        ".mjs": 1,
        ".cjs": 1,
        ".svelte": 2,
        ".py": 3,
        ".go": 4,
        ".rs": 5,
        ".java": 6,
        ".tsx": 7,
        ".jsx": 7,
    }

    # Domain vocabularies are DATA, not code. The owner is Postgres
    # atlas_domain_vocabulary_crosswalk_v1 (NORMALIZED_EXACT rows only; canonical=false) and, for
    # admission, python/parent_atlas_ontology/domain_mapping.py. This module never invents aliases:
    # a label resolves only by an exact normalized match against crosswalk rows handed in by the caller.
    UNRESOLVED = "unresolved"

    @staticmethod
    def _norm(value: str) -> str:
        return "".join(ch for ch in value.lower() if ch.isalnum())

    @classmethod
    def load_crosswalk(cls, rows: Sequence[Tuple[str, str, Optional[str], str]]) -> Dict[Tuple[str, str], str]:
        """rows: (source_vocab, source_value, taxonomy_domain_id, match_method). Keeps NORMALIZED_EXACT only."""
        out: Dict[Tuple[str, str], str] = {}
        for vocab, value, domain_id, method in rows:
            if method == "NORMALIZED_EXACT" and domain_id:
                out[(vocab, cls._norm(value))] = domain_id
        return out

    @classmethod
    def resolve_domain(
        cls,
        source_vocab: str,
        raw_label: str,
        crosswalk: Dict[Tuple[str, str], str],
    ) -> str:
        """Exact crosswalk lookup; anything not present is 'unresolved' (never guessed)."""
        if not raw_label or not raw_label.strip():
            return cls.UNRESOLVED
        return crosswalk.get((source_vocab, cls._norm(raw_label)), cls.UNRESOLVED)

    @classmethod
    def resolve_domain_76(cls, raw_label: str, crosswalk: Optional[Dict[Tuple[str, str], str]] = None) -> str:
        """Deprecated name kept for importers. Matches raw_label against any vocabulary in the supplied
        crosswalk by exact normalized equality; with no crosswalk everything is 'unresolved'."""
        if not raw_label or not raw_label.strip() or not crosswalk:
            return cls.UNRESOLVED
        key = cls._norm(raw_label)
        for (_vocab, value), domain_id in crosswalk.items():
            if value == key:
                return domain_id
        return cls.UNRESOLVED

    @classmethod
    def get_lang_id(cls, file_path: str) -> int:
        """Return 0..7 for AST languages, 255 for non-AST."""
        ext = Path(file_path).suffix.lower()
        return cls.EXTENSION_LANG_MAP.get(ext, 255)

    @staticmethod
    def lsp_utf16_to_utf8_byte_offset(source_bytes: bytes, line: int, utf16_col: int) -> int:
        """LSP (line, UTF-16 column) -> absolute UTF-8 byte offset. Strict: raises ValueError on invalid
        UTF-8, negative or out-of-range line/column, or a column that splits a surrogate pair.
        LSP line breaks are only \\n, \\r\\n and \\r (not U+2028/U+2029/VT/FF)."""
        if line < 0 or utf16_col < 0:
            raise ValueError("negative LSP position")
        text = source_bytes.decode("utf-8")  # strict: invalid UTF-8 raises UnicodeDecodeError (a ValueError)
        starts = [0]
        i = 0
        while i < len(text):
            c = text[i]
            if c == "\n":
                starts.append(i + 1)
            elif c == "\r":
                if i + 1 < len(text) and text[i + 1] == "\n":
                    i += 1
                starts.append(i + 1)
            i += 1
        if line >= len(starts):
            raise ValueError("LSP line out of range")
        line_start = starts[line]
        line_end = starts[line + 1] if line + 1 < len(starts) else len(text)
        units = 0
        idx = line_start
        while idx < line_end and units < utf16_col:
            width = 2 if ord(text[idx]) > 0xFFFF else 1
            if units + width > utf16_col:
                raise ValueError("LSP column splits a surrogate pair")
            units += width
            idx += 1
        if units != utf16_col:
            raise ValueError("LSP column beyond end of line")
        return len(text[:idx].encode("utf-8"))

    @classmethod
    def route_non_ast_chunk(cls, file_path: str, chunk_text: str) -> Dict[str, Any]:
        """Routes the remaining 53% non-AST corpus (144,675 chunks) before raising errors.
        
        - JSON/JSONL/NDJSON and YAML: simdjson control-stream / okf schema route.
        - Markdown/MDX/Text: parent-atlas-versioned-doc-intelligence + spacy_pos route.
        - SQL (3,180): DDL / migration regex & table reference extraction.
        - Null (39,006), C/C++ (862), TOML (8): lang_id=255 and domain UNRESOLVED.
        """
        ext = Path(file_path).suffix.lower()
        if ext in (".json", ".jsonl", ".ndjson", ".yaml", ".yml"):
            return {
                "route_target": "simdjson_okf_validator",
                "route_status": "ROUTE_RULE_PRESENT_NOT_EXECUTED",
                "lang_id": 255,
                "domain": cls.UNRESOLVED,  # extension is not classification evidence
                "lut_byte": cls.NES_DOMAIN_LUT["unresolved"],
                "requires_ast": False,
            }
        elif ext in (".md", ".mdx", ".txt", ".rst"):
            return {
                "route_target": "doc_intelligence_spacy_pos",
                "route_status": "ROUTE_RULE_PRESENT_NOT_EXECUTED",
                "lang_id": 255,
                "domain": cls.UNRESOLVED,  # extension is not classification evidence
                "lut_byte": cls.NES_DOMAIN_LUT["unresolved"],
                "requires_ast": False,
            }
        elif ext in (".sql", ".drizzle"):
            return {
                "route_target": "ddl_migration_regex_extractor",
                "route_status": "ROUTE_RULE_PRESENT_NOT_EXECUTED",
                "lang_id": 255,
                "domain": cls.UNRESOLVED,  # extension is not classification evidence
                "lut_byte": cls.NES_DOMAIN_LUT["unresolved"],
                "requires_ast": False,
            }
        else:
            return {
                "route_target": "unresolved_generic_carrier",
                "route_status": "NO_PARSER_RULE",
                "reason": f"unsupported extension: {ext or '<none>'}",
                "lang_id": 255,
                "domain": "unresolved",
                "lut_byte": cls.NES_DOMAIN_LUT["unresolved"],
                "requires_ast": False,
            }

    @classmethod
    def build_linked_tuples_and_mmap_features(
        cls,
        raw_chunks: List[Dict[str, Any]],
        mmap_path: str,
        crosswalk: Optional[Dict[Tuple[str, str], str]] = None,
    ) -> Tuple[Dict[Tuple[str, int, int], AstChunkRouteTuple], Any]:
        """Builds K/V tuple routing dict, links sequential AST chunks in O(1),
        and writes the [B, 25] float32 feature matrix via procedural mmap for PyTorch DMA.
        """
        batch_size = len(raw_chunks)
        kv_route_dict: Dict[Tuple[str, int, int], AstChunkRouteTuple] = {}

        # Hard-fail identity rules: never default or coerce a missing source_ref / source_revision, and
        # reject duplicate coordinates instead of silently overwriting.
        seen_coords = set()
        for ch in raw_chunks:
            if not ch.get("source_ref"):
                raise ValueError("chunk missing source_ref")
            if not ch.get("source_revision"):
                raise ValueError("chunk missing source_revision")
            start, end = ch.get("start_byte"), ch.get("end_byte")
            if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end < start:
                raise ValueError("chunk has invalid byte span")
            coord = (ch["source_ref"], start, end)
            if coord in seen_coords:
                raise ValueError(f"duplicate chunk coordinate {coord}")
            seen_coords.add(coord)

        # Intrusive links connect only chunks of the same source_ref, in byte order.
        order_by_ref: Dict[str, List[int]] = {}
        for i, ch in enumerate(raw_chunks):
            order_by_ref.setdefault(ch["source_ref"], []).append(i)
        prev_of: Dict[int, int] = {}
        next_of: Dict[int, int] = {}
        for idxs in order_by_ref.values():
            idxs.sort(key=lambda j: raw_chunks[j]["start_byte"])
            for pos, j in enumerate(idxs):
                prev_of[j] = idxs[pos - 1] if pos > 0 else -1
                next_of[j] = idxs[pos + 1] if pos + 1 < len(idxs) else -1

        # Procedural memory-mapped slab: [B, 25] float32 (100 bytes per row)
        byte_len = max(1, batch_size * 25 * 4)
        mmap_file = Path(mmap_path)
        mmap_file.parent.mkdir(parents=True, exist_ok=True)

        with open(mmap_file, "wb+") as f:
            f.truncate(byte_len)
            with mmap.mmap(f.fileno(), byte_len, access=mmap.ACCESS_WRITE) as mm:
                if HAVE_NUMPY:
                    feature_np = np.ndarray((batch_size, 25), dtype=np.float32, buffer=mm)
                    feature_np.fill(0.0)
                else:
                    feature_np = None

                for i, ch in enumerate(raw_chunks):
                    domain_slug = cls.resolve_domain_76(ch.get("domain_proposal", ""), crosswalk)
                    # Special Svelte 5 runes palette check
                    if ch.get("has_svelte_runes") or "$state" in ch.get("text", "") or "$derived" in ch.get("text", ""):
                        lut_byte = cls.NES_DOMAIN_LUT["svelte5_runes"]
                    else:
                        lut_byte = cls.NES_DOMAIN_LUT.get(domain_slug, cls.NES_DOMAIN_LUT["unresolved"])

                    source_ref = ch["source_ref"]
                    start_byte = ch["start_byte"]
                    end_byte = ch["end_byte"]
                    lang_id = ch.get("lang_id", cls.get_lang_id(source_ref))

                    route_tuple = AstChunkRouteTuple(
                        source_ref=source_ref,
                        source_revision=ch["source_revision"],
                        start_byte=start_byte,
                        end_byte=end_byte,
                        lang_id=lang_id,
                        nes_lut_byte=lut_byte,
                        prev_ordinal=prev_of[i],
                        next_ordinal=next_of[i],
                    )
                    # Keyed by canonical coordinate tuple (source_ref, start_byte, end_byte)
                    kv_route_dict[(source_ref, start_byte, end_byte)] = route_tuple

                    if feature_np is not None:
                        # Populate [B, 25] structural + POS feature vector
                        feature_np[i, 0] = float(max(0, end_byte - start_byte))
                        feature_np[i, 1] = float(ch.get("ast_depth", 0))
                        feature_np[i, 2] = float(lut_byte)
                        # Slots 3..24: spacy_pos ratios, import fanout, rune flags, etc.
                        if "pos_features" in ch and isinstance(ch["pos_features"], (list, tuple)):
                            pos_vals = np.asarray(ch["pos_features"][:22], dtype=np.float32)
                            feature_np[i, 3:3 + len(pos_vals)] = pos_vals

                mm.flush()

        if HAVE_NUMPY and HAVE_TORCH:
            mapped_np = np.memmap(mmap_path, dtype=np.float32, mode="r", shape=(batch_size, 25))
            tensor_cpu = torch.from_numpy(np.array(mapped_np, copy=True))
            if torch.cuda.is_available():
                tensor_cpu = tensor_cpu.pin_memory()
            return kv_route_dict, tensor_cpu
        elif HAVE_NUMPY:
            mapped_np = np.memmap(mmap_path, dtype=np.float32, mode="r", shape=(batch_size, 25))
            return kv_route_dict, np.array(mapped_np, copy=True)

        return kv_route_dict, None
