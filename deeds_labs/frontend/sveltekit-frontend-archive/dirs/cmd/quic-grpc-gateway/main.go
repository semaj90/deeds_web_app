// QUIC + gRPC Gateway for High-Performance JSON Streaming
// Go microservice for handling large JSON log streams with QUIC transport

package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"time"

	"github.com/bytedance/sonic"
	"github.com/quic-go/quic-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "your-project/proto/analyzer" // Generated protobuf
)

// Server implements the Analyzer gRPC service
type AnalyzerServer struct {
	pb.UnimplementedAnalyzerServer
	processor *JSONProcessor
}

// JSONProcessor handles JSON parsing with Sonic SIMD
type JSONProcessor struct {
	throughputCounter int64
	lastReport        time.Time
}

// PushJSON implements the gRPC endpoint
func (s *AnalyzerServer) PushJSON(ctx context.Context, req *pb.AnalyzerPayload) (*pb.AnalyzerAck, error) {
	start := time.Now()

	// Parse JSON with Sonic (CPU SIMD acceleration)
	var data interface{}
	if err := sonic.Unmarshal(req.JsonData, &data); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "JSON parse failed: %v", err)
	}

	// Process data (send to workers, Redis, etc.)
	go s.processAsync(req.Id, data, req.Source)

	duration := time.Since(start)

	return &pb.AnalyzerAck{
		Id:           req.Id,
		Accepted:     true,
		ProcessingMs: duration.Milliseconds(),
	}, nil
}

// PushJSONStream handles streaming upload of large JSON files
func (s *AnalyzerServer) PushJSONStream(stream pb.Analyzer_PushJSONStreamServer) error {
	var buffer []byte
	chunkCount := 0
	var lastChunkID string

	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			// stream finished; break to process buffer below
			break
		}
		if err != nil {
			return status.Errorf(codes.Unknown, "Stream error: %v", err)
		}
		// Accumulate payload and track last chunk id
		buffer = append(buffer, chunk.JsonData...)
		lastChunkID = chunk.Id
		chunkCount++
	}

	// Process complete buffer once stream ended
	var data interface{}
	if err := sonic.Unmarshal(buffer, &data); err != nil {
		return status.Errorf(codes.InvalidArgument, "JSON parse failed: %v", err)
	}

	// Async processing without blocking the response
	go s.processAsync(lastChunkID, data, "") // source not available here; pass empty or adapt as needed

	// Send acknowledgment using the last seen chunk id
	return stream.SendAndClose(&pb.AnalyzerAck{
		Id:         lastChunkID,
		Accepted:   true,
		ChunkCount: int32(chunkCount),
	})
}

// processAsync handles async processing after JSON parsing
func (s *AnalyzerServer) processAsync(id string, data interface{}, source string) {
	// Update throughput counter
	s.processor.throughputCounter++

	// Report metrics every second
	if time.Since(s.processor.lastReport) > time.Second {
		log.Printf("Throughput: %d req/s", s.processor.throughputCounter)
		s.processor.throughputCounter = 0
		s.processor.lastReport = time.Now()
	}

	// Send to Redis pub/sub for worker processing
	// publishToRedis(id, data, source)

	// Or send to RabbitMQ queue
	// publishToRabbitMQ(id, data, source)
}

// StartQUICServer starts a QUIC-enabled server for low-latency streaming
func StartQUICServer(addr string, tlsConfig *tls.Config) error {
	listener, err := quic.ListenAddr(addr, tlsConfig, nil)
	if err != nil {
		return fmt.Errorf("QUIC listen failed: %w", err)
	}

	log.Printf("🚀 QUIC server listening on %s", addr)

	for {
		conn, err := listener.Accept(context.Background())
		if err != nil {
			log.Printf("QUIC accept error: %v", err)
			continue
		}

		go handleQUICConnection(conn)
	}
}

// handleQUICConnection processes a QUIC connection
func handleQUICConnection(conn quic.Connection) {
	defer conn.CloseWithError(0, "")

	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil {
			return
		}

		go handleQUICStream(stream)
	}
}

// handleQUICStream processes a QUIC stream
func handleQUICStream(stream quic.Stream) {
	defer stream.Close()

	// Read the entire stream payload (handles arbitrary length)
	data, err := io.ReadAll(stream)
	if err != nil {
		log.Printf("QUIC read error: %v", err)
		return
	}

	// Parse with Sonic
	var parsed interface{}
	if err := sonic.Unmarshal(data, &parsed); err != nil {
		log.Printf("JSON parse error: %v", err)
		_, _ = stream.Write([]byte(fmt.Sprintf(`{"error": "%v"}`, err)))
		return
	}

	// Send acknowledgment
	ack := map[string]interface{}{
		"status":     "ok",
		"size_bytes": len(data),
		"timestamp":  time.Now().Unix(),
	}

	ackJSON, _ := sonic.Marshal(ack)
	_, _ = stream.Write(ackJSON)
}

// loadTLSConfig loads certificate and key paths from env or returns an error.
// Expects CERT_FILE and KEY_FILE env vars or defaults to ./server.crt and ./server.key.
func loadTLSConfig() (*tls.Config, error) {
	certFile := os.Getenv("CERT_FILE")
	if certFile == "" {
		certFile = "./server.crt"
	}
	keyFile := os.Getenv("KEY_FILE")
	if keyFile == "" {
		keyFile = "./server.key"
	}

	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load TLS certificate/key (%s, %s): %w", certFile, keyFile, err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		NextProtos:   []string{"quic-analyzer"},
	}, nil
}

// Main server setup
func main() {
	// Create gRPC server
	grpcServer := grpc.NewServer()

	analyzerServer := &AnalyzerServer{
		processor: &JSONProcessor{
			lastReport: time.Now(),
		},
	}

	pb.RegisterAnalyzerServer(grpcServer, analyzerServer)

	// Start gRPC listener
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	log.Println("🚀 gRPC server listening on :50051")

	// Start gRPC server in goroutine
	go func() {
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC serve error: %v", err)
		}
	}()

	// Start QUIC server with proper TLS config loaded from env/files
	tlsConfig, err := loadTLSConfig()
	if err != nil {
		log.Fatalf("TLS configuration error: %v", err)
	}

	if err := StartQUICServer(":4433", tlsConfig); err != nil {
		log.Fatalf("QUIC server error: %v", err)
	}
}

// Benchmark results (expected with Sonic):
// - JSON parsing: > 500 MB/s (CPU SIMD)
// - gRPC throughput: > 10k req/s
// - QUIC latency: < 10ms p99
// - Memory usage: < 100MB baseline
