// Neo4j Initialization for Legal AI Knowledge Graph
// Creates indexes, constraints, and initial schema for semantic analysis

// Create constraints and indexes for performance
CREATE CONSTRAINT legal_entity_id IF NOT EXISTS FOR (e:LegalEntity) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT evidence_id IF NOT EXISTS FOR (ev:Evidence) REQUIRE ev.id IS UNIQUE;
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT organization_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE;
CREATE CONSTRAINT legal_concept_id IF NOT EXISTS FOR (lc:LegalConcept) REQUIRE lc.id IS UNIQUE;

// Create indexes for common queries
CREATE INDEX legal_entity_type IF NOT EXISTS FOR (e:LegalEntity) ON (e.type);
CREATE INDEX legal_entity_name IF NOT EXISTS FOR (e:LegalEntity) ON (e.name);
CREATE INDEX case_status IF NOT EXISTS FOR (c:Case) ON (c.status);
CREATE INDEX case_type IF NOT EXISTS FOR (c:Case) ON (c.caseType);
CREATE INDEX evidence_type IF NOT EXISTS FOR (ev:Evidence) ON (ev.type);
CREATE INDEX person_role IF NOT EXISTS FOR (p:Person) ON (p.role);
CREATE INDEX organization_type IF NOT EXISTS FOR (o:Organization) ON (o.type);
CREATE INDEX legal_concept_category IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.category);

// Create full-text search indexes
CREATE FULLTEXT INDEX legal_entities_fulltext IF NOT EXISTS FOR (e:LegalEntity) ON EACH [e.name, e.description, e.content];
CREATE FULLTEXT INDEX cases_fulltext IF NOT EXISTS FOR (c:Case) ON EACH [c.title, c.description, c.content];
CREATE FULLTEXT INDEX evidence_fulltext IF NOT EXISTS FOR (ev:Evidence) ON EACH [ev.filename, ev.content, ev.extractedText];

// Sample legal entities and concepts for initial setup
MERGE (lc1:LegalConcept {
    id: 'contract-formation',
    name: 'Contract Formation',
    category: 'Contract Law',
    description: 'The process by which parties enter into a legally binding agreement',
    elements: ['Offer', 'Acceptance', 'Consideration', 'Capacity', 'Legality'],
    jurisdiction: 'General',
    complexity: 'Intermediate'
});

MERGE (lc2:LegalConcept {
    id: 'negligence',
    name: 'Negligence',
    category: 'Tort Law',
    description: 'Failure to exercise reasonable care, resulting in harm to another',
    elements: ['Duty', 'Breach', 'Causation', 'Damages'],
    jurisdiction: 'General',
    complexity: 'Intermediate'
});

MERGE (lc3:LegalConcept {
    id: 'criminal-intent',
    name: 'Criminal Intent (Mens Rea)',
    category: 'Criminal Law',
    description: 'The mental state or intention behind a criminal act',
    types: ['Purposely', 'Knowingly', 'Recklessly', 'Negligently'],
    jurisdiction: 'General',
    complexity: 'Advanced'
});

MERGE (lc4:LegalConcept {
    id: 'due-process',
    name: 'Due Process',
    category: 'Constitutional Law',
    description: 'Fair treatment through the normal judicial system',
    types: ['Procedural Due Process', 'Substantive Due Process'],
    jurisdiction: 'US Federal',
    complexity: 'Advanced'
});

MERGE (lc5:LegalConcept {
    id: 'evidence-admissibility',
    name: 'Evidence Admissibility',
    category: 'Evidence Law',
    description: 'Standards for determining what evidence can be presented in court',
    elements: ['Relevance', 'Reliability', 'Prejudicial Effect', 'Authentication'],
    jurisdiction: 'General',
    complexity: 'Advanced'
});

MERGE (lc6:LegalConcept {
    id: 'discovery-process',
    name: 'Discovery Process',
    category: 'Civil Procedure',
    description: 'Pre-trial phase where parties exchange information',
    types: ['Interrogatories', 'Depositions', 'Document Requests', 'Admissions'],
    jurisdiction: 'General',
    complexity: 'Intermediate'
});

// Create relationships between legal concepts
MERGE (lc1)-[:RELATED_TO {strength: 0.7, context: 'Both involve legal obligations'}]->(lc2);
MERGE (lc3)-[:ELEMENT_OF {context: 'Required for criminal liability'}]->(crime:LegalConcept {
    id: 'criminal-liability', 
    name: 'Criminal Liability', 
    category: 'Criminal Law',
    description: 'Legal responsibility for criminal acts'
});

