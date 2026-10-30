-- DRAFT — NOT APPLIED. Do not run against legal_ai_db without an explicit operator authorization.
--
-- Parent Atlas workstation: inverse-DAG registry for to-do recommendations (INVERSE-DAG-LOWRANK-01, LR-01).
-- Additive only: creates one table and two indexes. It drops nothing, alters no existing table and
-- writes no rows.
--
-- Definition (from openspec/changes/manual-migration-reconciliation/tasks.md, LR-01): the inverse DAG
-- of a recommendation is the input set that produced it. One row = one input edge
-- (recommendation_key -> input). The graph is bipartite (recommendation -> inputs, never
-- recommendation -> recommendation), so it is acyclic by construction and needs no cycle check.
--
-- Ownership (verified live 2026-10-29; reuse, do not duplicate):
--   * kanban_tasks / kanban_task_dependencies   task-to-task execution dependencies (parent -> child).
--                                               Different grain: this table records WHY a recommendation
--                                               exists, not what must run before what.
--   * atlas_feature_recommendation_index        derived gap score (todo_score), 1,000 rows. It stays the
--                                               scorer; its rows can appear here as an input_kind.
--   * atlas_recommendation_outcome_receipts     what happened after a recommendation. Referenced by
--                                               receipt_checksum as an input_kind, not copied.
--   * openspec_task_source_index_v1             OpenSpec task census. Referenced by
--                                               canonical_task_key_candidate, not copied.
--
-- Authority: canonical = false by CHECK. Rows are evidence for ranking and review; they never create
-- identity, a retrieval vote or an approval. input_revision is NULL unless an exact
-- 'sha256:<64 hex>' revision is known; it is never defaulted or coerced.
--
-- Deliberately NOT included: no foreign keys. The inputs are polymorphic across several tables, and
-- an FK would take locks on write-amplified tables (codebase_chunk_index has 48 indexes).
--
-- Rollback: drizzle/manual/20261029_atlas_todo_inverse_dag_v1.rollback.sql (not executed).
-- Post-check: see the rehearsal notes in openspec/changes/manual-migration-reconciliation/tasks.md.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_todo_inverse_dag_v1 (
  edge_id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  recommendation_key text        NOT NULL,
  input_kind         text        NOT NULL,
  input_ref          text        NOT NULL,
  input_source_ref   text,
  input_revision     text,
  role               text        NOT NULL,
  ordinal            integer     NOT NULL DEFAULT 0,
  weight             double precision,
  snapshot_id        text,
  producer           text        NOT NULL,
  producer_revision  text        NOT NULL,
  canonical          boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_todo_inverse_dag_v1_kind_chk CHECK (input_kind IN (
    'openspec_task', 'feature', 'packet', 'receipt', 'kanban_task',
    'recommendation_index_row', 'source_file')),
  CONSTRAINT atlas_todo_inverse_dag_v1_role_chk CHECK (role IN (
    'prerequisite', 'evidence', 'blocker', 'supersedes')),
  CONSTRAINT atlas_todo_inverse_dag_v1_canonical_chk CHECK (canonical = false),
  CONSTRAINT atlas_todo_inverse_dag_v1_revision_chk CHECK (
    input_revision IS NULL OR input_revision ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT atlas_todo_inverse_dag_v1_weight_chk CHECK (
    weight IS NULL OR weight NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  CONSTRAINT atlas_todo_inverse_dag_v1_ordinal_chk CHECK (ordinal >= 0),
  CONSTRAINT atlas_todo_inverse_dag_v1_nonblank_chk CHECK (
    btrim(recommendation_key) <> '' AND btrim(input_ref) <> ''
    AND btrim(producer) <> '' AND btrim(producer_revision) <> '')
);

-- Idempotency: the same input cannot be recorded twice for one recommendation and role.
-- COALESCE keeps NULL revisions comparable without treating NULL as a revision.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_todo_inverse_dag_v1_edge_uidx
  ON atlas_todo_inverse_dag_v1 (recommendation_key, input_kind, input_ref, role, COALESCE(input_revision, ''));

-- Inverse lookup: which recommendations did this input contribute to.
CREATE INDEX IF NOT EXISTS atlas_todo_inverse_dag_v1_input_idx
  ON atlas_todo_inverse_dag_v1 (input_kind, input_ref);

COMMENT ON TABLE atlas_todo_inverse_dag_v1 IS
  'Derived, non-canonical inverse-DAG registry: the input set behind each to-do recommendation. Evidence only; never identity or approval.';

COMMIT;
