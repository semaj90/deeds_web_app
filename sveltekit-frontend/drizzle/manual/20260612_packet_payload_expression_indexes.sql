CREATE INDEX IF NOT EXISTS idx_packet_payload_path ON atlas_packets (((payload->>'path')));
CREATE INDEX IF NOT EXISTS idx_packet_payload_feature ON atlas_packets (((payload->>'feature_id')));
