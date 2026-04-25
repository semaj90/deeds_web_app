# MCP Integration - Next Steps

**Generated:** March 1, 2026
**Priority:** HIGH
**Current Status:** 11 tools implemented, evidence/multimodal tools complete

---

## 🔥 Critical (Do First)

### 1. Add Report Tools to MCP
**File:** `src/mcp/server.ts`
**Impact:** AI agents can create/update/export reports
**Effort:** 2 hours

**Tools to Add:**
```typescript
{
  name: "reports:create",
  description: "Create a new report from template with optional AI generation",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      templateType: { type: "string", enum: ["charging_memo", "intake_summary", "discovery_list", ...] },
      customTitle: { type: "string" },
      useAI: { type: "boolean", default: false }
    },
    required: ["caseId", "templateType"]
  }
}

{
  name: "reports:list",
  description: "List reports for a case or user",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      userId: { type: "string" },
      status: { type: "string", enum: ["draft", "pending", "completed", "published"] }
    }
  }
}

{
  name: "reports:export",
  description: "Export report in specified format",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string" },
      format: { type: "string", enum: ["html", "markdown", "json"] }
    },
    required: ["reportId", "format"]
  }
}
```

**Implementation:**
```typescript
// In server.ts CallToolRequestSchema handler
case "reports:create": {
  const { caseId, templateType, customTitle, useAI } = args as any;
  const response = await fetch('http://localhost:5173/api/reports/generate-from-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId, templateType, customTitle, useAI })
  });
  const result = await response.json();
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

---

### 2. Add Citation Tools
**Impact:** AI agents can search/add legal citations
**Effort:** 1.5 hours

**Tools:**
```typescript
{
  name: "citations:search",
  description: "Search legal citations (glossary/statutes/precedents)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      searchType: { type: "string", enum: ["glossary", "statutes", "precedents", "all"] },
      topK: { type: "number", default: 10 }
    },
    required: ["query"]
  }
}

{
  name: "citations:add_to_case",
  description: "Link a citation to a case",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      citationId: { type: "string" },
      notes: { type: "string" }
    },
    required: ["caseId", "citationId"]
  }
}
```

**Endpoint Wiring:**
- `/api/glossary/search`
- `/api/statutes/search`
- `/api/precedents/search`
- `/api/cases/[id]/citations` (POST)

---

### 3. Add Case Management Tools
**Impact:** AI agents can create/update cases
**Effort:** 2 hours

**Tools:**
```typescript
{
  name: "cases:create",
  description: "Create a new legal case",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      practiceArea: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      description: { type: "string" }
    },
    required: ["title", "practiceArea"]
  }
}

{
  name: "cases:add_person",
  description: "Add a person of interest to a case",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      contactInfo: { type: "object" }
    },
    required: ["caseId", "name"]
  }
}

{
  name: "cases:add_evidence",
  description: "Upload and link evidence to a case",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      title: { type: "string" },
      fileUrl: { type: "string" },
      evidenceType: { type: "string" }
    },
    required: ["caseId", "title", "fileUrl"]
  }
}
```

---

## 🚀 High Priority

### 4. Add Timeline Tools
**Impact:** AI agents can build case chronologies
**Effort:** 1.5 hours

```typescript
{
  name: "timeline:create_event",
  description: "Add event to case timeline",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      date: { type: "string", format: "date-time" },
      title: { type: "string" },
      description: { type: "string" },
      evidenceIds: { type: "array", items: { type: "string" } }
    },
    required: ["caseId", "date", "title"]
  }
}
```

---

### 5. Enhanced RAG Tools
**Impact:** Better document understanding
**Effort:** 2 hours

**Current RAG tools:**
- `rag:search` ✅
- `rag:index_page` ✅

**Missing:**
```typescript
{
  name: "rag:validate_sources",
  description: "Validate source credibility and relevance",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      sources: { type: "array", items: { type: "object" } }
    },
    required: ["query", "sources"]
  }
}

{
  name: "rag:answer_with_citations",
  description: "Generate answer with legal citations",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      validatedSources: { type: "array" },
      citationStyle: { type: "string", enum: ["bluebook", "apa", "chicago"] }
    },
    required: ["query", "validatedSources"]
  }
}
```

**Endpoint Wiring:**
- `/api/rag/validate`
- `/api/rag/answer`

---

### 6. MCP Server Health & Monitoring
**Impact:** Better debugging and reliability
**Effort:** 1 hour

**Add tools:**
```typescript
{
  name: "system:health",
  description: "Check system health (Ollama, Qdrant, Postgres, Redis)",
  inputSchema: { type: "object", properties: {} }
}

