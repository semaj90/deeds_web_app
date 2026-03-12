# Zod + Superforms v2 — Benefits for SvelteKit 2
> Why schema-driven validation is the right default for the Deeds Legal AI platform.
---
## 1. Security
### Trust Boundaries
Zod acts as a validation gate at every I/O boundary — form submissions, API requests, URL parameters. Once data passes a Zod schema, it is "trusted" within the system. This is the **"parse, don't validate"** paradigm: transform unknown input into a known, typed structure at the boundary.
### Mass Assignment Prevention
Zod objects strip unknown keys by default (`.strip()` mode). If an attacker submits `{ email: "a@b.com", isAdmin: true }`, the `isAdmin` field is silently removed if not in the schema. `.strict()` mode throws an error on any unrecognized key — recommended for security-critical endpoints (auth, admin actions).
### Injection Mitigation
By constraining input to specific types, lengths, patterns, and enums, Zod prevents malformed payloads from reaching database queries. This complements Drizzle ORM's parameterized queries — defense-in-depth.
### Type Coercion Attack Prevention
Raw `formData.get()` always returns `string | null`. Without validation:
- `"true"` (string) bypasses a `=== true` boolean check
- `"0"` is falsely truthy/falsy depending on context
- `"__proto__"` can trigger prototype pollution in careless merge logic
Zod's coercion helpers (`z.coerce.number()`, `z.coerce.boolean()`) make type transformation predictable.
---
## 2. Developer Experience
### Zero-Duplication Type Inference
`z.infer<typeof schema>` extracts the TypeScript type directly from the schema. Declare once, get both runtime validation and compile-time types. No parallel `interface` + validation code that drift apart.
### Structured Error Messages
`safeParse` returns `ZodIssue[]` with `code`, `message`, `path` (nested), and `expected`/`received` types. Superforms maps these to per-field `$errors` stores automatically.
### Progressive Enhancement
Superforms works with zero JavaScript by default. Standard HTML `<form>` POST handles validation server-side. Adding `use:enhance` upgrades to AJAX, client-side validation, loading spinners, auto-focus on invalid fields — without changing the form structure.
### Shared Client/Server Schemas
The same Zod schema runs on both server (`+page.server.ts`) and client (`zodClient()` adapter). Validation rules defined once, enforced in both places.
---
## 3. Performance
### Fail-Fast at the Boundary
Zod validation rejects malformed requests before they reach DB queries, Qdrant searches, or Ollama inference. The few milliseconds Zod spends are dwarfed by network latency and database I/O.
### Zod v4 Gains
Zod v4 uses JIT compilation: 14x faster string parsing, 7x faster array parsing, 6.5x faster object parsing vs v3. For server routes where schemas are module-scoped and reused, this is a net win.
### Schema Caching
Keep schemas outside `load()` or action functions so the Superforms adapter can cache the compiled schema. Avoids re-initialization per request.
---
## 4. Raw `formData.get()` vs Zod — Comparison
| Aspect | Raw `formData.get()` | Zod Schema |
|--------|---------------------|------------|
| **Return type** | Always `string \| File \| null` | Inferred TypeScript type |
| **Type coercion** | Manual `Number()` — `NaN` silently | `z.coerce.number()` with error |
| **Boolean handling** | Returns `"on"` or `null` | `z.coerce.boolean()` with clear semantics |
| **Missing fields** | `null` — manual null-check each | Required/optional schema; structured errors |
| **Extra fields** | No protection (mass assignment) | `.strip()` removes; `.strict()` rejects |
| **Nested data** | Manual `formData.getAll()` | Superforms handles natively |
| **Error messages** | Build manually | `ZodIssue[]` with path, code, message |
| **Injection surface** | Raw strings to queries | Constrained type, length, pattern, enum |
| **Maintenance** | Scattered across actions | Single schema file, reused everywhere |
---
## 5. Best Practices (SvelteKit + Superforms)
1. **Define schemas at module scope** — enables adapter caching
2. **Always return the form object** — both in `load()` and actions
3. **`fail(400, { form })` for validation errors** — `setError()` for business logic
4. **Progressive enhancement as default** — build forms that work without JS
5. **Validate at the boundary, trust internally** — no redundant downstream checks
6. **Use `.strict()` on auth/admin schemas** — reject unexpected fields
7. **Use Zod transforms for sanitization** — `.trim()`, `.toLowerCase()` in the schema
---
## 6. What We Wired (Session 93r+)
### Superforms v2 (4 Highest-Risk Routes)
| Route | Schema File | Actions |
|-------|------------|---------|
| `/evidence` | `evidence/schema.ts` | upload, delete, update |
| `/cases` | `cases/schema.ts` | create, bulkUpdateStatus, bulkArchive |
| `/login` | `login/schema.ts` | login |
| `/analysis-center` | `analysis-center/schema.ts` | search, analyze |
### Zod `safeParse()` (API Routes — 55 endpoints)
| Endpoint | Validates |
|----------|-----------|
| `POST /api/citations` | statute_code, case_id, jurisdiction, etc. |
| `POST /api/recommendations` | query, caseId, topK, tags |
| `GET /api/graph/timeline` | caseId (uuid), limit (1-200), types (enum) |
| `POST /api/cases` | title, description, status (enum), priority (enum) |
| `PATCH /api/cases` | ids (uuid[]), status, priority |
| `DELETE /api/cases` | ids (uuid[]) |
| `POST /api/reports` | caseId (uuid), contentHtml (1MB), title, status, metadata |
| `PATCH /api/reports` | ids (uuid[]), contentHtml, title, status |
| `DELETE /api/reports` | ids (uuid[]) |
| `POST /api/cases/[id]/notes` | content (1-50K), title, isAI (boolean) |
| `POST /api/chat` | message/prompt/messages (max 50), temperature (0-2) |
| `POST /api/persons-of-interest/search` | query (1-200), limit (1-50), excludeId (uuid) |
| `POST /api/rag/answer` | context_id, query, case_id (uuid), max_tokens, temperature |
| `POST /api/synthesis/generate` | query (3-5K), persona (enum), maxTokens, stream, etc. |
| `PATCH /api/user/preferences` | theme, sidebarCollapsed, pageSize, language (.strict()) |
| `PUT /api/documents/[id]` | content (5MB), status (enum) |
| `POST /api/analytics/events` | eventType (enum), userId, sessionId, payload |
| `POST /api/feedback` | documentId, rating (0-1) |
| `POST /api/cache/invalidate` | pattern (prefix-validated via .refine()) |
| `POST /api/ai/ask` | question/query/prompt, context (.refine() requires one) |
| `POST /api/embed` | text (50K), model (enum), dimensions |
| `POST /api/rag/validate` | query_id, case_id (uuid), validations (array of chunk verdicts) |
| `POST /api/auth/login` | email (.trim(), .email()), password (1-255, NO trim) |
| `POST /api/cases/[id]/connections` | fromEvidenceId/toEvidenceId (uuid), connectionType, strength (0-1) |
| `PATCH /api/cases/[id]/connections` | connectionId (uuid), label, notes, strength, isVisible |
| `DELETE /api/cases/[id]/connections` | connectionId (uuid) |
| `POST /api/rag/search` | query (1-5K), top_k (1-100), min_score (0-1), scoring_method (enum) |
| `POST /api/evidence/search` | query (1-5K), caseId (uuid), limit, expandSections, jurisdiction |
| `POST /api/evidence/upload` | title (256), description (10K), caseId (uuid), evidenceType |
| `POST /api/sse/chat` | message (50K), model, conversationId, emotionPrompt, emotionMood |
| `POST /api/chat/stream` | sessionId, message (50K), caseId (uuid) |
| `GET /api/cases/[id]/similar` | limit (z.coerce 1-100), includeEmbedding, triggerGraph |
| `POST /api/persons` | caseId (uuid), name (1-500), aliases, threatLevel (enum), status (enum) |
| `POST /api/error-brain/apply-fix` | filePath (1K), fixedCode (5MB), dryRun, confidence (0-1), sourceIds |
| `POST /api/error-brain/auto-patch` | filePath (1K), errorMessage (50K), originalCode, maxAttempts (1-5) |
| `PATCH /api/cases/[id]` | title (1-500), description (10K), status (enum), priority (enum) |
| `POST /api/ai/chat` | message/prompt (10K), caseId (uuid), temperature (0-2), history (50 msgs, .refine()) |
| `POST /api/ai/tensorrt` | prompt (1-10K), maxTokens (64-8192), temperature (0-2), fallbackToOllama |
| `POST /api/gpu/compute` | operation (enum: similarity/cluster/weighted_embedding/device_info), embeddings, weights, k |
| `POST /api/push/send` | title (500), body (5K), channels (enum[]), ntfyTopic, userId (uuid) |
| `POST /api/pipeline/run` | doc_id, case_id, content (5MB), tags, pipeline_config, nested data |
| `POST /api/analyze-file` | filePath (1-1K) |
| `POST /api/summarize` | text (.trim(), 10-50K) |
| `POST /api/codebase-index` | query (1-5K), limit (1-100, default 20) |
| `POST /api/cases/[id]/laws` | statute_code (1-500), link_type (enum), notes (5K) |
| `POST /api/cases/[id]/citations` | citation_id (1-500), link_type (enum), notes (5K) |
| `POST /api/push` | subscription.endpoint (2K), subscription.keys.p256dh, .auth |
| `DELETE /api/push` | endpoint (1-2K) |
| `POST /api/cache` | key (1-500), value (unknown), options.ttl/priority/tags |
| `POST /api/case-theory` | summary (.trim(), 10-50K), caseName, charges[], keyEvidence[], witnessProfiles[], 15 fields |
| `PATCH /api/knowledge` | prompt (1-10K), max_context_chunks (1-50), use_gemini (boolean) |
| `POST /api/indexing?action=codebase` | rootPath (500, default './src') |
| `POST /api/indexing?action=search` | query (1-5K), limit (1-100, default 5) |
### Pattern Used
```typescript
// Form actions (Superforms)
const form = await superValidate(request, zod(schema));
if (!form.valid) return fail(400, { form });
// API routes (Zod safeParse)
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
}
```
---
## Sources
**Official:**
- [Superforms Official](https://superforms.rocks/)
- [Zod Official Docs](https://zod.dev/)
**Tutorials:**
- [LogRocket — Building SvelteKit Forms with Superforms](https://blog.logrocket.com/building-sveltekit-forms-superforms/)
- [Springtree — Form Validation with SvelteKit and Zod](https://www.springtree.nl/posts/form-validation-sveltekit-zod/)
- [Koivu Dev — Handling Forms in SvelteKit Using Superforms](https://koivudev.com/blog/superforms)
**Security:**
- [Steve Kinney — Best Practices with Zod](https://stevekinney.com/courses/full-stack-typescript/zod-best-practices)
- [Turing — Schema Validation with Zod in 2025](https://www.turing.com/blog/data-integrity-through-zod-validation)
- [DEV Community — Security by Design with Zod](https://dev.to/bbescort-team/security-by-design-with-nestjs-zod-ts-rest-and-custom-in-house-frameworks-488n)
**Performance:**
- [InfoQ — Zod v4 Available](https://www.infoq.com/news/2025/08/zod-v4-available/)
- [Numeric — How We Doubled Zod Performance](https://numeric.substack.com/p/how-we-doubled-zod-performance-to)
