-- Atlas Memory System Tables
-- Applied manually (not via drizzle-kit journal)
-- Created: 2026-07-15

-- Stories: one coherent user-meaningful activity sequence
CREATE TABLE IF NOT EXISTS stories (
    story_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id               uuid,
    repository_id         uuid,
    story_type            text NOT NULL CHECK (story_type IN ('investigation','repair','import','simulation','research','retrieval')),
    title                 text NOT NULL,
    objective             text,
    status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned','paused')),
    started_at            timestamptz NOT NULL DEFAULT now(),
    completed_at          timestamptz,
    summary               text,
    outcome               text,
    importance_score      real,
    retention_class       text NOT NULL DEFAULT 'standard' CHECK (retention_class IN ('ephemeral','standard','important','permanent')),
    metadata              jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_stories_case_id ON stories(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_repository_id ON stories(repository_id) WHERE repository_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_retention ON stories(retention_class);

-- Episodic events: what happened during a story execution
CREATE TABLE IF NOT EXISTS episodic_events (
    event_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id              uuid NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
    run_id                uuid,
    thread_id             text,
    workflow_id           text,
    sequence_no           bigint NOT NULL,
    event_type            text NOT NULL,
    workflow_state        text,
    actor_type            text NOT NULL CHECK (actor_type IN ('agent','tool','user','system','pipeline')),
    actor_id              text,
    input_refs            jsonb NOT NULL DEFAULT '[]',
    output_refs           jsonb NOT NULL DEFAULT '[]',
    event_payload         jsonb NOT NULL DEFAULT '{}',
    success               boolean,
    error_code            text,
    error_message         text,
    occurred_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (story_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_episodic_events_story_id ON episodic_events(story_id);
CREATE INDEX IF NOT EXISTS idx_episodic_events_run_id ON episodic_events(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_episodic_events_occurred_at ON episodic_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_episodic_events_event_type ON episodic_events(event_type);
CREATE INDEX IF NOT EXISTS idx_episodic_events_success ON episodic_events(success) WHERE success IS NOT NULL;

-- Semantic memories: durable validated facts, not per-execution logs
CREATE TABLE IF NOT EXISTS semantic_memories (
    memory_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id         uuid,
    title_id              text,
    packet_key            text,
    source_ref            text NOT NULL,
    memory_kind           text NOT NULL CHECK (memory_kind IN ('architectural_decision','repair_procedure','validated_fact','user_preference','tool_sequence','failure_pattern','concept_definition')),
    statement             text NOT NULL,
    summary               text,
    keywords              text[] NOT NULL DEFAULT '{}',
    concept_ids           text[] NOT NULL DEFAULT '{}',
    domain_class          text,
    confidence            real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    authority_score       real,
    valid_from            timestamptz NOT NULL DEFAULT now(),
    valid_until           timestamptz,
    source_hash           bytea NOT NULL,
    schema_version        text NOT NULL DEFAULT 'atlas-semantic-memory-v1',
    created_at            timestamptz NOT NULL DEFAULT now(),
    promoted_from_event   uuid REFERENCES episodic_events(event_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_repository_id ON semantic_memories(repository_id) WHERE repository_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semantic_memories_packet_key ON semantic_memories(packet_key) WHERE packet_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semantic_memories_source_ref ON semantic_memories(source_ref);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_memory_kind ON semantic_memories(memory_kind);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_domain_class ON semantic_memories(domain_class) WHERE domain_class IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semantic_memories_valid ON semantic_memories(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_keywords ON semantic_memories USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_concept_ids ON semantic_memories USING GIN(concept_ids);