{
  name: "system:stats",
  description: "Get system statistics and performance metrics",
  inputSchema: { type: "object", properties: {} }
}
```

**Implementation:**
```typescript
case "system:health": {
  const response = await fetch('http://localhost:5173/api/health/capabilities');
  const result = await response.json();
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

case "system:stats": {
  const response = await fetch('http://localhost:5173/api/dashboard/stats');
  const result = await response.json();
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

---

## 📋 Medium Priority

### 7. Batch Operations
**Impact:** Process multiple items efficiently
**Effort:** 2 hours

```typescript
{
  name: "evidence:analyze_batch",
  description: "Analyze multiple evidence items in batch",
  inputSchema: {
    type: "object",
    properties: {
      evidenceIds: { type: "array", items: { type: "string" } },
      operations: { type: "array", items: { type: "string", enum: ["entities", "forensics", "tags"] } }
    },
    required: ["evidenceIds", "operations"]
  }
}

{
  name: "reports:generate_batch",
  description: "Generate multiple reports at once",
  inputSchema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            caseId: { type: "string" },
            templateType: { type: "string" }
          }
        }
      },
      useAI: { type: "boolean" }
    },
    required: ["operations"]
  }
}
```

---

### 8. Document Generation Tools
**Impact:** Create legal documents from templates
**Effort:** 3 hours

```typescript
{
  name: "documents:generate_motion",
  description: "Generate legal motion from template",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      motionType: { type: "string", enum: ["dismiss", "summary_judgment", "suppress_evidence"] },
      arguments: { type: "array", items: { type: "string" } },
      citations: { type: "array", items: { type: "string" } }
    },
    required: ["caseId", "motionType"]
  }
}

{
  name: "documents:generate_brief",
  description: "Generate legal brief from research",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      issues: { type: "array", items: { type: "string" } },
      research: { type: "array", items: { type: "object" } }
    },
    required: ["caseId", "issues"]
  }
}
```

---

### 9. Analytics & Insights Tools
**Impact:** AI-driven case insights
**Effort:** 2 hours

```typescript
{
  name: "analytics:case_summary",
  description: "Generate AI summary of case status and key insights",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      includeTimeline: { type: "boolean", default: true },
      includeEvidence: { type: "boolean", default: true }
    },
    required: ["caseId"]
  }
}

{
  name: "analytics:predict_outcome",
  description: "AI prediction of case outcome based on evidence",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      factors: { type: "array", items: { type: "string" } }
    },
    required: ["caseId"]
  }
}
```

---

### 10. Collaboration Tools
**Impact:** Multi-user case collaboration
**Effort:** 3 hours

```typescript
{
  name: "collaboration:assign_task",
  description: "Assign a task to a team member",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      userId: { type: "string" },
      taskType: { type: "string" },
      description: { type: "string" },
      dueDate: { type: "string", format: "date" }
    },
    required: ["caseId", "userId", "taskType"]
  }
}

{
  name: "collaboration:add_note",
  description: "Add collaborative note to case",
  inputSchema: {
    type: "object",
    properties: {
      caseId: { type: "string" },
      noteType: { type: "string", enum: ["general", "strategy", "research"] },
      content: { type: "string" },
      private: { type: "boolean", default: false }
    },
    required: ["caseId", "content"]
  }
}
```

---

## Summary

**Total Tools:** 11 existing + 20 proposed = 31 tools
**Effort Estimate:** 22 hours total
**Priority Breakdown:**
- Critical: 3 items (5.5 hours)
- High: 3 items (4.5 hours)
- Medium: 4 items (12 hours)

**Implementation Order:**
1. Report tools (critical for template system integration)
2. Citation tools (high legal value)
3. Case management tools (core workflow)
4. Health/monitoring (debugging support)
5. RAG enhancements (better AI answers)
6. Batch operations (efficiency)
7. Analytics tools (insights)
8. Collaboration tools (team features)

**API Endpoints to Create:**
- `POST /api/cases/[id]/citations`
- `POST /api/timeline/events`
- `POST /api/documents/motion`
- `POST /api/documents/brief`
- `POST /api/analytics/case-summary`
- `POST /api/analytics/predict-outcome`
- `POST /api/collaboration/tasks`
- `POST /api/collaboration/notes`
