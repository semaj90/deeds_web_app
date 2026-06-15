-- P1 Task 10: Update Canonical Packet Table
-- Link packets to tree nodes via tree_node_id
-- Created: June 15, 2026

-- Add tree_node_id column if not exists
ALTER TABLE atlas_codebase_packets
  ADD COLUMN IF NOT EXISTS tree_node_id UUID;

-- Add lineage_version if not exists
ALTER TABLE atlas_codebase_packets
  ADD COLUMN IF NOT EXISTS lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2';

-- Add foreign key constraint if not exists
ALTER TABLE atlas_codebase_packets
  ADD CONSTRAINT IF NOT EXISTS fk_packet_tree_node
  FOREIGN KEY (tree_node_id) REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_packet_tree_node ON atlas_codebase_packets(tree_node_id);

-- Backfill tree_node_id by matching packet_key
UPDATE atlas_codebase_packets p
SET tree_node_id = (
  SELECT node_id FROM atlas_tree_nodes t
  WHERE t.packet_key = p.packet_key
  LIMIT 1
)
WHERE tree_node_id IS NULL;

-- Verify: Check how many packets are now linked
SELECT COUNT(*) as total_packets,
       COUNT(tree_node_id) as linked_packets,
       ROUND(100.0 * COUNT(tree_node_id) / COUNT(*), 2) as linkage_pct
FROM atlas_codebase_packets;
