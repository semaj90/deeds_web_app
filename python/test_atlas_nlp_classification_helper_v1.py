import json

from atlas_nlp_classification_helper_v1 import ClassificationRequestV1, classify_request


def request() -> ClassificationRequestV1:
    return ClassificationRequestV1(
        text="Qdrant embedding retrieval uses PostgreSQL evidence and an AST graph relation.",
        sourceRef="fixture/nlp-classification.py",
        sourceRevision="sha256:" + "1" * 64,
        workspaceRevision="sha256:" + "2" * 64,
        sourceNamespace="fixture",
        treeNodeId="fixture:node:1",
        language="python",
    )


def test_classification_is_revision_bound_and_noncanonical():
    first = classify_request(request())
    second = classify_request(request())
    assert first["proposalChecksum"] == second["proposalChecksum"]
    assert first["domain"] == "retrieval"
    assert first["linkedTupleProposal"]["status"] == "PROPOSAL_ONLY"
    assert first["canonicalAuthority"] is False
    assert first["writesPerformed"] is False
    assert first["hmmWorkflow"]["promotionAuthorized"] is False
    assert first["signal"]["sourceRevision"].startswith("sha256:")
    assert first["okfSchemaRevision"] == "atlas.okf-v02"
    assert first["linkedTupleProposal"]["sourceRevision"] == first["sourceRevision"]
    assert first["linkedTupleProposal"]["evidenceRefs"] == first["signal"]["evidenceRefs"]


def test_workspace_revision_is_metadata_not_label_authority():
    first = classify_request(request())
    changed = request().model_copy(update={"workspace_revision": "sha256:" + "3" * 64})
    second = classify_request(changed)
    assert first["domain"] == second["domain"]
    assert first["signal"]["sourceRevision"] == second["signal"]["sourceRevision"]
    # The label is unchanged, but the revision-bound proposal receipt changes
    # because workspace context is part of the evidence envelope.
    assert first["proposalChecksum"] != second["proposalChecksum"]


def test_serialization_is_json_safe():
    json.dumps(classify_request(request()), sort_keys=True)


def test_existing_sidecar_analysis_can_attach_advisory_proposal():
    from miniforge_nlp_sidecar import AnalyzeRequest, _analyze

    response = _analyze(
        AnalyzeRequest(
            text="Qdrant retrieval uses a revision-qualified AST graph.",
            source_ref="fixture/sidecar.py",
            sourceRevision="sha256:" + "4" * 64,
            workspaceRevision="sha256:" + "5" * 64,
            sourceNamespace="fixture",
            treeNodeId="fixture:sidecar:1",
            source_type="plain_text",
        )
    )
    assert response.classification_proposal is not None
    assert response.classification_proposal["canonicalAuthority"] is False
    assert response.classification_proposal["writesPerformed"] is False


def test_sidecar_classify_model_challenger_is_shadow_only():
    from miniforge_nlp_sidecar import classify

    result = classify(request().model_copy(update={"run_model_challenger": True}))
    assert result["trainedClassifier"]["status"] in {"SHADOW_ONLY", "UNAVAILABLE"}
    assert result["trainedClassifier"]["promotionAuthorized"] is False
    assert result["trainedClassifier"]["canonicalAuthority"] is False
    assert result["trainedClassifier"]["writesPerformed"] is False
