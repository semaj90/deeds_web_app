// gRPC Service Registry for Legal AI Platform
// Coordinates communication between 37 Go microservices using Protocol Buffers

package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

// ServiceRegistry manages all gRPC services in the legal AI platform
type ServiceRegistry struct {
	mu       sync.RWMutex
	services map[string]*ServiceInfo
	server   *grpc.Server
	listener net.Listener
}

// ServiceInfo contains metadata about each microservice
type ServiceInfo struct {
	Name        string
	Port        int
	Status      string
	LastHealth  time.Time
	GRPCClient  grpc.ClientConnInterface
	HTTPFallback string
}

// Legal AI Platform Service Definitions
var PlatformServices = map[string]*ServiceInfo{
	// Core AI Services
	"legal-gateway":           {Name: "legal-gateway", Port: 8080, HTTPFallback: "http://localhost:8080"},
	"enhanced-rag":           {Name: "enhanced-rag", Port: 8094, HTTPFallback: "http://localhost:8094"},
	"gpu-orchestrator":       {Name: "gpu-orchestrator", Port: 8095, HTTPFallback: "http://localhost:8095"},
	"cognitive-microservice": {Name: "cognitive-microservice", Port: 8096, HTTPFallback: "http://localhost:8096"},
	"cuda-service-worker":    {Name: "cuda-service-worker", Port: 8097, HTTPFallback: "http://localhost:8097"},

	// Legal Analysis Services
	"legal-ai-inference":     {Name: "legal-ai-inference", Port: 8100, HTTPFallback: "http://localhost:8100"},
	"case-scoring":          {Name: "case-scoring", Port: 8101, HTTPFallback: "http://localhost:8101"},
	"precedent-search":      {Name: "precedent-search", Port: 8102, HTTPFallback: "http://localhost:8102"},
	"document-classifier":   {Name: "document-classifier", Port: 8103, HTTPFallback: "http://localhost:8103"},
	"entity-extractor":      {Name: "entity-extractor", Port: 8104, HTTPFallback: "http://localhost:8104"},

	// Vector & Embedding Services
	"vector-search":         {Name: "vector-search", Port: 8110, HTTPFallback: "http://localhost:8110"},
	"embedding-generator":   {Name: "embedding-generator", Port: 8111, HTTPFallback: "http://localhost:8111"},
	"similarity-engine":     {Name: "similarity-engine", Port: 8112, HTTPFallback: "http://localhost:8112"},
	"semantic-analyzer":     {Name: "semantic-analyzer", Port: 8113, HTTPFallback: "http://localhost:8113"},

	// Storage & Cache Services
	"tensor-cache":          {Name: "tensor-cache", Port: 8120, HTTPFallback: "http://localhost:8120"},
	"redis-orchestrator":    {Name: "redis-orchestrator", Port: 8121, HTTPFallback: "http://localhost:8121"},
	"minio-gateway":         {Name: "minio-gateway", Port: 8122, HTTPFallback: "http://localhost:8122"},
	"qdrant-proxy":          {Name: "qdrant-proxy", Port: 8123, HTTPFallback: "http://localhost:8123"},

	// Streaming & Real-time Services
	"quic-streaming":        {Name: "quic-streaming", Port: 8130, HTTPFallback: "http://localhost:8130"},
	"websocket-gateway":     {Name: "websocket-gateway", Port: 8131, HTTPFallback: "http://localhost:8131"},
	"rabbitmq-coordinator":  {Name: "rabbitmq-coordinator", Port: 8132, HTTPFallback: "http://localhost:8132"},
	"nats-streaming":        {Name: "nats-streaming", Port: 8133, HTTPFallback: "http://localhost:8133"},

	// Monitoring & Health Services
	"health-monitor":        {Name: "health-monitor", Port: 8140, HTTPFallback: "http://localhost:8140"},
	"metrics-collector":     {Name: "metrics-collector", Port: 8141, HTTPFallback: "http://localhost:8141"},
	"performance-analyzer":  {Name: "performance-analyzer", Port: 8142, HTTPFallback: "http://localhost:8142"},
	"resource-manager":      {Name: "resource-manager", Port: 8143, HTTPFallback: "http://localhost:8143"},

	// Authentication & Security
	"auth-service":          {Name: "auth-service", Port: 8150, HTTPFallback: "http://localhost:8150"},
	"session-manager":       {Name: "session-manager", Port: 8151, HTTPFallback: "http://localhost:8151"},
	"security-gateway":      {Name: "security-gateway", Port: 8152, HTTPFallback: "http://localhost:8152"},

	// Job Processing & Queue Services
	"job-scheduler":         {Name: "job-scheduler", Port: 8160, HTTPFallback: "http://localhost:8160"},
	"task-coordinator":      {Name: "task-coordinator", Port: 8161, HTTPFallback: "http://localhost:8161"},
	"worker-pool":           {Name: "worker-pool", Port: 8162, HTTPFallback: "http://localhost:8162"},
	"queue-manager":         {Name: "queue-manager", Port: 8163, HTTPFallback: "http://localhost:8163"},

	// Specialized AI Services
	"ocr-processor":         {Name: "ocr-processor", Port: 8170, HTTPFallback: "http://localhost:8170"},
	"nlp-analyzer":          {Name: "nlp-analyzer", Port: 8171, HTTPFallback: "http://localhost:8171"},
	"sentiment-analyzer":    {Name: "sentiment-analyzer", Port: 8172, HTTPFallback: "http://localhost:8172"},
	"recommendation-engine": {Name: "recommendation-engine", Port: 8173, HTTPFallback: "http://localhost:8173"},

	// Additional Infrastructure Services
	"config-manager":        {Name: "config-manager", Port: 8180, HTTPFallback: "http://localhost:8180"},
	"log-aggregator":        {Name: "log-aggregator", Port: 8181, HTTPFallback: "http://localhost:8181"},
}

