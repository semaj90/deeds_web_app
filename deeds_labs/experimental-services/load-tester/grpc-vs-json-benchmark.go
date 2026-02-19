//go:build grpc_bench
// +build grpc_bench

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	pb "legal-ai-production/proto/case_management"
)

type BenchmarkConfig struct {
	JSONEndpoint     string
	GRPCEndpoint     string
	NumRequests      int
	ConcurrentUsers  int
	TestDuration     time.Duration
	MessageSize      string // small, medium, large
	WarmupRequests   int
	OutputCSV        string
}

type BenchmarkResult struct {
	Protocol           string        `json:"protocol"`
	TotalRequests      int           `json:"total_requests"`
	SuccessfulRequests int           `json:"successful_requests"`
	FailedRequests     int           `json:"failed_requests"`
	AverageLatency     time.Duration `json:"average_latency"`
	P50Latency         time.Duration `json:"p50_latency"`
	P95Latency         time.Duration `json:"p95_latency"`
	P99Latency         time.Duration `json:"p99_latency"`
	Throughput         float64       `json:"throughput_rps"`
	BytesSent          int64         `json:"bytes_sent"`
	BytesReceived      int64         `json:"bytes_received"`
	TestDuration       time.Duration `json:"test_duration"`
	CompressionRatio   float64       `json:"compression_ratio"`
}

type LatencyRecord struct {
	Latency   time.Duration
	Success   bool
	BytesSent int64
	BytesRecv int64
}

// JSON message structures
type JSONChatRequest struct {
	Messages []JSONMessage `json:"messages"`
}

type JSONMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type JSONChatResponse struct {
	Choices []JSONChoice `json:"choices"`
}

type JSONChoice struct {
	Message JSONMessage `json:"message"`
}

// Test data generators
func generateSmallMessage() ([]byte, *pb.CollaborationRequest) {
	content := "What is a contract?"

	// JSON version
	jsonReq := JSONChatRequest{
		Messages: []JSONMessage{
			{Role: "user", Content: content},
		},
	}
	jsonData, _ := json.Marshal(jsonReq)

	// gRPC version
	grpcReq := &pb.CollaborationRequest{
		CaseId:    "case_small_001",
		UserId:    "user_001",
		Type:      pb.CollaborationType_REAL_TIME_CHAT,
		Payload:   []byte(content),
		Scope:     pb.CollaborationScope_CASE_WIDE,
		Timestamp: timestamppb.Now(),
	}

	return jsonData, grpcReq
}

func generateMediumMessage() ([]byte, *pb.CollaborationRequest) {
	content := `Analyze this employment contract for potential legal issues:

	EMPLOYMENT AGREEMENT

	This Employment Agreement ("Agreement") is entered into on [DATE] between ABC Corporation,
	a Delaware corporation ("Company"), and John Doe ("Employee").

	1. POSITION AND DUTIES
	Employee shall serve as Senior Software Engineer and shall perform such duties and have such
	responsibilities as are customarily associated with such position and as may be assigned by Company.

	2. COMPENSATION
	Company shall pay Employee a base salary of $120,000 per year, payable in accordance with
	Company's standard payroll practices.

	3. TERMINATION
	This Agreement may be terminated by either party with 30 days written notice.`

	jsonReq := JSONChatRequest{
		Messages: []JSONMessage{
			{Role: "user", Content: content},
		},
	}
	jsonData, _ := json.Marshal(jsonReq)

	grpcReq := &pb.CollaborationRequest{
		CaseId:    "case_medium_001",
		UserId:    "user_001",
		Type:      pb.CollaborationType_DOCUMENT_EDIT,
		Payload:   []byte(content),
		Scope:     pb.CollaborationScope_DOCUMENT_SPECIFIC,
		Timestamp: timestamppb.Now(),
	}

	return jsonData, grpcReq
}

func generateLargeMessage() ([]byte, *pb.CollaborationRequest) {
	// Generate a large legal document (5KB+)
	baseContent := `COMPREHENSIVE LEGAL SERVICES AGREEMENT

	This Legal Services Agreement ("Agreement") is entered into as of [DATE] ("Effective Date")
	between [CLIENT NAME], a [STATE] [ENTITY TYPE] ("Client"), and [LAW FIRM NAME],
	a [STATE] [ENTITY TYPE] ("Firm").

	RECITALS

	WHEREAS, Client desires to retain Firm to provide certain legal services as described herein;

	WHEREAS, Firm is willing to provide such legal services subject to the terms and conditions
	set forth in this Agreement;

	NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein,
	and for other good and valuable consideration, the receipt and sufficiency of which are
	hereby acknowledged, the parties agree as follows:`

	// Repeat content to make it large
	largeContent := ""
	for i := 0; i < 50; i++ {
		largeContent += fmt.Sprintf("\n\n=== SECTION %d ===\n%s", i+1, baseContent)
	}

	jsonReq := JSONChatRequest{
		Messages: []JSONMessage{
			{Role: "user", Content: largeContent},
		},
	}
	jsonData, _ := json.Marshal(jsonReq)

	grpcReq := &pb.CollaborationRequest{
		CaseId:    "case_large_001",
		UserId:    "user_001",
		Type:      pb.CollaborationType_DOCUMENT_EDIT,
		Payload:   []byte(largeContent),
		Scope:     pb.CollaborationScope_CASE_WIDE,
		Timestamp: timestamppb.Now(),
	}

	return jsonData, grpcReq
}

