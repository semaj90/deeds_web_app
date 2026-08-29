"""Read-only 15-candidate tokenizer parity and tile-plan proof."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "models" / "embeddinggemma_300m_onnx"
MAP_PATH = ROOT / ".tmp" / "atlas" / "lineage-qualified-candidate-map-v1.json"
REPORT = ROOT / "docs" / "reports" / "embedding-tokenizer-candidate-tiles-v1.json"


def load_candidates() -> list[dict]:
    node_script = r"""
const fs = require('fs');
const pg = require('pg');
const { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } = require(process.cwd() + '/scripts/atlas/connection-config.mjs');
(async () => {
  const env = loadRepoEnv(process.env);
  const map = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  const candidates = map.candidates.slice(0, 15);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });
  try {
    const result = await pool.query(
      'SELECT DISTINCT ON (source_ref) source_ref, content FROM public.codebase_chunk_index WHERE source_ref = ANY($1::text[]) ORDER BY source_ref, id',
      [candidates.map((candidate) => candidate.sourceRef)],
    );
    const content = new Map(result.rows.map((row) => [row.source_ref, String(row.content ?? '')]));
    process.stdout.write(JSON.stringify({ map, candidates: candidates.map((candidate) => ({ ...candidate, content: content.get(candidate.sourceRef) ?? null })) }));
  } finally { await pool.end(); }
})().catch((error) => { console.error(error?.stack || error); process.exit(1); });
"""
    completed = subprocess.run(["node", "-e", node_script, str(MAP_PATH)], cwd=ROOT, text=True, capture_output=True, check=True)
    payload = json.loads(completed.stdout)
    if any(candidate["content"] is None for candidate in payload["candidates"]):
        missing = [candidate["sourceRef"] for candidate in payload["candidates"] if candidate["content"] is None]
        raise RuntimeError(f"CANONICAL_SOURCE_TEXT_MISSING:{missing}")
    return payload["candidates"]


def node_ids(texts: list[str]) -> list[list[int]]:
    node_script = r"""
const fs = require('fs');
const { createRequire } = require('module');
const root = process.cwd();
const req = createRequire(root + '/services/embedding-onnx-webgpu/package.json');
const { env, AutoTokenizer } = req('@huggingface/transformers');
env.localModelPath = root + '/sveltekit-frontend/static';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', { local_files_only: true })
  .then((tokenizer) => process.stdout.write(JSON.stringify(input.map((text) => tokenizer._tokenizer.encode(text).ids))))
  .catch((error) => { console.error(error?.stack || error); process.exit(1); });
"""
    completed = subprocess.run(["node", "-e", node_script], cwd=ROOT, input=json.dumps(texts), text=True, capture_output=True, check=True)
    return json.loads(completed.stdout)


def digest(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def tile_ranges(text: str, offsets: list[list[int]], max_tokens: int = 512, overlap: int = 64) -> list[dict]:
    step = max_tokens - overlap
    result = []
    for index, start in enumerate(range(0, len(offsets), step)):
        end = min(start + max_tokens, len(offsets))
        selected = offsets[start:end]
        source_offsets = [item for item in selected if item[1] > item[0]]
        source_offsets = source_offsets or [[0, 0]]
        char_start = min(item[0] for item in source_offsets)
        char_end = max(item[1] for item in source_offsets)
        result.append({
            "tileIndex": index,
            "tokenStart": start,
            "tokenEnd": end,
            "tokenCount": end - start,
            "byteStart": len(text[:char_start].encode("utf-8")),
            "byteEnd": len(text[:char_end].encode("utf-8")),
            "charStart": char_start,
            "charEnd": char_end,
        })
        if end == len(offsets):
            break
    return result


def main() -> int:
    candidates = load_candidates()
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), local_files_only=True, use_fast=True)
    texts = [f"title: none | text: {candidate['content']}" for candidate in candidates]
    node = node_ids(texts)
    rows = []
    all_match = True
    for candidate, rendered, node_row in zip(candidates, texts, node, strict=True):
        encoded = tokenizer(rendered, return_offsets_mapping=True, add_special_tokens=True, truncation=False)
        python_ids = [int(value) for value in encoded["input_ids"]]
        offsets = [[int(start), int(end)] for start, end in encoded["offset_mapping"]]
        match = python_ids == node_row
        all_match = all_match and match
        ranges = tile_ranges(rendered, offsets)
        rows.append({
            "candidateOrdinal": candidate["candidateOrdinal"],
            "sourceRef": candidate["sourceRef"],
            "renderedInputChecksum": digest(rendered),
            "tokenCount": len(python_ids),
            "tokenIdsMatch": match,
            "offsetsAvailable": len(offsets) == len(python_ids),
            "requiresTiling": len(python_ids) > 512,
            "tileRanges": ranges,
            "tileInputs": [rendered[item["charStart"]:item["charEnd"]] for item in ranges],
        })
    report = {
        "schema": "atlas.embedding-tokenizer-candidate-tiles.v1",
        "readOnly": True,
        "candidateCount": len(rows),
        "candidateSnapshotRevision": json.loads(MAP_PATH.read_text(encoding="utf-8"))["candidateSnapshotRevision"],
        "ordinalMapChecksum": json.loads(MAP_PATH.read_text(encoding="utf-8"))["ordinalMapChecksum"],
        "tokenizerChecksum": digest((MODEL_DIR / "tokenizer.json").read_text(encoding="utf-8")),
        "candidates": rows,
        "summary": {"tokenIdsMatch": all_match, "offsetsAvailable": all(row["offsetsAvailable"] for row in rows), "tilesRequired": sum(row["requiresTiling"] for row in rows), "tileCount": sum(len(row["tileRanges"]) for row in rows)},
        "status": "CANDIDATE_TILE_TOKENIZER_PARITY_PROVEN" if all_match else "CANDIDATE_TILE_TOKENIZER_PARITY_BLOCKED",
        "writesPerformed": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "candidateCount": len(rows), "summary": report["summary"], "reportPath": str(REPORT)}, indent=2))
    return 0 if all_match else 1


if __name__ == "__main__":
    raise SystemExit(main())
