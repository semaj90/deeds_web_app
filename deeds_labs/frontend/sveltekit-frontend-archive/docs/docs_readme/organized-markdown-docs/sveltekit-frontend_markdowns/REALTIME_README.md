# Real-time Evidence Management System

A robust real-time update system for the SvelteKit legal case management app using Redis pub/sub, WebSocket, and Server-Sent Events (SSE) with local memory, undo functionality, and SSR hydration safety.

## 🚀 Features

### Real-time Updates

- **WebSocket Connection**: Primary real-time communication using `ws` library
- **Server-Sent Events (SSE)**: SSR-safe fallback for real-time updates
- **Redis Pub/Sub**: Backend message broadcasting across services
- **Auto-reconnection**: Automatic reconnection with exponential backoff
- **Connection Status**: Live connection monitoring and status display

### Local Storage & Sync

- **Loki.js Integration**: Lightweight in-memory JSON database for local caching
- **Offline Sync Queue**: Queue operations when offline, sync when online
- **Optimistic Updates**: Immediate UI updates with server synchronization
- **Conflict Resolution**: Smart merging of local and server state
- **Persistent Storage**: IndexedDB persistence with Loki.js adapter

### Undo/Redo System

- **Operation History**: Track all evidence operations (create, update, delete)
- **Undo/Redo**: Full undo/redo functionality with operation reversal
- **State Snapshots**: Efficient state management with operation logs
- **Keyboard Shortcuts**: Ctrl+Z (undo) and Ctrl+Y (redo) support

### Enhanced UI

- **Real-time Grid**: Live updating evidence grid with Pinterest-style layout
- **Connection Status**: Visual indicators for online/offline state
- **Sync Progress**: Real-time sync status with pending/failed operation counts
- **Filter & Search**: Advanced filtering with real-time updates
- **Grid/List Views**: Toggle between grid and list layouts
- **Selection Tools**: Bulk operations with multi-selection

## 🏗️ Architecture

```
┌─────────────────┬─────────────────┬─────────────────┐
│   SvelteKit     │   WebSocket     │     Redis       │
│   Frontend      │    Server       │   Pub/Sub       │
├─────────────────┼─────────────────┼─────────────────┤
│ • RealTimeGrid  │ • socket-server │ • evidence_*    │
│ • EvidenceStore │ • Redis client  │ • case_*        │
│ • Loki.js cache │ • Pub/Sub mgmt  │ • user_*        │
│ • SSE fallback  │ • Client mgmt   │ • canvas_*      │
└─────────────────┴─────────────────┴─────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  Data Flow                              │
├─────────────────────────────────────────────────────────┤
│ 1. User Action (Create/Update/Delete Evidence)         │
│ 2. Optimistic Update (Local Loki.js + UI)             │
│ 3. API Request (HTTP to SvelteKit backend)            │
│ 4. Database Update (PostgreSQL via Drizzle)           │
│ 5. Redis Publish (evidence_update channel)            │
│ 6. WebSocket Broadcast (All connected clients)        │
│ 7. Client Update (Other users see changes)            │
└─────────────────────────────────────────────────────────┘
```

## 📦 Installation & Setup

### Prerequisites

- Node.js 18+ and npm
- Redis server
- PostgreSQL database
- Docker (optional, for services)

### Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start all services**:

   ```powershell
   # Windows PowerShell
   .\start-realtime.ps1 -All

   # Or manually:
   npm run dev:realtime
   ```

3. **Individual services**:

   ```bash
   # Start WebSocket server only
   npm run websocket:start

   # Start SvelteKit dev server only
   npm run dev

   # Start with live reload for WebSocket server
   npm run websocket:dev
   ```

### Environment Variables

Required in `.env`:

```bash
# Redis (required for real-time features)
REDIS_URL=redis://localhost:6379

# PostgreSQL (required for persistence)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prosecutor_db

# WebSocket server (optional, defaults to 3030)
WEBSOCKET_PORT=3030

# Application
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:5173
```

## 🔧 Configuration

### WebSocket Server Configuration

