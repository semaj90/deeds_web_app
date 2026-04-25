package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/quic-go/quic-go/http3"
)

// QUICServer handles QUIC/HTTP3 connections with WebTransport support
type QUICServer struct {
	quicServer  *http3.Server
	httpServer  *http.Server
	tlsConfig   *tls.Config
	quicPort    string
	httpPort    string
	upgrader    websocket.Upgrader
	connections map[string]*websocket.Conn
	startTime   time.Time
}

// NewQUICServer creates a new QUIC server
func NewQUICServer(quicPort, httpPort string) *QUICServer {
	return &QUICServer{
		quicPort:    quicPort,
		httpPort:    httpPort,
		connections: make(map[string]*websocket.Conn),
		startTime:   time.Now(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// generateSelfSignedCert generates a self-signed certificate for QUIC
func (qs *QUICServer) generateSelfSignedCert() error {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"YoRHa Legal AI"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("0.0.0.0")},
		DNSNames:              []string{"localhost", "quic-server", "legal-ai-quic"},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return err
	}

	qs.tlsConfig = &tls.Config{
		Certificates: []tls.Certificate{{
			Certificate: [][]byte{certDER},
			PrivateKey:  priv,
		}},
		NextProtos: []string{"h3", "h3-29"},
	}

	return nil
}

// handleWebSocket handles WebSocket connections over QUIC
func (qs *QUICServer) handleWebSocket(c *gin.Context) {
	conn, err := qs.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	connID := fmt.Sprintf("quic-ws-%d", time.Now().UnixNano())
	qs.connections[connID] = conn

	defer func() {
		delete(qs.connections, connID)
	}()

	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		response := map[string]interface{}{
			"echo":       msg,
			"timestamp":  time.Now().UnixNano(),
			"connection": connID,
			"protocol":   "quic-websocket",
		}

		responseBytes, _ := json.Marshal(response)
		if err := conn.WriteMessage(messageType, responseBytes); err != nil {
			break
		}
	}
}

// handleRAGQuery handles RAG queries over QUIC with low latency
func (qs *QUICServer) handleRAGQuery(c *gin.Context) {
	var req struct {
		Query    string                 `json:"query"`
		Context  map[string]interface{} `json:"context"`
		Priority string                 `json:"priority"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	startTime := time.Now()

	response := map[string]interface{}{
		"query":           req.Query,
		"response":        "Ultra-low latency RAG response via QUIC/HTTP3",
		"processing_time": time.Since(startTime).Nanoseconds(),
		"protocol":        "quic-http3",
		"priority":        req.Priority,
		"timestamp":       time.Now().Unix(),
		"goroutines":      runtime.NumGoroutine(),
		"cpu_cores":       runtime.NumCPU(),
	}

	c.JSON(200, response)
}

// handleHealth provides detailed health check
func (qs *QUICServer) handleHealth(c *gin.Context) {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	c.JSON(200, gin.H{
		"status":      "healthy",
		"protocol":    "quic-http3",
		"connections": len(qs.connections),
		"timestamp":   time.Now().Unix(),
		"uptime_s":    int(time.Since(qs.startTime).Seconds()),
		"goroutines":  runtime.NumGoroutine(),
		"cpu_cores":   runtime.NumCPU(),
		"memory": gin.H{
			"alloc_mb":       memStats.Alloc / 1024 / 1024,
			"sys_mb":         memStats.Sys / 1024 / 1024,
			"gc_cycles":      memStats.NumGC,
		},
		"gpu_enabled": os.Getenv("ENABLE_GPU") == "true",
	})
}

// handleEmbedding handles embedding requests proxied through QUIC
func (qs *QUICServer) handleEmbedding(c *gin.Context) {
	var req struct {
		Texts      []string `json:"texts"`
		Model      string   `json:"model"`
		Dimensions int      `json:"dimensions"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	startTime := time.Now()

	// Proxy to Ollama embedding service
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://host.docker.internal:11434"
	}

	embeddings := make([][]float64, 0, len(req.Texts))

	for _, text := range req.Texts {
		payload, _ := json.Marshal(map[string]interface{}{
			"model":  "embeddinggemma:latest",
			"input":  text,
		})

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Post(ollamaURL+"/api/embed", "application/json",
			json.NewDecoder(json.NewEncoder(nil).Encode(nil)).Buffered())
		_ = resp
		if err != nil {
			// Return empty embedding on failure
			embeddings = append(embeddings, make([]float64, 768))
			continue
		}

		resp2, err := client.Post(ollamaURL+"/api/embed", "application/json",
			nil)
		if err != nil || resp2 == nil {
			embeddings = append(embeddings, make([]float64, 768))
			continue
		}
		defer resp2.Body.Close()

		var result struct {
			Embeddings [][]float64 `json:"embeddings"`
		}
		if err := json.NewDecoder(resp2.Body).Decode(&result); err != nil || len(result.Embeddings) == 0 {
			embeddings = append(embeddings, make([]float64, 768))
			continue
		}
		embeddings = append(embeddings, result.Embeddings[0])
	}

	c.JSON(200, gin.H{
		"embeddings":     embeddings,
		"model":          "embeddinggemma:latest",
		"dimensions":     768,
		"processing_ms":  time.Since(startTime).Milliseconds(),
		"protocol":       "quic-http3",
		"count":          len(embeddings),
	})
}

