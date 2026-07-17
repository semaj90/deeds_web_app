-- Atlas Knowledge Layer — versioned schema registry, canonical knowledge objects,
-- AST structural identity, typed embeddings, graph facts, hyperedges,
-- validation results, and projection state.
--
-- Apply once, in order. All tables use IF NOT EXISTS so re-runs are safe.
-- Never run concurrently with another migration on these tables.
--
-- Applied: 2026-07-16

-- ── 1. Schema registry (.okf compiled contracts) ────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_schema_registry (
    schema_id       text    NOT NULL,
    schema_version  integer NOT NULL,
    schema_kind     text    NOT NULL CHECK (schema_kind IN (
                        'packet',
                        'feature_envelope',
                        'graph_fact',
                        'embedding_contract',
                        'qdrant_projection',
                        'workflow_state'
                    )),
    okf_source      text    NOT NULL,   -- human-authored .okf source
    json_schema     jsonb   NOT NULL,   -- compiled JSON Schema for validation
    schema_hash     text    NOT NULL,   -- sha256 of canonical json_schema bytes
    status          text    NOT NULL DEFAULT 'DRAFT' CHECK (
                        status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED')
                    ),
    created_at      timestamptz NOT NULL DEFAULT now(),
    activated_at    timestamptz,
    PRIMARY KEY (schema_id, schema_version),
    UNIQUE (schema_hash)
);

CREATE INDEX IF NOT EXISTS idx_asr_schema_id_status
    ON atlas_schema_registry (schema_id, status);

