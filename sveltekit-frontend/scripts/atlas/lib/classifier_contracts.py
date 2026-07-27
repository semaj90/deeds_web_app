"""
Canonical contracts for classifier training, evaluation, and prediction.
Version: 1.0.0

Pydantic v2 models matching JSON Schema Draft 2020-12 definitions.
These MUST align with TypeScript Zod validators in classifier-contracts.ts.
"""

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
import re


class VectorManifest(BaseModel):
    """Vector metadata and provenance."""
    vector_name: Literal['dense_768_legacy']
    embedding_model: Literal['embeddinggemma:latest']
    embedding_model_revision: str
    dimensions: Literal[768]
    distance_metric: Literal['cosine']


class ClassifierSplitManifest(BaseModel):
    """Immutable classifier training/validation/test split metadata."""
    schema_version: Literal['1.0.0']
    workspace_revision: str = Field(description="Postgres database identifier")
    split_hash: str = Field(regex=r'^[a-f0-9]{64}$')
    training_snapshot_sha256: str = Field(regex=r'^[a-f0-9]{64}$')
    vector_manifest: VectorManifest
    label_map_version: Literal['1.0.0']
    train_size: int = Field(gt=0)
    val_size: int = Field(gt=0)
    test_size: int = Field(gt=0)
    n_features: Literal[768]
    n_classes: int = Field(ge=2)
    classes: List[str] = Field(description="Sorted canonical domain labels")
    created_at: datetime


class DomainFeaturePacket(BaseModel):
    """Single training packet (immutable snapshot)."""
    packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    source_ref: str
    file_path: str
    feature_id: str
    feature_label: str
    domain_class: str
    embedding: List[float] = Field(min_length=768, max_length=768)
    semantic_sha256: str = Field(regex=r'^[a-f0-9]{64}$')
    created_at: datetime


class ModelRunManifest(BaseModel):
    """Trained model metadata and provenance."""
    schema_version: Literal['1.0.0']
    classifier: Literal['logistic_regression', 'xgboost', 'pytorch_mlp']
    model_sha256: str = Field(regex=r'^[a-f0-9]{64}$')
    dataset_hash: str = Field(regex=r'^[a-f0-9]{64}$')
    model_version: Literal['1.0']
    training_timestamp: datetime
    metadata: Dict[str, int] = Field(
        description="Must contain train_size, n_classes, n_features"
    )

    @field_validator('metadata')
    @classmethod
    def validate_metadata(cls, v):
        required = {'train_size', 'n_classes', 'n_features'}
        if not required.issubset(v.keys()):
            raise ValueError(f"metadata must contain {required}")
        if v.get('n_features') != 768:
            raise ValueError("n_features must be 768")
        return v


class PerDomainMetrics(BaseModel):
    """Evaluation metrics for a single domain class."""
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    f1: float = Field(ge=0, le=1)
    support: int = Field(ge=0)


class EvaluationReport(BaseModel):
    """Model evaluation results (validation + test sets)."""
    schema_version: Literal['1.0.0']
    accuracy: float = Field(ge=0, le=1)
    macro_f1: float = Field(ge=0, le=1)
    weighted_f1: float = Field(ge=0, le=1)
    test_accuracy: float = Field(ge=0, le=1)
    test_macro_f1: float = Field(ge=0, le=1)
    gate_pass: bool
    per_domain_metrics: Dict[str, PerDomainMetrics]


class DomainPrediction(BaseModel):
    """Single prediction result."""
    packet_key: str
    predicted_domain: str
    raw_scores: Dict[str, float]
    top_score: float = Field(ge=0, le=1)
    score_margin: float
    status: Literal['PREDICTED', 'UNCERTAIN', 'REJECTED']


# Phase 1.5: Multi-Domain Ontology
class DomainOntologyLabel(BaseModel):
    """Hierarchical domain ontology entry (Phase 1.5)."""
    domain: str
    canonical_label: str
    tier: Literal['tier1_root', 'tier2_major', 'tier3_specific']
    parent_domain: Optional[str] = None
    keywords: List[str]
    description: str


# Phase 2: Multi-Signal Evidence Linking
class EvidenceLanes(BaseModel):
    """Independent evidence signal scores from retrieval lanes."""
    semantic: float = Field(ge=0, le=1, description="Embedding cosine similarity")
    lexical: float = Field(ge=0, le=1, description="BM25 lexical match")
    structural: float = Field(ge=0, le=1, description="AST/import graph")
    topology: float = Field(ge=0, le=1, description="PageRank/SOM neighborhood")
    recency: float = Field(ge=0, le=1, description="Temporal freshness")


class LinkedSemanticTuple(BaseModel):
    """Semantic relationship between packets (multi-signal evidence)."""
    source_packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    target_packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    evidence_lanes: EvidenceLanes
    combined_score: float = Field(ge=0, le=1, description="RRF-fused score across lanes")
    created_at: datetime


# Phase 2: Ranked Retrieval Result
class RetrievalCandidate(BaseModel):
    """Ranked candidate from multi-signal retrieval."""
    packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    rank: int = Field(gt=0)
    rrf_score: float = Field(ge=0, description="Reciprocal Rank Fusion score")
    evidence_signals: EvidenceLanes
    domain_boosts: Dict[str, float] = Field(description="Naive Bayes domain probability boosts")
    matching_domains: List[str] = Field(description="Domains this packet belongs to")


# Phase 2: Feature Vector for XGBoost Ranker
class RankerFeatures(BaseModel):
    """Feature vector for XGBoost ranker training."""
    semantic_score: float = Field(description="Query-packet embedding cosine similarity")
    bm25_score: float = Field(description="BM25 ranking score (normalized 0-1)")
    domain_entropy: float = Field(description="Shannon entropy of domain_memberships")
    tree_node_distance: float = Field(description="Minimum graph distance to query source")
    page_rank_score: float = Field(description="PageRank authority score (0-1)")
    recency_days: float = Field(description="Days since last update (log scale)")