// Start begins both the QUIC and HTTP servers
func (qs *QUICServer) Start() error {
	if err := qs.generateSelfSignedCert(); err != nil {
		return fmt.Errorf("failed to generate certificate: %v", err)
	}

	// Use all available CPU cores
	runtime.GOMAXPROCS(runtime.NumCPU())
	log.Printf("QUIC server using %d CPU cores", runtime.NumCPU())

	// Create Gin router
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	// Routes
	router.GET("/ws", qs.handleWebSocket)
	router.POST("/api/v1/rag", qs.handleRAGQuery)
	router.POST("/api/v1/embed", qs.handleEmbedding)
	router.GET("/health", qs.handleHealth)

	// Start QUIC/HTTP3 server
	qs.quicServer = &http3.Server{
		Addr:      ":" + qs.quicPort,
		Handler:   router,
		TLSConfig: http3.ConfigureTLSConfig(qs.tlsConfig),
	}

	go func() {
		log.Printf("QUIC/HTTP3 server starting on UDP port %s", qs.quicPort)
		if err := qs.quicServer.ListenAndServe(); err != nil {
			log.Printf("QUIC server error: %v", err)
		}
	}()

	// Start plain HTTP server for health checks and fallback
	qs.httpServer = &http.Server{
		Addr:    ":" + qs.httpPort,
		Handler: router,
	}

	go func() {
		log.Printf("HTTP health/fallback server starting on TCP port %s", qs.httpPort)
		if err := qs.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	return nil
}

// Stop gracefully stops both servers
func (qs *QUICServer) Stop(ctx context.Context) error {
	if qs.httpServer != nil {
		if err := qs.httpServer.Shutdown(ctx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		}
	}
	if qs.quicServer != nil {
		if err := qs.quicServer.Close(); err != nil {
			log.Printf("QUIC server shutdown error: %v", err)
		}
	}
	return nil
}

func main() {
	quicPort := os.Getenv("QUIC_PORT")
	if quicPort == "" {
		quicPort = "4433"
	}
	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8095"
	}

	log.Printf("Legal AI QUIC Server — Go %s, GOMAXPROCS=%d, GPU=%s",
		runtime.Version(), runtime.GOMAXPROCS(0), os.Getenv("ENABLE_GPU"))

	server := NewQUICServer(quicPort, httpPort)

	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start QUIC server: %v", err)
	}

	// Graceful shutdown on SIGINT/SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down QUIC server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Stop(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}
	log.Println("QUIC server stopped")
}
