// ═══════════════════════════════════════════════════════════════════════
// Agentic Knowledge Integration V2 - Neo4j Schema
// ═══════════════════════════════════════════════════════════════════════
// Date: January 2, 2026
// Purpose: Graph schema for code dependencies and relationships
// ═══════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────
// Constraints and Indexes
// ───────────────────────────────────────────────────────────────────────

// File node constraints
CREATE CONSTRAINT file_path_unique IF NOT EXISTS
FOR (f:File) REQUIRE f.path IS UNIQUE;

CREATE INDEX file_name_index IF NOT EXISTS
FOR (f:File) ON (f.name);

CREATE INDEX file_extension_index IF NOT EXISTS
FOR (f:File) ON (f.extension);

CREATE INDEX file_last_modified_index IF NOT EXISTS
FOR (f:File) ON (f.lastModified);

// Component node constraints
CREATE CONSTRAINT component_id_unique IF NOT EXISTS
FOR (c:Component) REQUIRE c.id IS UNIQUE;

CREATE INDEX component_name_index IF NOT EXISTS
FOR (c:Component) ON (c.name);

CREATE INDEX component_type_index IF NOT EXISTS
FOR (c:Component) ON (c.type);

CREATE INDEX component_file_path_index IF NOT EXISTS
FOR (c:Component) ON (c.filePath);

// Function node constraints
CREATE CONSTRAINT function_id_unique IF NOT EXISTS
FOR (fn:Function) REQUIRE fn.id IS UNIQUE;

CREATE INDEX function_name_index IF NOT EXISTS
FOR (fn:Function) ON (fn.name);

CREATE INDEX function_file_path_index IF NOT EXISTS
FOR (fn:Function) ON (fn.filePath);

// Tag node constraints
CREATE CONSTRAINT tag_id_unique IF NOT EXISTS
FOR (t:Tag) REQUIRE t.tagId IS UNIQUE;

CREATE INDEX tag_category_index IF NOT EXISTS
FOR (t:Tag) ON (t.category);

CREATE INDEX tag_timestamp_index IF NOT EXISTS
FOR (t:Tag) ON (t.timestamp);

// Error node constraints
CREATE CONSTRAINT error_id_unique IF NOT EXISTS
FOR (e:Error) REQUIRE e.id IS UNIQUE;

CREATE INDEX error_type_index IF NOT EXISTS
FOR (e:Error) ON (e.errorType);

CREATE INDEX error_file_path_index IF NOT EXISTS
FOR (e:Error) ON (e.filePath);

// ───────────────────────────────────────────────────────────────────────
// Node Labels and Properties
// ───────────────────────────────────────────────────────────────────────

// File Node
// Properties:
//   - path: string (unique)
//   - name: string
//   - extension: string
//   - lastModified: datetime
//   - hash: string
//   - loc: integer (lines of code)
//   - language: string

// Component Node
// Properties:
//   - id: string (unique, UUID)
//   - name: string
//   - type: string (e.g., 'SvelteComponent', 'ReactComponent', 'Class')
//   - filePath: string
//   - lineNumber: integer
//   - exported: boolean
//   - props: [string] (for components)

// Function Node
// Properties:
//   - id: string (unique, UUID)
//   - name: string
//   - filePath: string
//   - lineNumber: integer
//   - parameters: [string]
//   - returnType: string
//   - async: boolean
//   - exported: boolean

// Tag Node
// Properties:
//   - tagId: string (unique, references PostgreSQL enhanced_tags.id)
//   - category: string
//   - name: string
//   - timestamp: datetime
//   - clusterId: string (optional)

// Error Node
// Properties:
//   - id: string (unique, UUID)
//   - errorType: string
//   - message: string
//   - filePath: string
//   - lineNumber: integer
//   - severity: string ('error', 'warning', 'info')
//   - fixed: boolean
//   - timestamp: datetime

// ───────────────────────────────────────────────────────────────────────
// Relationship Types
// ───────────────────────────────────────────────────────────────────────

// File Relationships
// (File)-[:IMPORTS {importedSymbols: [string], importType: string}]->(File)
// (File)-[:EXPORTS {exportedSymbols: [string]}]->(Component|Function)
// (File)-[:CONTAINS]->(Component|Function|Error)
// (File)-[:HAS_TAG]->(Tag)

// Component Relationships
// (Component)-[:DEPENDS_ON {reason: string}]->(Component)
// (Component)-[:USES]->(Function)
// (Component)-[:IMPORTS_FROM]->(File)
// (Component)-[:HAS_ERROR]->(Error)

// Function Relationships
// (Function)-[:CALLS {callType: string}]->(Function)
// (Function)-[:USES]->(Component)
// (Function)-[:IMPORTS_FROM]->(File)
// (Function)-[:HAS_ERROR]->(Error)

// Tag Relationships
// (Tag)-[:REFERENCES]->(File|Component|Function)
// (Tag)-[:IN_CLUSTER]->(Cluster)
// (Tag)-[:SIMILAR_TO {similarity: float}]->(Tag)

// Error Relationships
// (Error)-[:OCCURS_IN]->(File|Component|Function)
// (Error)-[:CAUSED_BY]->(Error)
// (Error)-[:FIXED_BY]->(Tag)

// ───────────────────────────────────────────────────────────────────────
// Sample Queries
// ───────────────────────────────────────────────────────────────────────

// Find all dependencies of a component
// MATCH (c:Component {name: 'MyComponent'})-[:DEPENDS_ON*]->(dep:Component)
// RETURN c, dep

// Find all files that import a specific file
// MATCH (f1:File)-[:IMPORTS]->(f2:File {path: '/path/to/file.ts'})
// RETURN f1

// Find all errors in a file
// MATCH (f:File {path: '/path/to/file.ts'})-[:CONTAINS]->(e:Error)
// WHERE e.fixed = false
// RETURN e

// Find all components that use a specific function
// MATCH (c:Component)-[:USES]->(fn:Function {name: 'myFunction'})
// RETURN c

// Find circular dependencies
// MATCH path = (c:Component)-[:DEPENDS_ON*]->(c)
// RETURN path

// Find most connected components (hub analysis)
// MATCH (c:Component)
// OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep)
// OPTIONAL MATCH (dependent)-[:DEPENDS_ON]->(c)
// RETURN c.name, count(DISTINCT dep) as dependencies, count(DISTINCT dependent) as dependents
// ORDER BY dependencies + dependents DESC
// LIMIT 10

// Find components with most errors
// MATCH (c:Component)-[:HAS_ERROR]->(e:Error)
// WHERE e.fixed = false
// RETURN c.name, count(e) as error_count
// ORDER BY error_count DESC
// LIMIT 10

// Find similar tags (by cluster)
// MATCH (t1:Tag {tagId: 'some-uuid'})-[:IN_CLUSTER]->(cluster)<-[:IN_CLUSTER]-(t2:Tag)
// WHERE t1 <> t2
// RETURN t2

// Find all tags for a file
// MATCH (f:File {path: '/path/to/file.ts'})-[:HAS_TAG]->(t:Tag)
// RETURN t

// ═══════════════════════════════════════════════════════════════════════
// Schema Creation Complete
// ═══════════════════════════════════════════════════════════════════════
