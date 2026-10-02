// Vector Manifest
export {
  VectorManifestSchema,
  VectorNameEnum,
  ActiveSemanticVectorNameEnum,
  SymbolRepresentationNameEnum,
  VectorRepresentationEnum,
  DistanceMetricEnum,
  hashVectorManifest,
  createVectorManifest,
  VECTOR_MANIFESTS,
  type VectorManifest,
  type VectorName,
  type ActiveSemanticVectorName,
  type SymbolRepresentationName,
  type VectorRepresentation,
  type DistanceMetric,
} from './vector-manifest.js';

// Semantic Packet
export {
  SemanticPacketSchema,
  EvidenceStateEnum,
  hashSemanticPacketIdentity,
  createSemanticPacket,
  authorizedUpdateDomainClass,
  type SemanticPacket,
  type EvidenceState,
} from './semantic-packet.js';

// Domain Feature Packet
export {
  DomainFeaturePacketSchema,
  LexicalFeaturesSchema,
  PathFeaturesSchema,
  IdentifierFeaturesSchema,
  ImportFeaturesSchema,
  SyntaxFeaturesSchema,
  SemanticFeaturesSchema,
  TopologyFeaturesSchema,
  ProvenanceSchema,
  hashFeatureVocabulary,
  createDomainFeaturePacket,
  type DomainFeaturePacket,
  type LexicalFeatures,
  type PathFeatures,
  type IdentifierFeatures,
  type ImportFeatures,
  type SyntaxFeatures,
  type SemanticFeatures,
  type TopologyFeatures,
  type Provenance,
} from './domain-feature-packet.js';

// Domain Prediction
export {
  DomainPredictionSchema,
  ClassifierKindEnum,
  PredictionStatusEnum,
  createDomainPrediction,
  authorizedPromotePrediction,
  type DomainPrediction,
  type ClassifierKind,
  type PredictionStatus,
} from './domain-prediction.js';

// Ontology Proposal
export {
  OntologyProposalSchema,
  PredicateEnum,
  ProposalSourceEnum,
  OntologyProposalStatusEnum,
  createOntologyProposal,
  authorizedApproveProposal,
  type OntologyProposal,
  type Predicate,
  type ProposalSource,
  type OntologyProposalStatus,
} from './ontology-proposal.js';

// Canonical hashing
export { canonicalHashJSON, verifyCanonicalHash } from './canonical-hashing.js';
export { FeaturePacketV1Schema, buildFeaturePacketV1, type FeaturePacketV1 } from './feature-packet-v1.js';
export {
  EvidenceTupleV1Schema,
  createEvidenceTupleV1,
  createEvidenceTupleFromRawSpanV1,
  type EvidenceTupleV1,
  type EvidenceTupleV1Input,
  type EvidenceTupleRawSpanInputV1,
} from './evidence-tuple-v1.js';
export {
  createEvidenceTupleKagIndexV1,
  type EvidenceTupleKagQueryV1,
  type EvidenceTupleKagHitV1,
  type EvidenceTupleKagSearchResultV1,
  type EvidenceTupleSourceReaderV1,
} from './evidence-tuple-kag-index-v1.js';
export {
  EvidenceTypeV1Schema,
  EvidenceVerdictV1Schema,
  ProofStateV1Schema,
  EvidenceRefV1Schema,
  AssertionResultV1Schema,
  ExpectedAssertionV1Schema,
  ActualAssertionV1Schema,
  EvidenceSourceRefV1Schema,
  EvidenceReceiptV1Schema,
  EvidenceCardV1Schema,
  buildEvidenceReceiptV1,
  verifyEvidenceReceiptV1,
  deriveOpenSpecProofState,
  buildEvidenceCardV1,
  type EvidenceTypeV1,
  type EvidenceVerdictV1,
  type ProofStateV1,
  type EvidenceRefV1,
  type AssertionResultV1,
  type ExpectedAssertionV1,
  type ActualAssertionV1,
  type EvidenceSourceRefV1,
  type EvidenceReceiptV1,
  type EvidenceCardV1,
} from './openspec-evidence-fabric-v1.js';
