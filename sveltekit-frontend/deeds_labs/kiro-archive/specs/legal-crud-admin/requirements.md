# Legal CRUD Admin Requirements

## Introduction

This feature enables legal professionals to create, read, update, and delete statutory citations, case law references, and legal metadata through an intuitive admin interface. The system enforces legal data integrity through validation rules, jurisdiction requirements, and audit logging.

## Glossary

- **Statute**: A law enacted by a legislative body (e.g., California Penal Code §273)
- **Citation Number**: Standardized reference format (e.g., "§ 1170.1(a)")
- **Jurisdiction**: Geographic/legal authority (CA, NY, Federal, etc.)
- **Authority Type**: Classification of legal source (Statute, Case, Regulation, Constitution)
- **pgvector**: PostgreSQL extension for vector embeddings (768-dim)
- **Drizzle ORM**: TypeScript ORM for database operations
- **CRUD**: Create, Read, Update, Delete operations
- **Validation**: Legal-grade constraint checking (syntax, jurisdiction, authority)

## Requirements

### Requirement 1: Editable Statutory Fields

**User Story:** As a legal administrator, I want to create and edit statutory citations with proper legal formatting, so that the system maintains accurate legal references.

#### Acceptance Criteria

1. WHEN a user opens the statute editor, THE system SHALL display form fields for: title, citation_number, jurisdiction, authority_type, section_id, chapter, revision_year, source_url, tags
2. WHILE editing a statute, THE system SHALL validate citation_number against pattern: `§?\s*\d+[\w\.\-]*(\([a-zA-Z0-9]\))*`
3. IF jurisdiction field is empty, THEN THE system SHALL prevent form submission with error message "Jurisdiction required"
4. WHERE authority_type is provided, THE system SHALL restrict values to: Statute, Case, Regulation, Constitution
5. WHEN source_url is provided, THE system SHALL validate URL format and optionally warn if domain is not .gov

### Requirement 2: Jurisdiction-First Workflow

**User Story:** As a legal professional, I want to select jurisdiction before performing any legal operations, so that results are scoped to applicable law.

#### Acceptance Criteria

1. WHEN user accesses the legal search interface, THE system SHALL display jurisdiction selector as required field
2. WHILE jurisdiction is unselected, THE system SHALL disable search, CRUD operations, and citation linking
3. IF user changes jurisdiction, THE system SHALL clear previous search results and reset filters
4. WHERE jurisdiction is selected, THE system SHALL filter all displayed statutes and cases to matching jurisdiction
5. WHEN user saves any legal record, THE system SHALL enforce jurisdiction matches selected context

### Requirement 3: CRUD Admin Interface

**User Story:** As a legal administrator, I want a unified admin interface to manage all legal data tables, so that I can maintain data integrity across the system.

#### Acceptance Criteria

1. WHEN admin accesses the admin panel, THE system SHALL display sidebar navigation with sections: Evidence, Chunks, Vector, Citations, KAG Links, Audit
2. WHILE viewing a data table, THE system SHALL display searchable, paginated datagrid with sortable columns
3. IF user clicks a row, THEN THE system SHALL open detail drawer with full record and editable fields
4. WHERE vector fields exist, THE system SHALL display as read-only with regenerate button
5. WHEN user saves changes, THE system SHALL validate all fields and persist to database with audit log entry

### Requirement 4: Vector Field Protection

**User Story:** As a system architect, I want to prevent direct editing of vector embeddings, so that embedding integrity is maintained.

#### Acceptance Criteria

1. WHEN user attempts to edit a vector field, THE system SHALL reject modification with HTTP 400 error
2. WHILE vector metadata is editable, THE system SHALL allow changes to: embedding_model, metadata fields only
3. IF user clicks regenerate button, THE system SHALL call embedding service and update vector with new embedding
4. WHERE vector regeneration is triggered, THE system SHALL log operation with timestamp and user_id
5. WHEN regeneration completes, THE system SHALL display success message and refresh vector preview

### Requirement 5: Legal Data Validation

**User Story:** As a compliance officer, I want strict validation of legal data, so that the system maintains legal accuracy and prevents invalid references.

#### Acceptance Criteria

1. WHEN citation_number is entered, THE system SHALL validate against legal citation patterns (§, numbers, parentheses)
2. WHILE authority_type is selected, THE system SHALL enforce enum constraint: Statute|Case|Regulation|Constitution
3. IF revision_year is provided, THEN THE system SHALL validate range: 1900–2100
4. WHERE source_url is provided, THE system SHALL validate URL format and optionally check domain authority
5. WHEN form is submitted, THE system SHALL display all validation errors before allowing save

### Requirement 6: Audit Logging

**User Story:** As a legal compliance officer, I want all CRUD operations logged, so that I can maintain chain of custody for legal data.

#### Acceptance Criteria

1. WHEN any record is created, THE system SHALL log: user_id, timestamp, operation_type, record_id, changes
2. WHILE record is updated, THE system SHALL log: user_id, timestamp, operation_type, record_id, old_values, new_values
3. IF record is deleted, THEN THE system SHALL log: user_id, timestamp, operation_type, record_id, deleted_values
4. WHERE audit log is queried, THE system SHALL display read-only compliance history with no modification capability
5. WHEN audit log is exported, THE system SHALL include all metadata for legal discovery

