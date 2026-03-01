#!/bin/bash
# Extract legal patterns from codebase for Unsloth training dataset
# Searches: evidence types, legal keywords, case patterns, entity extraction logic

OUTPUT_DIR="./training-datasets"
mkdir -p "$OUTPUT_DIR"

echo "Extracting legal domain patterns from codebase..."

# 1. Evidence type patterns and MIME mappings
echo "=== Evidence Type Patterns ===" > "$OUTPUT_DIR/evidence-patterns.jsonl"
rg -A 3 -B 3 "evidenceType|evidence_type|MIME" \
  --glob "*.ts" \
  --glob "*.svelte" \
  src/lib/server/ocr/ \
  src/routes/api/evidence/ \
  | awk 'BEGIN {RS="--"; ORS=""} {
    gsub(/\n/, " ");
    if (length($0) > 50) print "{\"text\": \"" $0 "\"}\n"
  }' >> "$OUTPUT_DIR/evidence-patterns.jsonl"

# 2. Legal keyword classifications (testimonial, forensic, etc.)
echo "=== Legal Classification Keywords ===" > "$OUTPUT_DIR/legal-keywords.jsonl"
rg -i "sworn|witness|oath|testimony|forensic|DNA|fingerprint|expert|admissibility" \
  --glob "*.ts" \
  src/lib/server/ \
  | awk -F: '{print "{\"text\": \"" $2 "\"}" }' \
  >> "$OUTPUT_DIR/legal-keywords.jsonl"

# 3. Entity extraction patterns (EMAIL, PHONE, CITATION, STATUTE)
echo "=== Entity Extraction Patterns ===" > "$OUTPUT_DIR/entity-patterns.jsonl"
rg -A 5 "EMAIL|PHONE|CITATION|STATUTE|DATE|MONEY" \
  --glob "entity-extraction.ts" \
  src/lib/server/analysis/ \
  | sed 's/\\/\\\\/g; s/"/\\"/g' \
  | awk 'BEGIN {RS="--"} {gsub(/\n/, " "); print "{\"text\": \"" $0 "\"}"}' \
  >> "$OUTPUT_DIR/entity-patterns.jsonl"

# 4. Forensic pattern detection logic
echo "=== Forensic Patterns ===" > "$OUTPUT_DIR/forensic-patterns.jsonl"
rg -A 3 "forensic|SSN|creditCard|contactDensity" \
  --glob "forensics.ts" \
  src/lib/server/analysis/ \
  | sed 's/\\/\\\\/g; s/"/\\"/g' \
  | awk 'BEGIN {RS="--"} {gsub(/\n/, " "); print "{\"text\": \"" $0 "\"}"}' \
  >> "$OUTPUT_DIR/forensic-patterns.jsonl"

# 5. RAG context assembly patterns (ACE context)
echo "=== RAG Context Patterns ===" > "$OUTPUT_DIR/rag-context.jsonl"
rg -A 10 "assembleACEContext|evidenceMetadata|caseContext" \
  --glob "*.ts" \
  src/lib/server/ace/ \
  | sed 's/\\/\\\\/g; s/"/\\"/g' \
  | awk 'BEGIN {RS="--"} {gsub(/\n/, " "); if (length($0) > 100) print "{\"text\": \"" $0 "\"}"}' \
  >> "$OUTPUT_DIR/rag-context.jsonl"

# 6. Svelte 5 component patterns (for LSP training)
echo "=== Svelte 5 Patterns ===" > "$OUTPUT_DIR/svelte5-patterns.jsonl"
rg '\$state|\$derived|\$effect|\$props' \
  --glob "*.svelte" \
  src/lib/components/ \
  src/routes/ \
  | head -500 \
  | sed 's/\\/\\\\/g; s/"/\\"/g' \
  | awk -F: '{print "{\"file\": \"" $1 "\", \"text\": \"" $2 "\"}"}' \
  >> "$OUTPUT_DIR/svelte5-patterns.jsonl"

# 7. Legal database schema (for understanding evidence structure)
echo "=== Database Schema ===" > "$OUTPUT_DIR/schema-patterns.jsonl"
rg "evidenceTypeEnum|caseStatusEnum|forensic|entity" \
  --glob "schema-postgres.ts" \
  src/lib/server/db/ \
  | sed 's/\\/\\\\/g; s/"/\\"/g' \
  | awk -F: '{print "{\"text\": \"" $2 "\"}"}' \
  >> "$OUTPUT_DIR/schema-patterns.jsonl"

echo ""
echo "Dataset extraction complete! Files in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"
echo ""
echo "Total lines extracted:"
wc -l "$OUTPUT_DIR"/*.jsonl
