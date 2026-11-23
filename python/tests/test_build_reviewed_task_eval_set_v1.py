from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_mod():
    mod_path = REPO_ROOT / "scripts" / "atlas" / "build-reviewed-task-eval-set-v1.py"
    spec = importlib.util.spec_from_file_location("build_reviewed_task_eval_set_v1", mod_path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_builds_36_disjoint_task_groups_and_fails_closed_when_unreviewed():
    mod = _load_mod()
    tasks = [
        {
            "taskId": f"chg-{i}:L1",
            "change": f"chg-{i}",
            "status": "OPEN",
            "sourceRef": f"openspec/changes/chg-{i}/tasks.md",
            "sourceSha256": "sha256:" + "a" * 64,
            "text": f"Implement retrieval graph query {i}",
        }
        for i in range(36)
    ]
    chunks = [
        {
            "chunkId": f"card:{j}",
            "sourceRef": f"src/f{j}.ts",
            "sourceRevision": "sha256:" + "b" * 64,
            "text": "Implement retrieval graph query",
        }
        for j in range(5)
    ]

    records, receipt = mod.build_leakage_free_eval_template_v1(tasks, chunks, target_groups=36)
    assert receipt["totalTaskGroups"] == 36
    assert receipt["trainTaskGroups"] == 24
    assert receipt["heldOutTaskGroups"] == 12
    assert receipt["sourceLeakageCount"] == 0
    assert receipt["reviewCompleted"] is False

    # Unreviewed set must fail closed
    blocked = mod.evaluate_reviewed_holdout_v1(records)
    assert blocked["status"] == "UNREVIEWED_EVAL_SET"
    assert blocked["passed"] is False

    # Once reviewed, metrics compute deterministically
    for r in records:
        if r["split"] == "held_out":
            r["reviewStatus"] = "REVIEWED"
            r["candidates"][0]["relevanceLabel"] = 1.0
            r["candidates"][0]["citationVerified"] = True

    ok = mod.evaluate_reviewed_holdout_v1(records)
    assert ok["status"] == "EVALUATED"
    assert ok["recallAtK"] == 1.0
    assert ok["mrr"] == 1.0
    assert ok["citationPassRate"] == 1.0
    assert ok["passed"] is True
