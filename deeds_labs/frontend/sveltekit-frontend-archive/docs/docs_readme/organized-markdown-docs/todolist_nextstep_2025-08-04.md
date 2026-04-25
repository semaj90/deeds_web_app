# AI Legal System Next Steps To-Do List (2025-08-04)

## 1. Qdrant Installation & Backend Integration

- [ ] Install Qdrant locally or natively
- [ ] Add Qdrant client to backend:
  ```ts
  import { QdrantClient } from "@qdrant/js-client-rest";
  const qdrant = new QdrantClient({ url: "http://localhost:6333" });
  ```

## 2. Document Upload Pipeline

- [ ] On document upload, auto-tag with AI (Claude/Ollama)
- [ ] Save tags and embeddings to Postgres (Drizzle ORM) and Qdrant
- [ ] Example Drizzle schema:
  ```ts
  export const evidence = pgTable("evidence", {
    id: serial("id").primaryKey(),
    caseId: text("case_id"),
    tags: text("tags").array(),
    embedding: vector("embedding", { dimensions: 768 }),
    content: text("content"),
    createdAt: timestamp("created_at").defaultNow(),
  });
  ```

## 3. Playwright User DB Seed

- [ ] Use Playwright to seed users, cases, and evidence for testing
- [ ] Example:
  ```ts
  await db
    .insert(users)
    .values({ name: "Test User", email: "test@example.com" });
  await db.insert(cases).values({ userId: 1, title: "Case 1" });
  await db
    .insert(evidence)
    .values({
      caseId: 1,
      content: "Contract text...",
      tags: ["contract", "liability"],
    });
  ```

## 4. LangChain Bridge to Ollama

- [ ] Install LangChain and Ollama
- [ ] Use LangChain for agentic workflows, RAG, and query orchestration
- [ ] Example:
  ```ts
  import { Ollama } from "langchain/llms/ollama";
  const ollama = new Ollama({
    baseUrl: "http://localhost:11434",
    model: "gemma3-legal",
  });
  ```

## 5. Auto-Tagging, Embedding, and Storage

- [ ] Use Ollama (gemma3-legal) for summarization and entity extraction
- [ ] Use nomic-embed-text for embeddings
- [ ] Store results in Postgres (Drizzle ORM) and Qdrant
- [ ] Example pipeline:
  ```ts
  const summary = await ollama.summarize(content);
  const tags = await ollama.extractEntities(content);
  const embedding = await nomicEmbed(content);
  await db.insert(evidence).values({ caseId, content, tags, embedding });
  await qdrant.upsertPoint({
    collection_name: "evidence",
    points: [{ id, vector: embedding, payload: { tags } }],
  });
  ```

## 6. Enhanced RAG, Semantic Search, and Agent Orchestration

- [ ] Use Qdrant for semantic search and ranking
- [ ] Use LangChain for RAG-powered query answering
- [ ] Implement rank_function, synthesize_function in backend
- [ ] Example RAG query:
  ```ts
  const results = await qdrant.search({ vector: queryEmbedding, top: 5 });
  const answer = await ollama.generate({ context: results, question });
  ```

## 7. Go Microservice (main.go)

- [ ] Use Gin for REST API, fastjson for SIMD parsing, CUDA/cuBLAS for matrix ops, and SOM training
- [ ] Example endpoints:
  ```go
  router.POST("/embed", embedHandler)
  router.POST("/som/train", somTrainHandler)
  router.GET("/health", healthHandler)
  ```
- [ ] Node.js integration:
  ```ts
  import { spawn } from "child_process";
  const goProc = spawn("./goMicroservice");
  ```

## 8. XState Integration

- [ ] Use XState for all engine orchestration (upload, tag, embed, search, recommend)
- [ ] Example:
  ```ts
  const docAgent = createMachine({
    id: "docAgent",
    context: { caseId, evidence, tags, embedding },
    states: {
      idle: { on: { UPLOAD: "tagging" } },
      tagging: { invoke: { src: "autoTag", onDone: "embedding" } },
      embedding: { invoke: { src: "embed", onDone: "storing" } },
      storing: { invoke: { src: "storeEvidence", onDone: "searching" } },
      searching: { invoke: { src: "semanticSearch", onDone: "recommend" } },
      recommend: {
        /* ... */
      },
    },
  });
  ```

## 9. Neo4j Auto-Tag Insert Pipeline

- [ ] On evidence tagging, insert relationships into Neo4j
- [ ] Example:
  ```ts
  await neo4j.run(
    "MERGE (e:Evidence {id: $id}) MERGE (t:Tag {name: $tag}) MERGE (e)-[:HAS_TAG]->(t)",
    { id, tag }
  );
  ```

---

**Timestamp:** 2025-08-04
