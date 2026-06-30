#!/bin/bash
# Simple Colab export — minimal dependencies

cd "$(dirname "$0")/../.."

TARGET_DIR="colab-export"
mkdir -p "$TARGET_DIR/packets"

echo "Exporting packets to $TARGET_DIR..."

# Dump packets without summaries as JSONL (one packet per line)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
COPY (
  SELECT
    json_build_object(
      'packet_key', packet_key,
      'source_ref', source_ref,
      'file_path', file_path,
      'feature_id', feature_id,
      'feature_label', feature_label,
      'payload', payload,
      'summary', summary,
      'needs_summary', summary IS NULL
    ) as packet
  FROM atlas_packets
  WHERE summary IS NULL
  LIMIT 999999
) TO STDOUT
" > "$TARGET_DIR/packets.jsonl"

echo "✓ Exported to $TARGET_DIR/packets.jsonl"
wc -l "$TARGET_DIR/packets.jsonl"

# Create config
cat > "$TARGET_DIR/config.json" << 'CONFIG'
{
  "export_timestamp": "2026-06-30T15:45:00Z",
  "total_packets": 53570,
  "model": "gemma4",
  "instructions": {
    "step_1": "Upload packets.jsonl to Google Drive or Colab",
    "step_2": "Run: python colab-summarize.py",
    "step_3": "Download summaries.jsonl back to local machine",
    "step_4": "Run: npm run colab:import:summaries"
  }
}
CONFIG

echo "✓ Created $TARGET_DIR/config.json"
echo ""
echo "Next steps:"
echo "  1. cd $TARGET_DIR"
echo "  2. Upload packets.jsonl + colab-summarize.py to Google Colab"
echo "  3. In Colab: python colab-summarize.py"
echo "  4. Download summaries.jsonl"
echo "  5. npm run colab:import:summaries"
