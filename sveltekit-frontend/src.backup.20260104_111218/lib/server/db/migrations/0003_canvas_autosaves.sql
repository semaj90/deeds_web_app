CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS canvas_autosaves (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id uuid NOT NULL REFERENCES canvas_states(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    embedding vector(384),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS canvas_autosaves_canvas_id_idx ON canvas_autosaves (canvas_id);
CREATE INDEX IF NOT EXISTS canvas_autosaves_canvas_created_idx ON canvas_autosaves (canvas_id, created_at);
CREATE INDEX IF NOT EXISTS canvas_autosaves_user_id_idx ON canvas_autosaves (user_id);
