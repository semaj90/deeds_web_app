# Multi-Agent Claude System Usage Guide

## Overview

You now have a complete multi-agent Claude system integrated into your legal AI application. This system automatically processes evidence documents through four specialized AI agents to provide comprehensive case analysis.

## System Architecture

```
Evidence Upload → Evidence Analyzer → Person Extractor → Relationship Mapper → Case Synthesizer → Auto-populated UI
```

## Usage Methods

### 1. Claude Code Slash Commands

Use these commands directly in your Claude Code session:

```bash
# Analyze evidence document
/analyze CASE-2024-001 ./evidence/witness_statement.txt

# Extract persons from existing analysis
/extract_persons ./temp/analysis_CASE-2024-001_20240728/evidence_analysis.json
```

### 2. Shell Scripts (Direct)

**Windows:**
```cmd
scripts\analyze-evidence.bat CASE-2024-001 "C:\evidence\witness_statement.txt"
```

**Unix/Linux:**
```bash
./scripts/analyze-evidence.sh CASE-2024-001 ./evidence/witness_statement.txt
```

### 3. SvelteKit API Endpoints

**Trigger Analysis via API:**
```javascript
// POST /api/multi-agent/analyze
const response = await fetch('/api/multi-agent/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    caseId: 'CASE-2024-001',
    evidenceContent: 'Police Report: On July 15, 2024...',
    evidenceTitle: 'Police Report #2024-001',
    evidenceType: 'police_report'
  })
});

const result = await response.json();
console.log('Analysis Result:', result.analysis);
```

### 4. GraphQL Mutations

**Analyze Evidence:**
```graphql
mutation AnalyzeEvidence($caseId: String!, $content: String!, $title: String!) {
  analyzeEvidenceWithAgents(
    caseId: $caseId
    evidenceContent: $content
    evidenceTitle: $title
    evidenceType: "witness_statement"
  ) {
    id
    caseId
    personsData {
      name
      role
      confidence
      details
    }
    timelineEvents {
      date
      time
      event
      persons
      category
    }
    caseSynthesis
    confidence
    timestamp
  }
}
```

## SvelteKit Component Usage

### 1. Multi-Agent Analysis Card

```svelte
<script>
  import { MultiAgentAnalysisCard } from '$lib/components/ai/MultiAgentAnalysisCard.svelte';

  let analysisData = {
    caseId: 'CASE-2024-001',
    evidenceAnalysis: { /* from API */ },
    personsData: { /* from API */ },
    caseSynthesis: { /* from API */ },
    timestamp: '2024-07-28T14:30:00Z'
  };
</script>

<MultiAgentAnalysisCard {analysisData} />
```

### 2. Person of Interest Card

```svelte
<script>
  import { PersonOfInterestCard } from '$lib/components/ai/PersonOfInterestCard.svelte';

  let person = {
    name: 'John Doe',
    role: 'suspect',
    details: { age: 35, occupation: 'Accountant' },
    confidence: 0.85,
    sourceContext: 'Mentioned in witness statement'
  };

  let relationships = [
    {
      person1: 'John Doe',
      person2: 'Jane Smith',
      relationship: 'works_with',
      confidence: 0.90
    }
  ];
</script>

<PersonOfInterestCard {person} {relationships} />
```

### 3. Evidence Timeline Card

```svelte
<script>
  import { EvidenceTimelineCard } from '$lib/components/ai/EvidenceTimelineCard.svelte';

  let timelineEvents = [
    {
      date: '2024-07-15',
      time: '14:30',
      event: 'Suspect seen at location',
      persons: ['John Doe'],
      evidenceSource: 'Witness Statement #001',
      confidence: 0.95,
      category: 'witness'
    }
  ];
</script>

<EvidenceTimelineCard {timelineEvents} caseId="CASE-2024-001" />
```

## Example Workflow

### Complete Evidence Processing Pipeline

```javascript
// 1. Upload evidence and trigger analysis
async function processEvidence(caseId, evidenceFile) {
  // Read evidence content
  const evidenceContent = await readFileContent(evidenceFile);

  // Trigger multi-agent analysis
  const analysisResponse = await fetch('/api/multi-agent/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caseId,
      evidenceContent,
      evidenceTitle: evidenceFile.name,
      evidenceType: detectFileType(evidenceFile)
    })
  });

  const analysis = await analysisResponse.json();

  // 2. Auto-populate UI components
  updateAnalysisDisplay(analysis);
  updatePersonsOfInterest(analysis.personsData);
  updateTimeline(analysis.evidenceAnalysis.timelineEvents);

  // 3. Update case with findings
  await updateCaseWithFindings(caseId, analysis.caseSynthesis);

  return analysis;
}

// 4. Display results in prosecutor dashboard
function updateAnalysisDisplay(analysis) {
  const analysisCard = new MultiAgentAnalysisCard({
    target: document.getElementById('analysis-container'),
    props: { analysisData: analysis }
  });
}
```

## Agent Customization

### Modifying Agent Prompts

Edit agent templates in `.claude/agents/`:

```markdown
# .claude/agents/evidence-analyzer.md
You are an Evidence Analyzer Agent specialized in [YOUR DOMAIN].
Focus on [SPECIFIC REQUIREMENTS]...
```

### Adding New Agents

1. Create new agent prompt file:
```bash
.claude/agents/financial-analyzer.md
```

2. Update orchestration script:
```bash
# Add to analyze-evidence.sh
claude -f .claude/agents/financial-analyzer.md --input "$EVIDENCE_CONTENT" > "$TEMP_DIR/financial_analysis.json"
```

3. Update GraphQL schema with new types
4. Update SvelteKit components to display new data

## Production Deployment

### Environment Setup

```bash
# Required environment variables
ANTHROPIC_API_KEY=your_api_key
DATABASE_URL=postgresql://user:pass@localhost:5432/legal_ai
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

### Database Schema

Add multi-agent analysis table:

```sql
CREATE TABLE multi_agent_analyses (
  id SERIAL PRIMARY KEY,
  case_id VARCHAR(255) NOT NULL,
  evidence_title VARCHAR(255) NOT NULL,
  evidence_analysis JSONB,
  persons_data JSONB,
  case_synthesis JSONB,
  confidence FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
```

## Performance Considerations

- **Parallel Processing**: Agents run sequentially by design for data flow
- **Caching**: Store analysis results to avoid re-processing
- **Rate Limiting**: Implement Claude API rate limiting
- **Error Handling**: Robust error handling for agent failures
- **Monitoring**: Log agent performance and accuracy metrics

## Security Notes
- **Evidence Encryption**: Encrypt sensitive evidence files at rest
- **API Security**: Secure API endpoints with proper authentication
- **Audit Trail**: Log all multi-agent processing activities
- **Data Retention**: Implement evidence retention policies
- **Access Control**: Role-based access to analysis results

Your multi-agent Claude system is now fully operational and integrated with your legal AI application!