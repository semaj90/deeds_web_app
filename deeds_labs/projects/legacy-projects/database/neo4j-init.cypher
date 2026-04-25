// Legal AI System - Neo4j Initialization
// Creates knowledge graph schema for legal relationships

// Create constraints for uniqueness
CREATE CONSTRAINT case_id_unique IF NOT EXISTS
FOR (c:Case) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT person_id_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT document_id_unique IF NOT EXISTS
FOR (d:Document) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT evidence_id_unique IF NOT EXISTS
FOR (e:Evidence) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT law_id_unique IF NOT EXISTS
FOR (l:Law) REQUIRE l.id IS UNIQUE;

// Create indexes for performance
CREATE INDEX case_title_index IF NOT EXISTS
FOR (c:Case) ON (c.title);

CREATE INDEX case_status_index IF NOT EXISTS
FOR (c:Case) ON (c.status);

CREATE INDEX person_name_index IF NOT EXISTS
FOR (p:Person) ON (p.name);

CREATE INDEX document_type_index IF NOT EXISTS
FOR (d:Document) ON (d.type);

CREATE INDEX evidence_type_index IF NOT EXISTS
FOR (e:Evidence) ON (e.type);

CREATE INDEX law_jurisdiction_index IF NOT EXISTS
FOR (l:Law) ON (l.jurisdiction);

// Create full-text search indexes
CREATE FULLTEXT INDEX case_search_index IF NOT EXISTS
FOR (c:Case) ON EACH [c.title, c.description];

CREATE FULLTEXT INDEX document_search_index IF NOT EXISTS
FOR (d:Document) ON EACH [d.content, d.summary];

CREATE FULLTEXT INDEX law_search_index IF NOT EXISTS
FOR (l:Law) ON EACH [l.title, l.description, l.text];

// Create sample data for testing
// Sample Case
CREATE (case1:Case {
    id: 'sample-case-001',
    title: 'State v. Johnson',
    description: 'Criminal fraud case involving financial misconduct',
    status: 'active',
    created_at: datetime(),
    case_number: '2024-CR-001',
    jurisdiction: 'State',
    case_type: 'Criminal'
});

// Sample Persons
CREATE (prosecutor:Person {
    id: 'person-001',
    name: 'Sarah Mitchell',
    role: 'Prosecutor',
    bar_number: 'BAR123456',
    email: 'sarah.mitchell@prosecution.gov'
});

CREATE (defendant:Person {
    id: 'person-002',
    name: 'John Johnson',
    role: 'Defendant',
    date_of_birth: date('1985-05-15')
});

CREATE (witness1:Person {
    id: 'person-003',
    name: 'Emily Roberts',
    role: 'Witness',
    credibility_score: 0.85
});

// Sample Documents
CREATE (contract:Document {
    id: 'doc-001',
    type: 'Contract',
    title: 'Fraudulent Investment Agreement',
    date_created: date('2023-01-15'),
    relevance_score: 0.95
});

CREATE (statement:Document {
    id: 'doc-002',
    type: 'Witness Statement',
    title: 'Witness Statement - Emily Roberts',
    date_created: date('2024-02-20'),
    relevance_score: 0.80
});

// Sample Evidence
CREATE (bankRecords:Evidence {
    id: 'evidence-001',
    type: 'Financial Records',
    description: 'Bank statements showing fraudulent transactions',
    date_collected: date('2024-01-10'),
    chain_of_custody: 'Secured',
    admissibility: 'Admissible'
});

CREATE (emails:Evidence {
    id: 'evidence-002',
    type: 'Digital Communication',
    description: 'Email correspondence discussing scheme',
    date_collected: date('2024-01-15'),
    chain_of_custody: 'Secured',
    admissibility: 'Admissible'
});

// Sample Laws
CREATE (fraudStatute:Law {
    id: 'law-001',
    title: '18 U.S.C. § 1343 - Wire Fraud',
    jurisdiction: 'Federal',
    category: 'Criminal',
    penalty_range: '0-20 years imprisonment',
    effective_date: date('1952-07-16')
});

CREATE (conspiracyStatute:Law {
    id: 'law-002',
    title: '18 U.S.C. § 371 - Conspiracy',
    jurisdiction: 'Federal',
    category: 'Criminal',
    penalty_range: '0-5 years imprisonment',
    effective_date: date('1948-06-25')
});

