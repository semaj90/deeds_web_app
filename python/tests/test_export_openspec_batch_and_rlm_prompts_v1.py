from __future__ import annotations

import importlib.util
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_exporter():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "export-openspec-batch-and-rlm-prompts-v1.py"
    spec = importlib.util.spec_from_file_location("export_openspec_batch_and_rlm_prompts_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_exports_ndjson_csr_4d_topology_and_rlm_prompts(tmp_path: Path):
    mod = _load_exporter()
    changes = tmp_path / "openspec" / "changes"
    c1 = changes / "demo-change"
    c1.mkdir(parents=True)
    (c1 / "tasks.md").write_text(
        "- [x] Done postgres task\n- [ ] Fix svelte-check ast error in retrieval\n",
        encoding="utf-8",
    )

    ndjson_p = tmp_path / "all.ndjson"
    prompts_p = tmp_path / "prompts.jsonl"
    receipt_p = tmp_path / "receipt.json"

    res = mod.export_all_openspec_tasks_and_prompts_v1(
        changes,
        ndjson_path=ndjson_p,
        prompts_path=prompts_p,
        receipt_path=receipt_p,
    )
    assert res["totalTasksExported"] == 2
    assert res["doneTasks"] == 1
    assert res["openTasks"] == 1
    assert res["promptPacketCount"] == 1
    assert res["gpuVramAllocated"] is False
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False

    prompts = [json.loads(line) for line in prompts_p.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert prompts[0]["status"] == "PROPOSED"
    assert prompts[0]["recommendedLane"] == "error-fixing-kanban"