class RankerFeatureEnvelope(BaseModel):
    """Feature vector for XGBoost ranker training (labeled training sample)."""
    query_id: str
    packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    relevance_label: int = Field(ge=0, le=3, description="0=irrelevant, 1=marginal, 2=relevant, 3=highly_relevant")
    features: RankerFeatures


def validate_split_manifest(data: dict) -> tuple[bool, Optional[ClassifierSplitManifest], Optional[str]]:
    """
    Validates data against ClassifierSplitManifest schema.
    Returns (success, manifest_or_none, error_message_or_none)
    """
    try:
        manifest = ClassifierSplitManifest(**data)
        return True, manifest, None
    except Exception as e:
        return False, None, str(e)


def validate_evaluation_report(data: dict) -> tuple[bool, Optional[EvaluationReport], Optional[str]]:
    """
    Validates data against EvaluationReport schema.
    Returns (success, report_or_none, error_message_or_none)
    """
    try:
        report = EvaluationReport(**data)
        return True, report, None
    except Exception as e:
        return False, None, str(e)


def validate_prediction(data: dict) -> tuple[bool, Optional[DomainPrediction], Optional[str]]:
    """
    Validates data against DomainPrediction schema.
    Returns (success, prediction_or_none, error_message_or_none)
    """
    try:
        pred = DomainPrediction(**data)
        return True, pred, None
    except Exception as e:
        return False, None, str(e)


def validate_domain_ontology_label(data: dict) -> tuple[bool, Optional[DomainOntologyLabel], Optional[str]]:
    """
    Validates data against DomainOntologyLabel schema (Phase 1.5).
    Returns (success, label_or_none, error_message_or_none)
    """
    try:
        label = DomainOntologyLabel(**data)
        return True, label, None
    except Exception as e:
        return False, None, str(e)


def validate_linked_semantic_tuple(data: dict) -> tuple[bool, Optional[LinkedSemanticTuple], Optional[str]]:
    """
    Validates data against LinkedSemanticTuple schema.
    Returns (success, tuple_or_none, error_message_or_none)
    """
    try:
        tup = LinkedSemanticTuple(**data)
        return True, tup, None
    except Exception as e:
        return False, None, str(e)


def validate_retrieval_candidate(data: dict) -> tuple[bool, Optional[RetrievalCandidate], Optional[str]]:
    """
    Validates data against RetrievalCandidate schema.
    Returns (success, candidate_or_none, error_message_or_none)
    """
    try:
        cand = RetrievalCandidate(**data)
        return True, cand, None
    except Exception as e:
        return False, None, str(e)


def validate_ranker_feature_envelope(data: dict) -> tuple[bool, Optional[RankerFeatureEnvelope], Optional[str]]:
    """
    Validates data against RankerFeatureEnvelope schema.
    Returns (success, envelope_or_none, error_message_or_none)
    """
    try:
        env = RankerFeatureEnvelope(**data)
        return True, env, None
    except Exception as e:
        return False, None, str(e)


# Phase 3: Proof Matrix & Evidence Ledger
class EvidenceObservation(BaseModel):
    """Immutable observed evidence for a packet (proof matrix entry)."""
    observation_id: str = Field(regex=r'^obs:[a-z0-9_-]+$')
    packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    observation_type: Literal[
        'semantic_embedding',
        'lexical_bm25',
        'structural_ast',
        'topology_pagerank',
        'topology_som',
        'domain_membership',
        'recency_metadata',
        'identity_resolution',
    ]
    evidence_lane: Literal['semantic', 'lexical', 'structural', 'topology', 'recency', 'identity']
    value: Dict | List | str | float  # polymorphic
    confidence: float = Field(ge=0, le=1, description="Measurement confidence")
    source: Literal['postgres', 'qdrant', 'neo4j', 'computed', 'manual']
    observed_at: datetime
    metadata: Optional[Dict[str, any]] = None


class MutationProposal(BaseModel):
    """Proposed change to canonical truth (before application)."""
    proposal_id: str = Field(regex=r'^mut:[a-z0-9_-]+$')
    packet_key: str = Field(regex=r'^ace:packet:[a-z0-9_-]+$')
    mutation_type: Literal[
        'domain_membership_update',
        'identity_correction',
        'feature_extraction',
        'feature_correction',
        'label_override',
        'confidence_adjustment',
    ]
    changes: Dict[str, any] = Field(description="Fields to change: {field: new_value, ...}")
    justification: str
    observations_supporting: List[str] = Field(description="observation_ids that support this proposal")
    status: Optional[Literal['proposed', 'under_review', 'approved', 'applied', 'rejected']] = None
    created_at: datetime
    applied_at: Optional[datetime] = None
    applied_by: Optional[str] = None


def validate_evidence_observation(data: dict) -> tuple[bool, Optional[EvidenceObservation], Optional[str]]:
    """
    Validates data against EvidenceObservation schema.
    Returns (success, observation_or_none, error_message_or_none)
    """
    try:
        obs = EvidenceObservation(**data)
        return True, obs, None
    except Exception as e:
        return False, None, str(e)


def validate_mutation_proposal(data: dict) -> tuple[bool, Optional[MutationProposal], Optional[str]]:
    """
    Validates data against MutationProposal schema.
    Returns (success, proposal_or_none, error_message_or_none)
    """
    try:
        prop = MutationProposal(**data)
        return True, prop, None
    except Exception as e:
        return False, None, str(e)
