# Database Schema to API Endpoint Mapping

Based on our Drizzle schema analysis, here are the **EXACT** API endpoints we need for our database tables:

## Core Database Tables → Required APIs

### **Authentication & Users**
**Tables**: `users`, `sessions`, `emailVerificationCodes`, `passwordResetTokens`

**APIs Needed**:
- ✅ `POST /api/auth/login` - Session creation
- ✅ `POST /api/auth/logout` - Session cleanup
- ✅ `POST /api/auth/register` - User creation
- ✅ `GET /api/auth/me` - Current user info
- 🔧 `POST /api/auth/verify-email` - Email verification
- 🔧 `POST /api/auth/reset-password` - Password reset

### **Cases Management**
**Tables**: `cases`, `caseActivities`, `caseScores`, `caseTimeline`, `caseSummaryVectors`

**APIs Needed**:
- 🔧 `GET /api/v1/cases` - List cases with pagination
- 🔧 `POST /api/v1/cases` - Create new case
- 🔧 `GET /api/v1/cases/[id]` - Get case details
- 🔧 `PUT /api/v1/cases/[id]` - Update case
- 🔧 `DELETE /api/v1/cases/[id]` - Delete case
- 🔧 `GET /api/v1/cases/[id]/timeline` - Case timeline events
- 🔧 `POST /api/v1/cases/[id]/timeline` - Add timeline event
- 🔧 `GET /api/v1/cases/[id]/score` - Case scoring data
- 🔧 `POST /api/v1/cases/[id]/score` - Update case score

### **Evidence Management**
**Tables**: `evidence`, `evidenceConnections`, `evidenceVectors`, `hashVerifications`

**APIs Needed**:
- 🔧 `GET /api/v1/evidence` - List evidence with filters
- 🔧 `POST /api/v1/evidence` - Upload evidence
- 🔧 `GET /api/v1/evidence/[id]` - Get evidence details
- 🔧 `PUT /api/v1/evidence/[id]` - Update evidence
- 🔧 `DELETE /api/v1/evidence/[id]` - Delete evidence
- 🔧 `GET /api/v1/evidence/[id]/connections` - Evidence connections
- 🔧 `POST /api/v1/evidence/[id]/verify-hash` - Hash verification
- 🔧 `GET /api/v1/evidence/[id]/analysis` - AI analysis results

### **Legal Documents & Research**
**Tables**: `legalDocuments`, `legalDocumentsJsonb`, `legalPrecedents`, `legalResearch`, `citations`

**APIs Needed**:
- 🔧 `GET /api/v1/documents` - Search legal documents
- 🔧 `POST /api/v1/documents` - Upload legal document
- 🔧 `GET /api/v1/documents/[id]` - Get document details
- 🔧 `GET /api/v1/precedents/search` - Search legal precedents
- 🔧 `GET /api/v1/research/[id]` - Get research session
- 🔧 `POST /api/v1/research` - Create research session
- 🔧 `GET /api/v1/citations/[caseId]` - Case citations

### **AI & Chat Systems**
**Tables**: `aiRecommendations`, `aiReports`, `chatSessions`, `chatMessages`, `legalAnalysisSessions`

**APIs Needed**:
- ✅ `POST /api/v1/ai/chat` - Unified chat endpoint
- ✅ `POST /api/ai/inference` - AI inference
- ✅ `POST /api/legal/analysis` - Legal analysis
- 🔧 `GET /api/v1/ai/recommendations/[caseId]` - AI recommendations
- 🔧 `POST /api/v1/ai/recommendations/[id]/rate` - Rate recommendation
- 🔧 `GET /api/v1/ai/reports/[caseId]` - AI-generated reports
- 🔧 `GET /api/v1/chat/sessions` - Chat session history
- 🔧 `GET /api/v1/chat/sessions/[id]` - Chat messages

### **Vector Search & Embeddings**
**Tables**: `documentVectors`, `evidenceVectors`, `caseEmbeddingsOptimized`, `vectorEmbeddings`

**APIs Needed**:
- ✅ `POST /api/v1/vector/search` - Vector similarity search (JSON)
- ✅ `POST /api/v1/vector/protobuf` - Vector search (Protocol Buffer)
- 🔧 `POST /api/v1/vector/embed` - Generate embeddings
- 🔧 `GET /api/v1/vector/similar-cases/[id]` - Find similar cases
- 🔧 `GET /api/v1/vector/similar-evidence/[id]` - Find similar evidence

