-- Phase 80 Tool Traces table and indexes

CREATE TABLE IF NOT EXISTS tool_traces (
  id varchar(255) PRIMARY KEY,
  message_id varchar(255) REFERENCES chat_messages(id) ON DELETE CASCADE,
  tool_name varchar(255) NOT NULL,
  args text,
  result_summary text,
  duration_ms integer,
  status varchar(32) NOT NULL DEFAULT 'ok',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS tool_traces
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'ok';

ALTER TABLE IF EXISTS tool_traces
  ADD COLUMN IF NOT EXISTS error text;

CREATE INDEX IF NOT EXISTS idx_tool_traces_message_id ON tool_traces(message_id);
CREATE INDEX IF NOT EXISTS idx_tool_traces_tool_name ON tool_traces(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_traces_created_at ON tool_traces(created_at);