// NewServiceRegistry creates a new service registry
func NewServiceRegistry() *ServiceRegistry {
	return &ServiceRegistry{
		services: make(map[string]*ServiceInfo),
		server:   grpc.NewServer(),
	}
}

// InitializeServices initializes all platform services
func (sr *ServiceRegistry) InitializeServices() error {
	sr.mu.Lock()
	defer sr.mu.Unlock()

	// Copy platform services to registry
	for name, info := range PlatformServices {
		sr.services[name] = &ServiceInfo{
			Name:         info.Name,
			Port:         info.Port,
			Status:       "initializing",
			LastHealth:   time.Now(),
			HTTPFallback: info.HTTPFallback,
		}
	}

	log.Printf("Initialized %d platform services", len(sr.services))
	return nil
}

// StartGRPCServer starts the gRPC service registry server
func (sr *ServiceRegistry) StartGRPCServer(port int) error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %v", port, err)
	}

	sr.listener = listener

	// Register health checking
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(sr.server, healthServer)

	// Enable reflection for easier debugging
	reflection.Register(sr.server)

	log.Printf("🚀 gRPC Service Registry starting on port %d", port)
	log.Printf("Managing %d microservices", len(sr.services))

	return sr.server.Serve(listener)
}

// HealthCheck performs health checks on all services
func (sr *ServiceRegistry) HealthCheck() map[string]string {
	sr.mu.RLock()
	defer sr.mu.RUnlock()

	results := make(map[string]string)

	for name, service := range sr.services {
		// TODO: Implement actual gRPC health check
		// For now, mark as healthy if recently seen
		if time.Since(service.LastHealth) < 30*time.Second {
			results[name] = "healthy"
			service.Status = "healthy"
		} else {
			results[name] = "unhealthy"
			service.Status = "unhealthy"
		}
	}

	return results
}

// GetServiceStatus returns the status of all services
func (sr *ServiceRegistry) GetServiceStatus() map[string]*ServiceInfo {
	sr.mu.RLock()
	defer sr.mu.RUnlock()

	// Return a copy to prevent race conditions
	status := make(map[string]*ServiceInfo)
	for name, service := range sr.services {
		status[name] = &ServiceInfo{
			Name:         service.Name,
			Port:         service.Port,
			Status:       service.Status,
			LastHealth:   service.LastHealth,
			HTTPFallback: service.HTTPFallback,
		}
	}

	return status
}

// UpdateServiceStatus updates the status of a specific service
func (sr *ServiceRegistry) UpdateServiceStatus(serviceName, status string) {
	sr.mu.Lock()
	defer sr.mu.Unlock()

	if service, exists := sr.services[serviceName]; exists {
		service.Status = status
		service.LastHealth = time.Now()
	}
}

// GetServiceEndpoint returns the gRPC endpoint for a service
func (sr *ServiceRegistry) GetServiceEndpoint(serviceName string) (string, error) {
	sr.mu.RLock()
	defer sr.mu.RUnlock()

	service, exists := sr.services[serviceName]
	if !exists {
		return "", fmt.Errorf("service %s not found", serviceName)
	}

	return fmt.Sprintf("localhost:%d", service.Port), nil
}

// Shutdown gracefully shuts down the service registry
func (sr *ServiceRegistry) Shutdown() {
	log.Println("🛑 Shutting down gRPC Service Registry...")

	// Stop gRPC server
	sr.server.GracefulStop()

	// Close listener
	if sr.listener != nil {
		sr.listener.Close()
	}

	log.Println("✅ Service Registry shutdown complete")
}

func main() {
	// Default port for service registry
	port := 8080
	if envPort := os.Getenv("GRPC_REGISTRY_PORT"); envPort != "" {
		fmt.Sscanf(envPort, "%d", &port)
	}

	// Create and initialize service registry
	registry := NewServiceRegistry()

	if err := registry.InitializeServices(); err != nil {
		log.Fatalf("Failed to initialize services: %v", err)
	}

	// Start health checking in background
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			results := registry.HealthCheck()
			healthyCount := 0
			for _, status := range results {
				if status == "healthy" {
					healthyCount++
				}
			}
			log.Printf("Health Check: %d/%d services healthy", healthyCount, len(results))
		}
	}()

	// Handle graceful shutdown
	go func() {
		// TODO: Add signal handling for graceful shutdown
	}()

	// Start the gRPC server
	log.Fatal(registry.StartGRPCServer(port))
}