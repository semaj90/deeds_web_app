from __future__ import annotations

import pytest
from pydantic import ValidationError

from atlas_contract_parity.agent_control_plane_v1 import ExecutorRequestV1, GepaShadowInputV1

DIGEST = "sha256:" + ("a" * 64)


def test_executor_request_accepts_fastapi_gpu_artifact_reference() -> None:
    value = ExecutorRequestV1.model_validate(
        {
            "schema": "atlas.executor-request.v1",
            "requestId": "req:1",
            "executionId": "exec:1",
            "nodeId": "gpu-rerank",
            "helperId": "GPU_FEATURE_RERANK",
            "executorClass": "FASTAPI_GPU",
            "transport": "HTTP_JSON",
            "workspaceRevision": "workspace:v1",
            "policyRevision": "policy:v1",
            "parametersChecksum": DIGEST,
            "inputArtifactRefs": ["artifact:arrow:matrix"],
            "evidenceRefs": ["evidence:q"],
            "expectedOutputSchemaRef": "atlas.rerank-observation.v1",
            "timeoutMs": 10_000,
            "payloadPolicy": "REFERENCES_ONLY",
            "canonicalAuthority": False,
        }
    )
    assert value.canonicalAuthority is False


def test_executor_request_rejects_gpu_without_artifact_reference() -> None:
    with pytest.raises(ValidationError, match="GPU_EXECUTOR_REQUIRES_ARTIFACT_REFERENCE"):
        ExecutorRequestV1.model_validate(
            {
                "schema": "atlas.executor-request.v1",
                "requestId": "req:1",
                "executionId": "exec:1",
                "nodeId": "gpu-rerank",
                "helperId": "GPU_FEATURE_RERANK",
                "executorClass": "FASTAPI_GPU",
                "transport": "HTTP_JSON",
                "workspaceRevision": "workspace:v1",
                "policyRevision": "policy:v1",
                "parametersChecksum": DIGEST,
                "inputArtifactRefs": [],
                "evidenceRefs": [],
                "expectedOutputSchemaRef": "atlas.rerank-observation.v1",
                "timeoutMs": 10_000,
                "payloadPolicy": "REFERENCES_ONLY",
                "canonicalAuthority": False,
            }
        )


def test_executor_request_rejects_grpc_over_http() -> None:
    with pytest.raises(ValidationError, match="GRPC_EXECUTOR_REQUIRES_GRPC_TRANSPORT"):
        ExecutorRequestV1.model_validate(
            {
                "schema": "atlas.executor-request.v1",
                "requestId": "req:1",
                "executionId": "exec:1",
                "nodeId": "gpu-rerank",
                "helperId": "GPU_FEATURE_RERANK",
                "executorClass": "GRPC_GPU",
                "transport": "HTTP_JSON",
                "workspaceRevision": "workspace:v1",
                "policyRevision": "policy:v1",
                "parametersChecksum": DIGEST,
                "inputArtifactRefs": ["artifact:mmap:matrix"],
                "evidenceRefs": [],
                "expectedOutputSchemaRef": "atlas.rerank-observation.v1",
                "timeoutMs": 10_000,
                "payloadPolicy": "REFERENCES_ONLY",
                "canonicalAuthority": False,
            }
        )


def test_gepa_shadow_input_cannot_promote() -> None:
    with pytest.raises(ValidationError):
        GepaShadowInputV1.model_validate(
            {
                "schema": "atlas.gepa-shadow-input.v1",
                "promptProgramRevision": "prompt:v1",
                "heldOutEvalRevision": "eval:v1",
                "learningOutcomeRefs": ["outcome:1"],
                "validatorFeedbackRefs": ["validator:1"],
                "metricRevision": "metric:v1",
                "optimizerRevision": "gepa:v1",
                "mode": "SHADOW_ONLY",
                "promotionAllowed": True,
                "writesAllowed": False,
                "canonicalAuthority": False,
            }
        )
