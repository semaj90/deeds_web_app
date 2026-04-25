# 🔌 WebSocket Implementation Guide for Enhanced RAG Service

## Overview
This guide walks through adding WebSocket support to the Enhanced RAG Go service (`enhanced-rag-service.go`) for real-time legal search streaming.

---

## Part 1: WebSocket Endpoint Implementation

### Step 1: Add WebSocket Dependencies

Update `go-microservice/go.mod`:

```go
require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gorilla/websocket v1.5.1  // ⭐ ADD THIS
    github.com/jackc/pgx/v5 v5.5.0
    github.com/minio/minio-go/v7 v7.0.63
    github.com/pgvector/pgvector-go v0.1.1
    // ... existing dependencies
)
```

Run:
```bash
cd go-microservice
go get github.com/gorilla/websocket@latest
go mod tidy
```

---

### Step 2: Create WebSocket Handler File

**File**: `go-microservice/websocket-handler.go`

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WebSocket upgrader with CORS support
var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins in development (restrict in production)
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	HandshakeTimeout: 10 * time.Second,
}

// WebSocket message types
type WSMessageType string

const (
	WSSearchQuery        WSMessageType = "search_query"
	WSSearchResultChunk  WSMessageType = "search_result_chunk"
	WSSearchCompleted    WSMessageType = "search_completed"
	WSSearchError        WSMessageType = "search_error"
	WSSearchProgress     WSMessageType = "search_progress"
	WSPing               WSMessageType = "ping"
	WSPong               WSMessageType = "pong"
)

// WebSocket message structure
type WSMessage struct {
	Type      WSMessageType `json:"type"`
	SearchID  string        `json:"searchId,omitempty"`
	Data      interface{}   `json:"data"`
	Timestamp int64         `json:"timestamp"`
}

// WebSocket client connection manager
type WSClient struct {
	conn       *websocket.Conn
	send       chan WSMessage
	ragService *RAGService
	mu         sync.Mutex
}

// WebSocket connection pool
type WSHub struct {
	clients    map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan WSMessage
	mu         sync.RWMutex
}

var wsHub = &WSHub{
	clients:    make(map[*WSClient]bool),
	register:   make(chan *WSClient),
	unregister: make(chan *WSClient),
	broadcast:  make(chan WSMessage),
}

// Start WebSocket hub (call in main)
func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("✅ WebSocket client connected (total: %d)", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("❌ WebSocket client disconnected (total: %d)", len(h.clients))

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Handle WebSocket upgrade and connection
func HandleWebSocketLegalSearch(c *gin.Context, ragService *RAGService) {
	// Upgrade HTTP connection to WebSocket
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("❌ WebSocket upgrade failed: %v", err)
		return
	}

	client := &WSClient{
		conn:       conn,
		send:       make(chan WSMessage, 256),
		ragService: ragService,
	}

	wsHub.register <- client

	// Start goroutines for read/write
	go client.writePump()
	go client.readPump()

	log.Println("🚀 WebSocket connection established for legal search")
}

// Read messages from WebSocket client
func (c *WSClient) readPump() {
	defer func() {
		wsHub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg WSMessage
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("⚠️ WebSocket read error: %v", err)
			}
			break
		}

		// Handle different message types
		c.handleMessage(msg)
	}
}

