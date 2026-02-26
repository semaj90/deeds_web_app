# Requirements Document: YoRHa Detective Screens

## Introduction

The YoRHa Detective Screens complete the WardenNet legal investigation platform with three critical interfaces: a Command Center for case management and system oversight, an Evidence Board for visual relationship mapping and investigation coordination, and an AI Legal Terminal for intelligent legal reasoning and evidence analysis. These screens integrate with the existing PDF ingestion pipeline, chain-of-custody logging, and Gemma-powered legal analysis to provide prosecutors with a comprehensive investigation workspace.

## Glossary

- **Command Center**: Dashboard providing real-time case overview, active case list, system status, and quick actions for prosecutors
- **Evidence Board**: Interactive grid-based visualization for mapping evidence relationships, suspects, and investigative connections with drag/zoom capabilities
- **AI Legal Terminal**: CRT-style interface for Gemma-powered legal reasoning, function-calling for evidence queries, and holdings/citations extraction
- **Case**: A legal investigation containing multiple pieces of evidence, suspects, and investigative findings
- **Evidence Node**: A single piece of evidence (PDF, document, etc.) with metadata, embeddings, and chain-of-custody history
- **Relationship**: A connection between evidence nodes, suspects, or case elements (e.g., "mentions", "contradicts", "supports")
- **Gemma**: Local LLM (768d embeddings) used for legal analysis, summarization, and function-calling
- **pgvector**: PostgreSQL extension for vector similarity search on embeddings
- **Elasticsearch**: Full-text search index for evidence content
- **YoRHa Aesthetic**: Noir/cyber forensic theme with bone-white (#FAF7F1), crimson verdict (#9E0000), CRT terminal styling, and blueprint grid backgrounds

## Requirements

### Requirement 1: Command Center Dashboard

**User Story:** As a prosecutor, I want a centralized dashboard showing all active cases, system status, and quick access to key actions, so that I can manage multiple investigations efficiently and monitor system health.

#### Acceptance Criteria

1. WHEN the prosecutor navigates to `/dashboard`, THE Command Center SHALL display a grid layout with case statistics, active cases list, and system status panels
2. WHILE viewing the Command Center, THE system SHALL show real-time counts for: active cases, pending evidence, approved evidence, and persons of interest
3. WHEN the prosecutor views the active cases section, THE system SHALL display each case with: case title, status (active/closed), evidence count, last updated timestamp, and quick action buttons
4. IF a case status changes (evidence approved, new suspect added), THEN THE Command Center SHALL update the affected case card within 2 seconds
5. WHERE a prosecutor has permission to access a case, THE system SHALL display a "View Case" button that navigates to the case detail page
6. WHEN the prosecutor clicks "Quick Actions", THE system SHALL display options: Timeline Analysis, Evidence Summary, Suspect Connections, and Generate Report
7. WHILE the Command Center is displayed, THE system SHALL show system status indicators for: database connection, Elasticsearch index status, Gemma service availability, and file storage capacity

### Requirement 2: Evidence Board

**User Story:** As a prosecutor, I want to visualize evidence relationships on an interactive grid with drag/zoom capabilities, so that I can understand investigative connections and identify patterns across evidence.

#### Acceptance Criteria

1. WHEN the prosecutor navigates to `/cases/[id]/board`, THE Evidence Board SHALL render a zoomable, pannable grid canvas with evidence nodes positioned as draggable cards
2. WHILE viewing the Evidence Board, THE system SHALL display evidence nodes with: thumbnail/icon, evidence ID, classification level, and status indicator (pending/approved/locked)
3. WHEN the prosecutor drags an evidence node, THE system SHALL update its position on the canvas and persist the layout to the database
4. IF two evidence nodes are related (extracted from Gemma analysis), THEN THE system SHALL draw a crimson relationship line between them with a label (e.g., "mentions", "contradicts", "supports")
5. WHEN the prosecutor zooms in/out using mouse wheel or pinch gesture, THE Evidence Board SHALL scale the canvas and maintain readable node labels at all zoom levels
6. WHERE a prosecutor right-clicks on an evidence node, THE system SHALL display a context menu with options: View Details, Add Relationship, Remove Node, and Generate Summary
7. WHEN the prosecutor clicks "Add Relationship", THE system SHALL allow selection of a target node and relationship type, then create the connection
8. IF the prosecutor saves the board layout, THEN THE system SHALL persist node positions and relationships to the database for future sessions
9. WHEN the prosecutor hovers over a relationship line, THE system SHALL highlight the connected nodes and display the relationship metadata (type, confidence, source)

### Requirement 3: AI Legal Terminal

**User Story:** As a prosecutor, I want to interact with an AI legal assistant through a CRT-style terminal interface, so that I can query evidence, extract legal holdings, and receive intelligent analysis without leaving the investigation workspace.

#### Acceptance Criteria

1. WHEN the prosecutor navigates to `/terminal`, THE AI Legal Terminal SHALL display a CRT-style interface with black background, neon green text, and scanline effects
2. WHILE the terminal is active, THE system SHALL accept natural language queries from the prosecutor (e.g., "What evidence mentions the suspect?", "Extract holdings from this case")
3. WHEN the prosecutor submits a query, THE system SHALL route it to Gemma with function-calling capabilities to: search evidence, extract citations, identify holdings, and analyze relationships
4. IF Gemma determines a function call is needed, THEN THE system SHALL execute the appropriate function (search_evidence, extract_holdings, find_citations, analyze_relationships) and return results
5. WHEN Gemma returns results, THE system SHALL display them in the terminal with: query response, relevant evidence snippets, confidence scores, and source references
6. WHERE a prosecutor requests "Generate Report", THE system SHALL compile evidence summaries, holdings, citations, and investigative findings into a formatted legal document
7. WHILE the terminal displays results, THE system SHALL provide clickable links to: view full evidence, navigate to Evidence Board, and add to case timeline
8. WHEN the prosecutor types a command starting with "/", THE system SHALL interpret it as a system command (e.g., "/search", "/analyze", "/export") and execute accordingly
9. IF an error occurs during query processing, THEN THE system SHALL display a clear error message with troubleshooting suggestions and maintain terminal session state

### Requirement 4: Cross-Screen Integration

**User Story:** As a prosecutor, I want seamless navigation and data consistency across the Command Center, Evidence Board, and AI Terminal, so that my investigation workflow is uninterrupted and all screens reflect current case state.

#### Acceptance Criteria

1. WHEN the prosecutor navigates between screens, THE system SHALL maintain case context and preserve user session state (selected case, zoom level, terminal history)
2. WHILE viewing any screen, THE system SHALL display a persistent navigation bar with links to: Dashboard, Cases, Evidence Board, and Terminal
3. WHEN evidence is approved in the Evidence Board, THE Command Center SHALL update the evidence count within 2 seconds
4. IF the prosecutor queries the AI Terminal for evidence, THEN THE system SHALL highlight matching nodes on the Evidence Board when navigating back
5. WHEN the prosecutor clicks a case card on the Command Center, THE system SHALL navigate to the case detail page with Evidence Board pre-loaded
6. WHERE a prosecutor adds a relationship on the Evidence Board, THE system SHALL make that relationship available for AI Terminal queries immediately
7. WHEN the prosecutor exports a report from the AI Terminal, THE system SHALL include Evidence Board layout, chain-of-custody logs, and all analyzed evidence

### Requirement 5: Visual Design & Aesthetics

**User Story:** As a prosecutor, I want the interface to maintain a consistent noir/cyber forensic aesthetic across all screens, so that the investigation workspace feels cohesive and professional.

#### Acceptance Criteria

1. THE Command Center SHALL use bone-white (#FAF7F1) cards on a blueprint grid background with crimson (#9E0000) accent borders for high-priority cases
2. THE Evidence Board SHALL render evidence nodes as bone-white cards with crimson relationship lines and support WebGL rendering for smooth animations
3. THE AI Legal Terminal SHALL display neon green (#00FF00) text on black background with CRT scanline effects and monospace font (Courier New or equivalent)
4. WHILE any screen is displayed, THE system SHALL use consistent typography: serif fonts for case titles, monospace for technical details, and sans-serif for UI labels
5. WHERE status indicators are shown, THE system SHALL use: amber (#FFA500) for pending, green (#00AA00) for approved, red (#CC0000) for rejected, and gray for locked
6. WHEN the prosecutor interacts with UI elements, THE system SHALL provide visual feedback: hover states, click animations, and loading indicators consistent with YoRHa aesthetic

