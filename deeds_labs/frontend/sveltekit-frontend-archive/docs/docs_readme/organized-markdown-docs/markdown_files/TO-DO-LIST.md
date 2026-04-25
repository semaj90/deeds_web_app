# 🏛️ Prosecutor Social Network – Integration TO-DO-LIST

## 1. Authentication & Session
- [ ] Ensure registration/login routes use persistent authentication (JWT/cookie, stored in Postgres via Drizzle ORM).
- [ ] Expose user/session data SSR via `+layout.server.ts` and make available in all layouts/pages.
- [ ] Navbar/profile dropdown shows user info (SSR-safe).

## 2. Case Management (CRUD, Branching, CMS)
- [ ] Update/create routes for cases:
  - `/cases` (list, search, filter)
  - `/cases/new` (create)
  - `/cases/[id]` (view)
  - `/cases/[id]/edit` (edit)
  - `/cases/[id]/branch` (create sub-case/branch)
- [ ] Use form fields: Who, What, Why, How, Statute (law reference).
- [ ] Add AI summarization button to forms (calls `/api/nlp/summarize`).
- [ ] Support branching/merging cases (CMS-like features).

## 3. Evidence Upload & Interactive Canvas
- [ ] `/cases/[id]/evidence` page: upload, view, annotate, and link evidence.
- [ ] Use `/api/evidence/upload` for uploads (PDF, image, video).
- [ ] Call Python NLP service for metadata/entity extraction.
- [ ] Show evidence on an interactive canvas (drag/drop, annotate).

## 4. AI/NLP Integration
- [ ] Use `/api/nlp/summarize`, `/api/nlp/extract-entities`, `/api/nlp/recommendations` for:
  - Summarizing case/evidence
  - Extracting entities
  - Suggesting case titles, report sections, recommendations
- [ ] Integrate Qdrant for semantic search (similar cases, law recommendations).

## 5. Report Maker & Wanted Posters
- [ ] `/cases/[id]/report` page: generate structured report (Who, What, Why, How, Statute, Evidence, AI summary).
- [ ] `/criminals/[id]/wanted-poster` page: generate wanted poster with all deeds, recommendations, law context.

## 6. Law Data & Search
- [ ] Ingest law/statute text files into Postgres (Drizzle ORM).
- [ ] `/laws` and `/laws/[id]` pages: searchable, full-text and semantic search (Qdrant).
- [ ] Allow law selection in case forms.

## 7. Caching & Performance
- [ ] Use LokiJS for in-memory cache (recent cases, evidence, search results).
- [ ] Use Qdrant for vector/semantic search cache.

## 8. Documentation & Comments
- [ ] Add comments to all new/modified files explaining integration points.
- [ ] Document workflow in README and TO-DO-LIST.md.

---

**Instructions:**
- As you implement each feature, check it off and add a note with the file(s) and commit reference.
- Add comments in code to explain integration points for future contributors.
- Keep this list up to date as features are added or changed.
