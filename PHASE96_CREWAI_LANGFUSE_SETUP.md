# 🚀 Phase 96: CrewAI + Langfuse + Gemma3 Integration

## 📋 Overview

Replace deprecated AutoGen with **CrewAI** + **Langfuse** (free LangSmith alternative) + your existing **gemma3-legal:latest** model.

**Cost**: **$0/month** (all self-hosted)

---

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│                  (AIDropdown.svelte, etc.)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     CrewAI Agents                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Legal     │  │  Document   │  │    Case     │         │
│  │ Researcher  │  │  Analyzer   │  │   Manager   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                  │
│         └────────────────┴────────────────┘                  │
│                         │                                     │
└─────────────────────────┼─────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │   Langfuse Observability       │
         │   (Traces, Metrics, Costs)     │
         │   http://localhost:3030        │
         └────────────────┬───────────────┘
                          │
         ┌────────────────┴───────────────┐
         │                                │
         ▼                                ▼
┌─────────────────┐            ┌─────────────────┐
│ Ollama (Gemma3) │            │ Your Existing   │
│ gemma3-legal    │            │ Infrastructure  │
│ (Local LLM)     │            │ (Postgres, etc.)│
└─────────────────┘            └─────────────────┘
```

---

## 🛠️ Step 1: Install Langfuse

### Start Langfuse (FREE alternative to LangSmith)

```powershell
# Start Langfuse
docker-compose -f docker/langfuse.yml up -d

# Check status
docker ps | Select-String langfuse

# View logs
docker logs -f langfuse-server
```

**Access UI**: http://localhost:3030

1. Create account (first visit)
2. Go to **Settings** → **API Keys**
3. Create new API key
4. Copy `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`

### Add to `.env.phase14` (or your active env)

```bash
# Langfuse Observability (FREE self-hosted)
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key-here
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key-here
LANGFUSE_HOST=http://localhost:3030
```

---

## 🐍 Step 2: Install CrewAI

```powershell
# Activate your venv (you already did this)
& C:\Users\james\Videos\deeds-web-app\.venv\Scripts\Activate.ps1

# Install CrewAI with all tools
pip install 'crewai[tools]'

# Install Langfuse integration
pip install langfuse

# Verify installation
python -c "import crewai; print(f'CrewAI v{crewai.__version__}')"
```

**Expected Output**: `CrewAI v1.8.0` (or newer)

---

## 🤖 Step 3: Configure Ollama Integration

You already have `gemma3-legal:latest` running. Let's verify:

```powershell
# Check Ollama is running
docker ps | Select-String ollama

# List models
docker exec ollama ollama list
```

**Expected**: You should see `gemma3-legal:latest`

### Create CrewAI Config for Ollama

```python
# sveltekit-frontend/scripts/crewai-config.py
from crewai import Agent, Crew, Task, Process
from langchain_ollama import ChatOllama
from langfuse import Langfuse
import os

# Langfuse client (for observability)
langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST", "http://localhost:3030")
)

# Ollama LLM (using your existing gemma3-legal)
llm = ChatOllama(
    model="gemma3-legal:latest",
    base_url="http://localhost:11434",  # Ollama API
    temperature=0.3,
    num_predict=2048,
)

# Example: Legal Research Agent
legal_researcher = Agent(
    role="Senior Legal Researcher",
    goal="Find relevant case law, statutes, and legal precedents",
    backstory="""You are an expert legal researcher with 20+ years experience.
    You excel at finding relevant case law and statutes, understanding legal context,
    and identifying key precedents for legal arguments.""",
    llm=llm,
    verbose=True,
    allow_delegation=False,
)

# Example: Document Analyzer Agent
document_analyzer = Agent(
    role="Legal Document Analyst",
    goal="Extract key information from legal documents",
    backstory="""You are a meticulous document analyst specializing in legal filings.
    You identify critical facts, dates, parties, and legal issues in documents.""",
    llm=llm,
    verbose=True,
    allow_delegation=False,
)

# Example: Case Manager Agent
case_manager = Agent(
    role="Case Management Specialist",
    goal="Organize and track legal cases efficiently",
    backstory="""You are an experienced case manager who ensures all case details
    are properly documented, deadlines are tracked, and workflows are optimized.""",
    llm=llm,
    verbose=True,
    allow_delegation=True,  # Can delegate to other agents
)

def create_legal_research_crew(case_details: str):
    """Create a crew for legal research tasks"""

    # Define task
    research_task = Task(
        description=f"""
        Research legal precedents and case law relevant to:
        {case_details}

        Provide:
        1. Relevant case citations
        2. Key legal principles
        3. Applicable statutes
        4. Strength of legal arguments
        """,
        expected_output="Detailed legal research report with citations",
        agent=legal_researcher,
    )

    # Create crew
    crew = Crew(
        agents=[legal_researcher],
        tasks=[research_task],
        process=Process.sequential,
        verbose=True,
    )

    # Execute with Langfuse tracking
    trace = langfuse.trace(name="legal-research-crew")
    result = crew.kickoff()
    trace.update(output=str(result))

    return result

# Example usage
if __name__ == "__main__":
    result = create_legal_research_crew(
        "Employment discrimination case involving wrongful termination"
    )
    print(result)