// Create relationships
CREATE (case1)-[:PROSECUTED_BY]->(prosecutor);
CREATE (case1)-[:DEFENDANT]->(defendant);
CREATE (case1)-[:WITNESS]->(witness1);
CREATE (case1)-[:HAS_EVIDENCE]->(bankRecords);
CREATE (case1)-[:HAS_EVIDENCE]->(emails);
CREATE (case1)-[:RELATED_DOCUMENT]->(contract);
CREATE (case1)-[:RELATED_DOCUMENT]->(statement);
CREATE (case1)-[:CHARGES_UNDER]->(fraudStatute);
CREATE (case1)-[:CHARGES_UNDER]->(conspiracyStatute);

CREATE (witness1)-[:GAVE_STATEMENT]->(statement);
CREATE (defendant)-[:SIGNED]->(contract);
CREATE (bankRecords)-[:SUPPORTS_CHARGE]->(fraudStatute);
CREATE (emails)-[:SUPPORTS_CHARGE]->(conspiracyStatute);

// Create case timeline events
CREATE (event1:TimelineEvent {
    id: 'event-001',
    date: datetime('2023-01-15T10:00:00'),
    description: 'Fraudulent contract signed',
    event_type: 'Contract Execution'
});

CREATE (event2:TimelineEvent {
    id: 'event-002',
    date: datetime('2023-06-20T14:30:00'),
    description: 'First fraudulent transaction',
    event_type: 'Financial Transaction'
});

CREATE (event3:TimelineEvent {
    id: 'event-003',
    date: datetime('2024-01-10T09:00:00'),
    description: 'Investigation initiated',
    event_type: 'Investigation Start'
});

CREATE (case1)-[:HAS_EVENT]->(event1);
CREATE (case1)-[:HAS_EVENT]->(event2);
CREATE (case1)-[:HAS_EVENT]->(event3);

CREATE (event1)-[:NEXT]->(event2);
CREATE (event2)-[:NEXT]->(event3);

// Create legal precedents
CREATE (precedent1:Precedent {
    id: 'precedent-001',
    case_name: 'United States v. Smith',
    citation: '123 F.3d 456 (9th Cir. 2020)',
    holding: 'Email communications sufficient to establish wire fraud',
    year: 2020,
    court: '9th Circuit',
    relevance_score: 0.9
});

CREATE (case1)-[:CITES_PRECEDENT]->(precedent1);
CREATE (precedent1)-[:SUPPORTS]->(fraudStatute);

// Create analytics nodes
CREATE (caseMetrics:CaseMetrics {
    id: 'metrics-001',
    case_id: 'sample-case-001',
    evidence_strength_score: 0.85,
    witness_credibility_avg: 0.85,
    precedent_support_score: 0.9,
    overall_case_score: 87,
    last_updated: datetime()
});

CREATE (case1)-[:HAS_METRICS]->(caseMetrics);

// Create sample query templates for common legal research
CREATE (query1:QueryTemplate {
    id: 'query-001',
    name: 'Find Similar Cases',
    cypher: 'MATCH (c:Case)-[:CHARGES_UNDER]->(l:Law)<-[:CHARGES_UNDER]-(similar:Case) WHERE c.id = $caseId AND similar.id <> $caseId RETURN similar',
    description: 'Find cases with similar charges',
    category: 'Case Research'
});

CREATE (query2:QueryTemplate {
    id: 'query-002',
    name: 'Evidence Chain',
    cypher: 'MATCH path = (c:Case)-[:HAS_EVIDENCE]->(e:Evidence)-[:SUPPORTS_CHARGE]->(l:Law) WHERE c.id = $caseId RETURN path',
    description: 'Trace evidence to supported charges',
    category: 'Evidence Analysis'
});

CREATE (query3:QueryTemplate {
    id: 'query-003',
    name: 'Case Timeline',
    cypher: 'MATCH (c:Case)-[:HAS_EVENT]->(e:TimelineEvent) WHERE c.id = $caseId RETURN e ORDER BY e.date',
    description: 'Get chronological case events',
    category: 'Timeline Analysis'
});

// Return confirmation
RETURN 'Neo4j Legal Knowledge Graph initialized successfully' as message,
       count(DISTINCT n) as total_nodes,
       count(DISTINCT r) as total_relationships
MATCH (n)
MATCH ()-[r]->();
