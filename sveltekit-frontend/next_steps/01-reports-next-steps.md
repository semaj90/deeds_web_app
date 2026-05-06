# Report System - Next Steps

**Generated:** March 1, 2026
**Priority:** HIGH
**Files Analyzed:** 7 report API files, 30 template-related files

---

## 🔥 Critical (Do First)

### 1. Fix Template Generation Endpoint
**File:** `src/routes/api/reports/generate-from-template/+server.ts`
**Issue:** Returns 500 error when called
**Impact:** Blocks AI-powered template generation
**Effort:** 30 minutes

**Action Items:**
```typescript
// Debug steps:
1. Add console.log at start of POST handler
2. Test getTemplate() import at runtime
3. Verify template data structure
4. Check db import works correctly
5. Test with simple 'summary' template first
```

**Test:**
```bash
curl -X POST http://localhost:5173/api/reports/generate-from-template \
  -H "Content-Type: application/json" \
  -d '{"templateType":"summary","caseId":"test-id","useAI":false}'
```

---

### 2. Add Report Audit Logging
**File:** `src/routes/api/reports/+server.ts`
**Impact:** Legal compliance requirement
**Effort:** 1 hour

**Implementation:**
```typescript
// Create audit log table:
CREATE TABLE report_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted', 'published', 'exported'
  changes JSONB, -- What changed
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

// Add audit helper:
async function auditReportAction(
  reportId: string,
  userId: string,
  action: string,
  changes?: any,
  request?: Request
) {
  await db.insert(reportAuditLog).values({
    reportId,
    userId,
    action,
    changes,
    ipAddress: request?.headers.get('x-forwarded-for'),
    userAgent: request?.headers.get('user-agent')
  });
}

// Add to all CRUD operations
```

---

### 3. Streaming AI Generation
**File:** `src/routes/api/reports/generate-stream/+server.ts` (NEW)
**Impact:** Better UX for AI-powered reports
**Effort:** 2 hours

**Implementation:**
```typescript
// SSE endpoint for streaming generation
export const GET: RequestHandler = async ({ url, locals }) => {
  const templateType = url.searchParams.get('templateType');
  const caseId = url.searchParams.get('caseId');

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Send section headers as they're generated
        controller.enqueue(encoder.encode('data: {"type":"section","name":"Executive Summary"}\n\n'));

        // Stream AI content
        const aiStream = await ollamaStream(prompt);
        for await (const chunk of aiStream) {
          controller.enqueue(encoder.encode(`data: {"type":"content","text":"${chunk}"}\n\n`));
        }

        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }
  );
};
```

---

## 🚀 High Priority

### 4. Report Version History
**Impact:** Track changes over time
**Effort:** 3 hours

**Schema:**
```sql
CREATE TABLE report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL,
  version_number INT NOT NULL,
  content TEXT,
  title VARCHAR(255),
  status report_status,
  metadata JSONB,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(report_id, version_number)
);
```

**API:**
```typescript
// GET /api/reports/[id]/versions
// GET /api/reports/[id]/versions/[version]
// POST /api/reports/[id]/revert?version=3
```

---

### 5. Report Collaboration
**Impact:** Multi-user editing
**Effort:** 4 hours (was 6 — switching from websocket to SSE drops the standalone-server overhead)

**Tech Stack:**
- YJS for CRDT
- **SSE for sync** (replaces WebSocket — SvelteKit-native, no separate server, integrates with existing `/api/sse/*` infrastructure and `Promise.withResolvers()` stream pattern)
- TipTap YJS extension
- POST endpoint for client-to-server YJS update broadcast (since SSE is one-way)

**Files to create:**
```
src/lib/collaboration/yjs-provider.ts          (SSE-based provider)
src/routes/api/reports/[id]/collaborate/+server.ts  (SSE GET stream)
src/routes/api/reports/[id]/collaborate/update/+server.ts  (POST YJS updates)
```