```

---

## 🔗 Step 4: Integrate with SvelteKit

### Option A: Add SvelteKit API Route

```typescript
// src/routes/api/crewai/research/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { caseDetails } = await request.json();

    // Call Python CrewAI script
    const { stdout, stderr } = await execAsync(
      `python scripts/crewai-config.py --case "${caseDetails}"`,
      { cwd: process.cwd() }
    );

    if (stderr) console.error('CrewAI stderr:', stderr);

    return json({
      success: true,
      result: stdout,
      trace_url: 'http://localhost:3030' // Langfuse UI
    });
  } catch (error) {
    console.error('CrewAI error:', error);
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
```

### Option B: Use FastMCP (Your Existing System)

```javascript
// scripts/phase96-crewai-mcp-tool.mjs
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const crewaiTools = {
  'crewai:legal-research': async (args) => {
    const { caseDetails } = args;

    const { stdout } = await execAsync(
      `python scripts/crewai-config.py --case "${caseDetails}"`,
      { cwd: process.cwd() }
    );

    return {
      success: true,
      result: stdout,
      langfuse_trace: 'http://localhost:3030',
    };
  },
};
```

---

## 🎨 Step 5: Update AIDropdown.svelte

Fix the `$props()` syntax issue (Svelte 5 compatibility):

```svelte
<script lang="ts">
  interface Props {
    disabled?: boolean;
    onReportGenerate?: (reportType: string) => void;
    onSummarize?: () => void;
    onAnalyze?: () => void;
    hasContent?: boolean;
    isGenerating?: boolean;
  }

  // FIX: Use destructuring assignment
  let props = $props<Props>();

  let disabled = $derived(props.disabled ?? false);
  let onReportGenerate = $derived(props.onReportGenerate ?? (() => {}));
  let onSummarize = $derived(props.onSummarize ?? (() => {}));
  let onAnalyze = $derived(props.onAnalyze ?? (() => {}));
  let hasContent = $derived(props.hasContent ?? false);
  let isGenerating = $derived(props.isGenerating ?? false);
</script>
```

---

## 📊 Step 6: Monitor with Langfuse

After running CrewAI tasks:

1. Open **http://localhost:3030**
2. View **Traces** tab
3. See:
   - LLM calls (to gemma3-legal)
   - Agent interactions
   - Token usage
   - Response times
   - Cost tracking (if using paid APIs)

**Example Trace**:
```
legal-research-crew
├── Agent: Legal Researcher
│   ├── LLM Call: gemma3-legal (342 tokens)
│   ├── Tool: search_case_law
│   └── Output: 3 relevant cases found
└── Total Duration: 4.2s
```

---

## 🐳 Docker Commands Cheatsheet

### Langfuse

```powershell
# Start Langfuse
docker-compose -f docker/langfuse.yml up -d

# Stop Langfuse
docker-compose -f docker/langfuse.yml down

# View logs
docker logs -f langfuse-server

# Restart
docker-compose -f docker/langfuse.yml restart

# Remove all data (CAUTION!)
docker-compose -f docker/langfuse.yml down -v
```

### Ollama (already running)

```powershell
# Check status
docker ps | Select-String ollama

# View logs
docker logs -f ollama

# Test model
docker exec ollama ollama run gemma3-legal:latest "What is tort law?"

# List models
docker exec ollama ollama list
```

---

## 💡 Why This Stack?

| Component | Cost | Purpose | Alternative |
|-----------|------|---------|-------------|
| **CrewAI** | $0 | Multi-agent orchestration | AutoGen (deprecated), LangGraph ($39/mo) |
| **Langfuse** | $0 | Observability/tracing | LangSmith ($39-$390/mo), Weights & Biases |
| **Ollama (gemma3)** | $0 | Local LLM inference | OpenAI API ($100-$500/mo) |
| **Total** | **$0/month** | Full agentic stack | $500+/month with cloud services |

---

## 🚀 Quick Start Commands

```powershell
# 1. Start Langfuse
docker-compose -f docker/langfuse.yml up -d

# 2. Get API keys from http://localhost:3030
# (Add to .env.phase14)

# 3. Install CrewAI
pip install 'crewai[tools]' langfuse

# 4. Test integration
python scripts/crewai-config.py

# 5. View traces
# Open http://localhost:3030
```

---

## 📚 Resources

- **CrewAI Docs**: https://docs.crewai.com
- **Langfuse Docs**: https://langfuse.com/docs
- **Ollama Docs**: https://ollama.com/docs
- **Your Cost Comparison**: `AGENTIC_FRAMEWORK_COST_COMPARISON.md`

---

## 🎯 Next Steps (Phase 96 Roadmap)

- [x] Set up Langfuse (FREE observability)
- [x] Install CrewAI
- [x] Configure Ollama integration
- [ ] Create legal research crew
- [ ] Add document analysis crew
- [ ] Integrate with AIDropdown.svelte
- [ ] Migrate /evidence to SSR + form actions
- [ ] Add SSE for real-time notifications

**Ready to start?** Run the Langfuse setup and I'll help you create your first CrewAI legal research agent! 🚀
