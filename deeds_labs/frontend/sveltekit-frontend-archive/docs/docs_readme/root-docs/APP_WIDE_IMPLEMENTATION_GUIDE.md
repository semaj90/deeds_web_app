# App-Wide Session & User Data Implementation Guide

This guide documents the comprehensive session management and user-centric data system implemented across the entire SvelteKit legal AI platform.

## 🎯 Overview

The implementation provides:
- **Global session management** with Lucia v3 integration
- **User-owned data stores** for cases, evidence, citations, reports, AI conversations
- **Persistent storage** with fallback mechanisms
- **App-wide formatting utilities** for consistent UI
- **Global sidebar component** with user-specific content
- **Session initialization** for seamless integration

## 📁 File Structure

```
src/lib/
├── stores/
│   ├── sessionStore.ts          # Global session management
│   └── userDataStore.ts         # User-owned data management
├── utils/
│   └── formatting.ts            # App-wide formatting utilities
├── components/
│   ├── GlobalSidebar.svelte     # Universal user sidebar
│   └── SessionInitializer.svelte # Session auto-init component
```

## 🔐 Session Management (`sessionStore.ts`)

### Features
- Lucia v3 integration with SvelteKit page store
- Multiple fallback mechanisms for session restoration
- Persistent storage with 5-minute cache validity
- Cross-tab synchronization
- Auto-refresh on visibility change

### Usage

```typescript
import { sessionStore, user, isAuthenticated } from '$lib/stores/sessionStore';

// In your component
$: currentUser = $user;
$: authenticated = $isAuthenticated;

// For uploads
import { getUserForUpload } from '$lib/stores/sessionStore';
const { uploadedBy, uploaderRole, uploaderEmail } = getUserForUpload();
```

### Session Resolution Priority
1. **SvelteKit page store** (most reliable)
2. **Window globals** (`__PERSISTED_SESSION`, `__SESSION`, `__LUCIA_SESSION`)
3. **localStorage cache** (legal_ai_session_cache, session, auth)
4. **Server API** (`/api/auth/session`)

## 🗄️ User Data Management (`userDataStore.ts`)

### Data Types Managed
- **Cases**: Legal cases with status, priority, evidence counts
- **Evidence**: Files with metadata, AI analysis status
- **Citations**: Legal references with favorites
- **Reports**: Generated documents with word counts
- **AI Conversations**: Chat history with context
- **Activities**: Audit trail of user actions

### Features
- Auto-sync when session changes
- Parallel data fetching for performance
- 10-minute cache validity
- Real-time statistics
- Filtered derived stores

### Usage

```typescript
import {
  userDataStore,
  userCases,
  userEvidence,
  userStats,
  activeCases,
  recentEvidence
} from '$lib/stores/userDataStore';

// Access user data
$: cases = $userCases;
$: stats = $userStats;

// Add new data
userDataStore.addCase(newCase);
userDataStore.addEvidence(evidence);
userDataStore.updateCase(caseId, updates);
```

## 🎨 Formatting Utilities (`formatting.ts`)

### Timestamp Functions
- `formatRelativeTime()` - "2m", "3h", "1d", "2w"
- `formatDate()` - Standard date/time
- `formatDetailedTimestamp()` - With user context
- `formatLegalTimestamp()` - Court-ready format

### Text Functions
- `truncateFilename()` - Smart extension preservation
- `truncateText()` - General truncation
- `truncateWords()` - Word boundary aware
- `truncateCaseTitle()` - Legal case specific

### File Functions
- `formatFileSize()` - Human readable sizes
- `getFileIcon()` - Emoji based on type
- `detectFileType()` - From extension

### Legal Functions
- `formatCaseNumber()` - Consistent case formatting
- `formatJurisdiction()` - Human readable jurisdictions
- `formatCourtLevel()` - Court hierarchy display

### Usage

```typescript
import {
  formatRelativeTime,
  truncateFilename,
  getFileIcon,
  getPriorityColor,
  MINI_TEXT_LENGTHS
} from '$lib/utils/formatting';

// In templates
{formatRelativeTime(evidence.uploadedAt)}
{truncateFilename(filename, MINI_TEXT_LENGTHS.FILENAME)}
<span class="nes-badge {getPriorityColor(priority)}">{priority}</span>
```

## 🔧 Global Sidebar (`GlobalSidebar.svelte`)

### Features
- Session-aware user profile
- Real-time data statistics
- Universal search functionality
- Quick actions for common tasks
- Collapsible sections
- Responsive design
- Persistent preferences

### Sections
1. **User Profile** - Session status and role
2. **Search** - Cross-content search
3. **Statistics** - Data overview
4. **Quick Actions** - Create case, upload, etc.
5. **Cases** - Recent with status badges
6. **Evidence** - Files with icons and meta
7. **Citations** - Legal references
8. **Reports** - Generated documents
9. **AI Assistant** - Conversation history

### Usage

```svelte
<script>
  import GlobalSidebar from '$lib/components/GlobalSidebar.svelte';
</script>

<GlobalSidebar
  isOpen={true}
  defaultSection="dashboard"
  showQuickActions={true}
  compactMode={false}
/>
```

## 🚀 Session Initialization (`SessionInitializer.svelte`)

### Features
- Automatic session sync with page data
- Auto-refresh with configurable intervals
- Cross-tab synchronization
- Visibility change detection
- Debug logging support

### Usage in Layout

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import SessionInitializer from '$lib/components/SessionInitializer.svelte';
</script>

