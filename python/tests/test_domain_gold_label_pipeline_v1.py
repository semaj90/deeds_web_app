"""Tests for the read-only domain gold-label export, floor gate, and group-split anti-leakage."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load_module(name: str, rel_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_propose_domain_label_is_advisory() -> None:
    exp = _load_module("export_domain_label_queue_v1", "scripts/eval/export_domain_label_queue_v1.py")
    assert exp.propose_domain_label("sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts", None, "") == "retrieval_search"
    assert exp.propose_domain_label("sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts", None, "") == "graph_ontology"
    assert exp.propose_domain_label("sveltekit-frontend/src/routes/(app)/+page.svelte", None, "") == "ui_frontend"


def test_validate_gold_labels_floor_and_group_split() -> None:
    val = _load_module("validate_domain_gold_labels_v1", "scripts/eval/validate_domain_gold_labels_v1.py")

    rows = []
    for c_idx, cls_name in enumerate(val.CLASSES):
        for i in range(35):
            # 2 chunks per file to verify group split keeps same source_ref together
            src = f"src/{cls_name}/file_{i // 2}.ts"
            rows.append(
                {
                    "chunk_id": f"chk_{c_idx}_{i}",
                    "source_ref": src,
                    "sha256": f"sha_{c_idx}_{i}",
                    "proposed_label": cls_name,
                    "gold_label": cls_name,
                    "status": "reviewed",
                }
            )
    # Add skipped / ambiguous rows that must not enter the floor count
    rows.append(
        {
            "chunk_id": "chk_skip",
            "source_ref": "src/misc/skip.ts",
            "sha256": "sha_skip",
            "proposed_label": "retrieval_search",
            "gold_label": None,
            "status": "skip",
        }
    )

    report = val.validate_gold_labels(rows)
    assert report["total_reviewed"] == 210
    assert report["group_leakage_count"] == 0
    assert report["passed"] is True

    # Under-floor check fails cleanly
    small_report = val.validate_gold_labels(rows[:100])
    assert small_report["passed"] is False


def test_gated_trainer_end_to_end() -> None:
    val = _load_module("validate_domain_gold_labels_v1", "scripts/eval/validate_domain_gold_labels_v1.py")
    trn = _load_module("train_domain_classifier_v1", "scripts/eval/train_domain_classifier_v1.py")

    rng = np.random.default_rng(42)
    rows = []
    vecs = {}
    for c_idx, cls_name in enumerate(val.CLASSES):
        proto = np.zeros(16, dtype=np.float32)
        proto[c_idx] = 4.0
        for i in range(36):
            cid = f"chk_{c_idx}_{i}"
            rows.append(
                {
                    "chunk_id": cid,
                    "source_ref": f"src/{cls_name}/file_{i // 2}.ts",
                    "sha256": f"sha_{c_idx}_{i}",
                    "proposed_label": cls_name,
                    "gold_label": cls_name,
                    "status": "reviewed",
                }
            )
            vecs[cid] = proto + rng.normal(0.0, 0.2, size=16).astype(np.float32)

    result = trn.train_and_evaluate_linear_classifier(rows, vecs)
    assert result["canonical_authority"] is False
    assert result["group_leakage_count"] == 0
    assert result["test"]["accuracy"] >= 0.90


def _separable_rows(val, per_class: int = 60):
    rng = np.random.default_rng(7)
    rows, vecs = [], {}
    for c_idx, cls_name in enumerate(val.CLASSES):
        for i in range(per_class):
            cid = f"c{c_idx}_{i}"
            rows.append({"chunk_id": cid, "source_ref": f"src/{cls_name}/{i}.ts", "sha256": f"s{c_idx}_{i}",
                         "gold_label": cls_name, "status": "reviewed"})
            vec = rng.normal(0.0, 0.1, size=16).astype(np.float32)
            vec[c_idx] += 3.0
            vecs[cid] = vec
    return rows, vecs


def _modules():
    val = _load_module("validate_domain_gold_labels_v1", "scripts/eval/validate_domain_gold_labels_v1.py")
    trn = _load_module("train_domain_classifier_v1", "scripts/eval/train_domain_classifier_v1.py")
    return val, trn


def test_duplicate_chunk_rows_are_rejected() -> None:
    val, _ = _modules()
    rows, _vecs = _separable_rows(val)
    with pytest.raises(ValueError, match="DUPLICATE_CHUNK_ID"):
        val.validate_gold_labels(rows + [rows[0]])


def test_identical_content_cannot_pad_the_floor_or_conflict() -> None:
    val, trn = _modules()
    rows, vecs = _separable_rows(val, per_class=36)
    for row in rows:
        row["content_digest"] = f"same-{row['gold_label']}"
    with pytest.raises(ValueError, match="GOLD_LABEL_GATE_FAILED"):
        trn.train_and_evaluate_linear_classifier(rows, vecs)
    rows[40]["content_digest"] = rows[0]["content_digest"]
    with pytest.raises(ValueError, match="CONFLICTING_LABELS"):
        trn.train_and_evaluate_linear_classifier(rows, vecs)


def test_linked_content_stays_in_one_split() -> None:
    val, _ = _modules()
    rows, _vecs = _separable_rows(val)
    for i, row in enumerate(rows):
        row["content_digest"] = f"pair-{i // 2}"
    splits = val.build_grouped_splits(rows)
    assert val.count_split_leakage(splits) == 0
    # The checker itself must detect a bad split.
    assert val.count_split_leakage({"train": [rows[0]], "val": [], "test": [rows[1]]}) == 1


def test_trainer_fails_on_missing_vector_and_missing_class_in_split() -> None:
    val, trn = _modules()
    rows, vecs = _separable_rows(val)
    partial = dict(vecs)
    partial.pop("c0_0")
    with pytest.raises(ValueError, match="MISSING_VECTORS"):
        trn.train_and_evaluate_linear_classifier(rows, partial)
    for row in rows:
        if row["gold_label"] == val.CLASSES[0]:
            row["source_ref"] = "src/one-file.ts"
    with pytest.raises(ValueError, match="CLASS_MISSING_FROM_SPLIT"):
        trn.train_and_evaluate_linear_classifier(rows, vecs)


def test_trainer_command_saves_report_and_model(tmp_path, monkeypatch) -> None:
    val, trn = _modules()
    rows, vecs = _separable_rows(val)
    gold = tmp_path / "gold.jsonl"
    gold.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    monkeypatch.setattr(trn, "load_training_inputs", lambda loaded: (loaded, vecs))
    out = tmp_path / "run"
    assert trn.main(["--gold", str(gold), "--out-dir", str(out)]) == 0
    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    assert {"validation", "test", "test_per_class", "calibration"} <= set(report)
    assert report["test"]["count"] + report["validation"]["count"] + report["train"]["count"] == 360
    saved = np.load(out / "model.npz")
    assert saved["weights"].shape == (16, len(val.CLASSES))
    assert trn.main(["--gold", str(gold), "--out-dir", str(out)]) == 1  # refuses to reuse the folder


def test_reviewer_asks_again_after_invalid_input(tmp_path) -> None:
    queue, out = tmp_path / "queue.jsonl", tmp_path / "out.jsonl"
    queue.write_text("".join(
        json.dumps({"chunk_id": f"q{i}", "source_ref": f"f{i}.ts", "sha256": "x", "proposed_label": "ui_frontend",
                    "text_preview": "text"}) + "\n" for i in range(2)), encoding="utf-8")
    run = subprocess.run(
        [sys.executable, str(ROOT / "scripts/eval/review_domain_labels.py"), "--queue", str(queue), "--out", str(out)],
        input="9\n\n2\nq\n", capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stderr
    records = [json.loads(l) for l in out.read_text(encoding="utf-8").splitlines()]
    assert [(r["chunk_id"], r["gold_label"]) for r in records] == [("q0", "graph_ontology")]
    assert "PROPOSED" not in run.stdout
    assert records[0]["blind_review"] is True and records[0]["proposal_shown"] is False


def test_export_refuses_to_overwrite_a_queue(tmp_path) -> None:
    exp = _load_module("export_domain_label_queue_v1", "scripts/eval/export_domain_label_queue_v1.py")
    target = tmp_path / "queue.jsonl"
    target.write_text("keep", encoding="utf-8")
    with pytest.raises(FileExistsError):
        exp.export_queue(out_path=target)
    assert target.read_text(encoding="utf-8") == "keep"


def test_training_runs_to_convergence_and_reports_a_capped_run() -> None:
    val, trn = _modules()
    rows, vecs = _separable_rows(val)
    done = trn.train_and_evaluate_linear_classifier(rows, vecs)
    assert done["converged"] is True and 0 < done["epochs_run"] < done["epoch_ceiling"]
    capped = trn.train_and_evaluate_linear_classifier(rows, vecs, epochs=50)
    assert capped["converged"] is False and capped["epochs_run"] == 50


def test_trainer_rejects_mixed_representations_and_nonfinite_vectors() -> None:
    val, trn = _modules()
    rows, vecs = _separable_rows(val)
    mixed_rows = [dict(r, representation_id="eg1-768" if i % 2 == 0 else "eg2-768") for i, r in enumerate(rows)]
    with pytest.raises(ValueError, match="MIXED_EMBEDDING_REPRESENTATIONS"):
        trn.train_and_evaluate_linear_classifier(mixed_rows, vecs)

    bad_vecs = dict(vecs)
    first_id = rows[0]["chunk_id"]
    bad_vecs[first_id] = np.full(16, np.nan, dtype=np.float32)
    with pytest.raises(ValueError, match="INVALID_VECTOR_NONFINITE_OR_ZERO"):
        trn.train_and_evaluate_linear_classifier(rows, bad_vecs)


def test_model_reload_parity(tmp_path) -> None:
    val, trn = _modules()
    rows, vecs = _separable_rows(val)
    model_path = tmp_path / "model.npz"
    report = trn.train_and_evaluate_linear_classifier(rows, vecs, model_path=model_path)
    sample_x = np.vstack([vecs[r["chunk_id"]] for r in rows[:12]])
    reloaded = trn.predict_with_saved_model(model_path, sample_x)
    assert reloaded["classes"] == report["classes"]
    assert abs(reloaded["temperature"] - report["calibration"]["temperature"]) < 1e-3
    assert reloaded["probs"].shape == (12, len(val.CLASSES))
    assert np.allclose(reloaded["probs"].sum(axis=1), 1.0, atol=1e-5)

