-- Manual migration SQL for Distilled Table Store tables
-- Tables: atlas_profile_cards, atlas_feature_profiles, atlas_dependency_edges, atlas_hot_keyword_clusters, atlas_retrieval_events

CREATE TABLE IF NOT EXISTS public.atlas_profile_cards (
    card_id text PRIMARY KEY,
    source_ref text,
    feature_label text NOT NULL,
    hot_keywords text[] NOT NULL DEFAULT '{}',
    dependencies text[] NOT NULL DEFAULT '{}',
    imports text[] NOT NULL DEFAULT '{}',
    exports text[] NOT NULL DEFAULT '{}',
    routes text[] NOT NULL DEFAULT '{}',
    mcp_tools text[] NOT NULL DEFAULT '{}',
    db_tables text[] NOT NULL DEFAULT '{}',
    qdrant_collection text,
    redis_keys text[] NOT NULL DEFAULT '{}',
    network_protocols text NOT NULL DEFAULT 'unknown',
    encoding_profile text NOT NULL DEFAULT 'unknown',
    missing_getters text[] NOT NULL DEFAULT '{}',
    missing_setters text[] NOT NULL DEFAULT '{}',
    missing_logs text[] NOT NULL DEFAULT '{}',
    implementation_status text NOT NULL DEFAULT 'candidate_complete',
    next_action text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atlas_feature_profiles (
    feature_label text PRIMARY KEY,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atlas_dependency_edges (
    id serial PRIMARY KEY,
    source_card_id text NOT NULL REFERENCES public.atlas_profile_cards(card_id) ON DELETE CASCADE,
    target_card_id text NOT NULL,
    edge_type text DEFAULT 'depends_on' NOT NULL,
    weight double precision DEFAULT 1.0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atlas_hot_keyword_clusters (
    cluster_id text PRIMARY KEY,
    hot_keywords text[] NOT NULL DEFAULT '{}',
    feature_labels text[] NOT NULL DEFAULT '{}',
    top_source_refs text[] NOT NULL DEFAULT '{}',
    dependency_edges text[] NOT NULL DEFAULT '{}',
    recommended_cards text[] NOT NULL DEFAULT '{}',
    missing_implementation text[] NOT NULL DEFAULT '{}',
    next_action text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.atlas_retrieval_events (
    id serial PRIMARY KEY,
    query text NOT NULL,
    selected_cards text[] NOT NULL DEFAULT '{}',
    dropped_cards text[] NOT NULL DEFAULT '{}',
    source_refs text[] NOT NULL DEFAULT '{}',
    latency_ms double precision NOT NULL,
    fallback_reason text,
    missing_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_atlas_profile_cards_label ON public.atlas_profile_cards(feature_label);
CREATE INDEX IF NOT EXISTS idx_atlas_dependency_edges_source ON public.atlas_dependency_edges(source_card_id);
CREATE INDEX IF NOT EXISTS idx_atlas_retrieval_events_query ON public.atlas_retrieval_events(query);
