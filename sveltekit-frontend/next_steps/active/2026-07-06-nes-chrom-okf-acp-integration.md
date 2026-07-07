# NES-CHROM → OKF Decompilation (ACP/A2A/LangGraph Integration)
**Status**: DESIGN_READY + Existing Infrastructure Aligned  
**Date**: 2026-07-06  
**Integration**: SearXNG web search + Pydantic validation + LangGraph + NetworkX + gRPC

---

## Executive Summary

**Goal**: Convert NES-CHROM packets (cuDNN-reranked) → OKF YAML format, with optional web context + graph analysis.

**Bridge Architecture**:
```
NES-CHROM packets (Postgres/Redis)
  ↓ [Normalize via Pydantic]
OKF canonical envelope (validated schema)
  ↓ [Optional: SearXNG web context]
OKF + citations (YAML)
  ↓ [Optional: NetworkX topology expansion]
OKF + graph metrics (YAML)
  ↓ [Persist to S3/SeaweedFS]
yq-queryable files
  ↓ [A2A/MCP discovery]
Agents invoke via `/api/acp/okf-export`
```

---

## Part 1: OKF Canonical Schema (Pydantic)

```python
# python/okf_schema.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime

class OKFIdentity(BaseModel):
    """Immutable packet identity"""
    packet_key: str = Field(..., description="Canonical packet ID")
    source_ref: str = Field(..., description="File path or module")
    feature_id: str = Field(..., description="Semantic feature class")
    feature_label: str = Field(..., description="Human-readable label")

class OKFSemantics(BaseModel):
    """Content + NLP analysis"""
    summary: Optional[str] = None
    keywords: List[str] = []
    entities: List[str] = []  # Named entities extracted by LangExtract
    ace_tags: List[str] = []

class OKFTopology(BaseModel):
    """Graph structure"""
    community_id: Optional[str] = None
    som_cluster: Optional[int] = None
    domain_class: str = "other"  # auth, db, ui, search, cache
    kag_nodes: List[str] = []
    dag_edges: List[Dict[str, str]] = []  # [{"from": "X", "to": "Y", "relation": "USES"}]

class OKFProvenance(BaseModel):
    """Source tracking"""
    source: str  # "nes-chrom-generator" | "cunn-reranker"
    worker: Optional[str] = None
    generated_at: datetime
    rerank_score: Optional[float] = None

class OKFStatus(BaseModel):
    """Runtime state"""
    indexed_qdrant: bool = False
    cached_redis: bool = False
    cached_at: Optional[datetime] = None
    graph_metrics: Optional[Dict[str, float]] = None  # pagerank, centrality, etc.
    web_search_citations: List[Dict[str, str]] = []  # [{"title": "...", "url": "...", "snippet": "..."}]
    reasoning_summary: Optional[str] = None

class OKFRelation(BaseModel):
    """Graph edge"""
    kind: str  # "Feature", "Cluster", "Module"
    name: str
    relation: str  # IMPLEMENTS, USES, MEMBER_OF, DEPENDS_ON

class OKFEnvelope(BaseModel):
    """Complete normalized packet"""
    kind: str = "Feature"
    api_version: str = "okf.deeds/v1"
    
    # Metadata section
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Spec section
    identity: OKFIdentity
    semantic: OKFSemantics = Field(default_factory=OKFSemantics)
    topology: OKFTopology = Field(default_factory=OKFTopology)
    
    # Status section
    provenance: OKFProvenance
    status: OKFStatus = Field(default_factory=OKFStatus)
    relations: List[OKFRelation] = []
    
    @validator('topology')
    def validate_domain_class(cls, v):
        allowed = {'auth', 'db', 'ui', 'search', 'cache', 'test', 'other'}
        if v.domain_class not in allowed:
            v.domain_class = 'other'
        return v
    
    @validator('status')
    def validate_scores(cls, v):
        if v.graph_metrics:
            for key, val in v.graph_metrics.items():
                if not 0.0 <= val <= 1.0:
                    raise ValueError(f"{key} must be 0.0-1.0, got {val}")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "kind": "Feature",
                "api_version": "okf.deeds/v1",
                "identity": {
                    "packet_key": "ace:packet:auth:001",
                    "source_ref": "src/lib/server/auth.ts",
                    "feature_id": "auth.sessions",
                    "feature_label": "Authentication Sessions"
                },
                "provenance": {
                    "source": "nes-chrom-generator",
                    "generated_at": "2026-07-06T12:00:00Z"
                }
            }
        }
```

---

## Part 2: NES-CHROM → OKF Normalization (FastAPI Service)

