-- Draft Review Spec: drizzle/manual/proposed_20261015_atlas_hypergraph_edges_spec.sql
-- DO NOT APPLY WITHOUT OPERATOR REVIEW (AGENTS.md Drizzle Governance)
--
-- Purpose:
--   1. Reconciles code-entity N-ary hyperedges with existing canonical packet tree_node_id ownership.
--   2. Does NOT create a duplicate atlas_ast_treenodes table (atlas_packets and atlas_tree_nodes already
--      hold 61,659 linked packet-tree rows and 269,972 tree nodes).
--   3. Enforces sha256:<64hex> source_revision qualification so commit labels (e.g. git:0084288f26) fail closed.
--   4. Uses lexicographically sorted member_tree_node_ids text[] + PostgreSQL 18 GIN index to enable
--      planner-driven Bitmap Index Scans / AIO Bitmap Heap Scans across multi-hop hyperedge neighborhoods.
--   5. Keeps canonical_authority = false until source-byte enrichment and P12 revision gates pass.

CREATE TABLE IF NOT EXISTS public.atlas_hypergraph_edges (
    hyperedge_id text PRIMARY KEY,               -- Format: he_v1_<32_char_sha256_hex>
    source_revision text NOT NULL,               -- Must match ^sha256:[0-9a-f]{64}$
    source_file text NOT NULL,                   -- Repo-relative path (e.g. sveltekit-frontend/src/...)
    relation_kind text NOT NULL,                 -- 'RUNE_DEPENDENCY', 'COMPONENT_RENDER', 'EVENT_DISPATCH', 'CALLS', 'IMPORTS'
    member_tree_node_ids text[] NOT NULL,        -- Lexicographically sorted set of revision-qualified tree_node_ids (tn_v1_*)
    role_map jsonb NOT NULL DEFAULT '{}'::jsonb, -- Maps tree_node_id -> role ('caller', 'callee', 'rune_state', 'template_el', 'handler')
    confidence_lane text NOT NULL,               -- 'svelte_compiler_ast' | 'ast_grep_crosscheck' | 'langextract_span'
    canonical_authority boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_atlas_hypergraph_edges_source_rev_sha256 CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT chk_atlas_hypergraph_edges_canonical_authority_false CHECK (canonical_authority = false),
    CONSTRAINT chk_atlas_hypergraph_edges_min_arity CHECK (array_length(member_tree_node_ids, 1) >= 2)
);

-- GIN index enables PostgreSQL 18 planner Bitmap Index Scan + AIO Bitmap Heap Scan on multi-node membership (@>, &&)
CREATE INDEX IF NOT EXISTS idx_atlas_hypergraph_edges_members_gin
    ON public.atlas_hypergraph_edges USING gin (member_tree_node_ids);

CREATE INDEX IF NOT EXISTS idx_atlas_hypergraph_edges_file_rev
    ON public.atlas_hypergraph_edges (source_file, source_revision);

-- Read-only projection view bridging existing relational incidence rows (atlas_hyperedges + atlas_hyperedge_members)
-- into the sorted array representation for unified planner evaluation:
CREATE OR REPLACE VIEW public.v_atlas_hyperedge_incidence_sorted AS
SELECT
    he.hyperedge_id::text AS hyperedge_id,
    he.source_revision,
    he.source_ref_key AS source_file,
    he.relation_type AS relation_kind,
    array_agg(hm.member_id ORDER BY hm.member_id) AS member_tree_node_ids,
    jsonb_object_agg(hm.member_id, hm.role) AS role_map,
    he.extractor_version AS confidence_lane,
    false AS canonical_authority,
    he.created_at
FROM public.atlas_hyperedges he
JOIN public.atlas_hyperedge_members hm ON hm.hyperedge_id = he.hyperedge_id
GROUP BY he.hyperedge_id, he.source_revision, he.source_ref_key, he.relation_type, he.extractor_version, he.created_at;