**Why SSE over WebSocket here:**
- App already has 8+ SSE routes (`/api/sse/chat`, `/api/sse/reports`, etc.) — same connection pool, same heartbeat patterns
- No separate websocket server process; runs inside SvelteKit
- HTTP/2 multiplexing makes per-connection cost cheap
- Reconnect-with-Last-Event-ID is built into SSE; YJS state-vector handles the resumption

---

### 6. Report Analytics
**Impact:** Usage insights
**Effort:** 2 hours

**Metrics to track:**
```typescript
interface ReportMetrics {
  totalReports: number;
  reportsByType: Record<string, number>;
  reportsByStatus: Record<string, number>;
  avgTimeToComplete: Record<string, number>; // By template type
  aiGenerationRate: number;
  exportsByFormat: Record<string, number>;
  mostActiveUsers: { userId: string; count: number }[];
}
```

**Endpoint:**
```typescript
// GET /api/analytics/reports
// GET /api/analytics/reports/trends?period=30d
```

---

## 📋 Medium Priority

### 7. Template Marketplace
**Impact:** Share custom templates
**Effort:** 8 hours

**Schema:**
```sql
CREATE TABLE template_marketplace (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_json JSONB NOT NULL,
  author_id UUID NOT NULL,
  downloads INT DEFAULT 0,
  rating DECIMAL(3,2),
  tags TEXT[],
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 8. Smart Template Suggestions
**Impact:** AI recommendations
**Effort:** 4 hours

**Algorithm:**
```typescript
function suggestTemplates(case: Case): Template[] {
  const suggestions = [];

  // Rule-based suggestions
  if (!hasReport(case, 'intake_summary')) {
    suggestions.push({ template: 'intake_summary', reason: 'No intake summary yet', priority: 'high' });
  }

  if (case.nextHearing && daysDiff(case.nextHearing) < 7) {
    suggestions.push({ template: 'hearing_prep', reason: 'Hearing in < 7 days', priority: 'urgent' });
  }

  if (case.evidenceCount > 10 && !hasReport(case, 'evidence_review')) {
    suggestions.push({ template: 'evidence_review', reason: '10+ evidence items need review', priority: 'medium' });
  }

  return suggestions.sort((a, b) => priorityScore(b) - priorityScore(a));
}
```

---

### 9. Report Preview Before Creation
**Impact:** Better UX
**Effort:** 2 hours

**Component:**
```svelte
<Dialog.Root>
  <Dialog.Trigger>Preview Template</Dialog.Trigger>
  <Dialog.Content class="max-w-4xl">
    <TemplatePreview
      template={selectedTemplate}
      caseData={caseContext}
      showSampleData={true}
    />
    <Button onclick={createWithTemplate}>Use This Template</Button>
  </Dialog.Content>
</Dialog.Root>
```

---

### 10. Batch Report Generation
**Impact:** Generate multiple reports at once
**Effort:** 3 hours

**API:**
```typescript
POST /api/reports/batch-generate
{
  operations: [
    { caseId: "uuid1", templateType: "intake_summary" },
    { caseId: "uuid2", templateType: "timeline" },
    { caseId: "uuid3", templateType: "evidence_review" }
  ],
  useAI: true,
  schedule?: "2026-03-05T10:00:00Z" // Optional scheduled generation
}
```

---

## 🎨 UI/UX Improvements

### 11. Report Diff Viewer
**Impact:** Show version changes
**Effort:** 3 hours

**Component:**
```svelte
<ReportDiff
  original={reportV1}
  modified={reportV2}
  mode="side-by-side" // or "inline"
  highlightChanges={true}