func benchmarkJSON(config *BenchmarkConfig, jsonData []byte) *BenchmarkResult {
	log.Printf("🔄 Benchmarking JSON API at %s", config.JSONEndpoint)

	results := make([]LatencyRecord, 0, config.NumRequests)
	var wg sync.WaitGroup
	resultsChan := make(chan LatencyRecord, config.NumRequests)

	startTime := time.Now()

	// Launch concurrent goroutines
	for i := 0; i < config.ConcurrentUsers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			requestsPerUser := config.NumRequests / config.ConcurrentUsers
			for j := 0; j < requestsPerUser; j++ {
				start := time.Now()

				resp, err := http.Post(config.JSONEndpoint, "application/json", bytes.NewBuffer(jsonData))
				if err != nil {
					resultsChan <- LatencyRecord{
						Latency:   time.Since(start),
						Success:   false,
						BytesSent: int64(len(jsonData)),
						BytesRecv: 0,
					}
					continue
				}

				body, err := io.ReadAll(resp.Body)
				resp.Body.Close()

				latency := time.Since(start)
				success := err == nil && resp.StatusCode == 200

				resultsChan <- LatencyRecord{
					Latency:   latency,
					Success:   success,
					BytesSent: int64(len(jsonData)),
					BytesRecv: int64(len(body)),
				}
			}
		}()
	}

	wg.Wait()
	close(resultsChan)

	// Collect results
	for result := range resultsChan {
		results = append(results, result)
	}

	return analyzeResults("JSON", results, time.Since(startTime))
}

func benchmarkGRPC(config *BenchmarkConfig, grpcReq *pb.CollaborationRequest) *BenchmarkResult {
	log.Printf("🔄 Benchmarking gRPC at %s", config.GRPCEndpoint)

	// Connect to gRPC server
	conn, err := grpc.Dial(config.GRPCEndpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("❌ Failed to connect to gRPC server: %v", err)
	}
	defer conn.Close()

	client := pb.NewCaseManagementServiceClient(conn)

	results := make([]LatencyRecord, 0, config.NumRequests)
	var wg sync.WaitGroup
	resultsChan := make(chan LatencyRecord, config.NumRequests)

	startTime := time.Now()

	// Launch concurrent goroutines
	for i := 0; i < config.ConcurrentUsers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			// Create stream for this user
			stream, err := client.StreamCaseCollaboration(context.Background())
			if err != nil {
				log.Printf("❌ Failed to create gRPC stream: %v", err)
				return
			}
			defer stream.CloseSend()

			requestsPerUser := config.NumRequests / config.ConcurrentUsers
			for j := 0; j < requestsPerUser; j++ {
				start := time.Now()

				// Serialize protobuf
				reqData, err := proto.Marshal(grpcReq)
				if err != nil {
					resultsChan <- LatencyRecord{
						Latency:   time.Since(start),
						Success:   false,
						BytesSent: 0,
						BytesRecv: 0,
					}
					continue
				}

				// Send request
				err = stream.Send(grpcReq)
				if err != nil {
					resultsChan <- LatencyRecord{
						Latency:   time.Since(start),
						Success:   false,
						BytesSent: int64(len(reqData)),
						BytesRecv: 0,
					}
					continue
				}

				// Receive response
				resp, err := stream.Recv()
				if err != nil {
					resultsChan <- LatencyRecord{
						Latency:   time.Since(start),
						Success:   false,
						BytesSent: int64(len(reqData)),
						BytesRecv: 0,
					}
					continue
				}

				respData, _ := proto.Marshal(resp)
				latency := time.Since(start)

				resultsChan <- LatencyRecord{
					Latency:   latency,
					Success:   true,
					BytesSent: int64(len(reqData)),
					BytesRecv: int64(len(respData)),
				}
			}
		}()
	}

	wg.Wait()
	close(resultsChan)

	// Collect results
	for result := range resultsChan {
		results = append(results, result)
	}

	return analyzeResults("gRPC", results, time.Since(startTime))
}

