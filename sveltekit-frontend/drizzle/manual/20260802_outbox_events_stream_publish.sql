-- Generic stream-publish tracking on outbox_events. Additive/nullable —
-- existing agent-run outbox rows are unaffected. Any outbox consumer (not
-- just acquisition) can now record which stream/entry it published to.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS stream_name text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS stream_entry_id text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_publish_error text;
