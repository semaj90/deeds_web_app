"""Read-only 4x6 feature tile; revision-qualified N-ary concept join.
Fixture adapter only: source-provided PROVEN flags are not live lineage proof.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import math
from typing import Iterable, Mapping

FEATURES=("exact_match","semantic_score","domain_alignment","nary_fact_overlap","graph_prior","provenance_confidence")
IDENTITY=("packet_key","source_revision","workspace_revision","graph_revision","representation_revision","domain_taxonomy_revision","feature_schema_revision")
@dataclass(frozen=True)
class ConceptTileV1:
    values: tuple[tuple[float,...],...]
    missing: tuple[tuple[int,...],...]
    valid_rows: tuple[int,...]
    identities: tuple[tuple[str,...],...]
    checksum: str

def materialize(rows: Iterable[Mapping[str,object]], *, row_count:int=4)->ConceptTileV1:
    if row_count != 4: raise ValueError("TILE_4_ROWS_REQUIRED")
    normalized=[]
    seen=set()
    for row in rows:
        key=tuple(str(row.get(k) or "").strip() for k in IDENTITY)
        if not all(key) or row.get("revision_status")!="PROVEN":
            raise ValueError("TILE_IDENTITY_UNPROVEN")
        if key in seen: raise ValueError("TILE_DUPLICATE_IDENTITY")
        seen.add(key)
        facts=row.get("nary_facts",[])
        if not isinstance(facts,list): raise ValueError("TILE_FACTS_NOT_LIST")
        for fact in facts:
            if not isinstance(fact,dict) or not all(fact.get(k) for k in ("fact_id","checksum","evidence_refs","participant_roles","participant_ids","graph_revision")):
                raise ValueError("TILE_FACT_UNGROUNDED")
            if fact["graph_revision"]!=key[3] or len(fact["participant_ids"])!=len(fact["participant_roles"]):
                raise ValueError("TILE_FACT_REVISION_OR_ROLES")
        vals=[]; miss=[]
        for name in FEATURES:
            absent=row.get(name) is None
            val=0.0 if absent else float(row[name])
            if not math.isfinite(val): raise ValueError("TILE_NONFINITE")
            vals.append(val); miss.append(int(absent))
        normalized.append((key,tuple(vals),tuple(miss)))
    if len(normalized)>4: raise ValueError("TILE_OVERFLOW")
    normalized.sort(key=lambda r:r[0])
    count=len(normalized)
    keys=tuple(r[0] for r in normalized)
    vals=tuple(r[1] for r in normalized)+((0.,)*6,)*(4-count)
    miss=tuple(r[2] for r in normalized)+((1,)*6,)*(4-count)
    valid=tuple([1]*count+[0]*(4-count))
    blob=json.dumps({"schema":"atlas.candidate-concept-tile.v1","features":FEATURES,"identity":keys,"values":vals,"missing":miss,"valid":valid},sort_keys=True,separators=(",",":"))
    return ConceptTileV1(vals,miss,valid,keys,hashlib.sha256(blob.encode()).hexdigest())


# ---- Batch layer (ALIGN-GEMM-01 / DECISION 4X6-TILE-01): tile = 4 CANDIDATES x 6 features ----
# Pure Python, no torch: the CPU oracle for the 4-candidate x 6-feature layout. Every tile row is a
# distinct candidate with its own ordinal and packet_key. Writes nothing; scores are a derived receipt
# keyed by candidate-order digest, never a canonical packet field.
MAX_BATCH = 4096            # max real candidates
MAX_TILES = MAX_BATCH // 4  # 1024
PAD_ORDINAL = -1


@dataclass(frozen=True)
class ConceptTileBatchV1:
    values: tuple[float, ...]            # flat [tiles*24] = [tiles,4,6] row-major
    present: tuple[int, ...]             # flat [tiles*24]; 1 only for a present feature of a real row
    tile_count: int
    slot_ordinals: tuple[int, ...]       # [tiles*4] candidate ordinal per row slot, PAD_ORDINAL for padding
    slot_packet_keys: tuple[str, ...]    # [tiles*4], "" for padding
    slot_source_revisions: tuple[str, ...]
    candidate_ordinals: tuple[int, ...]  # real candidates in slot order (padding excluded)
    ordinal_map_revision: str
    order_digest: str
    checksum: str

    @property
    def batch_size(self) -> int:
        return len(self.candidate_ordinals)


def materialize_batch(groups: Iterable[Iterable[Mapping[str, object]]], *,
                      ordinals: Iterable[Iterable[int]], sealed_ordinal_map: Mapping[str, object],
                      max_batch: int = MAX_BATCH,
                      ) -> ConceptTileBatchV1:
    """Each group (<= 4 rows) becomes one tile. ordinals[g][i] is the candidate ordinal of groups[g][i].

    Rows inside a tile are ordered by identity key (the existing `materialize` rule), so the batch carries a
    per-slot ordinal/packet_key table instead of assuming caller order.
    The revision is derived from and every candidate is resolved against the supplied sealed
    CandidateOrdinalMapV1. A caller-supplied ordinal-map revision is intentionally not accepted.
    """
    ordinal_map_revision = verify_sealed_ordinal_map(sealed_ordinal_map)
    group_rows = [list(g) for g in groups]
    group_ords = [list(o) for o in ordinals]
    if len(group_rows) != len(group_ords) or any(len(r) != len(o) for r, o in zip(group_rows, group_ords)):
        raise ValueError("BATCH_ORDINAL_COUNT_MISMATCH")
    real = sum(len(r) for r in group_rows)
    if not (1 <= real <= max_batch) or not (1 <= len(group_rows) <= MAX_TILES):
        raise ValueError("BATCH_SIZE_OUT_OF_RANGE")
    flat_ords = [o for grp in group_ords for o in grp]
    if any(isinstance(o, bool) or not isinstance(o, int) or o < 0 for o in flat_ords):
        raise ValueError("BATCH_ORDINAL_INVALID")
    if len(set(flat_ords)) != len(flat_ords):
        raise ValueError("BATCH_ORDINAL_DUPLICATE")

    tiles = [materialize(r) for r in group_rows]
    vals: list[float] = []
    pres: list[int] = []
    slot_ords: list[int] = []
    slot_pks: list[str] = []
    slot_srs: list[str] = []
    for rows, ords, tile in zip(group_rows, group_ords, tiles):
        by_pk: dict[str, int] = {}
        for row, ordinal in zip(rows, ords):
            pk = str(row.get("packet_key") or "")
            if pk in by_pk:
                raise ValueError("BATCH_PACKET_KEY_AMBIGUOUS_IN_TILE")
            by_pk[pk] = ordinal
        for r in range(4):
            vals.extend(tile.values[r])
            pres.extend((0 if m else 1) * tile.valid_rows[r] for m in tile.missing[r])
            if tile.valid_rows[r]:
                ident = tile.identities[r]
                slot_ords.append(by_pk[ident[0]])
                slot_pks.append(ident[0])
                slot_srs.append(ident[1])
            else:
                slot_ords.append(PAD_ORDINAL)
                slot_pks.append("")
                slot_srs.append("")
    if not all(math.isfinite(v) for v in vals):
        raise ValueError("BATCH_NONFINITE")
    real_ords = tuple(o for o in slot_ords if o != PAD_ORDINAL)
    od = hashlib.sha256(json.dumps({"tiles": [t.checksum for t in tiles], "slotOrdinals": slot_ords,
                                    "ordinalMapRevision": ordinal_map_revision},
                                   sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    ck = hashlib.sha256(json.dumps({"schema": "atlas.candidate-concept-tile-batch.v2", "orderDigest": od,
                                    "values": vals, "present": pres},
                                   separators=(",", ":")).encode()).hexdigest()
    batch = ConceptTileBatchV1(tuple(vals), tuple(pres), len(tiles), tuple(slot_ords), tuple(slot_pks),
                               tuple(slot_srs), real_ords, ordinal_map_revision, od, ck)
    bind_batch_to_sealed_map(batch, sealed_ordinal_map)
    return batch


def score_batch_cpu(batch: ConceptTileBatchV1, weights: Iterable[float], bias: float) -> list[float]:
    """CPU oracle: bias + sum_c w[c] * x[c] for every REAL candidate, in slot order. Padding is skipped."""
    w = list(weights)
    if len(w) != 6:
        raise ValueError("SCORE_WEIGHTS_MUST_BE_6")
    out: list[float] = []
    for slot, ordinal in enumerate(batch.slot_ordinals):
        if ordinal == PAD_ORDINAL:
            continue
        base = slot * 6
        out.append(bias + sum(w[c] * batch.values[base + c] for c in range(6)))
    return out


def stable_top_k(scores: Iterable[float], ordinals: Iterable[int], k: int) -> list[int]:
    """Indices of the top-k scores: score desc, then ordinal asc (deterministic tie-break)."""
    s = list(scores)
    o = list(ordinals)
    if len(s) != len(o):
        raise ValueError("TOPK_LENGTH_MISMATCH")
    if any(not math.isfinite(x) for x in s):
        raise ValueError("TOPK_NONFINITE")
    if k < 0:
        raise ValueError("TOPK_K_NEGATIVE")
    return sorted(range(len(s)), key=lambda i: (-s[i], o[i]))[:k]


def scoring_receipt(batch: ConceptTileBatchV1, scores: Iterable[float], *, model_revision: str, top_k: int) -> dict:
    """Derived, non-canonical receipt over REAL candidates only (padding can never be selected)."""
    sc = list(scores)
    if len(sc) != batch.batch_size:
        raise ValueError("RECEIPT_SCORE_COUNT_MISMATCH")
    if not str(model_revision or "").strip():
        raise ValueError("RECEIPT_MODEL_REVISION_MISSING")
    idx = stable_top_k(sc, batch.candidate_ordinals, top_k)
    return {"schema": "atlas.candidate-score-receipt.v2", "orderDigest": batch.order_digest,
            "batchChecksum": batch.checksum, "modelRevision": model_revision,
            "ordinalMapRevision": batch.ordinal_map_revision,
            "topKOrdinals": [batch.candidate_ordinals[i] for i in idx], "canonicalAuthority": False,
            "writesPerformed": False}


# ---- Sealed CandidateOrdinalMapV1 verification (port of features/canonical-candidate-v1.ts) ----
def _canonical_json(value: object) -> str:
    """Port of the TS `canonicalJson`: keys sorted by UTF-8 bytes, no whitespace, None kept, no ASCII escaping."""
    if value is None or isinstance(value, (bool, str)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("SEALED_MAP_NONFINITE")
        return json.dumps(int(value) if value.is_integer() else value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: kv[0].encode("utf-8"))
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{_canonical_json(v)}" for k, v in items) + "}"
    raise ValueError("SEALED_MAP_UNSUPPORTED_TYPE")


def sealed_ordinal_map_checksum(sealed_map: Mapping[str, object]) -> str:
    """Recompute `ordinalMapChecksum` exactly as the TS materializer does."""
    payload = {"candidateSnapshotRevision": sealed_map["candidateSnapshotRevision"],
               "workspaceRevision": sealed_map["workspaceRevision"],
               "candidates": sealed_map["candidates"]}
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def verify_sealed_ordinal_map(sealed_map: Mapping[str, object]) -> str:
    """Fail closed unless the map matches the TypeScript row-count and revision invariants."""
    cands = sealed_map.get("candidates")
    if not isinstance(cands, list) or not cands:
        raise ValueError("SEALED_MAP_NO_CANDIDATES")
    row_count = sealed_map.get("rowCount")
    if not isinstance(row_count, int) or isinstance(row_count, bool) or row_count != len(cands):
        raise ValueError("SEALED_MAP_ROW_COUNT_MISMATCH")
    if sealed_ordinal_map_checksum(sealed_map) != sealed_map.get("ordinalMapChecksum"):
        raise ValueError("SEALED_MAP_CHECKSUM_MISMATCH")
    if [c.get("candidateOrdinal") for c in cands] != list(range(len(cands))):
        raise ValueError("SEALED_MAP_ORDINALS_NOT_CONTIGUOUS")
    if len({c.get("canonicalId") for c in cands}) != len(cands):
        raise ValueError("SEALED_MAP_CANONICAL_ID_DUPLICATE")
    if any(c.get("workspaceRevision") != sealed_map.get("workspaceRevision") for c in cands):
        raise ValueError("SEALED_MAP_WORKSPACE_REVISION_MISMATCH")
    if any(c.get("candidateSnapshotRevision") != sealed_map.get("candidateSnapshotRevision") for c in cands):
        raise ValueError("SEALED_MAP_SNAPSHOT_REVISION_MISMATCH")
    return str(sealed_map["ordinalMapChecksum"])


def bind_batch_to_sealed_map(batch: ConceptTileBatchV1, sealed_map: Mapping[str, object]) -> None:
    """Every real candidate ordinal must resolve in the verified sealed map the batch declares, and the row's
    packet_key / source_revision must equal the map candidate's (padding is skipped)."""
    checksum = verify_sealed_ordinal_map(sealed_map)
    if batch.ordinal_map_revision != checksum:
        raise ValueError("BATCH_ORDINAL_MAP_CHECKSUM_MISMATCH")
    cands = sealed_map["candidates"]  # type: ignore[index]
    n = len(cands)  # type: ignore[arg-type]
    for ordinal, pk, sr in zip(batch.slot_ordinals, batch.slot_packet_keys, batch.slot_source_revisions):
        if ordinal == PAD_ORDINAL:
            continue
        if not 0 <= ordinal < n:
            raise ValueError("BATCH_ORDINAL_NOT_IN_SEALED_MAP")
        cand = cands[ordinal]  # type: ignore[index]
        if cand.get("packetKey") != pk:
            raise ValueError("BATCH_PACKET_KEY_MISMATCH")
        if cand.get("sourceRevision") != sr:
            raise ValueError("BATCH_SOURCE_REVISION_MISMATCH")
