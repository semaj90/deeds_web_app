package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type ServiceConfig struct {
	Name     string `json:"name"`
	UUID     string `json:"uuid"`
	Port     int    `json:"port"`
	Endpoint string `json:"endpoint"`
}

func wsHandler(serviceName string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("❌ [%s] Upgrade error: %v\n", serviceName, err)
			return
		}
		defer conn.Close()

		log.Printf("✅ [%s] Client connected from %s\n", serviceName, r.RemoteAddr)

		// Enhanced RAG specific handler
		if serviceName == "enhanced-rag" {
			handleEnhancedRAG(conn)
			return
		}

		// Keepalive ticker for other services
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		done := make(chan struct{})

		go func() {
			defer close(done)
			for {
				_, msg, err := conn.ReadMessage()
				if err != nil {
					log.Printf("❌ [%s] Read error: %v\n", serviceName, err)
					return
				}

				if string(msg) == "ping" {
					conn.WriteMessage(websocket.TextMessage, []byte("pong"))
					continue
				}

				log.Printf("📨 [%s] Received: %s\n", serviceName, msg)
				response := fmt.Sprintf("[%s] Echo: %s", serviceName, msg)
				if err := conn.WriteMessage(websocket.TextMessage, []byte(response)); err != nil {
					return
				}
			}
		}()

		for {
			select {
			case <-ticker.C:
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}
}

// Enhanced RAG handler with legal search capabilities
func handleEnhancedRAG(conn *websocket.Conn) {
	defer conn.Close()

	// Keep connection alive
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		var request map[string]interface{}
		if err := conn.ReadJSON(&request); err != nil {
			log.Printf("🔌 [enhanced-rag] Client disconnected: %v", err)
			return
		}

		requestType, _ := request["type"].(string)
		query, _ := request["query"].(string)

		log.Printf("📨 [enhanced-rag] Request: %s - %s", requestType, query)

		var response map[string]interface{}
		switch requestType {
		case "legal_search":
			response = processLegalSearch(query, request)
		case "document_analysis":
			response = processDocumentAnalysis(query, request)
		case "similarity_search":
			response = processSimilaritySearch(query, request)
		case "ping":
			response = map[string]interface{}{
				"type":      "pong",
				"status":    "connected",
				"timestamp": time.Now().Format(time.RFC3339),
			}
		default:
			response = map[string]interface{}{
				"status":    "error",
				"message":   "Unknown request type",
				"timestamp": time.Now().Format(time.RFC3339),
			}
		}

		response["service"] = "enhanced-rag"
		if err := conn.WriteJSON(response); err != nil {
			log.Printf("❌ [enhanced-rag] Write error: %v", err)
			return
		}
	}
}

func processLegalSearch(query string, context map[string]interface{}) map[string]interface{} {
	// Mock implementation - integrate with actual RAG service on port 8095
	return map[string]interface{}{
		"status":    "success",
		"type":      "legal_search",
		"query":     query,
		"timestamp": time.Now().Format(time.RFC3339),
		"results": []map[string]interface{}{
			{
				"id":         uuid.New().String(),
				"title":      "Relevant Case Law",
				"type":       "case",
				"content":    "Mock legal search result for: " + query,
				"score":      0.95,
				"similarity": 0.92,
				"metadata": map[string]interface{}{
					"jurisdiction": "US",
					"date":        "2024-01-01",
					"status":      "final",
				},
			},
		},
	}
}

func processDocumentAnalysis(query string, context map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{
		"status":    "success",
		"type":      "document_analysis",
		"timestamp": time.Now().Format(time.RFC3339),
		"analysis": map[string]interface{}{
			"summary":    "Mock document analysis",
			"key_points": []string{"Point 1", "Point 2"},
			"entities":   []string{"Entity 1", "Entity 2"},
		},
	}
}

func processSimilaritySearch(query string, context map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{
		"status":    "success",
		"type":      "similarity_search",
		"timestamp": time.Now().Format(time.RFC3339),
		"similar_documents": []map[string]interface{}{
			{
				"id":         "doc1",
				"title":      "Similar Document 1",
				"similarity": 0.88,
			},
			{
				"id":         "doc2",
				"title":      "Similar Document 2",
				"similarity": 0.82,
			},
		},
	}
}

func pickPortInRange(start, end int) (net.Listener, int, error) {
	for port := start; port <= end; port++ {
		addr := fmt.Sprintf(":%d", port)
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			return ln, port, nil
		}
	}
	return nil, 0, fmt.Errorf("no free port in range %d-%d", start, end)
}

func main() {
	// Define WebSocket services
	services := map[string]http.HandlerFunc{
		"rag":          wsHandler("rag"),
		"chat":         wsHandler("chat"),
		"canvas":       wsHandler("canvas"),
		"notifications": wsHandler("notifications"),
		"enhanced-rag": wsHandler("enhanced-rag"), // New legal search service
	}

	var configs []ServiceConfig
	envContent := ""
	caddyUpstreams := ""

	for name, handler := range services {
		ln, port, err := pickPortInRange(5173, 5199)
		if err != nil {
			log.Fatalf("❌ Failed to allocate port for %s: %v", name, err)
		}

		serviceUUID := uuid.New().String()
		endpoint := fmt.Sprintf("/ws/%s", serviceUUID)

		config := ServiceConfig{
			Name:     name,
			UUID:     serviceUUID,
			Port:     port,
			Endpoint: endpoint,
		}
		configs = append(configs, config)

		// Write to .env.local for Vite
		envContent += fmt.Sprintf("VITE_WS_%s_UUID=%s\nVITE_WS_%s_PORT=%d\n", name, serviceUUID, name, port)

		// Generate Caddy upstream config
		caddyUpstreams += fmt.Sprintf("  @%s path %s*\n  reverse_proxy @%s localhost:%d\n\n", name, endpoint, name, port)

		log.Printf("🚀 [%s] Service → ws://localhost:%d%s\n", name, port, endpoint)

		// Start WebSocket server
		mux := http.NewServeMux()
		mux.HandleFunc(endpoint, handler)
		mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]string{
				"service": name,
				"status":  "healthy",
				"uuid":    serviceUUID,
			})
		})

		go func(ln net.Listener, mux *http.ServeMux, svcName string) {
			if err := http.Serve(ln, mux); err != nil {
				log.Printf("❌ [%s] Server error: %v", svcName, err)
			}
		}(ln, mux, name)
	}

	// Write service registry
	registryPath := filepath.Join("..", "..", "sveltekit-frontend", ".ws-registry.json")
	registryData, _ := json.MarshalIndent(configs, "", "  ")
	os.WriteFile(registryPath, registryData, 0644)
	log.Printf("✅ Wrote service registry to %s\n", registryPath)

	// Write .env.local for Vite
	envPath := filepath.Join("..", "..", "sveltekit-frontend", ".env.local")
	os.WriteFile(envPath, []byte(envContent), 0644)
	log.Printf("✅ Wrote environment config to %s\n", envPath)

	// Write Caddyfile snippet
	caddyPath := filepath.Join("..", "..", "Caddyfile.ws")
	caddyContent := fmt.Sprintf("# Auto-generated WebSocket upstreams\n\n%s", caddyUpstreams)
	os.WriteFile(caddyPath, []byte(caddyContent), 0644)
	log.Printf("✅ Wrote Caddy config to %s\n", caddyPath)

	log.Println("🎯 WebSocket orchestrator ready!")
	select {} // Keep alive
}