```python
# python/okf_normalizer.py
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
import asyncio
import httpx
import logging
from datetime import datetime
from typing import Optional
import asyncpg

from okf_schema import OKFEnvelope, OKFIdentity, OKFSemantics, OKFTopology, OKFProvenance, OKFStatus, OKFRelation

logger = logging.getLogger(__name__)
app = FastAPI(title="OKF Normalizer")

POSTGRES_URL = os.environ.get('DATABASE_URL', 'postgresql://...')
GEMMA4_URL = os.environ.get('LLAMA_URL', 'http://127.0.0.1:8090')
SEARXNG_URL = os.environ.get('SEARXNG_URL', 'http://127.0.0.1:8888')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379')

# Connection pools
pg_pool: Optional[asyncpg.Pool] = None
http_client: Optional[httpx.AsyncClient] = None

@app.on_event("startup")
async def startup():
    global pg_pool, http_client
    pg_pool = await asyncpg.create_pool(POSTGRES_URL)
    http_client = httpx.AsyncClient(timeout=30.0)

@app.on_event("shutdown")
async def shutdown():
    await pg_pool.close()
    await http_client.aclose()

async def fetch_nes_chrom_packet(packet_key: str) -> dict:
    """Read NES-CHROM from Postgres nes_chrom_packets"""
    row = await pg_pool.fetchrow(
        '''SELECT packet_key, source_ref, feature_id, packet_type, lane, model, summary, payload, 
                  created_at, updated_at
           FROM nes_chrom_packets WHERE packet_key = $1''',
        packet_key
    )
    if not row:
        raise ValueError(f"Packet not found: {packet_key}")
    return dict(row)

async def fetch_web_context(query: str, limit: int = 3) -> list[dict]:
    """Fetch web search results via SearXNG"""
    try:
        url = f"{SEARXNG_URL}/search"
        params = {
            "q": query,
            "format": "json",
            "categories": "general",
            "language": "en"
        }
        resp = await http_client.get(url, params=params, timeout=10)
        resp.raise_for_status()
        
        data = resp.json()
        results = []
        for r in data.get("results", [])[:limit]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
                "engine": r.get("engine", "searxng")
            })
        return results
    except Exception as e:
        logger.warning(f"Web search failed for '{query}': {e}")
        return []

async def normalize_nes_to_okf(nes_packet: dict) -> OKFEnvelope:
    """Transform NES-CHROM dict → OKF canonical shape with Pydantic validation"""
    payload = nes_packet.get("payload", {}) or {}
    
    # Extract / validate required fields
    packet_key = nes_packet.get("packet_key")
    source_ref = nes_packet.get("source_ref") or payload.get("source_ref")
    feature_id = nes_packet.get("feature_id") or payload.get("feature_id")
    
    if not all([packet_key, source_ref, feature_id]):
        raise ValueError(f"Missing identity fields: {packet_key}, {source_ref}, {feature_id}")
    
    # Build OKFEnvelope (Pydantic validates during construction)
    try:
        okf = OKFEnvelope(
            identity=OKFIdentity(
                packet_key=packet_key,
                source_ref=source_ref,
                feature_id=feature_id,
                feature_label=payload.get("feature_label", feature_id)
            ),
            semantic=OKFSemantics(
                summary=nes_packet.get("summary"),
                keywords=payload.get("keywords", []),
                entities=payload.get("entities", []),
                ace_tags=payload.get("ace_tags", [])
            ),
            topology=OKFTopology(
                community_id=payload.get("community_id"),
                som_cluster=payload.get("som_cluster"),
                domain_class=payload.get("domain_class", "other"),
                kag_nodes=payload.get("kag_nodes", []),
                dag_edges=payload.get("dag_edges", [])
            ),
            provenance=OKFProvenance(
                source=nes_packet.get("model", "nes-chrom-generator"),
                generated_at=nes_packet.get("updated_at", datetime.utcnow()),
                rerank_score=payload.get("rerank_score")
            ),
            metadata={
                "namespace": payload.get("namespace", "default"),
                "labels": payload.get("labels", [])
            }
        )
        return okf
    except ValidationError as e:
        raise ValueError(f"OKF validation failed: {e}")

@app.post("/normalize")
async def normalize_endpoint(packet_key: str, web_search: bool = False):
    """Normalize single NES-CHROM packet to OKF"""
    try:
        nes = await fetch_nes_chrom_packet(packet_key)
        okf = await normalize_nes_to_okf(nes)
        
        # Optional: web search
        if web_search:
            citations = await fetch_web_context(okf.identity.feature_label, limit=3)
            okf.status.web_search_citations = citations
        
        return okf.dict()
    except Exception as e:
        logger.error(f"Normalization failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/batch-normalize")
async def batch_normalize(packet_keys: list[str], web_search: bool = False):
    """Normalize batch of packets (concurrent)"""
    tasks = [normalize_endpoint(pk, web_search) for pk in packet_keys]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return {
        "total": len(packet_keys),
        "succeeded": sum(1 for r in results if not isinstance(r, Exception)),
        "failed": sum(1 for r in results if isinstance(r, Exception)),
        "results": [r if not isinstance(r, Exception) else {"error": str(r)} for r in results]
    }
```

