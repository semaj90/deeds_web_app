-- ============================================================================
-- ATLAS-3A: Separate Symbol (AST Truth) from Runtime (Dynamic Resolution)
-- ============================================================================

-- LAYER 1: Pure AST Truth
-- Extracted once, changes only when source code changes
-- No runtime data, no repair skill references
CREATE TABLE IF NOT EXISTS atlas_symbol_map (
  id bigserial PRIMARY KEY,

  -- Source location (from AST extraction)
  source_ref text NOT NULL,
  symbol_name text NOT NULL,
  symbol_kind text NOT NULL,  -- function, class, method, export, default_export, svelte_component, svelte_load, svelte_action, api_handler_GET, api_handler_POST, server_action, drizzle_table, zod_schema, test_case, repair_skill, dynamic_import

  -- Code location
  line_start integer,
  line_end integer,
  signature text,  -- CRITICAL: "(email: string, password: string) => Promise<User>"

  -- AST metadata (immutable)
  payload jsonb DEFAULT '{}',  -- ast_node, dependencies, exports_to

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: prevent duplicate extraction on reruns
CREATE UNIQUE INDEX IF NOT EXISTS atlas_symbol_map_unique_idx
ON atlas_symbol_map (
  source_ref,
  symbol_name,
  symbol_kind,
  COALESCE(line_start, 0)
);

-- Core indexes for AST lookups
CREATE INDEX IF NOT EXISTS atlas_symbol_map_source_idx ON atlas_symbol_map(source_ref);
CREATE INDEX IF NOT EXISTS atlas_symbol_map_source_kind_idx ON atlas_symbol_map(source_ref, symbol_kind);
CREATE INDEX IF NOT EXISTS atlas_symbol_map_symbol_trgm ON atlas_symbol_map USING gin(symbol_name gin_trgm_ops);

-- ============================================================================

-- LAYER 2: Runtime Resolution Map
-- Evolves constantly as repair skills are discovered and linked
-- Bridges packets → symbols → repair execution
CREATE TABLE IF NOT EXISTS atlas_runtime_map (
  id bigserial PRIMARY KEY,

  -- Packet identity
  packet_key text NOT NULL UNIQUE,
  feature_id text,

  -- Symbol reference (foreign key to atlas_symbol_map)
  symbol_id bigint NOT NULL,  -- references atlas_symbol_map(id)

  -- Runtime enrichment
  community_id integer,
  repair_skill_id text,  -- references repair_skills(skill_id)

  -- Validation references
  test_refs text[],  -- array of test file paths
  dynamic_import_key text,  -- ./skills/drizzle-23505-fix.mjs

  -- Authority scoring
  authority_score real DEFAULT 0.0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_runtime_map_packet_idx ON atlas_runtime_map(packet_key);
CREATE INDEX IF NOT EXISTS atlas_runtime_map_symbol_idx ON atlas_runtime_map(symbol_id);
CREATE INDEX IF NOT EXISTS atlas_runtime_map_feature_idx ON atlas_runtime_map(feature_id);
CREATE INDEX IF NOT EXISTS atlas_runtime_map_community_idx ON atlas_runtime_map(community_id);
CREATE INDEX IF NOT EXISTS atlas_runtime_map_skill_idx ON atlas_runtime_map(repair_skill_id);

-- ============================================================================

-- REPAIR GRAPH: Error Pattern → Repair Skill Edge
-- Non-deterministic: confidence and success_rate evolve from real runs
CREATE TABLE IF NOT EXISTS repair_edges (
  id bigserial PRIMARY KEY,

  -- Source symbol (what fails)
  source_ref text NOT NULL,
  symbol_name text NOT NULL,

  -- Error pattern (what breaks)
  error_pattern text NOT NULL,  -- "duplicate key value violates unique constraint"

  -- Target skill (how to fix)
  skill_id text NOT NULL,  -- references repair_skills(skill_id)

  -- Signal strength
  confidence real DEFAULT 0.5,  -- 0.0 → 1.0, learned from runs
  success_rate real DEFAULT 0.0,  -- % of times this edge led to success

  metadata jsonb DEFAULT '{}',  -- error_class, fix_category, etc.

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS repair_edges_unique_idx
ON repair_edges(source_ref, symbol_name, error_pattern, skill_id);
CREATE INDEX IF NOT EXISTS repair_edges_error_pattern_idx ON repair_edges(error_pattern);
CREATE INDEX IF NOT EXISTS repair_edges_skill_idx ON repair_edges(skill_id);
CREATE INDEX IF NOT EXISTS repair_edges_confidence_idx ON repair_edges(confidence DESC);

-- ============================================================================

-- COMMENT: Data Model Philosophy
COMMENT ON TABLE atlas_symbol_map IS
'AST Truth: Extracted once, immutable between source changes.
Symbol extraction via ts-morph: source_ref → symbols with signatures.
Signature is the contract for dynamic imports and repair validation.

Do NOT put runtime data here (repair_skill_id, community_id, feature_id).
Those belong in atlas_runtime_map, which evolves independently.';

COMMENT ON TABLE atlas_runtime_map IS
'Runtime Resolution: Bridges packets → symbols → repair execution.
Evolves as repair skills are discovered and linked.
Authority scores, community assignments, and skill mappings belong here.

Separation from atlas_symbol_map means:
- Repair skill discovery does not require re-extraction of entire AST
- Community backfill updates only runtime_map, not symbol_map
- Authority reranking tuning does not touch symbol definitions';

COMMENT ON TABLE repair_edges IS
'Repair Graph: Error pattern → Skill mapping with confidence/success signals.
Non-deterministic: confidence and success_rate evolve from real repair runs.

Enables:
- Deterministic error → symbol → skill lookup (no LLM guessing)
- Learning: success_rate updated from validation test results
- Graph traversal: find alternative skills if primary fails
- Audit: confidence values show which edges are proven vs. experimental';

-- ============================================================================

-- Fix community_id chain: ensure nes_chrom_packets can join to codebase_files
-- This is needed because Phase 2B didn't persist community_id to glyph_records

-- Add temporary junction table to bridge source_ref → file_path → community_id
-- (codebase_files uses file_path, not source_ref)

CREATE TABLE IF NOT EXISTS atlas_source_to_file_path (
  source_ref text PRIMARY KEY,
  file_path text NOT NULL,
  codebase_file_id uuid,
  community_id integer,
  matched_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_source_to_file_path_file_idx ON atlas_source_to_file_path(file_path);
CREATE INDEX IF NOT EXISTS atlas_source_to_file_path_community_idx ON atlas_source_to_file_path(community_id);

-- ============================================================================

-- COMMENT: Purpose and usage
COMMENT ON TABLE atlas_symbol_map IS
'ATLAS-3A Foundation: Maps source_ref → extracted symbols (functions, routes, exports)
Enables agentic repair skill lookup by error type → source_ref → symbol → skill.

Extraction via ts-morph AST walk:
- Classify each symbol by kind (function, component, route handler, test, etc.)
- Link to feature_id (from atlas_feature_map) and packet_key (from nes_chrom_packets)
- Store signature, line numbers, and repair skill candidates in payload

Usage: "username already taken" → packet search → feature_id → symbol_map → route action → repair skill lookup';

COMMENT ON TABLE atlas_source_to_file_path IS
'Temporary bridge: source_ref (from nes_chrom_packets) → file_path (from codebase_files)
Needed because Phase 2B community_id detection works on codebase_files, but glyph_records uses source_ref.
Once populated, enables: packet → source_ref → file_path → community_id → glyph_records update';