/>
```

---

### 12. AI Citation Checker
**Impact:** Validate legal citations
**Effort:** 4 hours

**Integration with TipTap:**
```typescript
// Auto-highlight invalid citations
const CitationExtension = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        decorations(state) {
          // Find citation patterns
          // Validate against statute/case law DB
          // Add red underline to invalid citations
        }
      })
    ];
  }
});
```

---

## 🔗 Integration Opportunities

### 13. Evidence → Report Auto-Population
**File:** `src/lib/services/report-auto-populator.ts` (NEW)
**Impact:** Faster report creation
**Effort:** 2 hours

```typescript
export async function autoPopulateEvidenceReview(caseId: string): Promise<string> {
  const evidence = await fetchCaseEvidence(caseId);
  const grouped = groupByType(evidence);

  let content = '<h1>Evidence Review</h1>';

  // Documentary Evidence
  content += '<h2>Documentary Evidence</h2><table>...';
  grouped.documentary.forEach(item => {
    content += `<tr><td>${item.id}</td><td>${item.title}</td><td>${item.date}</td></tr>`;
  });

  // Physical Evidence
  content += '<h2>Physical Evidence</h2><table>...';

  // Digital Evidence
  content += '<h2>Digital Evidence</h2><table>...';

  return content;
}
```

---

### 14. Timeline → Report Integration
**Impact:** Auto-generate timeline reports
**Effort:** 2 hours

```typescript
POST /api/reports/generate-timeline
{
  caseId: "uuid",
  includeEvidence: true,
  includeCourt: true,
  groupBy: "chronological" // or "category"
}
```

---

## 📱 Mobile & Accessibility

### 15. Mobile Report Editor
**Impact:** Edit on mobile devices
**Effort:** 4 hours

**Optimizations:**
- Simplified toolbar
- Touch-friendly controls
- Voice dictation
- Offline mode

---

### 16. WCAG 2.1 AA Compliance
**Impact:** Accessibility
**Effort:** 3 hours

**Checklist:**
- [ ] Screen reader support
- [ ] Keyboard navigation
- [ ] High contrast mode
- [ ] Focus indicators
- [ ] ARIA labels
- [ ] Alt text for icons

---

## 🔐 Security

### 17. Report Permissions System
**Impact:** Granular access control
**Effort:** 4 hours

**Schema:**
```sql
CREATE TABLE report_permissions (
  report_id UUID NOT NULL,
  user_id UUID NOT NULL,
  permission VARCHAR(20) NOT NULL, -- 'view', 'edit', 'admin'
  granted_by UUID,
  granted_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (report_id, user_id)
);
```

---

### 18. Digital Signatures
**Impact:** Legal validity
**Effort:** 6 hours

**Implementation:**
```typescript
interface ReportSignature {
  reportId: string;
  signedBy: User;
  timestamp: Date;
  contentHash: string; // SHA-256 of content
  signature: string; // RSA signature
  certificate?: string; // X.509 certificate
}
```

---

## 📊 Testing

### 19. Report E2E Tests
**File:** `tests/e2e/reports.spec.ts` (NEW)
**Effort:** 3 hours

**Test cases:**
```typescript
test('create report from template', async ({ page }) => {
  // Navigate to reports/new
  // Select template
  // Fill title
  // Enable AI generation
  // Submit
  // Verify report created
});

test('edit and save report', async ({ page }) => {
  // Open existing report
  // Edit content in TipTap
  // Auto-save triggers
  // Reload page
  // Verify changes persisted
});
```

---

### 20. Template Generation Tests
**File:** `tests/unit/templates.test.ts` (NEW)
**Effort:** 1 hour

```typescript
describe('Report Templates', () => {
  it('should load all 10 templates', () => {
    const templates = getAllTemplates();
    expect(templates).toHaveLength(10);
  });

  it('should generate content from template', () => {
    const template = getTemplate('charging_memo');
    const content = generateFromTemplate(template, mockCaseData);
    expect(content).toContain('<h1>Charging Memorandum</h1>');
  });
});
```

---

## Summary

**Total Items:** 20
**Estimated Effort:** 65-75 hours
**Critical Items:** 3 (4.5 hours)
**High Priority:** 6 (20 hours)
**Medium Priority:** 11 (40 hours)
