from __future__ import annotations

import hashlib

import pytest

from parent_atlas_learning.task_prefill_ace_qlora_packet_v1 import (
    build_task_prefill_ace_qlora_packet_v1,
    make_human_reviewed_qlora_sample_v1,
    verify_task_prefill_ace_qlora_packet_v1,
)
from atlas_graph_runtime.doc14_bounded_rlm_recommender_v1 import _canonical_sha256_v1


def _fixture():
    text = "def search(): return 'evidence'\n"
    source_revision = "sha256:" + "a" * 64
    workspace_revision = "sha256:" + "b" * 64
    identity = {
        "selectedOrdinalSetChecksum": "1" * 64,
        "ordinalMapChecksum": "2" * 64,
        "retrievalPolicyRevision": "policy-v1",
        "acePlaybookRevision": "playbook-v1",
        "evidenceRevisions": {
            "sourceRevision": _canonical_sha256_v1({
                "schema": "atlas.ace-context-source-revision-set.v1", "revisions": [source_revision],
            }),
            "representationRevision": "rep-v1", "featureRevision": "sha256:" + "d" * 64,
            "ontologyRevision": "ontology-v1", "modelRevision": "model-v1",
            "promptTemplateRevision": "prompt-v1",
        },
    }
    v1 = {
        "schema": "atlas.context-manifest.v1", "requestId": "req-task-prefill-1",
        "snapshotId": "snapshot-task-prefill-1", "candidateBucket": 1, "candidateCount": 1,
        "tokenBudget": 2048, "query": "How does search verify evidence?",
        "producerRevision": "ace-producer-v1", "workspaceRevision": workspace_revision,
        "selectedNodeKeys": ["chunk-node-1"], "evidenceRefs": ["python/search.py"],
    }
    context = {
        "schema": "atlas.context-manifest.v2", "identityInput": identity, "v1": v1,
        "identityChecksum": _canonical_sha256_v1({
            "schema": "atlas.context-manifest-v2-identity.v1", "v1RequestId": v1["requestId"],
            "v1SnapshotId": v1["snapshotId"], "v1CandidateBucket": v1["candidateBucket"], **identity,
        }),
    }
    rows = [{
        "manifestNodeKey": "chunk-node-1",
        "chunkId": "chunk-1",
        "sourceRef": "python/search.py",
        "sourceRevision": source_revision,
        "workspaceRevision": workspace_revision,
        "chunkSha256": hashlib.sha256(text.encode()).hexdigest(),
        "text": text,
        "evidenceRefs": ["python/search.py"],
        "pgReadbackStatus": "PROVEN",
        "lineageMembershipStatus": "EXACT_SINGLE_MEMBER",
        "lineageRevisionStatus": "PROVEN",
    }]
    packet = build_task_prefill_ace_qlora_packet_v1(
        task_id="task-search-42",
        query="How does search verify evidence?",
        concept_id="atlas:retrieval-search",
        instruction="Review the cited implementation for this task.",
        context_manifest=context,
        readback_rows=rows,
        unsupervised_features_by_source={"python/search.py": {
            "clusterId": "cluster-7",
            "clusterRevision": "sha256:" + "e" * 64,
            "topicIds": ["retrieval", "evidence"],
            "pagerankScore": 0.71,
        }},
        created_at="2026-11-27T18:00:00Z",
    )
    return packet, context, rows


def test_builds_task_bound_ace_packet_and_ungraded_qlora_review_candidate():
    packet, _, _ = _fixture()
    assert verify_task_prefill_ace_qlora_packet_v1(packet)
    assert packet["taskId"] == "task-search-42"
    assert packet["trainingStatus"] == "REVIEW_CANDIDATES_ONLY"
    assert packet["unsupervisedFeaturesAreLabels"] is False
    assert packet["acePackets"][0]["unsupervisedFeatures"]["clusterId"] == "cluster-7"
    assert packet["qloraReviewCandidates"][0]["grade"] is None
    assert packet["qloraReviewCandidates"][0]["reviewStatus"] == "AWAITING_HUMAN_REVIEW"
    assert "text" not in packet["acePackets"][0]
    assert packet["writesPerformed"] is False


def test_human_review_conversion_uses_existing_qlora_sample_contract():
    packet, _, _ = _fixture()
    candidate_key = packet["qloraReviewCandidates"][0]["candidatePacketKey"]
    sample = make_human_reviewed_qlora_sample_v1(
        packet, candidate_packet_key=candidate_key, grade=3, reviewer_id="reviewer:one",
    )
    assert sample["query_group_id"] == "task-search-42"
    assert sample["reviewer_kind"] == "HUMAN"
    assert sample["grade"] == 3


