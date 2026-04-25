# Evidence System TODO

## Goal

Build a fully editable, searchable, and interactive legal evidence system:

- Evidence/docs are uploaded, edited, searched, and visualized as nodes (canvas).
- All changes are saved and connected to users/cases.
- System supports semantic, fuzzy, and relationship search.

---

## 1. Storage & Search Layer

- **pgvector (Postgres + Drizzle ORM):** Store evidence metadata, user/case links, vector embeddings.
- **Qdrant:** Advanced vector/semantic search and similarity.
- **Fuse.js/Loki.js:** Fast, client-side fuzzy search/filtering in UI.
- **Neo4j:** (Optional) Model complex relationships as a graph.
- **Redis:** Caching, fast lookups, pub/sub notifications.
- **RabbitMQ:** Async processing (virus scan, OCR, AI enrichment).

## 2. API Layer

- **REST (AJAX/JSON):** Standard CRUD (upload, edit, list, delete evidence).
- **GraphQL:** Flexible queries (fetch all evidence for a user, with related cases/nodes).
- **WebSocket:** Real-time updates (evidence edited/added).

## 3. Editable Evidence & Node System

- **XState:** State machines for upload, edit, node interactions.
- **Drizzle ORM:** All DB operations (create, update, delete, link evidence).
- **AJAX/Fetch:** Client-server communication (REST/GraphQL).
- **Interactive Canvas:** Import evidence as nodes, drag/drop, connect, save relationships.

## 4. Example Flows

- **Upload Evidence:**
  - POST /api/users/:userId/evidence (multipart/form-data)
  - Save file, metadata, generate embedding (pgvector/Qdrant).
- **Edit Evidence:**
  - PATCH /api/users/:userId/evidence/:evidenceId
  - Update metadata, re-embed if content changes.
- **List/Search Evidence:**
  - GET /api/users/:userId/evidence
  - POST /api/users/:userId/evidence/search (semantic)
  - Fuzzy search in UI (Fuse.js).
- **Canvas Integration:**
  - Evidence/docs are nodes.
  - Import to canvas, connect nodes (evidence <-> case <-> report).
  - Save node positions/relationships (Drizzle/Neo4j).
- **XState Example:**
  - Use state machines for upload/edit flows.

## 5. Connections & Memory

- Use Neo4j or relational tables for relationships (evidence <-> case <-> user <-> report).
- Use Context7 MCP and enhanced index to remember/retrieve connections for AI/search.

## 6. File/Codebase Integration

- API endpoints: `src/routes/api/evidence/+server.ts` (REST) or `src/routes/api/graphql/+server.ts` (GraphQL).
- Svelte stores/XState for frontend state.
- Drizzle ORM for DB access.
- Qdrant/pgvector for semantic search.
- Fuse.js for UI search.
- Canvas for node editing/visualization.

## 7. Example: Evidence Node Save (AJAX)

- Use AJAX/GraphQL to save node edits/positions/relationships.

---

**Summary:**

- Use Drizzle/pgvector/Qdrant for storage/semantic search.
- XState for robust UI state.
- REST/GraphQL for API.
- Neo4j/relational for connections.
- Fuse.js for UI search.
- Canvas for node editing/visualization.
- All changes saved/connected, system can "remember" and retrieve via enhanced index/Context7.
