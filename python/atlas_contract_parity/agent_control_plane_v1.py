from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

NonEmpty = Annotated[str, StringConstraints(min_length=1)]
Sha256 = Annotated[str, StringConstraints(pattern=r"^sha256:[a-f0-9]{64}$")]

ExecutorClass = Literal[
    "TS_CPU_WORKER",
    "LOCAL_READ_ONLY",
    "FASTAPI_CPU",
    "FASTAPI_GPU",
    "GRPC_CPU",
    "GRPC_GPU",
]
ControlTransport = Literal["LOCAL", "HTTP_JSON", "GRPC_PROTO"]


class ExecutorRequestV1(BaseModel):
    """Boundary mirror of the Zod-owned atlas.executor-request.v1 contract.

    This is not a new owner. It exists so FastAPI/gRPC Python executors can
    fail closed on malformed control envelopes before touching numeric artifacts.
    """

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)

    schema_: Literal["atlas.executor-request.v1"] = Field(alias="schema")
    requestId: NonEmpty
    executionId: NonEmpty
    nodeId: NonEmpty
    helperId: NonEmpty
    executorClass: ExecutorClass
    transport: ControlTransport
    workspaceRevision: NonEmpty
    policyRevision: NonEmpty
    parametersChecksum: Sha256
    inputArtifactRefs: list[NonEmpty]
    evidenceRefs: list[NonEmpty]
    expectedOutputSchemaRef: NonEmpty
    timeoutMs: int = Field(gt=0, le=120_000)
    payloadPolicy: Literal["REFERENCES_ONLY"]
    canonicalAuthority: Literal[False]

    @model_validator(mode="after")
    def _executor_transport_rules(self) -> "ExecutorRequestV1":
        if self.executorClass in ("FASTAPI_GPU", "GRPC_GPU") and not self.inputArtifactRefs:
            raise ValueError("GPU_EXECUTOR_REQUIRES_ARTIFACT_REFERENCE")
        if self.executorClass.startswith("GRPC_") and self.transport != "GRPC_PROTO":
            raise ValueError("GRPC_EXECUTOR_REQUIRES_GRPC_TRANSPORT")
        return self


class GepaShadowInputV1(BaseModel):
    """Boundary mirror for shadow-only DSPy/GEPA optimization input."""

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=False)

    schema_: Literal["atlas.gepa-shadow-input.v1"] = Field(alias="schema")
    promptProgramRevision: NonEmpty
    heldOutEvalRevision: NonEmpty
    learningOutcomeRefs: list[NonEmpty] = Field(min_length=1, max_length=1024)
    validatorFeedbackRefs: list[NonEmpty] = Field(min_length=1, max_length=1024)
    metricRevision: NonEmpty
    optimizerRevision: NonEmpty
    mode: Literal["SHADOW_ONLY"]
    promotionAllowed: Literal[False]
    writesAllowed: Literal[False]
    canonicalAuthority: Literal[False]