MERGE (lc4)-[:GOVERNS {context: 'Constitutional protection in criminal proceedings'}]->(lc3);
MERGE (lc5)-[:APPLIES_TO {context: 'Evidence rules in discovery'}]->(lc6);

// Create sample case types and their relationships
MERGE (ct1:CaseType {
    id: 'personal-injury',
    name: 'Personal Injury',
    category: 'Civil',
    description: 'Cases involving harm to individuals',
    commonClaims: ['Negligence', 'Product Liability', 'Medical Malpractice'],
    averageDuration: '12-18 months',
    complexity: 'Intermediate'
});

MERGE (ct2:CaseType {
    id: 'contract-dispute',
    name: 'Contract Dispute',
    category: 'Civil',
    description: 'Disputes arising from contractual relationships',
    commonClaims: ['Breach of Contract', 'Misrepresentation', 'Impossibility'],
    averageDuration: '6-12 months',
    complexity: 'Intermediate'
});

MERGE (ct3:CaseType {
    id: 'criminal-defense',
    name: 'Criminal Defense',
    category: 'Criminal',
    description: 'Defense against criminal charges',
    commonDefenses: ['Self-Defense', 'Insanity', 'Alibi', 'Entrapment'],
    averageDuration: '3-24 months',
    complexity: 'Advanced'
});

// Link case types to relevant legal concepts
MERGE (ct1)-[:INVOLVES {strength: 0.9}]->(lc2);
MERGE (ct1)-[:REQUIRES {context: 'Evidence of damages'}]->(lc5);
MERGE (ct2)-[:INVOLVES {strength: 0.9}]->(lc1);
MERGE (ct3)-[:INVOLVES {strength: 0.8}]->(lc3);
MERGE (ct3)-[:PROTECTED_BY {strength: 0.9}]->(lc4);

// Create evidence types and their analysis patterns
MERGE (et1:EvidenceType {
    id: 'document-evidence',
    name: 'Document Evidence',
    category: 'Documentary',
    description: 'Written or recorded materials',
    analysisPatterns: ['Content Analysis', 'Authenticity Verification', 'Chain of Custody'],
    commonFormats: ['PDF', 'DOC', 'Email', 'Contract'],
    reliability: 'High'
});

MERGE (et2:EvidenceType {
    id: 'digital-evidence',
    name: 'Digital Evidence',
    category: 'Electronic',
    description: 'Electronic data and digital files',
    analysisPatterns: ['Metadata Analysis', 'Hash Verification', 'Timeline Reconstruction'],
    commonFormats: ['Images', 'Videos', 'Audio', 'Database Records'],
    reliability: 'High'
});

MERGE (et3:EvidenceType {
    id: 'witness-testimony',
    name: 'Witness Testimony',
    category: 'Testimonial',
    description: 'Statements from witnesses',
    analysisPatterns: ['Credibility Assessment', 'Consistency Analysis', 'Corroboration'],
    commonTypes: ['Expert', 'Fact Witness', 'Character Witness'],
    reliability: 'Variable'
});

// Link evidence types to legal concepts
MERGE (et1)-[:GOVERNED_BY {context: 'Admissibility rules'}]->(lc5);
MERGE (et2)-[:GOVERNED_BY {context: 'Digital evidence standards'}]->(lc5);
MERGE (et3)-[:GOVERNED_BY {context: 'Witness examination rules'}]->(lc5);

// Create investigation patterns for detective mode
MERGE (ip1:InvestigationPattern {
    id: 'timeline-analysis',
    name: 'Timeline Analysis',
    description: 'Reconstructing sequence of events',
    steps: ['Collect timestamps', 'Order events', 'Identify gaps', 'Cross-reference sources'],
    applicableTo: ['Criminal Cases', 'Contract Disputes', 'Personal Injury'],
    complexity: 'Intermediate'
});

MERGE (ip2:InvestigationPattern {
    id: 'connection-mapping',
    name: 'Connection Mapping',
    description: 'Identifying relationships between entities',
    steps: ['Identify entities', 'Map relationships', 'Analyze strength', 'Find patterns'],
    applicableTo: ['Criminal Cases', 'Corporate Law', 'Family Law'],
    complexity: 'Advanced'
});

MERGE (ip3:InvestigationPattern {
    id: 'document-analysis',
    name: 'Document Analysis',
    description: 'Deep analysis of document evidence',
    steps: ['Content extraction', 'Metadata analysis', 'Cross-referencing', 'Anomaly detection'],
    applicableTo: ['Contract Law', 'Corporate Law', 'Intellectual Property'],
    complexity: 'Intermediate'
});

