"""Read-only NLP classification adapter for Parent Atlas.

This module reuses the existing deterministic documentation domain/ontology
rules and exposes an optional FastAPI seam for bounded analysis.  It does not
own source identity, packet identity, training, or any durable store.  The
logistic-regression/naive-Bayes trainer remains a later offline challenger;
this adapter only reports whether a checkpoint is available and never writes
one.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Optional

from atlas_external_docs import classify_domain, classify_ontology
from parent_atlas_ontology.domain_mapping import admit_domain_classification, mapping_revision

from pydantic import BaseModel, Field


SCHEMA = "atlas.nlp-classification-proposal.v1"
PRODUCER_REVISION = "atlas-nlp-classification-helper-v1"
OKF_SCHEMA_REVISION = "atlas.okf-v02"


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _checksum(value: Any) -> str:
    return "sha256:" + hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _required(value: str, name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{name.upper()}_REQUIRED")
    return normalized


class ClassificationRequestV1(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    source_ref: str = Field(alias="sourceRef", min_length=1, max_length=2_000)
    source_revision: str = Field(alias="sourceRevision", min_length=1, max_length=256)
    workspace_revision: Optional[str] = Field(default=None, alias="workspaceRevision", max_length=256)
    packet_key: Optional[str] = Field(default=None, alias="packetKey", max_length=512)
    source_namespace: Optional[str] = Field(default=None, alias="sourceNamespace", max_length=256)
    tree_node_id: Optional[str] = Field(default=None, alias="treeNodeId", max_length=256)
    language: Optional[str] = Field(default=None, max_length=64)
    title: str = Field(default="", max_length=512)
    model_checkpoint: Optional[str] = Field(default=None, alias="modelCheckpoint", max_length=2_000)
    run_model_challenger: bool = Field(default=False, alias="runModelChallenger")

    model_config = {"populate_by_name": True}


def _checkpoint_probe(path_value: Optional[str]) -> dict[str, Any]:
    path = Path(path_value or os.getenv("DOMAIN_CLASSIFIER_CHECKPOINT_PATH", "models/domain-classifier/checkpoint.joblib"))
    return {
        "path": str(path),
        "available": path.is_file(),
        "loaded": False,
        "authority": "SHADOW_ONLY",
        "writesPerformed": False,
        "note": "Checkpoint loading is intentionally deferred to the offline trainer/read-only challenger.",
    }


# TODO(PYTORCH-UNSUPERVISED-01): add a separate, offline PyTorch challenger
# receipt for unsupervised feature grouping. It must consume frozen,
# revision-qualified examples and remain SHADOW_ONLY; it must not replace the
# deterministic taxonomy or mint ontology identity.


def classify_request(request: ClassificationRequestV1) -> dict[str, Any]:
    source_ref = _required(request.source_ref, "source_ref")
    source_revision = _required(request.source_revision, "source_revision")
    text = request.text.strip()
    title = request.title.strip()
    domain = classify_domain(title, text)
    ontology_labels = list(classify_ontology(text))
    admission = admit_domain_classification(domain, confidence=1.0)

    evidence_ref = f"source:{source_ref}#text:0-{len(text.encode('utf-8'))}"
    if request.tree_node_id:
        evidence_ref = f"tree:{request.tree_node_id}"

    signal = {
        "schema": "atlas.domain-classification-signal.v1",
        "requestId": _checksum([source_ref, source_revision, text])[:24],
        "sourceRef": source_ref,
        "sourceRevision": source_revision,
        "workspaceRevision": request.workspace_revision,
        "sourceNamespace": request.source_namespace,
        "treeNodeId": request.tree_node_id,
        "classifierId": "atlas-external-doc-domain-rules",
        "classifierRevision": "atlas-external-doc-domain-rules-v1",
        "mappingRevision": admission.mappingRevision,
        "ontologyRevision": mapping_revision(),
        "label": domain,
        "probability": 1.0,
        "ontologyLabels": ontology_labels,
        "evidenceRefs": [evidence_ref],
        "producerRevision": PRODUCER_REVISION,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    linked_tuple = {
        "status": "PROPOSAL_ONLY",
        "relation": "CLASSIFIED_AS",
        "subject": source_ref,
        "object": admission.classId,
        "ontologyLabels": ontology_labels,
        "evidenceRefs": [evidence_ref],
        "sourceRevision": source_revision,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    payload = {
        "schema": SCHEMA,
        "producerRevision": PRODUCER_REVISION,
        "okfSchemaRevision": OKF_SCHEMA_REVISION,
        "sourceRef": source_ref,
        "sourceRevision": source_revision,
        "workspaceRevision": request.workspace_revision,
        "packetKey": request.packet_key,
        "language": request.language,
        "domain": domain,
        "ontologyLabels": ontology_labels,
        "ontologyAdmission": admission.to_dict(),
        "signal": signal,
        "linkedTupleProposal": linked_tuple,
        "modelChallenger": _checkpoint_probe(request.model_checkpoint),
        "hmmWorkflow": {
            "inputObservation": "DOMAIN_CLASSIFICATION_PROPOSAL",
            "nextAction": "REVIEW_OR_GROUNDED_REPLAY",
            "promotionAuthorized": False,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    payload["proposalChecksum"] = _checksum(payload)
    return payload


if __name__ == "__main__":
    fixture = ClassificationRequestV1(
        text="FastAPI classification uses PostgreSQL evidence and a Graphify AST relation.",
        sourceRef="fixture/nlp-classification.py",
        sourceRevision="sha256:" + "1" * 64,
        sourceNamespace="fixture",
        treeNodeId="fixture:node:1",
        language="python",
    )
    print(json.dumps(classify_request(fixture), indent=2, sort_keys=True))
