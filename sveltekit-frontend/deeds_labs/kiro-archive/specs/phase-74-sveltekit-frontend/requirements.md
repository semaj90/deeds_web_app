# Phase 74: SvelteKit Frontend with AST Analysis & Agentic Suggestions

## Introduction

A modern SvelteKit 2 + Svelte 5 frontend application that provides intelligent code error fixing through AST analysis, agentic auto-suggestions with web search integration, and RAG-powered codebase context retrieval. The system integrates with the Phase 73 Unified Reasoning Engine to deliver real-time error analysis, suggestion recommendations, and semantic search across legal codebases.

## Glossary

- **SvelteKit**: Full-stack web framework for building web applications with Svelte
- **Svelte 5**: Latest version of Svelte with rune-based reactivity
- **AST (Abstract Syntax Tree)**: Tree representation of source code structure
- **tsmorph**: TypeScript compiler API wrapper for AST manipulation and analysis
- **Agentic Auto-Suggestion**: AI-powered system that autonomously recommends code fixes and improvements
- **Web Search Integration**: Real-time search capability to find external resources and solutions
- **RAG (Retrieval-Augmented Generation)**: System that retrieves relevant codebase context before generating suggestions
- **Codebase Context**: Indexed and searchable representation of project files and dependencies
- **uno.css**: Utility-first CSS framework with atomic design principles
- **drizzle-orm**: TypeScript ORM for type-safe database operations
- **Cluster Badge**: Visual indicator showing semantic clustering and relationship information
- **Error Fixing Pipeline**: End-to-end process from error detection to suggestion application

## Requirements

### Requirement 1: AST-Based Code Analysis

**User Story:** As a developer, I want the system to analyze my code using AST parsing, so that I can understand code structure and identify errors at the syntax and semantic level.

#### Acceptance Criteria

1. WHEN a developer uploads or pastes code, THE Frontend SHALL parse the code using tsmorph to generate an AST
2. WHILE the AST is being analyzed, THE Frontend SHALL extract function signatures, variable declarations, and type information
3. IF a syntax error is detected during AST parsing, THEN THE Frontend SHALL display the error location and type to the developer
4. WHERE code analysis is requested, THE Frontend SHALL store the AST representation for subsequent operations
5. THE Frontend SHALL support TypeScript, JavaScript, and JSX code analysis

### Requirement 2: Agentic Auto-Suggestion System

**User Story:** As a developer, I want the system to automatically suggest code fixes and improvements, so that I can quickly resolve errors without manual research.

#### Acceptance Criteria

1. WHEN an error is detected in the code, THE Frontend SHALL invoke the agentic suggestion engine with error context
2. WHILE generating suggestions, THE Frontend SHALL retrieve relevant codebase context using RAG
3. IF multiple suggestions are available, THEN THE Frontend SHALL rank them by confidence score and relevance
4. WHERE a suggestion is selected, THE Frontend SHALL apply the fix to the code and update the AST
5. THE Frontend SHALL display suggestion confidence scores and reasoning explanations

### Requirement 3: Web Search Integration

**User Story:** As a developer, I want the system to search the web for solutions when local context is insufficient, so that I can access external resources and best practices.

#### Acceptance Criteria

1. WHEN a suggestion requires external context, THE Frontend SHALL trigger a web search with relevant keywords
2. WHILE web search results are being retrieved, THE Frontend SHALL display a loading indicator
3. IF web search results are available, THEN THE Frontend SHALL display top results with source attribution
4. WHERE search results are displayed, THE Frontend SHALL include links to external resources
5. THE Frontend SHALL cache web search results for 24 hours to reduce API calls

### Requirement 4: RAG-Powered Codebase Context Retrieval

**User Story:** As a developer, I want the system to understand my codebase context, so that suggestions are tailored to my project structure and dependencies.

#### Acceptance Criteria