// Link investigation patterns to case types
MERGE (ct1)-[:USES_PATTERN {frequency: 'Often'}]->(ip1);
MERGE (ct1)-[:USES_PATTERN {frequency: 'Sometimes'}]->(ip3);
MERGE (ct2)-[:USES_PATTERN {frequency: 'Often'}]->(ip3);
MERGE (ct3)-[:USES_PATTERN {frequency: 'Often'}]->(ip1);
MERGE (ct3)-[:USES_PATTERN {frequency: 'Often'}]->(ip2);

// Create AI analysis capabilities
MERGE (ai1:AICapability {
    id: 'semantic-search',
    name: 'Semantic Search',
    description: 'AI-powered content similarity search',
    modelType: 'Embedding',
    accuracy: 0.85,
    applications: ['Case Law Research', 'Document Discovery', 'Precedent Finding']
});

MERGE (ai2:AICapability {
    id: 'legal-qa',
    name: 'Legal Question Answering',
    description: 'AI assistant for legal questions',
    modelType: 'Language Model',
    accuracy: 0.78,
    applications: ['Legal Research', 'Draft Review', 'Strategy Planning']
});

MERGE (ai3:AICapability {
    id: 'document-classification',
    name: 'Document Classification',
    description: 'Automatic categorization of legal documents',
    modelType: 'Classification',
    accuracy: 0.92,
    applications: ['Evidence Organization', 'Case Management', 'Document Routing']
});

// Link AI capabilities to legal concepts and case types
MERGE (ai1)-[:SUPPORTS {context: 'Research assistance'}]->(lc1);
MERGE (ai1)-[:SUPPORTS {context: 'Research assistance'}]->(lc2);
MERGE (ai2)-[:ASSISTS_WITH {context: 'Legal analysis'}]->(ct1);
MERGE (ai2)-[:ASSISTS_WITH {context: 'Legal analysis'}]->(ct2);
MERGE (ai3)-[:ORGANIZES {context: 'Evidence management'}]->(et1);
MERGE (ai3)-[:ORGANIZES {context: 'Evidence management'}]->(et2);

// Create user behavior patterns for recommendations
MERGE (ubp1:UserBehaviorPattern {
    id: 'case-researcher',
    name: 'Case Researcher',
    description: 'Users who frequently research case law and precedents',
    characteristics: ['High search activity', 'Document analysis focus', 'Long session times'],
    recommendations: ['Similar cases', 'Related precedents', 'Legal databases']
});

MERGE (ubp2:UserBehaviorPattern {
    id: 'document-reviewer',
    name: 'Document Reviewer',
    description: 'Users who spend time reviewing and analyzing documents',
    characteristics: ['Document-focused', 'Annotation activity', 'Detail-oriented'],
    recommendations: ['Related documents', 'Analysis tools', 'Review templates']
});

MERGE (ubp3:UserBehaviorPattern {
    id: 'case-manager',
    name: 'Case Manager',
    description: 'Users who manage multiple cases and coordinate workflows',
    characteristics: ['Multi-case activity', 'Timeline management', 'Collaboration focus'],
    recommendations: ['Workflow tools', 'Calendar integration', 'Team collaboration']
});

// Link behavior patterns to AI capabilities
MERGE (ubp1)-[:BENEFITS_FROM {strength: 0.9}]->(ai1);
MERGE (ubp1)-[:BENEFITS_FROM {strength: 0.8}]->(ai2);
MERGE (ubp2)-[:BENEFITS_FROM {strength: 0.9}]->(ai3);
MERGE (ubp2)-[:BENEFITS_FROM {strength: 0.7}]->(ai1);
MERGE (ubp3)-[:BENEFITS_FROM {strength: 0.6}]->(ai1);
MERGE (ubp3)-[:BENEFITS_FROM {strength: 0.7}]->(ai2);

// Create success message
CREATE (init:InitializationStatus {
    timestamp: datetime(),
    status: 'completed',
    message: 'Neo4j Legal AI Knowledge Graph initialized successfully',
    version: '1.0',
    features: [
        'Legal concepts and relationships',
        'Case type classifications',
        'Evidence type analysis',
        'Investigation patterns',
        'AI capability mapping',
        'User behavior patterns'
    ]
});

// Log completion
RETURN 'Neo4j Legal AI Knowledge Graph initialization completed successfully!' AS result;
