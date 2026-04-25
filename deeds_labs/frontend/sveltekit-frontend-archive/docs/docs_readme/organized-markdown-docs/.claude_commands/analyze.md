# Analyze Evidence Command

Run the multi-agent evidence analysis pipeline on a document.

## Usage
```
/analyze case_id evidence_file
```

## Parameters
- `case_id`: The ID of the case this evidence belongs to
- `evidence_file`: Path to the evidence document to analyze

## What it does
1. **Evidence Analyzer**: Structures the document into key facts, timeline, evidence items
2. **Person Extractor**: Identifies all persons of interest and their relationships  
3. **Relationship Mapper**: Updates Neo4j graph with persons and connections
4. **Case Synthesizer**: Provides prosecutorial analysis and next steps

## Example
```
/analyze CASE-2024-001 ./evidence/witness_statement_01.txt
```

## Output
- Structured evidence analysis (JSON)
- Persons of interest with roles and details
- Neo4j graph updates
- Case strength assessment and recommendations
- Auto-populated SvelteKit components with new data

## Files Created
- `temp/analysis_[case_id]_[timestamp]/evidence_analysis.json`
- `temp/analysis_[case_id]_[timestamp]/persons_extracted.json`
- `temp/analysis_[case_id]_[timestamp]/neo4j_updates.json`
- `temp/analysis_[case_id]_[timestamp]/case_synthesis.json`

This command automates the entire evidence-to-insights pipeline for prosecutors.