// Write messages to WebSocket client
func (c *WSClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteJSON(message); err != nil {
				log.Printf("❌ WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Handle incoming WebSocket messages
func (c *WSClient) handleMessage(msg WSMessage) {
	switch msg.Type {
	case WSSearchQuery:
		c.handleSearchQuery(msg)
	case WSPing:
		c.send <- WSMessage{
			Type:      WSPong,
			Timestamp: time.Now().Unix(),
		}
	default:
		log.Printf("⚠️ Unknown message type: %s", msg.Type)
	}
}

// Handle real-time search query
func (c *WSClient) handleSearchQuery(msg WSMessage) {
	// Parse search query
	queryData, ok := msg.Data.(map[string]interface{})
	if !ok {
		c.sendError(msg.SearchID, "Invalid query data")
		return
	}

	query, _ := queryData["query"].(string)
	if query == "" {
		c.sendError(msg.SearchID, "Query is required")
		return
	}

	// Send progress update
	c.send <- WSMessage{
		Type:      WSSearchProgress,
		SearchID:  msg.SearchID,
		Data:      map[string]interface{}{"status": "embedding", "progress": 0.25},
		Timestamp: time.Now().Unix(),
	}

	// Generate embedding (simulated - replace with actual RAG call)
	time.Sleep(100 * time.Millisecond)

	// Send progress update
	c.send <- WSMessage{
		Type:      WSSearchProgress,
		SearchID:  msg.SearchID,
		Data:      map[string]interface{}{"status": "searching", "progress": 0.50},
		Timestamp: time.Now().Unix(),
	}

	// Perform vector search (simulated - replace with actual RAG call)
	results := c.performStreamingSearch(query, msg.SearchID)

	// Send results in chunks (streaming)
	for i, chunk := range results {
		c.send <- WSMessage{
			Type:     WSSearchResultChunk,
			SearchID: msg.SearchID,
			Data: map[string]interface{}{
				"results": []interface{}{chunk},
				"chunk":   i + 1,
				"total":   len(results),
			},
			Timestamp: time.Now().Unix(),
		}
		time.Sleep(50 * time.Millisecond) // Simulate streaming delay
	}

	// Send completion
	c.send <- WSMessage{
		Type:     WSSearchCompleted,
		SearchID: msg.SearchID,
		Data: map[string]interface{}{
			"totalResults": len(results),
			"success":      true,
		},
		Timestamp: time.Now().Unix(),
	}
}

// Perform streaming search (integrate with RAGService)
func (c *WSClient) performStreamingSearch(query string, searchID string) []map[string]interface{} {
	// TODO: Replace with actual RAG service call
	// For now, return mock data
	return []map[string]interface{}{
		{
			"id":       "case_001",
			"title":    "Contract Law Precedent",
			"content":  "Relevant legal precedent for " + query,
			"score":    0.95,
			"type":     "case",
			"realTime": true,
		},
		{
			"id":      "statute_002",
			"title":   "Relevant Statute",
			"content": "Legal statute matching " + query,
			"score":   0.88,
			"type":    "statute",
			"realTime": true,
		},
	}
}

// Send error message
func (c *WSClient) sendError(searchID string, errorMsg string) {
	c.send <- WSMessage{
		Type:     WSSearchError,
		SearchID: searchID,
		Data: map[string]interface{}{
			"error": errorMsg,
		},
		Timestamp: time.Now().Unix(),
	}
}
```

---

### Step 3: Integrate WebSocket into Enhanced RAG Service

**Update**: `go-microservice/enhanced-rag-service.go`

Add WebSocket route to the existing Gin router:

```go
// Find the setupRoutes function (around line 700)
func setupRoutes(router *gin.Engine, ragService *RAGService) {
	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":       "healthy",
			"service":      "enhanced-rag",
			"port":         ServicePort,
			"queries":      ragService.queriesHandled,
			"indexed_docs": ragService.documentsIndexed,
			"websocket":    "enabled", // ⭐ ADD THIS
		})
	})

	// ⭐ ADD WEBSOCKET ENDPOINT
	router.GET("/ws/legal-search-client", func(c *gin.Context) {
		HandleWebSocketLegalSearch(c, ragService)
	})

	// Existing routes...
	api := router.Group("/api/v1")
	{
		api.POST("/rag/query", handleRAGQuery(ragService))
		api.POST("/rag/upload", handleDocumentUpload(ragService))
		// ... other routes
	}
}
```

**Update main() function**:

```go
func main() {
	// ... existing initialization

	// ⭐ START WEBSOCKET HUB
	go wsHub.Run()
	log.Println("🔌 WebSocket hub started")

	// Setup routes
	setupRoutes(router, ragService)

	// Start server
	log.Printf("🚀 Enhanced RAG Service with WebSocket starting on port %s", ServicePort)
	if err := router.Run(":" + ServicePort); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
```

---

### Step 4: Build and Test

```bash
# Build the service
cd go-microservice
go build -o enhanced-rag-service.exe enhanced-rag-service.go websocket-handler.go

# Run the service
.\enhanced-rag-service.exe
```

**Expected Output**:
```
🔌 WebSocket hub started
🚀 Enhanced RAG Service with WebSocket starting on port 8095
[GIN] Listening on :8095
```

---

### Step 5: Test WebSocket Connection

**Test with JavaScript** (run in browser console):

```javascript
const ws = new WebSocket('ws://localhost:8095/ws/legal-search-client');

ws.onopen = () => {
  console.log('✅ WebSocket connected');

  // Send search query
  ws.send(JSON.stringify({
    type: 'search_query',
    searchId: 'test_' + Date.now(),
    data: {
      query: 'contract law precedents'
    },
    timestamp: Date.now()
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('📨 Received:', msg.type, msg.data);
};

ws.onerror = (error) => {
  console.error('❌ WebSocket error:', error);
};

ws.onclose = () => {
  console.log('🔌 WebSocket closed');
};
```

---

## Part 2: Integration with Frontend

Your `real-time-search.ts` service will now connect successfully:

```typescript
// The WebSocket connection in real-time-search.ts will work:
this.ws = new WebSocket('ws://localhost:8095/ws/legal-search-client');

// ✅ Connection will succeed
// ✅ No more ConnectionResetError
// ✅ Real-time streaming enabled
```

---

## Performance Optimizations

### 1. Connection Pooling
```go
const MaxWebSocketClients = 1000

func (h *WSHub) Run() {
    // Add client limit check
    if len(h.clients) >= MaxWebSocketClients {
        log.Println("⚠️ Max WebSocket clients reached")
        return
    }
    // ... existing code
}
```

### 2. Message Compression
```go
var wsUpgrader = websocket.Upgrader{
    // ... existing config
    EnableCompression: true, // ⭐ ADD THIS
}
```

### 3. Rate Limiting
```go
type WSClient struct {
    // ... existing fields
    lastMessageTime time.Time
    messageCount    int
}

func (c *WSClient) handleMessage(msg WSMessage) {
    // Rate limit: max 10 messages per second
    if time.Since(c.lastMessageTime) < 100*time.Millisecond {
        c.messageCount++
        if c.messageCount > 10 {
            c.sendError("", "Rate limit exceeded")
            return
        }
    } else {
        c.messageCount = 0
    }
    c.lastMessageTime = time.Now()

    // ... existing code
}
```

---

## Next Steps

1. ✅ **WebSocket endpoint created** on port 8095
2. ⏳ **Integrate with actual RAG queries** (replace mock data)
3. ⏳ **Add authentication** (JWT token validation)
4. ⏳ **Implement Redis pub/sub** for multi-instance support
5. ⏳ **Add WebTransport/QUIC** (see separate guide)

---

## Troubleshooting

### Issue: "bind: address already in use"
**Solution**: Kill existing process on port 8095
```bash
# Windows
netstat -ano | findstr :8095
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:8095 | xargs kill -9
```

### Issue: WebSocket upgrade fails
**Solution**: Check CORS settings
```go
var wsUpgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        origin := r.Header.Get("Origin")
        log.Printf("WebSocket origin: %s", origin)
        return true // Allow all in dev
    },
}
```

### Issue: Connection closes immediately
**Solution**: Check client-side WebSocket event handlers
```javascript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
  console.log('ReadyState:', ws.readyState);
};
```

---

**Status**: ✅ **READY FOR IMPLEMENTATION**
**Complexity**: 🟡 **MEDIUM**
**Estimated Time**: ⏱️ **2-3 hours**
**Impact**: 🚀 **HIGH** - Enables real-time legal search

