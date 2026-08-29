"""Read-only Python/Node tokenizer parity proof for EmbeddingGemma."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "models" / "embeddinggemma_300m_onnx"
NODE_PACKAGE = ROOT / "services" / "embedding-onnx-webgpu" / "package.json"
REPORT = ROOT / "docs" / "reports" / "embedding-tokenizer-parity-v1.json"

FIXTURES = [
    ("RETRIEVAL_QUERY", "task: search result | query: PostgreSQL bitmap scan"),
    ("CODE_RETRIEVAL_QUERY", "task: code retrieval | query: CandidateOrdinal checksum"),
    ("RETRIEVAL_DOCUMENT", "title: none | text: PostgreSQL bitmap scan"),
    ("CLASSIFICATION_QUERY", "task: classification | query: graph revision owner"),
    ("CLUSTERING_QUERY", "task: clustering | query: semantic tile candidate"),
]


def sha256(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def node_ids(texts: list[str]) -> list[list[int]]:
    script = r"""
const fs = require('fs');
const { createRequire } = require('module');
const root = process.cwd();
const req = createRequire(root + '/services/embedding-onnx-webgpu/package.json');
const { env, AutoTokenizer } = req('@huggingface/transformers');
env.localModelPath = root + '/sveltekit-frontend/static';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', { local_files_only: true })
  .then((tokenizer) => {
    const ids = input.map((text) => tokenizer._tokenizer.encode(text).ids);
    process.stdout.write(JSON.stringify(ids));
  })
  .catch((error) => { console.error(error?.stack || error); process.exit(1); });
"""
    completed = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        input=json.dumps(texts),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(completed.stdout)


def main() -> int:
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), local_files_only=True, use_fast=True)
    texts = [text for _, text in FIXTURES]
    node = node_ids(texts)
    rows = []
    all_match = True
    for (role, text), node_row in zip(FIXTURES, node, strict=True):
        encoded = tokenizer(text, return_offsets_mapping=True, add_special_tokens=True)
        python_ids = [int(value) for value in encoded["input_ids"]]
        offsets = [[int(start), int(end)] for start, end in encoded["offset_mapping"]]
        match = python_ids == node_row
        all_match = all_match and match
        rows.append({
            "role": role,
            "renderedInput": text,
            "pythonTokenCount": len(python_ids),
            "nodeTokenCount": len(node_row),
            "tokenIdsMatch": match,
            "pythonTokenIds": python_ids,
            "offsets": offsets,
        })
    report = {
        "schema": "atlas.embedding-tokenizer-parity.v1",
        "readOnly": True,
        "tokenizer": {
            "modelDirectory": str(MODEL_DIR.relative_to(ROOT)).replace(os.sep, "/"),
            "tokenizerChecksum": sha256(MODEL_DIR / "tokenizer.json"),
            "pythonBackend": type(tokenizer).__name__,
            "nodePackage": "@huggingface/transformers",
        },
        "fixtures": rows,
        "allTokenIdsMatch": all_match,
        "offsetsAvailableInPython": all("offsets" in row for row in rows),
        "status": "EMBEDDING_TOKENIZER_PARITY_PROVEN" if all_match else "EMBEDDING_TOKENIZER_PARITY_BLOCKED",
        "writesPerformed": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "fixtureCount": len(rows), "reportPath": str(REPORT)}, indent=2))
    return 0 if all_match else 1


if __name__ == "__main__":
    raise SystemExit(main())
