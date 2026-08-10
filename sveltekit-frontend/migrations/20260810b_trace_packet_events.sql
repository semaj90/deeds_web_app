BEGIN;

-- T2-lineage execution_utility source. Deliberately NOT a packet_key column
-- bolted onto trace_runs — one run touches many packets, so that would encode
-- a false 1:1 run<->packet relationship. This is the n-ary child relation
-- instead: many trace_packet_events rows per trace_runs row, many packets
-- per run.
CREATE TABLE IF NOT EXISTS trace_packet_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid REFERENCES trace_runs(id) ON DELETE CASCADE,
    packet_key text NOT NULL,
    event_type text NOT NULL,
    retrieval_rank integer,
    selected boolean NOT NULL DEFAULT false,
    evidence_used boolean NOT NULL DEFAULT false,
    compile_pass boolean,
    test_pass boolean,
    repair_success boolean,
    validation_pass boolean,
    latency_ms integer,
    token_cost integer,
    tool_cost integer,
    source_revision text,
    representation_revision text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trace_packet_events_packet_idx
    ON trace_packet_events (packet_key, created_at DESC);

CREATE INDEX IF NOT EXISTS trace_packet_events_run_idx
    ON trace_packet_events (run_id);

-- Packet-level aggregation target. Populated by a future rollup job once
-- trace_packet_events has real rows to aggregate — this table is the
-- persistence shape, not proof that any aggregation has run.
CREATE TABLE IF NOT EXISTS atlas_execution_utility (
    packet_key text PRIMARY KEY,
    execution_utility_raw double precision,
    execution_utility double precision,
    selected_rate double precision,
    targeted_test_success_rate double precision,
    repair_success_rate double precision,
    execution_validation_rate double precision,
    false_edit_penalty double precision,
    observed_events integer NOT NULL DEFAULT 0,
    normalization_revision text,
    producer_revision text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