---

## Part 3: NetworkX Topology + Graph Metrics

```python
# python/okf_graph_analysis.py
import networkx as nx
from typing import Dict, List, Tuple
import asyncpg

async def expand_topology(
    okf_envelope: OKFEnvelope,
    pg_pool: asyncpg.Pool,
    kag_depth: int = 2
) -> OKFEnvelope:
    """Expand OKF with Neo4j topology + NetworkX metrics"""
    
    # Build DiGraph from Neo4j KAG
    G = nx.DiGraph()
    
    # Query Neo4j for k-hop neighbors
    cypher = '''
    MATCH (f:Feature {feature_id: $feature_id})
    MATCH path = (f)-[r:*1..{kag_depth}]-(neighbor)
    RETURN f.feature_id as source, neighbor.feature_id as target, type(r) as relation
    '''
    
    rows = await pg_pool.fetch(
        "SELECT ...FROM neo4j_cache WHERE source = $1",  # Simplified
        okf_envelope.identity.feature_id
    )
    
    for row in rows:
        G.add_edge(row['source'], row['target'], relation=row.get('relation', 'UNKNOWN'))
    
    # Compute metrics
    metrics = {}
    if G.nodes():
        metrics['pagerank'] = dict(nx.pagerank(G))
        metrics['centrality'] = dict(nx.betweenness_centrality(G))
        metrics['clustering'] = dict(nx.clustering(G.to_undirected()))
    
    # Inject into OKF
    okf_envelope.status.graph_metrics = {
        "pagerank": float(metrics.get('pagerank', {}).get(okf_envelope.identity.feature_id, 0)),
        "centrality": float(metrics.get('centrality', {}).get(okf_envelope.identity.feature_id, 0)),
        "clustering": float(metrics.get('clustering', {}).get(okf_envelope.identity.feature_id, 0))
    }
    
    return okf_envelope
```

---

## Part 4: LangGraph Worker (Docker Container)

```python
# docker/langgraph-synthesis/graph.py
from langgraph.graph import StateGraph, END
from typing import TypedDict
import json
import yaml

class OKFState(TypedDict):
    packet_key: str
    okf_envelope: dict | None
    web_search: bool
    deep_reasoning: bool
    final_yaml: str | None

def create_okf_pipeline():
    graph = StateGraph(OKFState)
    
    def step_normalize(state: OKFState):
        """Normalize NES-CHROM → OKF (call normalizer service)"""
        # POST to http://okf-normalizer:8000/normalize
        return {"okf_envelope": {...}}
    
    def step_web_search(state: OKFState):
        """Optional: fetch web context"""
        if not state.get("web_search"):
            return state
        # Call /api/websearch
        return {"citations": [...]}
    
    def step_graph_analysis(state: OKFState):
        """Optional: NetworkX metrics"""
        # Compute topology
        return {"metrics": {...}}
    
    def step_serialize_yaml(state: OKFState):
        """Convert to YAML string"""
        if state["okf_envelope"]:
            yaml_str = yaml.dump(state["okf_envelope"], default_flow_style=False)
            return {"final_yaml": yaml_str}
        return state
    
    graph.add_node("normalize", step_normalize)
    graph.add_node("web_search", step_web_search)
    graph.add_node("graph_analysis", step_graph_analysis)
    graph.add_node("serialize", step_serialize_yaml)
    
    graph.add_edge("normalize", "web_search")
    graph.add_edge("web_search", "graph_analysis")
    graph.add_edge("graph_analysis", "serialize")
    graph.add_edge("serialize", END)
    
    return graph.compile()

okf_pipeline = create_okf_pipeline()
```

---

## Part 5: SvelteKit API Route (A2A/MCP Integration)

```typescript
// src/routes/api/acp/okf-export/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const exportSchema = z.object({
  packet_keys: z.array(z.string()),
  web_search: z.boolean().default(false),
  deep_reasoning: z.boolean().default(false),
  kag_depth: z.number().int().min(1).max(3).default(2)
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  
  const parsed = exportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  
  const { packet_keys, web_search, deep_reasoning, kag_depth } = parsed.data;
  
  try {
    // Call LangGraph worker via HTTP
    const langgraph_url = process.env.LANGGRAPH_URL || 'http://127.0.0.1:8788';
    
    const responses = await Promise.all(
      packet_keys.map(pk =>
        fetch(`${langgraph_url}/invoke/okf_pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: {
              packet_key: pk,
              web_search,
              deep_reasoning,
              kag_depth
            }
          })
        }).then(r => r.json())
      )
    );
    
    return json({
      ok: true,
      processed: packet_keys.length,
      results: responses.map((r, i) => ({
        packet_key: packet_keys[i],
        okf_yaml: r.output?.final_yaml,
        web_citations: r.output?.web_search_citations || [],
        graph_metrics: r.output?.graph_metrics,
        errors: r.output?.errors || []
      }))
    });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};
