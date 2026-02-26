# Phase 2: Citation Intelligence Expansion - Requirements

## Introduction

Phase 2 expands the Case Reporter Summarizer into a cross-case legal research engine by adding comprehensive citation management, statute search, and case linking capabilities. This phase builds on the completed Phase 1 infrastructure without duplication.

## Glossary

- **Citation**: A reference to a statute, case law, regulation, or contract
- **Statute**: A law or legal code (e.g., 42 U.S.C. § 1983)
- **Case Linking**: Attaching a statute to a case as a charge or reference
- **RAG**: Retrieval-Augmented Generation (retrieve context, then generate)
- **KAG**: Knowledge-Augmented Generation (retrieve related cases from knowledge graph)
- **Collection**: User-created folder for organizing citations
- **Tag**: User-defined label for categorizing citations
- **Guest Mode**: Unauthenticated access (search only)
- **Auth Mode**: Authenticated access (save, link, library)

## Requirements

### Requirement 1: Citation Management

**User Story:** As a prosecutor, I want to save and search citations so that I can build a personal legal reference library.

#### Acceptance Criteria

1. WHEN a prosecutor highlights text in a summary, THE system SHALL provide a "Save Citation" button
2. WHEN a prosecutor clicks "Save Citation", THE system SHALL open a modal to enter citation metadata
3. WHEN a prosecutor submits the citation form, THE system SHALL save the citation to the database with source_type='manual'
4. WHEN a summary is generated, THE system SHALL automatically extract and save citations with source_type='auto_extracted'
5. WHEN a prosecutor searches for citations, THE system SHALL return results matching the query with pagination
6. WHEN a prosecutor views a citation, THE system SHALL display full metadata including statute code, title, jurisdiction, severity, and notes
7. WHEN a prosecutor updates citation notes, THE system SHALL save changes and log the audit event
8. WHEN a prosecutor deletes a citation, THE system SHALL remove it from the database and log the audit event

### Requirement 2: Statute Search

**User Story:** As a prosecutor or guest, I want to search statutes so that I can find relevant laws for a case.

#### Acceptance Criteria

1. WHEN a guest visits /laws/search, THE system SHALL display a search interface without requiring authentication
2. WHEN a guest searches for a statute, THE system SHALL return results from the statute database
3. WHEN a guest clicks a statute result, THE system SHALL display the full statute text with metadata
4. WHEN a guest views a statute, THE system SHALL display related cases from the knowledge graph
5. WHEN a prosecutor searches for a statute, THE system SHALL save the search to search_history table
6. WHEN a prosecutor views search history, THE system SHALL display their previous searches
7. WHEN a statute is selected, THE system SHALL retrieve context using RAG (Retrieval-Augmented Generation)
8. WHEN related cases are requested, THE system SHALL query Neo4j for cases with the same statute (KAG)

### Requirement 3: Citation → Case Linking

**User Story:** As a prosecutor, I want to link statutes to cases so that I can track which laws apply to each case.

#### Acceptance Criteria

1. WHEN a prosecutor views a statute detail, THE system SHALL provide an "Attach to Case" button
2. WHEN a prosecutor clicks "Attach to Case", THE system SHALL open a modal to select a case
3. WHEN a prosecutor selects a case, THE system SHALL create a link in the database and Neo4j
4. WHEN a link is created, THE system SHALL log an audit event with user_id and timestamp
5. WHEN a prosecutor views a case detail, THE system SHALL display a "Linked Statutes" tab
6. WHEN a prosecutor views the "Linked Statutes" tab, THE system SHALL display all statutes linked to the case
7. WHEN a prosecutor unlinks a statute, THE system SHALL remove the link from database and Neo4j
8. WHEN a prosecutor updates link metadata, THE system SHALL save changes and log the audit event

### Requirement 4: Citation Library

**User Story:** As a prosecutor, I want to organize citations into collections and export them so that I can manage my legal research.

#### Acceptance Criteria

1. WHEN a prosecutor visits /citations, THE system SHALL display their citation library
2. WHEN a prosecutor creates a collection, THE system SHALL save it to the database with user_id
3. WHEN a prosecutor adds a citation to a collection, THE system SHALL create a membership record
4. WHEN a prosecutor adds a tag to a citation, THE system SHALL save the tag to the database
5. WHEN a prosecutor searches citations by tag, THE system SHALL return matching citations
6. WHEN a prosecutor exports a collection, THE system SHALL generate a file in the requested format (PDF, JSON, CSV)
7. WHEN a prosecutor shares a collection, THE system SHALL grant access to other prosecutors
8. WHEN a prosecutor views a shared collection, THE system SHALL display citations with read-only access

### Requirement 5: Integration with Phase 1

**User Story:** As a system, I want to seamlessly integrate Phase 2 features with Phase 1 so that users have a unified experience.

#### Acceptance Criteria