def test_same_source_multiple_chunks_receive_distinct_review_keys():
    _, context, rows = _fixture()
    context["v1"]["selectedNodeKeys"] = ["chunk-node-1", "chunk-node-2"]
    context["v1"]["candidateCount"] = 2
    second_text = "def rerank(): return 'candidate'\n"
    second = dict(rows[0])
    second.update(
        manifestNodeKey="chunk-node-2",
        chunkId="chunk-2",
        chunkSha256=hashlib.sha256(second_text.encode()).hexdigest(),
        text=second_text,
    )
    packet = build_task_prefill_ace_qlora_packet_v1(
        task_id="task-search-42", query="How does search verify evidence?",
        concept_id="atlas:retrieval-search", instruction="Review the cited implementation for this task.",
        context_manifest=context, readback_rows=[*rows, second], created_at="2026-11-27T18:00:00Z",
    )
    candidates = packet["qloraReviewCandidates"]
    assert candidates[0]["candidatePacketKey"] != candidates[1]["candidatePacketKey"]
    assert candidates[0]["acePacketId"] == candidates[1]["acePacketId"]


@pytest.mark.parametrize("change, error", [
    (lambda ctx, rows: (ctx.update(schema="atlas.context-manifest.v1"), rows), "CONTEXT_MANIFEST_V2_REQUIRED"),
    (lambda ctx, rows: (rows[0].update(pgReadbackStatus="MISSING"), rows), "ACE_CONTEXT_ROW_NOT_VERIFIED"),
    (lambda ctx, rows: (rows[0].update(workspaceRevision="sha256:" + "f" * 64), rows), "READBACK_WORKSPACE_REVISION_MISMATCH"),
])
def test_fail_closed_on_manifest_or_readback_mismatch(change, error):
    packet, _, _ = _fixture()
    # Reconstruct a fully valid manifest so the mutation reaches the intended boundary.
    source_revision = "sha256:" + "a" * 64
    identity = {
        "selectedOrdinalSetChecksum": "1" * 64, "ordinalMapChecksum": "2" * 64,
        "retrievalPolicyRevision": "policy-v1", "acePlaybookRevision": "playbook-v1",
        "evidenceRevisions": {
            "sourceRevision": _canonical_sha256_v1({
                "schema": "atlas.ace-context-source-revision-set.v1", "revisions": [source_revision],
            }),
            "representationRevision": "rep-v1", "featureRevision": "feat-v1",
            "ontologyRevision": "ontology-v1", "modelRevision": "model-v1", "promptTemplateRevision": "prompt-v1",
        },
    }
    v1 = {
        "schema": "atlas.context-manifest.v1", "requestId": "req-1", "snapshotId": "snap-1",
        "candidateBucket": 1, "candidateCount": 1, "tokenBudget": 1024, "query": "query",
        "producerRevision": "producer-v1", "workspaceRevision": packet["workspaceRevision"],
        "selectedNodeKeys": ["chunk-node-1"], "evidenceRefs": ["python/search.py"],
    }
    context = {
        "schema": "atlas.context-manifest.v2", "identityInput": identity, "v1": v1,
        "identityChecksum": _canonical_sha256_v1({
            "schema": "atlas.context-manifest-v2-identity.v1", "v1RequestId": v1["requestId"],
            "v1SnapshotId": v1["snapshotId"], "v1CandidateBucket": v1["candidateBucket"], **identity,
        }),
    }
    text = "def search(): return 'evidence'\n"
    row = {
        "manifestNodeKey": "chunk-node-1", "chunkId": "chunk-1",
        "sourceRef": "python/search.py", "sourceRevision": source_revision,
        "workspaceRevision": packet["workspaceRevision"],
        "chunkSha256": hashlib.sha256(text.encode()).hexdigest(), "text": text,
        "evidenceRefs": ["python/search.py"],
        "pgReadbackStatus": "PROVEN", "lineageMembershipStatus": "EXACT_SINGLE_MEMBER",
        "lineageRevisionStatus": "PROVEN",
    }
    rows = [row]
    change(context, rows)
    with pytest.raises(ValueError, match=error):
        build_task_prefill_ace_qlora_packet_v1(
            task_id="task-search-42", query="query", concept_id="atlas:retrieval",
            instruction="Review evidence", context_manifest=context,
            readback_rows=rows, created_at="2026-11-27T18:00:00Z",
        )


def test_unsupervised_scores_cannot_be_injected_as_training_labels_and_packet_tamper_fails():
    packet, context, rows = _fixture()
    candidate_key = packet["qloraReviewCandidates"][0]["candidatePacketKey"]
    with pytest.raises(ValueError, match="UNSUPPORTED_UNSUPERVISED_FEATURES"):
        build_task_prefill_ace_qlora_packet_v1(
            task_id="task-search-42", query="How does search verify evidence?", concept_id="atlas:retrieval",
            instruction="Review evidence", context_manifest=context,
            readback_rows=rows,
            unsupervised_features_by_source={"python/search.py": {"grade": 3}},
            created_at="2026-11-27T18:00:00Z",
        )
    packet["qloraReviewCandidates"][0]["grade"] = 3
    assert not verify_task_prefill_ace_qlora_packet_v1(packet)
    with pytest.raises(ValueError, match="TASK_PREFILL_PACKET_CHECKSUM_OR_STATUS_INVALID"):
        make_human_reviewed_qlora_sample_v1(packet, candidate_packet_key=candidate_key, grade=3, reviewer_id="reviewer:one")
