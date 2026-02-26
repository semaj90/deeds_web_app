# Requirements Document: Case Reporter Summarizer

## Introduction

The Case Reporter Summarizer is a legal AI system that generates comprehensive case summaries with citations, holdings, and similar case recommendations. It integrates with the existing RAG/KAG infrastructure to provide prosecutors with AI-powered case analysis that extracts key legal concepts, identifies relevant statutes, and surfaces similar precedents. The system operates within the Lucia v3 authentication framework and attaches summaries to case records for persistent storage and retrieval.

## Glossary

- **Case**: A legal matter tracked in the system, associated with charges, evidence, and reports
- **Summary**: AI-generated comprehensive overview of a case including holdings, issues, and key terms
- **Citation**: Reference to a statute, case law, or legal precedent
- **Holding**: The legal principle or ruling established by a case
- **Statute**: A law or legal code (e.g., PC 273a)
- **Precedent**: Prior case law that establishes legal principles
- **RAG (Retrieval-Augmented Generation)**: System that retrieves relevant documents and uses them to generate responses
- **KAG (Knowledge-Augmented Graph)**: Graph database system that stores relationships between legal concepts
- **Prosecutor**: User role with authority to create and manage cases
- **Warden**: User role with administrative authority over cases
- **TinyMCE**: Rich text editor for drafting and exporting documents
- **pgvector**: PostgreSQL extension for vector similarity search
- **Qdrant**: Vector database for semantic search
- **Neo4j**: Graph database for storing legal relationships

## Requirements

### Requirement 1: Case Summary Generation

**User Story:** As a prosecutor, I want to generate a comprehensive summary of a case so that I can quickly understand key legal issues, holdings, and applicable statutes.

#### Acceptance Criteria

1. WHEN a prosecutor clicks "Generate Summary" on a case detail page, THE system SHALL retrieve the case's charges, evidence, and attached documents
2. WHEN the system retrieves case data, THE system SHALL query the RAG system to identify relevant statutes and case law
3. WHEN the RAG system returns results, THE system SHALL use Gemma3-Legal to generate a structured summary containing: issue statement, holding, rule extraction, and key terms
4. WHILE generating the summary, THE system SHALL maintain a processing status visible to the prosecutor
5. WHEN summary generation completes, THE system SHALL store the summary in the database and display it in TinyMCE editor

### Requirement 2: Citation Extraction and Linking

**User Story:** As a prosecutor, I want citations in the summary to be automatically extracted and linked to relevant statutes so that I can quickly navigate to applicable law.

#### Acceptance Criteria

1. WHEN the summary is generated, THE system SHALL extract all statute references (e.g., PC 273a, 18 USC 1001)
2. WHEN citations are extracted, THE system SHALL normalize them to standard format (jurisdiction + code)
3. WHEN citations are normalized, THE system SHALL create Neo4j relationships linking the case to cited statutes
4. WHEN a prosecutor clicks a citation in the summary, THE system SHALL navigate to the statute detail page or display statute information in a sidebar
5. WHERE citations are embedded in TinyMCE, THE system SHALL render them as clickable hyperlinks with visual distinction

### Requirement 3: Similar Case Recommendations

**User Story:** As a prosecutor, I want the system to recommend similar cases based on charges and legal issues so that I can identify relevant precedents.

#### Acceptance Criteria

1. WHEN a summary is generated, THE system SHALL query Neo4j for cases with similar charge bundles
2. WHEN similar cases are identified, THE system SHALL rank them by relevance using charge similarity and temporal proximity
3. WHEN ranking is complete, THE system SHALL retrieve the top 5 similar cases with their summaries and outcomes
4. WHEN similar cases are retrieved, THE system SHALL display them in a "Similar Cases" panel with links to case records
5. IF no similar cases exist, THEN THE system SHALL display a message indicating no precedents found

### Requirement 4: Summary Persistence and Retrieval

**User Story:** As a prosecutor, I want summaries to be saved to the case record so that I can retrieve them later without regenerating.

#### Acceptance Criteria

1. WHEN a summary is generated and the prosecutor confirms it, THE system SHALL store the summary text in the case_reports table
2. WHEN a summary is stored, THE system SHALL create a timestamp and associate it with the prosecutor's user ID
3. WHEN a prosecutor opens a case with an existing summary, THE system SHALL retrieve and display the summary in TinyMCE
4. WHEN a prosecutor generates a new summary, THE system SHALL preserve the previous summary as a version history entry
5. WHERE multiple summaries exist, THE system SHALL allow the prosecutor to view and restore previous versions

### Requirement 5: PDF Export and Drafting

**User Story:** As a prosecutor, I want to export the case summary as a PDF document so that I can include it in case filings or reports.

#### Acceptance Criteria

1. WHEN a summary is displayed in TinyMCE, THE system SHALL provide an "Export to PDF" button
2. WHEN the prosecutor clicks "Export to PDF", THE system SHALL format the summary with proper legal document styling
3. WHEN formatting is complete, THE system SHALL include case metadata (case number, charges, date) in the PDF header
4. WHEN the PDF is generated, THE system SHALL include a table of citations with statute references
5. WHEN the PDF is ready, THE system SHALL trigger a download with filename format: case-[caseId]-summary-[date].pdf

### Requirement 6: Authorization and Access Control

**User Story:** As a system administrator, I want to ensure only authorized prosecutors can generate and view case summaries so that case information remains confidential.

#### Acceptance Criteria

1. WHEN a prosecutor attempts to generate a summary, THE system SHALL verify the user's role is "prosecutor" or "warden"
2. IF the user's role is not authorized, THEN THE system SHALL return a 403 Forbidden response
3. WHEN a prosecutor views a case summary, THE system SHALL verify they have access to the case (owner or assigned)
4. IF the prosecutor does not have access, THEN THE system SHALL return a 403 Forbidden response
5. WHEN a summary is generated, THE system SHALL log the action in the audit trail with user ID and timestamp

### Requirement 7: Error Handling and Fallback

**User Story:** As a prosecutor, I want the system to handle errors gracefully so that I can understand what went wrong and retry if needed.

#### Acceptance Criteria

1. IF the RAG system is unavailable, THEN THE system SHALL display an error message and offer to retry
2. IF Gemma3-Legal inference fails, THEN THE system SHALL log the error and suggest contacting support
3. IF the database write fails, THEN THE system SHALL rollback the transaction and notify the prosecutor
4. WHEN an error occurs, THE system SHALL preserve the case data and allow the prosecutor to retry without data loss
5. WHERE errors are recoverable, THE system SHALL provide a "Retry" button; where not, SHALL provide a "Contact Support" link

### Requirement 8: Performance and Caching

**User Story:** As a prosecutor, I want summaries to generate quickly so that I can work efficiently without long wait times.

#### Acceptance Criteria

1. WHEN a summary is requested, THE system SHALL check Redis cache for a cached summary with the same case data hash
2. IF a valid cache entry exists, THEN THE system SHALL return the cached summary within 100ms
3. IF no cache entry exists, THEN THE system SHALL generate a new summary and cache it for 24 hours
4. WHEN generating a summary, THE system SHALL use parallel RAG queries to retrieve statutes and case law simultaneously
5. WHEN summary generation completes, THE system SHALL complete within 30 seconds for typical cases (< 50 pages evidence)
