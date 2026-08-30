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
