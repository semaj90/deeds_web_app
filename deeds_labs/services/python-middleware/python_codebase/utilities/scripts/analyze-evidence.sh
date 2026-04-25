#!/bin/bash

# Multi-Agent Evidence Analysis Pipeline
# Usage: ./scripts/analyze-evidence.sh <case_id> <evidence_file_path>

set -e

CASE_ID=$1
EVIDENCE_FILE=$2
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEMP_DIR="./temp/analysis_${CASE_ID}_${TIMESTAMP}"

# Validate inputs
if [ -z "$CASE_ID" ] || [ -z "$EVIDENCE_FILE" ]; then
    echo "Usage: $0 <case_id> <evidence_file_path>"
    exit 1
fi

if [ ! -f "$EVIDENCE_FILE" ]; then
    echo "Error: Evidence file not found: $EVIDENCE_FILE"
    exit 1
fi

# Create temp directory
mkdir -p "$TEMP_DIR"

echo "Starting multi-agent evidence analysis..."
echo "Case ID: $CASE_ID"
echo "Evidence: $EVIDENCE_FILE"
echo "Working directory: $TEMP_DIR"

# Step 1: Evidence Analyzer Agent
echo "=== Step 1: Analyzing Evidence ==="
EVIDENCE_CONTENT=$(cat "$EVIDENCE_FILE")
echo "Processing evidence document with Evidence Analyzer Agent..."

claude -f .claude/agents/evidence-analyzer.md --input "$EVIDENCE_CONTENT" > "$TEMP_DIR/evidence_analysis.json"

if [ $? -eq 0 ]; then
    echo "✓ Evidence analysis completed"
else
    echo "✗ Evidence analysis failed"
    exit 1
fi

# Step 2: Person Extractor Agent  
echo "=== Step 2: Extracting Persons of Interest ==="
EVIDENCE_SUMMARY=$(cat "$TEMP_DIR/evidence_analysis.json")
echo "Extracting persons and relationships..."

claude -f .claude/agents/person-extractor.md --input "$EVIDENCE_SUMMARY" > "$TEMP_DIR/persons_extracted.json"

if [ $? -eq 0 ]; then
    echo "✓ Person extraction completed"
else
    echo "✗ Person extraction failed"
    exit 1
fi

# Step 3: Relationship Mapper Agent
echo "=== Step 3: Mapping Relationships to Neo4j ==="
PERSONS_DATA=$(cat "$TEMP_DIR/persons_extracted.json")
echo "Updating Neo4j graph with persons and relationships..."

# Add case context to the input
MAPPER_INPUT=$(jq -n --arg caseId "$CASE_ID" --arg evidenceFile "$EVIDENCE_FILE" --argjson persons "$PERSONS_DATA" '{
    caseId: $caseId,
    evidenceFile: $evidenceFile,
    personsData: $persons
}')

echo "$MAPPER_INPUT" | claude -f .claude/agents/relationship-mapper.md > "$TEMP_DIR/neo4j_updates.json"

if [ $? -eq 0 ]; then
    echo "✓ Neo4j relationship mapping completed"
else
    echo "✗ Neo4j relationship mapping failed"
    exit 1
fi

# Step 4: Case Synthesizer Agent
echo "=== Step 4: Synthesizing Case Analysis ==="
echo "Generating prosecutorial analysis and recommendations..."

# Combine all previous outputs for synthesis
SYNTHESIS_INPUT=$(jq -n --arg caseId "$CASE_ID" \
    --argjson evidence "$(cat "$TEMP_DIR/evidence_analysis.json")" \
    --argjson persons "$(cat "$TEMP_DIR/persons_extracted.json")" \
    --argjson neo4j "$(cat "$TEMP_DIR/neo4j_updates.json")" '{
    caseId: $caseId,
    evidenceAnalysis: $evidence,
    personsData: $persons,
    neo4jUpdates: $neo4j
}')

echo "$SYNTHESIS_INPUT" | claude -f .claude/agents/case-synthesizer.md > "$TEMP_DIR/case_synthesis.json"

if [ $? -eq 0 ]; then
    echo "✓ Case synthesis completed"
else
    echo "✗ Case synthesis failed"
    exit 1
fi

# Step 5: Execute Neo4j Updates (if valid)
echo "=== Step 5: Executing Database Updates ==="
NEO4J_QUERIES=$(jq -r '.cypherQueries[]' "$TEMP_DIR/neo4j_updates.json")

if [ ! -z "$NEO4J_QUERIES" ]; then
    echo "Executing Cypher queries..."
    # Note: Replace with actual Neo4j execution
    echo "$NEO4J_QUERIES" > "$TEMP_DIR/cypher_queries.cypher"
    echo "✓ Cypher queries saved for execution"
else
    echo "! No Neo4j updates required"
fi

# Step 6: Update GraphQL with Results
echo "=== Step 6: Updating Case via GraphQL ==="
CASE_UPDATE_MUTATION=$(jq -r --arg caseId "$CASE_ID" '.keyFindings[] | "mutation { updateCase(id: \"" + $caseId + "\", findings: [\"" + . + "\"]) { id success } }"' "$TEMP_DIR/case_synthesis.json")

echo "$CASE_UPDATE_MUTATION" > "$TEMP_DIR/graphql_updates.gql"
echo "✓ GraphQL mutations prepared"

# Final Summary
echo ""
echo "=== Analysis Complete ==="
echo "✓ Evidence analyzed and structured"
echo "✓ $(jq '.persons | length' "$TEMP_DIR/persons_extracted.json") persons of interest identified"
echo "✓ $(jq '.cypherQueries | length' "$TEMP_DIR/neo4j_updates.json") Neo4j updates prepared"
echo "✓ Case synthesis and recommendations generated"
echo ""
echo "Output files:"
echo "  - Evidence Analysis: $TEMP_DIR/evidence_analysis.json"
echo "  - Persons Extracted: $TEMP_DIR/persons_extracted.json" 
echo "  - Neo4j Updates: $TEMP_DIR/neo4j_updates.json"
echo "  - Case Synthesis: $TEMP_DIR/case_synthesis.json"
echo ""
echo "Case Strength: $(jq -r '.caseStrength' "$TEMP_DIR/case_synthesis.json")"
echo "Next Steps: $(jq -r '.nextSteps[]' "$TEMP_DIR/case_synthesis.json" | head -3 | paste -sd, -)"
echo ""
echo "Multi-agent analysis pipeline completed successfully!"