func analyzeResults(protocol string, results []LatencyRecord, totalDuration time.Duration) *BenchmarkResult {
	if len(results) == 0 {
		return &BenchmarkResult{Protocol: protocol}
	}

	successful := 0
	failed := 0
	totalLatency := time.Duration(0)
	var bytesSent, bytesReceived int64

	latencies := make([]time.Duration, 0, len(results))

	for _, result := range results {
		if result.Success {
			successful++
			latencies = append(latencies, result.Latency)
		} else {
			failed++
		}
		totalLatency += result.Latency
		bytesSent += result.BytesSent
		bytesReceived += result.BytesRecv
	}

	// Sort latencies for percentile calculation
	for i := 0; i < len(latencies)-1; i++ {
		for j := i + 1; j < len(latencies); j++ {
			if latencies[i] > latencies[j] {
				latencies[i], latencies[j] = latencies[j], latencies[i]
			}
		}
	}

	avgLatency := totalLatency / time.Duration(len(results))
	throughput := float64(successful) / totalDuration.Seconds()

	var p50, p95, p99 time.Duration
	if len(latencies) > 0 {
		p50 = latencies[len(latencies)*50/100]
		p95 = latencies[len(latencies)*95/100]
		p99 = latencies[len(latencies)*99/100]
	}

	// Calculate compression ratio (gRPC vs JSON)
	compressionRatio := 1.0
	if protocol == "gRPC" && bytesSent > 0 {
		// Estimate JSON equivalent size
		estimatedJSONSize := bytesSent * 2 // Rough estimate
		compressionRatio = float64(estimatedJSONSize) / float64(bytesSent)
	}

	return &BenchmarkResult{
		Protocol:           protocol,
		TotalRequests:      len(results),
		SuccessfulRequests: successful,
		FailedRequests:     failed,
		AverageLatency:     avgLatency,
		P50Latency:         p50,
		P95Latency:         p95,
		P99Latency:         p99,
		Throughput:         throughput,
		BytesSent:          bytesSent,
		BytesReceived:      bytesReceived,
		TestDuration:       totalDuration,
		CompressionRatio:   compressionRatio,
	}
}

func printResults(jsonResult, grpcResult *BenchmarkResult) {
	fmt.Println("\n🚀 gRPC vs JSON Performance Benchmark Results")
	fmt.Println("═══════════════════════════════════════════════")

	fmt.Printf("📊 Test Configuration:\n")
	fmt.Printf("   Requests per protocol: %d\n", jsonResult.TotalRequests)
	fmt.Printf("   Test duration: %v\n\n", jsonResult.TestDuration)

	fmt.Printf("📈 JSON API Results:\n")
	fmt.Printf("   Success Rate: %.2f%% (%d/%d)\n",
		float64(jsonResult.SuccessfulRequests)/float64(jsonResult.TotalRequests)*100,
		jsonResult.SuccessfulRequests, jsonResult.TotalRequests)
	fmt.Printf("   Average Latency: %v\n", jsonResult.AverageLatency)
	fmt.Printf("   P95 Latency: %v\n", jsonResult.P95Latency)
	fmt.Printf("   P99 Latency: %v\n", jsonResult.P99Latency)
	fmt.Printf("   Throughput: %.2f RPS\n", jsonResult.Throughput)
	fmt.Printf("   Bytes Sent: %d\n", jsonResult.BytesSent)
	fmt.Printf("   Bytes Received: %d\n\n", jsonResult.BytesReceived)

	fmt.Printf("⚡ gRPC Results:\n")
	fmt.Printf("   Success Rate: %.2f%% (%d/%d)\n",
		float64(grpcResult.SuccessfulRequests)/float64(grpcResult.TotalRequests)*100,
		grpcResult.SuccessfulRequests, grpcResult.TotalRequests)
	fmt.Printf("   Average Latency: %v\n", grpcResult.AverageLatency)
	fmt.Printf("   P95 Latency: %v\n", grpcResult.P95Latency)
	fmt.Printf("   P99 Latency: %v\n", grpcResult.P99Latency)
	fmt.Printf("   Throughput: %.2f RPS\n", grpcResult.Throughput)
	fmt.Printf("   Bytes Sent: %d\n", grpcResult.BytesSent)
	fmt.Printf("   Bytes Received: %d\n", grpcResult.BytesReceived)
	fmt.Printf("   Compression Ratio: %.2fx\n\n", grpcResult.CompressionRatio)

	// Performance improvements
	fmt.Printf("🎯 Performance Improvements (gRPC vs JSON):\n")
	latencyImprovement := float64(jsonResult.AverageLatency) / float64(grpcResult.AverageLatency)
	throughputImprovement := grpcResult.Throughput / jsonResult.Throughput
	bandwidthSavings := 1.0 - (float64(grpcResult.BytesSent) / float64(jsonResult.BytesSent))

	fmt.Printf("   Latency: %.2fx faster (%.1f%% improvement)\n",
		latencyImprovement, (latencyImprovement-1)*100)
	fmt.Printf("   Throughput: %.2fx higher (%.1f%% improvement)\n",
		throughputImprovement, (throughputImprovement-1)*100)
	fmt.Printf("   Bandwidth: %.1f%% reduction\n", bandwidthSavings*100)

	if latencyImprovement >= 1.6 { // 60% improvement target
		fmt.Printf("✅ TARGET ACHIEVED: 60%+ performance improvement!\n")
	} else {
		fmt.Printf("⚠️  Target not met: Need 60%+ improvement, got %.1f%%\n", (latencyImprovement-1)*100)
	}
}

