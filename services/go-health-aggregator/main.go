// go-health-aggregator: single /healthz endpoint that probes all local services.
// Aggregates HTTP + gRPC health into one JSON response for the start-all script
// and the /api/infrastructure/status SvelteKit route.
//
// Build:  go build -o health-aggregator.exe .
// Run:    ./health-aggregator.exe          (listens :8090)
//
//	PORT=9090 ./health-aggregator    (custom port)
package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// ── types ────────────────────────────────────────────────────────────────────

type ServiceStatus struct {
	Name    string `json:"name"`
	Healthy bool   `json:"healthy"`
	Latency string `json:"latency,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

type HealthResponse struct {
	OK        bool            `json:"ok"`
	Timestamp string          `json:"timestamp"`
	Services  []ServiceStatus `json:"services"`
}

// ── HTTP probe ───────────────────────────────────────────────────────────────

func checkHTTP(name, url string) ServiceStatus {
	start := time.Now()
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	lat := time.Since(start).Truncate(time.Millisecond).String()
	if err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat, Detail: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		return ServiceStatus{Name: name, Healthy: true, Latency: lat}
	}
	return ServiceStatus{Name: name, Healthy: false, Latency: lat, Detail: resp.Status}
}

func checkPostgres(name, address, user, database string) ServiceStatus {
	start := time.Now()
	conn, err := net.DialTimeout("tcp", address, 3*time.Second)
	lat := func() string { return time.Since(start).Truncate(time.Millisecond).String() }
	if err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: err.Error()}
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))

	params := []string{"user", user, "database", database, "application_name", "go-health-aggregator"}
	body := make([]byte, 4, 4+len(params)*32+1)
	binary.BigEndian.PutUint32(body, 196608)
	for _, value := range params {
		body = append(body, value...)
		body = append(body, 0)
	}
	body = append(body, 0)
	packet := make([]byte, 4, 4+len(body))
	binary.BigEndian.PutUint32(packet, uint32(4+len(body)))
	packet = append(packet, body...)
	if _, err := conn.Write(packet); err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: err.Error()}
	}

	var header [5]byte
	if _, err := io.ReadFull(conn, header[:]); err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: "invalid PostgreSQL protocol response"}
	}
	messageLength := binary.BigEndian.Uint32(header[1:])
	if messageLength < 4 || messageLength > 1<<20 {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: "invalid PostgreSQL response length"}
	}
	messageBody := make([]byte, messageLength-4)
	if _, err := io.ReadFull(conn, messageBody); err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: "incomplete PostgreSQL protocol response"}
	}
	if header[0] == 'E' {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: "PostgreSQL rejected startup parameters"}
	}
	if header[0] != 'R' && header[0] != 'S' && header[0] != 'Z' {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat(), Detail: fmt.Sprintf("unexpected PostgreSQL response type %q", header[0])}
	}
	return ServiceStatus{Name: name, Healthy: true, Latency: lat()}
}

// ── gRPC probe ───────────────────────────────────────────────────────────────

func checkGRPC(name, addr string) ServiceStatus {
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	lat := time.Since(start).Truncate(time.Millisecond).String()
	if err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat, Detail: err.Error()}
	}
	defer conn.Close()

	hc := healthpb.NewHealthClient(conn)
	res, err := hc.Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil {
		return ServiceStatus{Name: name, Healthy: false, Latency: lat, Detail: err.Error()}
	}
	if res.Status == healthpb.HealthCheckResponse_SERVING {
		return ServiceStatus{Name: name, Healthy: true, Latency: lat}
	}
	return ServiceStatus{Name: name, Healthy: false, Latency: lat, Detail: res.Status.String()}
}

// ── service registry ─────────────────────────────────────────────────────────

type probe struct {
	required bool
	fn       func() ServiceStatus
}

func buildProbes() []probe {
	return []probe{
		// Required
		{true, func() ServiceStatus { return checkHTTP("ollama", "http://127.0.0.1:11434/api/tags") }},
		{true, func() ServiceStatus { return checkHTTP("qdrant", "http://127.0.0.1:6333/collections") }},
		{true, func() ServiceStatus {
			host := os.Getenv("POSTGRES_HOST")
			if host == "" {
				host = "127.0.0.1"
			}
			port := os.Getenv("POSTGRES_PORT")
			if port == "" {
				port = "5434"
			}
			user := os.Getenv("POSTGRES_USER")
			if user == "" {
				user = "legal_admin"
			}
			database := os.Getenv("POSTGRES_DB")
			if database == "" {
				database = "legal_ai_db"
			}
			return checkPostgres("postgres", net.JoinHostPort(host, port), user, database)
		}},
		// Optional HTTP
		{false, func() ServiceStatus { return checkHTTP("redis", "http://127.0.0.1:6379") }},
		{false, func() ServiceStatus { return checkHTTP("rabbitmq", "http://127.0.0.1:15672/") }},
		{false, func() ServiceStatus { return checkHTTP("neo4j", "http://127.0.0.1:7474") }},
		{false, func() ServiceStatus { return checkHTTP("minio", "http://127.0.0.1:9000/minio/health/live") }},
		{false, func() ServiceStatus { return checkHTTP("bifrost", "http://127.0.0.1:3040/health") }},
		{false, func() ServiceStatus { return checkHTTP("langfuse", "http://127.0.0.1:3030") }},
		{false, func() ServiceStatus { return checkHTTP("go-search", "http://127.0.0.1:8096/health") }},
		{false, func() ServiceStatus { return checkHTTP("go-embedding", "http://127.0.0.1:8097/health") }},
		{false, func() ServiceStatus { return checkHTTP("go-retrieval", "http://127.0.0.1:8100/health") }},
		{false, func() ServiceStatus { return checkHTTP("langgraph", "http://127.0.0.1:8101/health") }},
		{false, func() ServiceStatus { return checkHTTP("llama-server", "http://127.0.0.1:8080/slots") }},
		// Optional gRPC
		{false, func() ServiceStatus { return checkGRPC("embedding-grpc", "127.0.0.1:50051") }},
		{false, func() ServiceStatus { return checkGRPC("retrieval-grpc", "127.0.0.1:50053") }},
		{false, func() ServiceStatus { return checkGRPC("graphml-grpc", "127.0.0.1:50056") }},
	}
}

// ── handler ──────────────────────────────────────────────────────────────────

func healthzHandler(w http.ResponseWriter, r *http.Request) {
	probes := buildProbes()

	statuses := make([]ServiceStatus, len(probes))
	var wg sync.WaitGroup
	for i, p := range probes {
		i, p := i, p
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses[i] = p.fn()
		}()
	}
	wg.Wait()

	ok := true
	for i, p := range probes {
		if p.required && !statuses[i].Healthy {
			ok = false
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if !ok {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	_ = json.NewEncoder(w).Encode(HealthResponse{
		OK:        ok,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Services:  statuses,
	})
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

// ── main ─────────────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", healthzHandler)
	mux.HandleFunc("/readyz", readyHandler)

	log.Printf("health-aggregator listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