1. WHEN a summary is generated, THE system SHALL automatically extract citations and save them
2. WHEN a citation is saved, THE system SHALL be searchable in the citation search interface
3. WHEN a statute is linked to a case, THE system SHALL update the case detail page to show the link
4. WHEN a case is viewed, THE system SHALL display all linked statutes in a dedicated tab
5. WHEN a citation is viewed, THE system SHALL show related cases from the knowledge graph
6. WHEN a statute is searched, THE system SHALL show related cases from the knowledge graph
7. WHEN any operation occurs, THE system SHALL log an audit event with user_id, action, and timestamp
8. WHEN a user performs an action, THE system SHALL enforce role-based access control (prosecutor, warden, guest)

### Requirement 6: Performance & Scalability

**User Story:** As a system, I want to maintain performance targets so that users have a responsive experience.

#### Acceptance Criteria

1. WHEN a citation is saved, THE system SHALL respond within 500ms
2. WHEN a statute is searched, THE system SHALL respond within 2 seconds
3. WHEN related cases are retrieved, THE system SHALL respond within 3 seconds
4. WHEN citations are cached, THE system SHALL achieve >80% cache hit rate
5. WHEN the database grows, THE system SHALL maintain performance through proper indexing
6. WHEN multiple users search simultaneously, THE system SHALL handle 10+ concurrent requests
7. WHEN a collection is exported, THE system SHALL complete within 5 seconds
8. WHEN the system is under load, THE system SHALL not exceed 500MB memory per instance

### Requirement 7: Security & Audit

**User Story:** As a system, I want to maintain security and audit compliance so that all operations are tracked and authorized.

#### Acceptance Criteria

1. WHEN a guest accesses /laws/search, THE system SHALL not require authentication
2. WHEN a guest attempts to save a citation, THE system SHALL return 401 Unauthorized
3. WHEN a prosecutor saves a citation, THE system SHALL log the action with user_id and timestamp
4. WHEN a prosecutor links a statute to a case, THE system SHALL log the action with user_id and timestamp
5. WHEN a prosecutor exports citations, THE system SHALL log the action with user_id and timestamp
6. WHEN a warden views a case, THE system SHALL allow read-only access to linked statutes
7. WHEN a warden attempts to link a statute, THE system SHALL return 403 Forbidden
8. WHEN any operation fails, THE system SHALL log the error with user_id and error details

### Requirement 8: User Experience

**User Story:** As a prosecutor, I want an intuitive interface so that I can efficiently manage citations and statutes.

#### Acceptance Criteria

1. WHEN a prosecutor searches for a statute, THE system SHALL display results with relevance scores
2. WHEN a prosecutor views a statute, THE system SHALL highlight related cases
3. WHEN a prosecutor saves a citation, THE system SHALL provide immediate feedback
4. WHEN a prosecutor creates a collection, THE system SHALL allow naming and describing it
5. WHEN a prosecutor exports citations, THE system SHALL provide format options (PDF, JSON, CSV)
6. WHEN a prosecutor shares a collection, THE system SHALL show sharing status
7. WHEN a prosecutor views the library, THE system SHALL display collections and citations in an organized manner
8. WHEN a prosecutor performs an action, THE system SHALL provide clear error messages if validation fails

---

## Non-Functional Requirements

### Performance

- Citation save latency: <500ms
- Statute search latency: <2s
- Related cases query latency: <3s
- Cache hit rate: >80%
- Concurrent throughput: 10+ req/s
- Memory usage: <500MB per instance

### Scalability

- Support 1000+ citations per user
- Support 10,000+ statutes in database
- Support 100+ concurrent users
- Support 1000+ cases with relationships

### Reliability

- System uptime: 99.9%
- Error rate: <0.1%
- Data consistency: ACID transactions
- Backup frequency: Daily

### Security

- Authentication: Lucia v3
- Authorization: Role-based access control
- Encryption: HTTPS in transit
- Audit logging: All operations tracked

### Accessibility

- WCAG AA compliance
- Keyboard navigation support
- Screen reader compatible
- Minimum 40x40px hit areas

---

## Constraints

- Must build on Phase 1 infrastructure (no duplication)
- Must use existing services (RAGService, GraphService, etc.)
- Must maintain backward compatibility with Phase 1
- Must follow Legal AI UX design system
- Must implement role-based access control
- Must log all operations for audit compliance

---

## Dependencies

### Phase 1 Components (Already Complete)

- PostgreSQL with pgvector
- Redis caching
- Neo4j relationships
- RabbitMQ job queue
- Ollama Gemma3-Legal
- Lucia v3 authentication
- CaseSummaryService
- RAGService
- GraphService
- AuditService
- CitationExtractionWorker

### External Services

- PostgreSQL (database)
- Redis (caching)
- Neo4j (relationships)
- RabbitMQ (job queue)

---

## Success Criteria

1. ✅ All 30 tasks completed
2. ✅ All 100+ subtasks completed
3. ✅ All performance targets met
4. ✅ All security requirements met
5. ✅ All accessibility requirements met
6. ✅ 80%+ test coverage
7. ✅ Complete documentation
8. ✅ Zero critical bugs

---

**Requirements Version**: 1.0
**Created**: November 22, 2025
**Status**: Ready for Implementation
**Builds On**: Phase 1 ✅ COMPLETE