### **Canvas & Annotations**
**Tables**: `canvasStates`, `canvasAnnotations`

**APIs Needed**:
- 🔧 `GET /api/v1/canvas/[caseId]` - Load canvas state
- 🔧 `POST /api/v1/canvas/[caseId]` - Save canvas state
- 🔧 `GET /api/v1/canvas/[caseId]/annotations` - Canvas annotations
- 🔧 `POST /api/v1/canvas/annotations` - Create annotation

### **Reports & Documents**
**Tables**: `reports`, `savedReports`

**APIs Needed**:
- 🔧 `GET /api/v1/reports/[caseId]` - Case reports
- 🔧 `POST /api/v1/reports` - Generate report
- 🔧 `GET /api/v1/reports/[id]/export` - Export report (PDF/Word)

### **System & Monitoring**
**Tables**: `auditLogs`, `systemSettings`, `apiRateLimits`

**APIs Needed**:
- 🔧 `GET /api/system/health` - System health check
- 🔧 `GET /api/system/settings` - System configuration
- 🔧 `GET /api/system/audit` - Audit logs (admin only)

## Priority Implementation Order

### **Phase A: Critical CRUD APIs (Week 1)**
These are essential for basic platform functionality:

1. **Cases CRUD** - Core business logic
   ```typescript
   GET    /api/v1/cases
   POST   /api/v1/cases
   GET    /api/v1/cases/[id]
   PUT    /api/v1/cases/[id]
   DELETE /api/v1/cases/[id]
   ```

2. **Evidence CRUD** - File management
   ```typescript
   GET    /api/v1/evidence
   POST   /api/v1/evidence
   GET    /api/v1/evidence/[id]
   PUT    /api/v1/evidence/[id]
   DELETE /api/v1/evidence/[id]
   ```

3. **Authentication Extensions**
   ```typescript
   POST   /api/auth/verify-email
   POST   /api/auth/reset-password
   ```

### **Phase B: AI Integration APIs (Week 2)**
These connect our AI services with the database:

1. **AI Recommendations**
   ```typescript
   GET    /api/v1/ai/recommendations/[caseId]
   POST   /api/v1/ai/recommendations/[id]/rate
   ```

2. **Vector Search**
   ```typescript
   POST   /api/v1/vector/embed
   GET    /api/v1/vector/similar-cases/[id]
   GET    /api/v1/vector/similar-evidence/[id]
   ```

3. **Legal Research**
   ```typescript
   GET    /api/v1/documents
   POST   /api/v1/documents
   GET    /api/v1/precedents/search
   ```

### **Phase C: Advanced Features (Week 3)**
These provide rich functionality:

1. **Canvas System**
   ```typescript
   GET    /api/v1/canvas/[caseId]
   POST   /api/v1/canvas/[caseId]
   POST   /api/v1/canvas/annotations
   ```

2. **Reports Generation**
   ```typescript
   GET    /api/v1/reports/[caseId]
   POST   /api/v1/reports
   GET    /api/v1/reports/[id]/export
   ```

## Database-Driven Validation

Each API endpoint will use **Drizzle schema validation**:

```typescript
// Example: Cases API validation
import { cases, insertCaseSchema, selectCaseSchema } from '$lib/db/schema';

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  // Validate against Drizzle schema
  const validatedData = insertCaseSchema.parse(data);

  // Insert with full type safety
  const result = await db.insert(cases).values(validatedData);

  return json(result);
};
```

## Protocol Buffer Candidates

Based on table complexity and expected traffic:

**High Traffic → Protobuf**:
- `/api/v1/vector/search` - Vector operations with embeddings
- `/api/v1/evidence` (list) - Large datasets with metadata
- `/api/v1/documents` (search) - Full-text search results

**Medium Traffic → JSON**:
- `/api/v1/cases/[id]` - Individual case details
- `/api/v1/ai/chat` - Chat conversations
- `/api/v1/canvas/*` - Canvas operations

**Low Traffic → JSON**:
- `/api/auth/*` - Authentication flows
- `/api/system/*` - System management

## Implementation Status

- ✅ **Implemented** (3/50): Basic AI endpoints functional
- 🔧 **Required** (47/50): Critical database CRUD operations
- **Target**: 50 focused, database-driven API endpoints

This gives us a **clean, database-driven API architecture** with exactly the endpoints needed for our legal AI platform! 🎯