-- ── 2. Canonical knowledge objects ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_knowledge_objects (
    knowledge_id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type         text    NOT NULL,
    object_key          text    NOT NULL,
    schema_id           text    NOT NULL,
    schema_version      integer NOT NULL,
    canonical_data      jsonb   NOT NULL,
    content_hash        text    NOT NULL,
    source_ref_key      text,
    tree_node_id        text,           -- FK added after atlas_ast_nodes exists
    packet_key          text,
    generator_type      text    NOT NULL CHECK (generator_type IN (
                            'AST', 'DETERMINISTIC', 'MODEL', 'HUMAN', 'IMPORT'
                        )),
    generator_version   text    NOT NULL,
    confidence          real,
    validation_status   text    NOT NULL DEFAULT 'PENDING' CHECK (
                            validation_status IN (
                                'PENDING', 'VALID', 'INVALID', 'SUPERSEDED'
                            )
                        ),
    valid_from          timestamptz NOT NULL DEFAULT now(),
    valid_to            timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (schema_id, schema_version)
        REFERENCES atlas_schema_registry (schema_id, schema_version),
    UNIQUE (object_type, object_key, schema_version, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_ako_object_type_key
    ON atlas_knowledge_objects (object_type, object_key);
CREATE INDEX IF NOT EXISTS idx_ako_packet_key
    ON atlas_knowledge_objects (packet_key)
    WHERE packet_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ako_source_ref
    ON atlas_knowledge_objects (source_ref_key)
    WHERE source_ref_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ako_validation_status
    ON atlas_knowledge_objects (validation_status);
CREATE INDEX IF NOT EXISTS idx_ako_canonical_data_gin
    ON atlas_knowledge_objects USING gin (canonical_data);

-- ── 3. AST structural identity (distinct from existing atlas_tree_nodes ledger) ──

CREATE TABLE IF NOT EXISTS atlas_ast_nodes (
    tree_node_id        text    PRIMARY KEY,  -- sha256 of structural key
    structural_key      text    NOT NULL,      -- repo:path:kind:symbol:hash
    repo_id             uuid    NOT NULL,
    relative_path       text    NOT NULL,
    node_kind           text    NOT NULL,      -- function, class, interface, etc.
    qualified_symbol    text,
    start_byte          integer,
    end_byte            integer,
    line_start          integer,
    line_end            integer,
    normalized_node_hash text   NOT NULL,      -- hash of normalized AST subtree
    source_content_hash  text   NOT NULL,      -- hash of raw source bytes
    parser_name         text    NOT NULL,
    parser_version      text    NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    superseded_by       text    REFERENCES atlas_ast_nodes (tree_node_id),
    UNIQUE (repo_id, relative_path, node_kind, qualified_symbol, normalized_node_hash)
);

CREATE INDEX IF NOT EXISTS idx_aan_relative_path
    ON atlas_ast_nodes (relative_path);
CREATE INDEX IF NOT EXISTS idx_aan_node_kind
    ON atlas_ast_nodes (node_kind);
CREATE INDEX IF NOT EXISTS idx_aan_qualified_symbol
    ON atlas_ast_nodes (qualified_symbol)
    WHERE qualified_symbol IS NOT NULL;

-- ── 4. Features (reference AST structural identity) ─────────────────────────

CREATE TABLE IF NOT EXISTS atlas_features (
    feature_id          text    PRIMARY KEY,
    tree_node_id        text    NOT NULL REFERENCES atlas_ast_nodes (tree_node_id),
    feature_namespace   text    NOT NULL,
    feature_type        text    NOT NULL,
    normalized_value    jsonb   NOT NULL,
    labels              jsonb   NOT NULL DEFAULT '{}'::jsonb,
    schema_id           text    NOT NULL,
    schema_version      integer NOT NULL,
    extractor_version   text    NOT NULL,
    confidence          real,
    content_hash        text    NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (schema_id, schema_version)
        REFERENCES atlas_schema_registry (schema_id, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_af_tree_node_id
    ON atlas_features (tree_node_id);
CREATE INDEX IF NOT EXISTS idx_af_namespace_type
    ON atlas_features (feature_namespace, feature_type);
CREATE INDEX IF NOT EXISTS idx_af_labels_gin
    ON atlas_features USING gin (labels);

-- ── 5. Typed canonical embeddings ───────────────────────────────────────────
-- 384-dim production vectors. Legacy 768-dim and latent 64-dim use separate tables.

CREATE TABLE IF NOT EXISTS atlas_embeddings_384 (
    embedding_id    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type    text    NOT NULL CHECK (subject_type IN (
                        'chunk', 'packet', 'tree_node', 'feature', 'summary'
                    )),
    subject_id      text    NOT NULL,
    vector_role     text    NOT NULL CHECK (vector_role IN (
                        'content', 'summary', 'signature', 'latent', 'routing'
                    )),
    vector_contract text    NOT NULL,   -- e.g. "canonical-content384-v1"
    model_name      text    NOT NULL,
    model_version   text    NOT NULL,
    dimension       integer NOT NULL DEFAULT 384 CHECK (dimension = 384),
    dtype           text    NOT NULL DEFAULT 'float32',
    normalized      boolean NOT NULL,
    embedding       vector(384),
    input_hash      text    NOT NULL,   -- sha256 of model input text
    vector_hash     text    NOT NULL,   -- sha256 of embedding bytes
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_type, subject_id, vector_role, vector_contract, input_hash)
);

CREATE INDEX IF NOT EXISTS idx_ae384_subject
    ON atlas_embeddings_384 (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_ae384_content_hnsw
    ON atlas_embeddings_384 USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128)
    WHERE vector_role = 'content' AND normalized = true;

-- Legacy 768-dim analysis vectors (kept separate — never mix with 384)
CREATE TABLE IF NOT EXISTS atlas_embeddings_768 (
    embedding_id    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type    text    NOT NULL,
    subject_id      text    NOT NULL,
    vector_role     text    NOT NULL,
    vector_contract text    NOT NULL,   -- e.g. "legacy-content-768-v1"
    model_name      text    NOT NULL,
    model_version   text    NOT NULL,
    dimension       integer NOT NULL DEFAULT 768 CHECK (dimension = 768),
    dtype           text    NOT NULL DEFAULT 'float32',
    normalized      boolean NOT NULL,
    embedding       vector(768),
    input_hash      text    NOT NULL,
    vector_hash     text    NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_type, subject_id, vector_role, vector_contract, input_hash)
);

CREATE INDEX IF NOT EXISTS idx_ae768_subject
    ON atlas_embeddings_768 (subject_type, subject_id);

-- Latent 64-dim autoencoder projections (routing/memory only, not for ANN search)
CREATE TABLE IF NOT EXISTS atlas_embeddings_64_latent (
    embedding_id    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type    text    NOT NULL,
    subject_id      text    NOT NULL,
    vector_role     text    NOT NULL DEFAULT 'latent',
    vector_contract text    NOT NULL,   -- e.g. "ae-latent-64-v1"
    encoder_version text    NOT NULL,
    dimension       integer NOT NULL DEFAULT 64 CHECK (dimension = 64),
    normalized      boolean NOT NULL DEFAULT false,
    embedding       vector(64),
    input_hash      text    NOT NULL,
    vector_hash     text    NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_type, subject_id, vector_role, vector_contract, input_hash)
);

CREATE INDEX IF NOT EXISTS idx_ae64_subject
    ON atlas_embeddings_64_latent (subject_type, subject_id);

-- ── 6. Graph facts (canonical before Neo4j projection) ─────────────────────

CREATE TABLE IF NOT EXISTS atlas_graph_facts (
    graph_fact_id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id          text    NOT NULL,
    predicate           text    NOT NULL,
    object_id           text    NOT NULL,
    subject_type        text    NOT NULL,
    object_type         text    NOT NULL,
    source_ref_key      text    NOT NULL,
    evidence_hash       text    NOT NULL,   -- sha256 of evidence supporting fact
    extractor_version   text    NOT NULL,
    confidence          real    NOT NULL,
    valid_from          timestamptz NOT NULL DEFAULT now(),
    valid_to            timestamptz,
    metadata            jsonb   NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (subject_id, predicate, object_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS idx_agf_subject
    ON atlas_graph_facts (subject_id, predicate);
CREATE INDEX IF NOT EXISTS idx_agf_object
    ON atlas_graph_facts (object_id, predicate);
CREATE INDEX IF NOT EXISTS idx_agf_source_ref
    ON atlas_graph_facts (source_ref_key);
CREATE INDEX IF NOT EXISTS idx_agf_predicate
    ON atlas_graph_facts (predicate);

-- ── 7. Hyperedges (n-ary relations) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_hyperedges (
    hyperedge_id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    relation_type       text    NOT NULL,
    schema_id           text    NOT NULL,
    schema_version      integer NOT NULL,
    source_ref_key      text    NOT NULL,
    evidence_hash       text    NOT NULL,
    properties          jsonb   NOT NULL DEFAULT '{}'::jsonb,
    extractor_version   text    NOT NULL,
    confidence          real,
    created_at          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (schema_id, schema_version)
        REFERENCES atlas_schema_registry (schema_id, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_ahe_relation_type
    ON atlas_hyperedges (relation_type);
CREATE INDEX IF NOT EXISTS idx_ahe_source_ref
    ON atlas_hyperedges (source_ref_key);

CREATE TABLE IF NOT EXISTS atlas_hyperedge_members (
    hyperedge_id    uuid    NOT NULL REFERENCES atlas_hyperedges (hyperedge_id)
                            ON DELETE CASCADE,
    member_id       text    NOT NULL,
    member_type     text    NOT NULL,
    member_role     text    NOT NULL,
    ordinal         integer,
    PRIMARY KEY (hyperedge_id, member_id, member_role)
);

CREATE INDEX IF NOT EXISTS idx_ahem_member_id
    ON atlas_hyperedge_members (member_id);
CREATE INDEX IF NOT EXISTS idx_ahem_member_type_role
    ON atlas_hyperedge_members (member_type, member_role);

-- ── 8. Validation results ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_validation_results (
    validation_id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_id        uuid    REFERENCES atlas_knowledge_objects (knowledge_id),
    schema_id           text    NOT NULL,
    schema_version      integer NOT NULL,
    validator_name      text    NOT NULL,
    validator_version   text    NOT NULL,
    passed              boolean NOT NULL,
    errors              jsonb   NOT NULL DEFAULT '[]'::jsonb,
    warnings            jsonb   NOT NULL DEFAULT '[]'::jsonb,
    input_hash          text    NOT NULL,
    validated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avr_knowledge_id
    ON atlas_validation_results (knowledge_id)
    WHERE knowledge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_avr_schema
    ON atlas_validation_results (schema_id, schema_version, passed);
CREATE INDEX IF NOT EXISTS idx_avr_validator
    ON atlas_validation_results (validator_name, passed);

-- ── 9. Projection state (tracks what's been sent to each store) ─────────────

CREATE TABLE IF NOT EXISTS atlas_projection_state (
    knowledge_id        uuid    NOT NULL REFERENCES atlas_knowledge_objects (knowledge_id),
    target_store        text    NOT NULL CHECK (target_store IN (
                            'QDRANT', 'NEO4J', 'TURBOVEC', 'REDIS'
                        )),
    target_contract     text    NOT NULL,   -- e.g. "atlas-qdrant-384-hybrid-v1"
    projected_version   integer NOT NULL,
    projection_hash     text    NOT NULL,
    status              text    NOT NULL CHECK (status IN (
                            'PENDING', 'PROJECTED', 'VERIFIED', 'FAILED', 'STALE'
                        )),
    projected_at        timestamptz,
    verified_at         timestamptz,
    last_error          text,
    PRIMARY KEY (knowledge_id, target_store, target_contract)
);

CREATE INDEX IF NOT EXISTS idx_aps_status
    ON atlas_projection_state (target_store, status);
CREATE INDEX IF NOT EXISTS idx_aps_stale
    ON atlas_projection_state (knowledge_id)
    WHERE status IN ('PENDING', 'FAILED', 'STALE');

-- ── 10. Backfill FK: knowledge objects → ast nodes ───────────────────────────
-- Deferred constraint — atlas_ast_nodes must exist first (created above).
-- If tree_node_id already has values in atlas_knowledge_objects, this validates them.

ALTER TABLE atlas_knowledge_objects
    ADD CONSTRAINT fk_ako_tree_node
    FOREIGN KEY (tree_node_id)
    REFERENCES atlas_ast_nodes (tree_node_id)
    NOT VALID;
-- VALIDATE separately after populating atlas_ast_nodes:
--   ALTER TABLE atlas_knowledge_objects VALIDATE CONSTRAINT fk_ako_tree_node;