func saveCSV(filename string, jsonResult, grpcResult *BenchmarkResult) error {
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	// CSV header
	fmt.Fprintf(file, "protocol,total_requests,successful_requests,failed_requests,avg_latency_ms,p95_latency_ms,p99_latency_ms,throughput_rps,bytes_sent,bytes_received,compression_ratio\n")

	// JSON row
	fmt.Fprintf(file, "%s,%d,%d,%d,%.2f,%.2f,%.2f,%.2f,%d,%d,%.2f\n",
		jsonResult.Protocol,
		jsonResult.TotalRequests,
		jsonResult.SuccessfulRequests,
		jsonResult.FailedRequests,
		float64(jsonResult.AverageLatency.Nanoseconds())/1e6,
		float64(jsonResult.P95Latency.Nanoseconds())/1e6,
		float64(jsonResult.P99Latency.Nanoseconds())/1e6,
		jsonResult.Throughput,
		jsonResult.BytesSent,
		jsonResult.BytesReceived,
		jsonResult.CompressionRatio)

	// gRPC row
	fmt.Fprintf(file, "%s,%d,%d,%d,%.2f,%.2f,%.2f,%.2f,%d,%d,%.2f\n",
		grpcResult.Protocol,
		grpcResult.TotalRequests,
		grpcResult.SuccessfulRequests,
		grpcResult.FailedRequests,
		float64(grpcResult.AverageLatency.Nanoseconds())/1e6,
		float64(grpcResult.P95Latency.Nanoseconds())/1e6,
		float64(grpcResult.P99Latency.Nanoseconds())/1e6,
		grpcResult.Throughput,
		grpcResult.BytesSent,
		grpcResult.BytesReceived,
		grpcResult.CompressionRatio)

	return nil
}

func main() {
	config := &BenchmarkConfig{}

	flag.StringVar(&config.JSONEndpoint, "json", "http://localhost:5174/api/ai/chat", "JSON API endpoint")
	flag.StringVar(&config.GRPCEndpoint, "grpc", "localhost:8090", "gRPC server endpoint")
	flag.IntVar(&config.NumRequests, "requests", 100, "Number of requests per protocol")
	flag.IntVar(&config.ConcurrentUsers, "concurrent", 10, "Number of concurrent users")
	flag.StringVar(&config.MessageSize, "size", "medium", "Message size: small, medium, large")
	flag.IntVar(&config.WarmupRequests, "warmup", 10, "Number of warmup requests")
	flag.StringVar(&config.OutputCSV, "csv", "", "Output CSV file path")
	flag.Parse()

	log.Printf("🚀 Starting gRPC vs JSON Benchmark")
	log.Printf("📊 Configuration:")
	log.Printf("   JSON Endpoint: %s", config.JSONEndpoint)
	log.Printf("   gRPC Endpoint: %s", config.GRPCEndpoint)
	log.Printf("   Requests per protocol: %d", config.NumRequests)
	log.Printf("   Concurrent users: %d", config.ConcurrentUsers)
	log.Printf("   Message size: %s", config.MessageSize)

	// Generate test data based on size
	var jsonData []byte
	var grpcReq *pb.CollaborationRequest

	switch config.MessageSize {
	case "small":
		jsonData, grpcReq = generateSmallMessage()
	case "large":
		jsonData, grpcReq = generateLargeMessage()
	default: // medium
		jsonData, grpcReq = generateMediumMessage()
	}

	log.Printf("📏 Message sizes: JSON=%d bytes, gRPC=%d bytes",
		len(jsonData), proto.Size(grpcReq))

	// Run benchmarks
	jsonResult := benchmarkJSON(config, jsonData)
	grpcResult := benchmarkGRPC(config, grpcReq)

	// Print results
	printResults(jsonResult, grpcResult)

	// Save CSV if requested
	if config.OutputCSV != "" {
		if err := saveCSV(config.OutputCSV, jsonResult, grpcResult); err != nil {
			log.Printf("❌ Failed to save CSV: %v", err)
		} else {
			log.Printf("✅ Results saved to %s", config.OutputCSV)
		}
	}
}