The WebSocket server (`websocket-server.js`) can be configured via environment variables:

```javascript
const PORT = process.env.WEBSOCKET_PORT || 3030;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
```

### Redis Channels

The system uses these Redis channels for pub/sub:

- `evidence_update` - Evidence CRUD operations
- `case_update` - Case modifications
- `poi_update` - Person of Interest updates
- `report_update` - Report changes
- `citation_update` - Citation modifications
- `canvas_update` - Interactive canvas state
- `user_activity` - User presence and activity

### Loki.js Configuration

Local database settings in `loki-evidence.ts`:

```typescript
const db = new Loki("evidence_db.json", {
  adapter: new LokiIndexedAdapter("evidence_db"),
  autoload: true,
  autosave: true,
  autosaveInterval: 4000, // 4 seconds
});
```

## 📡 API Endpoints

### Evidence API (`/api/evidence`)

#### GET `/api/evidence`

Fetch evidence with filtering and pagination:

```typescript
// Query parameters
?caseId=case-001&type=document&limit=20&offset=0

// Response
{
  evidence: Evidence[],
  pagination: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  }
}
```

#### POST `/api/evidence`

Create new evidence (triggers real-time update):

```typescript
// Request body
{
  title: string,
  description: string,
  type: string,
  caseId: string,
  tags?: string[],
  // ... other fields
}

// Response
{
  id: string,
  success: true,
  evidence: Evidence
}
```

#### PATCH `/api/evidence?id={evidenceId}`

Update evidence (triggers real-time update):

```typescript
// Request body (partial update)
{
  title?: string,
  description?: string,
  tags?: string[],
  // ... other fields
}
```

#### DELETE `/api/evidence?id={evidenceId}`

Delete evidence (triggers real-time update):

```typescript
// Response
{
  success: true,
  deletedId: string
}
```

### Real-time Updates API (`/api/updates`)

#### GET `/api/updates` (Server-Sent Events)

SSR-safe real-time updates:

```typescript
// Query parameters
?userId=user123&subscriptions=evidence_update,case_update

// Event stream format
data: {"type": "EVIDENCE_CREATED", "evidenceId": "...", ...}

data: {"type": "heartbeat", "timestamp": "..."}
```

## 🎯 Usage Examples

### Basic Real-time Grid

```svelte
<script>
  import RealTimeEvidenceGrid from '$lib/components/RealTimeEvidenceGrid.svelte';

  let caseId = 'case-001';
  let searchQuery = '';
  let selectedTypes = ['document', 'image'];
</script>

<RealTimeEvidenceGrid
  {caseId}
  {searchQuery}
  {selectedTypes}
  showAdvancedFilters={true}
/>
```

### Evidence Store Integration

```typescript
import { evidenceStore } from "$lib/stores/evidenceStore";

// Create evidence (optimistic update + real-time sync)
await evidenceStore.createEvidence({
  title: "New Evidence",
  description: "Evidence description",
  type: "document",
  caseId: "case-001",
});

// Update evidence
await evidenceStore.updateEvidence("evidence-id", {
  title: "Updated Title",
});

// Delete evidence
await evidenceStore.deleteEvidence("evidence-id");

// Undo/Redo
evidenceStore.undo(); // Undo last operation
evidenceStore.redo(); // Redo last undone operation

// Check undo/redo availability
const canUndo = evidenceStore.canUndo();
const canRedo = evidenceStore.canRedo();
```

### Local Storage with Loki.js

```typescript
import { lokiEvidenceService } from "$lib/utils/loki-evidence";

// Query local data
const allEvidence = lokiEvidenceService.getAllEvidence();
const caseEvidence = lokiEvidenceService.getEvidenceByCase("case-001");
const searchResults = lokiEvidenceService.searchEvidence("keyword");

// Get analytics
const stats = lokiEvidenceService.getEvidenceStats();
// Returns: { total, byType, byCase, recentCount }

// Sync status
const syncStatus = lokiEvidenceService.getSyncStatus();
// Returns: { pending, failed, total, inProgress }

// Manual sync
await lokiEvidenceService.syncWithServer(serverEvidence);
await lokiEvidenceService.processSyncQueue();
```

