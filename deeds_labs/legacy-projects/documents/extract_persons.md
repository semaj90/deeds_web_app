# Extract Persons Command

Extract persons of interest from evidence analysis results.

## Usage
```
/extract_persons evidence_analysis_file
```

## Parameters
- `evidence_analysis_file`: Path to JSON file containing evidence analysis results

## What it does
Uses the Person Extractor Agent to:
1. Identify all mentioned persons in the evidence
2. Classify their roles (suspect, witness, victim, associate)
3. Extract available details (name, age, address, phone, etc.)
4. Map relationships between persons
5. Assign confidence scores to each extraction

## Example
```
/extract_persons ./temp/analysis_CASE-2024-001_20240728_143022/evidence_analysis.json
```

## Output JSON Structure
```json
{
  "persons": [
    {
      "name": "John Doe",
      "role": "suspect",
      "details": {
        "age": 35,
        "address": "123 Main St",
        "phone": "555-0123",
        "occupation": "Accountant"
      },
      "confidence": 0.95,
      "sourceContext": "Mentioned as primary suspect in robbery"
    }
  ],
  "relationships": [
    {
      "person1": "John Doe",
      "person2": "Jane Smith",
      "relationship": "works_with",
      "context": "Both employed at XYZ Corp",
      "confidence": 0.87
    }
  ]
}
```

Ideal for standalone person extraction when you already have evidence analysis.