<SessionInitializer
  enableAutoSync={true}
  syncInterval={300000}
  enableDebugLogging={false}
/>

<main>
  <slot />
</main>
```

## 🔌 API Integration Requirements

### Required API Endpoints

```typescript
// Session management
GET  /api/auth/session           // Current session info
POST /api/auth/login             // Login endpoint
POST /api/auth/logout            // Logout endpoint

// User data endpoints
GET  /api/user/{userId}/cases           // User's cases
GET  /api/user/{userId}/evidence        // User's evidence
GET  /api/user/{userId}/citations       // User's citations
GET  /api/user/{userId}/reports         // User's reports
GET  /api/user/{userId}/ai-conversations // AI chat history

// Upload endpoints
POST /api/evidence/ingest               // Evidence upload
```

### Database Schema (Drizzle-ORM Ready)

```typescript
// User cases table
export const cases = pgTable('cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('open'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  jurisdiction: varchar('jurisdiction', { length: 100 }).notNull(),
  caseNumber: varchar('case_number', { length: 100 }),
  assignedUserId: uuid('assigned_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Evidence table
export const evidence = pgTable('evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id),
  filename: varchar('filename', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  fileSize: integer('file_size').notNull(),
  minioUrl: varchar('minio_url', { length: 500 }).notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  tags: json('tags').$type<string[]>().default([]),
  notes: text('notes'),
  metadata: json('metadata').default({}),
  aiAnalysisStatus: varchar('ai_analysis_status', { length: 20 }).default('pending'),
});

// Citations table
export const citations = pgTable('citations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  caseId: uuid('case_id').references(() => cases.id),
  title: varchar('title', { length: 500 }).notNull(),
  source: varchar('source', { length: 500 }).notNull(),
  citationType: varchar('citation_type', { length: 50 }).notNull(),
  jurisdiction: varchar('jurisdiction', { length: 100 }).notNull(),
  year: integer('year'),
  url: varchar('url', { length: 1000 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isFavorite: boolean('is_favorite').default(false),
});
```

## 🎮 Implementation Steps

### 1. Add to Root Layout

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import SessionInitializer from '$lib/components/SessionInitializer.svelte';
  import GlobalSidebar from '$lib/components/GlobalSidebar.svelte';
  import { isAuthenticated } from '$lib/stores/sessionStore';

  $: showSidebar = $isAuthenticated;
</script>

<SessionInitializer />

{#if showSidebar}
  <GlobalSidebar />
{/if}

<main class:with-sidebar={showSidebar}>
  <slot />
</main>

<style>
  main.with-sidebar {
    margin-left: 320px;
  }
</style>
```

### 2. Update Layout Server Load

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
    session: locals.session,
    isAuthenticated: !!locals.user,
  };
};
```

### 3. Update Component Templates

```svelte
<!-- Any component that needs user context -->
<script>
  import { user, isAuthenticated } from '$lib/stores/sessionStore';
  import { formatRelativeTime, truncateFilename } from '$lib/utils/formatting';

  $: currentUser = $user;
  $: authenticated = $isAuthenticated;
</script>

{#if authenticated}
  <div class="user-content">
    <p>Welcome, {currentUser?.email}</p>
    <!-- User-specific content -->
  </div>
{:else}
  <div class="auth-prompt">
    <a href="/auth/login">Sign In</a>
  </div>
{/if}
```

### 4. File Upload Integration

```typescript
// Enhanced upload with session context
import { getUserForUpload } from '$lib/stores/sessionStore';

async function uploadFile(file: File, caseId: string) {
  const { uploadedBy, uploaderRole, uploaderEmail } = getUserForUpload();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('caseId', caseId);
  formData.append('uploadedBy', uploadedBy);
  formData.append('uploaderRole', uploaderRole);
  if (uploaderEmail) formData.append('uploaderEmail', uploaderEmail);

  const response = await fetch('/api/evidence/ingest', {
    method: 'POST',
    body: formData
  });

  return response.json();
}
```

## 📊 UI Preview Demo

Visit `/ui-preview` to see:
- **Session Demo** - Login/logout simulation
- **Formatting Demo** - All utility functions
- **Sidebar Demo** - Global sidebar features

## 🔧 Configuration Options

### Session Store
- `enableAutoSync` - Auto-refresh sessions
- `syncInterval` - Refresh frequency (default: 5min)
- `cacheTimeout` - Cache validity (default: 5min)

### User Data Store
- `enableCache` - Local storage caching
- `cacheTimeout` - Cache validity (default: 10min)
- `enableRealTimeSync` - Auto-sync on changes

### Global Sidebar
- `isOpen` - Sidebar visibility
- `defaultSection` - Initial section
- `showQuickActions` - Quick action buttons
- `compactMode` - Collapsed by default

## ✅ Benefits

1. **Consistent UX** - Unified session handling across all pages
2. **Performance** - Intelligent caching and batched API calls
3. **Reliability** - Multiple fallback mechanisms for session restoration
4. **Developer Experience** - Simple stores and utilities
5. **Type Safety** - Full TypeScript integration
6. **Scalability** - Ready for drizzle-orm and real API integration

## 🚨 Important Notes

- **Session Security** - Always validate sessions server-side
- **Cache Management** - Implement cache invalidation strategies
- **Error Handling** - Graceful degradation when APIs fail
- **Performance** - Monitor bundle size with large user datasets
- **Privacy** - Ensure sensitive data isn't cached inappropriately

This implementation provides a robust foundation for user-centric legal AI applications with seamless session management and comprehensive user data integration.