1. WHEN a project is loaded, THE Frontend SHALL index all code files and extract semantic embeddings
2. WHILE generating suggestions, THE Frontend SHALL retrieve the top-K most relevant code snippets from the codebase
3. IF a code pattern matches existing implementations, THEN THE Frontend SHALL prioritize suggestions that align with project conventions
4. WHERE codebase context is retrieved, THE Frontend SHALL display the source files and line numbers
5. THE Frontend SHALL update the codebase index when files are modified

### Requirement 5: Real-Time Error Detection and Visualization

**User Story:** As a developer, I want to see errors highlighted in real-time as I write code, so that I can fix issues immediately.

#### Acceptance Criteria

1. WHEN code is being edited, THE Frontend SHALL perform incremental AST analysis on each keystroke
2. WHILE analyzing code, THE Frontend SHALL detect syntax errors, type mismatches, and semantic issues
3. IF an error is detected, THEN THE Frontend SHALL highlight the error location with color coding and inline messages
4. WHERE errors are displayed, THE Frontend SHALL show error severity (error, warning, info)
5. THE Frontend SHALL debounce analysis to avoid excessive processing

### Requirement 6: Cluster Badge Integration

**User Story:** As a developer, I want to see semantic relationships between code suggestions, so that I can understand how suggestions relate to each other.

#### Acceptance Criteria

1. WHEN suggestions are displayed, THE Frontend SHALL show cluster badges indicating semantic grouping
2. WHILE hovering over a cluster badge, THE Frontend SHALL display cluster information and related suggestions
3. IF multiple suggestions belong to the same cluster, THEN THE Frontend SHALL visually group them together
4. WHERE cluster badges are displayed, THE Frontend SHALL use color coding to indicate cluster type
5. THE Frontend SHALL support filtering suggestions by cluster

### Requirement 7: Data Persistence with Drizzle ORM

**User Story:** As a developer, I want my analysis history and preferences to be saved, so that I can resume work and track changes over time.

#### Acceptance Criteria

1. WHEN a code analysis is completed, THE Frontend SHALL store the analysis results in the database
2. WHILE storing data, THE Frontend SHALL use Drizzle ORM for type-safe database operations
3. IF a developer requests analysis history, THEN THE Frontend SHALL retrieve and display previous analyses
4. WHERE user preferences are set, THE Frontend SHALL persist them to the database
5. THE Frontend SHALL support exporting analysis results and suggestions

### Requirement 8: Responsive UI with uno.css

**User Story:** As a developer, I want the interface to be responsive and visually appealing, so that I can use the system on any device.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL render a responsive layout using uno.css utilities
2. WHILE resizing the window, THE Frontend SHALL adapt the layout for mobile, tablet, and desktop viewports
3. IF the screen is small, THEN THE Frontend SHALL stack components vertically and hide non-essential UI elements
4. WHERE UI components are rendered, THE Frontend SHALL use consistent spacing, typography, and color schemes
5. THE Frontend SHALL support light and dark themes

### Requirement 9: Integration with Phase 73 Reasoning Engine

**User Story:** As a developer, I want the frontend to communicate with the backend reasoning engine, so that I can leverage advanced clustering and re-ranking capabilities.

#### Acceptance Criteria

1. WHEN a suggestion is requested, THE Frontend SHALL call the Phase 73 unified search API
2. WHILE waiting for backend response, THE Frontend SHALL display a loading state
3. IF the backend returns cluster information, THEN THE Frontend SHALL display cluster badges and metadata
4. WHERE re-ranking scores are available, THE Frontend SHALL sort suggestions by relevance
5. THE Frontend SHALL handle backend errors gracefully with user-friendly messages

### Requirement 10: Code Suggestion Application and Diff Viewing

**User Story:** As a developer, I want to preview and apply code suggestions with diff visualization, so that I can review changes before committing them.

#### Acceptance Criteria

1. WHEN a suggestion is selected, THE Frontend SHALL display a side-by-side diff of the original and suggested code
2. WHILE viewing the diff, THE Frontend SHALL highlight added, removed, and modified lines
3. IF the developer approves the suggestion, THEN THE Frontend SHALL apply the changes to the code
4. WHERE changes are applied, THE Frontend SHALL update the AST and re-analyze the code
5. THE Frontend SHALL support undoing applied suggestions