```

---

## Part 6: yq Query Patterns (Existing rg Search Replacement)

```bash
# Query by domain (replaces rg search -n)
yq 'select(.spec.topology.domain_class == "auth") | .identity.packet_key' okf/**/*.yaml

# Query by web citations present
yq 'select(.status.web_search_citations | length > 0) | .identity.feature_label' okf/**/*.yaml

# Extract all dependencies (DAG edges)
yq '.topology.dag_edges[] | select(.relation == "DEPENDS_ON")' okf/**/*.yaml

# Sort by graph centrality
yq 'sort_by(.status.graph_metrics.centrality // 0) | reverse | .[0:10]' okf/**/*.yaml

# Count by domain
yq '[.spec.topology.domain_class] | group_by(.) | map({domain: .[0], count: length})' okf/**/*.yaml
```

**Programmatic (Node.js)**:
```typescript
// src/lib/server/okf/yq-queries.ts
import { execSync } from 'node:child_process';

export function queryOKFByDomain(domain: string): string[] {
  const cmd = `yq 'select(.spec.topology.domain_class == "${domain}") | .identity.packet_key' okf/**/*.yaml`;
  return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
}

export function queryCriticalFeatures(): Record<string, any>[] {
  const cmd = `yq '[select(.status.graph_metrics.centrality > 0.5)] | sort_by(.status.confidence)' okf/**/*.yaml`;
  return JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
}
```

---

## Part 7: npm Scripts + Deployment

```json
{
  "okf:export": "node scripts/nes-chrom-okf-export.mjs",
  "okf:export:dry": "node scripts/nes-chrom-okf-export.mjs --dry-run",
  "okf:export:batch": "node scripts/nes-chrom-okf-export.mjs --batch --limit=100",
  "okf:export:api": "curl -X POST http://localhost:5173/api/acp/okf-export -H 'Content-Type: application/json' -d '{\"packet_keys\": [\"ace:packet:auth:001\"], \"web_search\": true}'",
  "langgraph:start": "docker compose up legal-ai-langgraph -d",
  "langgraph:logs": "docker compose logs -f legal-ai-langraph",
  "okf:query:auth": "yq 'select(.spec.topology.domain_class == \"auth\") | .identity.feature_label' okf/**/*.yaml",
  "okf:query:critical": "yq 'sort_by(.status.graph_metrics.centrality // 0) | reverse | .[0:10]' okf/**/*.yaml"
}
```

---

## Part 8: Validation Gates (G1-G5)

**G1: Pydantic Schema Compliance**
- All OKFEnvelope instances must pass BaseModel validation
- Hard fail if packet_key, source_ref, feature_id missing

**G2: Normalization Quality**
- Timestamps must be ISO 8601 (validated by datetime field)
- Scores must be 0.0-1.0 (validated via @validator)
- Domain class must be in allowed set

**G3: Web Search Citations**
- All citations must have { title, url, snippet, engine }
- Max 3 results per packet (truncate if needed)

**G4: Graph Metrics**
- NetworkX metrics must be computed if kag_depth > 0
- All metrics must be 0.0-1.0 float

**G5: YAML Queryability**
- All exported files must pass `yq empty` (valid YAML syntax)
- Sample yq queries must return > 0 results

---

## Minimal Execution Path (Phase 2→3)

1. **Phase 2**: Execute `npm run golden:retrieval:replay` (validate retrieval stack)
2. **Phase 3A** (immediate): 
   - Deploy normalizer FastAPI service (Python)
   - Wire `/api/acp/okf-export` endpoint (TypeScript)
   - Test with 10 packets
3. **Phase 3B** (optional):
   - Enable web_search flag (SearXNG integration)
   - Enable deep_reasoning flag (Gemma4 analysis)
   - Enable kag_depth > 1 (NetworkX topology)

---

## Summary

| Component | Tech | Status | Effort |
|-----------|------|--------|--------|
| OKF Schema | Pydantic | NEW (design) | 1h |
| Normalizer | FastAPI | NEW (design) | 2h |
| Graph Analysis | NetworkX | NEW (design) | 1h |
| LangGraph | Python StateGraph | NEW (design) | 2h |
| API Route | SvelteKit | NEW (design) | 1h |
| yq Integration | Bash/Node.js | NEW (design) | 30m |
| **Total** | | | **7.5h** |

**Ready for implementation?** Execute golden replay first (30m), then proceed with 3A setup.
