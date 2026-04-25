# Essential Routes for Legal AI Platform

## Core Routes (Must Have - 20 routes)

### 1. Authentication & User Management

- ✅ `/` - Homepage/Landing
- ✅ `/auth/login` - User login
- ✅ `/auth/register` - User registration
- ❌ `/auth/logout` - Logout endpoint (create)
- ✅ `/profile` - User profile

### 2. Case Management

- ✅ `/cases` - Cases list/dashboard
- ✅ `/cases/create` - Create new case
- ✅ `/cases/[id]` - View single case
- ✅ `/cases/[id]/canvas` - Case evidence canvas

### 3. Evidence Management

- ✅ `/evidenceboard` - Evidence board overview
- ✅ `/evidence` - Evidence list
- ✅ `/evidence/upload` - Upload evidence
- ✅ `/evidence/analyze` - Analyze evidence

### 4. AI Features

- ✅ `/chat` - AI chat interface
- ✅ `/ai` - AI dashboard
- ❌ `/ai/rag` - RAG interface (create)
- ❌ `/ai/summarize` - Document summarization (create)

### 5. Dashboard & Analytics

- ✅ `/dashboard` - Main dashboard
- ✅ `/dashboard/cases` - Cases dashboard
- ✅ `/dashboard/search` - Search dashboard

### 6. Core Features

- ✅ `/search` - Global search
- ✅ `/reports` - Reports generation
- ✅ `/settings` - User settings
- ✅ `/help` - Help/documentation

## Secondary Routes (Nice to Have - 10 routes)

- ✅ `/persons-of-interest` - POI management
- ✅ `/legal/documents` - Legal documents
- ✅ `/legal/research` - Legal research
- ✅ `/citations` - Citations management
- ✅ `/admin` - Admin panel
- ✅ `/system/health` - System health
- ✅ `/detective` - Detective board
- ✅ `/prosecutor` - Prosecutor tools
- ✅ `/export` - Export data
- ✅ `/import` - Import data

## Demo/Test Routes to Remove (268+ routes)

All routes under:

- `/demo/*` (114 routes)
- `/test/*` (30+ routes)
- `/dev/*` (20+ routes)
- `/yorha/*` variations (15+ routes)
- Other test/demo variations

## Routes to Create/Fix

1. `/auth/logout` - Logout page
2. `/ai/rag` - RAG interface
3. `/ai/summarize` - Summarization tool

## Total Essential Routes: ~30
