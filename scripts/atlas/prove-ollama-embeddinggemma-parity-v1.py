"""Read-only parity check: Ollama embeddinggemma:latest (:11434) vs stored :8081 vectors in Postgres 18."""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "semantic-doc-01-ollama-embedding-parity-v1.json"


def main() -> int:
    load_dotenv(REPO_ROOT / "sveltekit-frontend" / ".env", override=False)
    dsn = os.environ.get("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
    ollama_url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.chunk_id, p.title, c.text, c.content_embedding::text
                FROM public.atlas_external_doc_chunks c
                JOIN public.atlas_external_doc_pages p ON p.id = c.page_id
                WHERE c.content_embedding IS NOT NULL
                ORDER BY c.chunk_id
                LIMIT 24
            """)
            rows = cur.fetchall()

    inputs = [f"title: {title or 'none'} | text: {text}" for _, title, text, _ in rows]
    req = urllib.request.Request(
        f"{ollama_url}/api/embed",
        data=json.dumps({"model": "embeddinggemma:latest", "input": inputs, "truncate": False}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        embs = json.loads(resp.read().decode("utf-8"))["embeddings"]

    cosines: list[float] = []
    for (_, _, _, stored_txt), ollama_vec in zip(rows, embs):
        a = np.fromstring(stored_txt.strip("[]"), sep=",", dtype=np.float32)
        b = np.asarray(ollama_vec, dtype=np.float32)
        cos = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
        cosines.append(cos)

    min_cos = min(cosines)
    mean_cos = float(np.mean(cosines))
    passed = len(cosines) >= 10 and mean_cos >= 0.98 and min_cos >= 0.95
    report = {
        "schema": "atlas.semantic-doc-01-embedding-parity.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "gate": "SEMANTIC-DOC-01 parity (Ollama embeddinggemma:latest vs stored :8081)",
        "executor": {
            "url": ollama_url,
            "kind": "Ollama embeddinggemma:latest (/api/embed, truncate:false)",
        },
        "sampleCount": len(cosines),
        "measured": {
            "mean_cosine": round(mean_cos, 6),
            "min_cosine": round(min_cos, 6),
        },
        "thresholds": {
            "mean_cosine_min": 0.98,
            "min_cosine_min": 0.95,
        },
        "result": "EMBEDDING_PARITY_PROVEN" if passed else "EMBEDDING_PARITY_FAILED",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": report["result"],
        "sampleCount": report["sampleCount"],
        "measured": report["measured"],
        "reportPath": str(REPORT_PATH),
    }, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
