from __future__ import annotations

import importlib.util
import hashlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
REV = "sha256:" + "a" * 64


def _load_mod():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "run-bow-relation-clustering-v1.py"
    spec = importlib.util.spec_from_file_location("run_bow_relation_clustering_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_bow_clustering_and_byte_verified_relation_proposals_stay_separate(monkeypatch):
    mod = _load_mod()
    captured_tasks = []
    original_builder = mod.build_task_keyword_csr_v1

    def capture_tasks(tasks):
        captured_tasks.extend(tasks)
        return original_builder(tasks)

    monkeypatch.setattr(mod, "build_task_keyword_csr_v1", capture_tasks)
    chunks = [
        {
            "chunkId": "c1",
            "sourceRef": "src/a.ts",
            "sourceRevision": REV,
            "contentSha256": "b" * 64,
            "chunkSha256": hashlib.sha256(b"import { db } from '$lib/db';\nexport const q = db;").hexdigest(),
            "text": "import { db } from '$lib/db';\nexport const q = db;",
        },
        {
            "chunkId": "c2",
            "sourceRef": "src/b.ts",
            "sourceRevision": REV,
            "contentSha256": "c" * 64,
            "chunkSha256": hashlib.sha256(b"import { cache } from '$lib/redis';\nexport const r = cache;").hexdigest(),
            "text": "import { cache } from '$lib/redis';\nexport const r = cache;",
        },
        {
            "chunkId": "c3",
            "sourceRef": "src/c.ts",
            "sourceRevision": REV,
            "contentSha256": "d" * 64,
            "chunkSha256": hashlib.sha256(b"postgres pgvector index query retrieval").hexdigest(),
            "text": "postgres pgvector index query retrieval",
        },
        {
            "chunkId": "c4",
            "sourceRef": "src/d.ts",
            "sourceRevision": REV,
            "contentSha256": "e" * 64,
            "chunkSha256": hashlib.sha256(b"gpu vram tensor eviction lease").hexdigest(),
            "text": "gpu vram tensor eviction lease",
        },
    ]
    res = mod.run_bow_relation_clustering_v1(chunks, n_clusters=2, allow_gpu=False)
    assert res["chunkCount"] == 4
    assert res["clustering"]["clustersCanMintRelations"] is False
    assert 0.0 <= res["clustering"]["trustworthiness"] <= 1.0
    assert res["relationProposals"]["verifiedProposedCount"] == 2
    assert res["relationProposals"]["rejectedCount"] == 0
    assert captured_tasks[0]["taskRevision"] == REV
    assert captured_tasks[0]["sourceSha256"] == "sha256:" + "b" * 64
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