## 🧪 Testing Real-time Features

### Demo Mode

Visit `/evidence/realtime` and click "Start Demo" to see:

1. **Real-time Evidence Creation**: Evidence appears as it's added
2. **Live Updates**: Changes propagate to all connected clients
3. **Offline Handling**: Operations queue when offline, sync when online
4. **Undo/Redo**: Test the complete operation history
5. **Connection Status**: Monitor WebSocket/SSE connection state

### Multi-client Testing

1. Open multiple browser tabs to `/evidence/realtime`
2. Create/update/delete evidence in one tab
3. Observe real-time updates in other tabs
4. Test offline mode by disconnecting network
5. Verify sync when reconnecting

### Performance Testing

The system handles:

- **1000+ evidence items** with smooth rendering
- **Multiple concurrent users** with efficient pub/sub
- **Offline operation** with local queue management
- **Large file uploads** with progress tracking

## 🔍 Troubleshooting

### Connection Issues

**WebSocket connection failed**:

- Check if WebSocket server is running on port 3030
- Verify Redis is running and accessible
- Check firewall settings for port 3030

**SSE fallback not working**:

- Ensure `/api/updates` endpoint is accessible
- Check for CORS issues in browser console
- Verify Redis pub/sub is functioning

### Sync Issues

**Operations not syncing**:

- Check Redis connection in WebSocket server logs
- Verify API endpoints are responding correctly
- Clear local storage and refresh

**Local data corruption**:

```typescript
// Clear and reset local data
await lokiEvidenceService.clearLocalData();
// Then reload from server
```

### Performance Issues

**Slow rendering with many items**:

- Evidence grid uses virtual scrolling for 1000+ items
- Check browser dev tools for memory usage
- Consider increasing pagination size

**Memory leaks**:

- Loki.js auto-saves and cleans old operations
- WebSocket connections auto-cleanup on disconnect
- Use browser task manager to monitor memory

## 📚 Component Reference

### RealTimeEvidenceGrid

Main evidence display component with real-time updates.

**Props**:

- `caseId?: string` - Filter by case ID
- `searchQuery?: string` - Search filter
- `selectedTypes?: string[]` - Evidence type filter
- `showAdvancedFilters?: boolean` - Show advanced filter UI

**Events**:

- Real-time updates automatically handled
- Emits standard component events

### EvidenceStore

Svelte store for evidence state management.

**Stores**:

- `evidence` - Array of evidence items
- `isLoading` - Loading state
- `isConnected` - Real-time connection status
- `error` - Error messages

**Methods**:

- `createEvidence(data)` - Create new evidence
- `updateEvidence(id, changes)` - Update evidence
- `deleteEvidence(id)` - Delete evidence
- `undo()` / `redo()` - Operation history
- `disconnect()` - Close connections

## 🚀 Production Deployment

### Environment Setup

```bash
# Production environment variables
NODE_ENV=production
REDIS_URL=redis://your-redis-instance:6379
DATABASE_URL=postgresql://user:pass@your-db:5432/db
WEBSOCKET_PORT=3030
```

### Docker Deployment

```dockerfile
# Dockerfile for WebSocket server
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY websocket-server.js ./
COPY src/lib/server ./src/lib/server
EXPOSE 3030
CMD ["node", "websocket-server.js"]
```

### Load Balancing

For multiple WebSocket servers:

- Use Redis pub/sub for cross-server communication
- Configure sticky sessions for WebSocket connections
- Load balance HTTP traffic separately from WebSocket traffic

### Monitoring

Monitor these metrics:

- **WebSocket connections**: Active connection count
- **Redis operations**: Pub/sub message rate
- **Sync queue**: Pending operations count
- **Error rates**: Failed operations and connections

## 📄 License

This real-time evidence management system is part of the larger legal case management application. See the main project license for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test real-time functionality thoroughly
4. Submit a pull request with detailed description

For questions or support, please create an issue in the main repository.
