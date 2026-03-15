# Go gRPC Implementation Guide

**Date:** November 23, 2025
**Status:** Ready for Implementation
**Go Version:** 1.25+
**Protocol:** gRPC + Protobuffers

---

## Quick Start

### 1. Generate Go Code from Protos

```bash
# Install protoc compiler
# Windows: choco install protoc
# WSL: apt-get install protobuf-compiler

# Install Go plugins
go install github.com/grpc/grpc-go/cmd/protoc-gen-go@latest
go install github.com/grpc/grpc-go/cmd/protoc-gen-go-grpc@latest

# Generate code
cd proto
protoc --go_out=. --go-grpc_out=. search-service.proto
protoc --go_out=. --go-grpc_out=. timeline-service.proto
protoc --go_out=. --go-grpc_out=. analytics-service.proto
```

### 2. Create Go Service Implementations

#### Search Service

```go
// go-microservice/cmd/search-service/main.go
package main

import (
	"context"
	"log"
	"net"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	pb "github.com/legal-ai/proto/search"
)

type SearchServer struct {
	pb.UnimplementedSearchServiceServer
	db *pgxpool.Pool
}

func (s *SearchServer) Search(ctx context.Context, req *pb.SearchRequest) (*pb.SearchResponse, error) {
	// Implementation
	results := []*pb.SearchResult{}

	// Query database
	query := `
		SELECT id, type, title, description, case_id, relevance_score, created_at
		FROM search_index
		WHERE query_text @@ plainto_tsquery($1)
		LIMIT $2 OFFSET $3
	`

	rows, err := s.db.Query(ctx, query, req.Query, req.Limit, req.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var result pb.SearchResult
		if err := rows.Scan(&result.Id, &result.Type, &result.Title,
			&result.Description, &result.CaseId, &result.RelevanceScore,
			&result.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, &result)
	}

	return &pb.SearchResponse{
		Success: true,
		Results: results,
		Total:   int32(len(results)),
	}, nil
}

func main() {
	// Connect to database
	db, err := pgxpool.New(context.Background(), "postgres://...")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Create gRPC server
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatal(err)
	}

	s := grpc.NewServer()
	pb.RegisterSearchServiceServer(s, &SearchServer{db: db})

	log.Println("Search service listening on :50051")
	if err := s.Serve(lis); err != nil {
		log.Fatal(err)
	}
}
```

#### Timeline Service

```go
// go-microservice/cmd/timeline-service/main.go
package main

import (
	"context"
	"log"
	"net"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	pb "github.com/legal-ai/proto/timeline"
)

type TimelineServer struct {
	pb.UnimplementedTimelineServiceServer
	db *pgxpool.Pool
}

func (s *TimelineServer) GetTimeline(ctx context.Context, req *pb.TimelineRequest) (*pb.TimelineResponse, error) {
	events := []*pb.TimelineEvent{}

	query := `
		SELECT id, type, title, description, case_id, timestamp, position, actor_id, actor_name
		FROM timeline_events
		WHERE case_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`

	rows, err := s.db.Query(ctx, query, req.CaseId, req.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var event pb.TimelineEvent
		if err := rows.Scan(&event.Id, &event.Type, &event.Title,
			&event.Description, &event.CaseId, &event.Timestamp,
			&event.Position, &event.ActorId, &event.ActorName); err != nil {
			return nil, err
		}
		events = append(events, &event)
	}

	return &pb.TimelineResponse{
		Success: true,
		Events:  events,
		Total:   int32(len(events)),
	}, nil
}

func main() {
	db, err := pgxpool.New(context.Background(), "postgres://...")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	lis, err := net.Listen("tcp", ":50052")
	if err != nil {
		log.Fatal(err)
	}

	s := grpc.NewServer()
	pb.RegisterTimelineServiceServer(s, &TimelineServer{db: db})

	log.Println("Timeline service listening on :50052")
	if err := s.Serve(lis); err != nil {
		log.Fatal(err)
	}
}
```

#### Analytics Service

```go
// go-microservice/cmd/analytics-service/main.go
package main

import (
	"context"
	"log"
	"net"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	pb "github.com/legal-ai/proto/analytics"
)

type AnalyticsServer struct {
	pb.UnimplementedAnalyticsServiceServer
	db *pgxpool.Pool
}

func (s *AnalyticsServer) GetAnalytics(ctx context.Context, req *pb.AnalyticsRequest) (*pb.AnalyticsResponse, error) {
	// Get summary stats
	var totalCases, activeCases, totalEvidence, totalChats, totalMessages int32

	err := s.db.QueryRow(ctx, `
		SELECT
			COUNT(DISTINCT id) as total_cases,
			COUNT(DISTINCT CASE WHEN status = 'active' THEN id END) as active_cases,
			COUNT(DISTINCT evidence_id) as total_evidence,
			COUNT(DISTINCT chat_id) as total_chats,
			COUNT(DISTINCT message_id) as total_messages
		FROM cases
	`).Scan(&totalCases, &activeCases, &totalEvidence, &totalChats, &totalMessages)

	if err != nil {
		return nil, err
	}

	return &pb.AnalyticsResponse{
		Success: true,
		Summary: &pb.SummaryStats{
			TotalCases:     totalCases,
			ActiveCases:    activeCases,
			TotalEvidence:  totalEvidence,
			TotalChats:     totalChats,
			TotalMessages:  totalMessages,
		},
	}, nil
}

func main() {
	db, err := pgxpool.New(context.Background(), "postgres://...")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	lis, err := net.Listen("tcp", ":50053")
	if err != nil {
		log.Fatal(err)
	}

	s := grpc.NewServer()
	pb.RegisterAnalyticsServiceServer(s, &AnalyticsServer{db: db})

	log.Println("Analytics service listening on :50053")
	if err := s.Serve(lis); err != nil {
		log.Fatal(err)
	}
}
```

### 3. Create HTTP → gRPC Gateway

```go
// go-microservice/cmd/http-grpc-gateway/main.go
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	pb_search "github.com/legal-ai/proto/search"
	pb_timeline "github.com/legal-ai/proto/timeline"
	pb_analytics "github.com/legal-ai/proto/analytics"
)

type Gateway struct {
	searchClient    pb_search.SearchServiceClient
	timelineClient  pb_timeline.TimelineServiceClient
	analyticsClient pb_analytics.AnalyticsServiceClient
}

func (g *Gateway) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limit := int32(20)

	resp, err := g.searchClient.Search(context.Background(), &pb_search.SearchRequest{
		Query: query,
		Limit: limit,
	})

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (g *Gateway) handleTimeline(w http.ResponseWriter, r *http.Request) {
	caseID := r.URL.Query().Get("case_id")

	resp, err := g.timelineClient.GetTimeline(context.Background(), &pb_timeline.TimelineRequest{
		CaseId: caseID,
		Limit:  50,
	})

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (g *Gateway) handleAnalytics(w http.ResponseWriter, r *http.Request) {
	resp, err := g.analyticsClient.GetAnalytics(context.Background(), &pb_analytics.AnalyticsRequest{
		Timeframe: "30d",
	})

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	// Connect to gRPC services
	searchConn, _ := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	timelineConn, _ := grpc.Dial("localhost:50052", grpc.WithTransportCredentials(insecure.NewCredentials()))
	analyticsConn, _ := grpc.Dial("localhost:50053", grpc.WithTransportCredentials(insecure.NewCredentials()))

	defer searchConn.Close()
	defer timelineConn.Close()
	defer analyticsConn.Close()

	gateway := &Gateway{
		searchClient:    pb_search.NewSearchServiceClient(searchConn),
		timelineClient:  pb_timeline.NewTimelineServiceClient(timelineConn),
		analyticsClient: pb_analytics.NewAnalyticsServiceClient(analyticsConn),
	}

	// HTTP routes
	http.HandleFunc("/api/yorha/search", gateway.handleSearch)
	http.HandleFunc("/api/yorha/timeline", gateway.handleTimeline)
	http.HandleFunc("/api/yorha/analytics", gateway.handleAnalytics)

	log.Println("HTTP → gRPC Gateway listening on :8080")
	http.ListenAndServe(":8080", nil)
}
```

### 4. Docker Compose Setup

```yaml
# docker-compose.grpc.yml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: legal_ai_db
      POSTGRES_USER: legal_admin
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Search Service (gRPC)
  search-service:
    build:
      context: ./go-microservice
      dockerfile: Dockerfile.search
    ports:
      - "50051:50051"
    environment:
      DATABASE_URL: postgres://legal_admin:secure_password@postgres:5432/legal_ai_db
    depends_on:
      - postgres

  # Timeline Service (gRPC)
  timeline-service:
    build:
      context: ./go-microservice
      dockerfile: Dockerfile.timeline
    ports:
      - "50052:50052"
    environment:
      DATABASE_URL: postgres://legal_admin:secure_password@postgres:5432/legal_ai_db
    depends_on:
      - postgres

  # Analytics Service (gRPC)
  analytics-service:
    build:
      context: ./go-microservice
      dockerfile: Dockerfile.analytics
    ports:
      - "50053:50053"
    environment:
      DATABASE_URL: postgres://legal_admin:secure_password@postgres:5432/legal_ai_db
    depends_on:
      - postgres

  # HTTP → gRPC Gateway
  http-gateway:
    build:
      context: ./go-microservice
      dockerfile: Dockerfile.gateway
    ports:
      - "8080:8080"
    environment:
      SEARCH_SERVICE: search-service:50051
      TIMELINE_SERVICE: timeline-service:50052
      ANALYTICS_SERVICE: analytics-service:50053
    depends_on:
      - search-service
      - timeline-service
      - analytics-service

  # TensorRT-LLM Server (GPU)
  tensorrt-llm:
    image: legal-ai-trt-llm:custom-gemma
    ports:
      - "50051:50051"  # gRPC
      - "8000:8000"    # HTTP
    environment:
      CUDA_VISIBLE_DEVICES: "0"
      MODEL_NAME: gemma3:8000
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  postgres_data:
```

### 5. Build Dockerfiles

```dockerfile
# go-microservice/Dockerfile.search
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o search-service ./cmd/search-service

FROM alpine:latest
COPY --from=builder /app/search-service /usr/local/bin/
EXPOSE 50051
CMD ["search-service"]
```

---

## Performance Optimization Tips

### 1. Connection Pooling
```go
// Reuse gRPC connections
var (
    searchConn *grpc.ClientConn
    // ...
)

func init() {
    searchConn, _ = grpc.Dial("localhost:50051",
        grpc.WithDefaultCallOptions(
            grpc.MaxCallRecvMsgSize(100*1024*1024),
        ),
    )
}
```

### 2. Batch Operations
```go
// Send multiple requests in one batch
batch := &pb.SearchResultBatch{
    Results: results,
    BatchId: time.Now().UnixNano(),
}
```

### 3. Streaming for Large Results
```go
// Use streaming instead of returning all at once
stream, _ := client.StreamSearch(ctx, req)
for {
    result, err := stream.Recv()
    if err == io.EOF {
        break
    }
    // Process result
}
```

---

## Testing

```bash
# Test gRPC services with grpcurl
grpcurl -plaintext localhost:50051 search_service.SearchService/Search

# Load testing
ghz --insecure \
  --proto ./proto/search-service.proto \
  --call search_service.SearchService/Search \
  -d '{"query":"test","limit":20}' \
  -c 100 -n 10000 \
  localhost:50051
```

---

## Deployment Checklist

- [ ] Proto files generated
- [ ] Go services compiled
- [ ] Docker images built
- [ ] Docker Compose stack running
- [ ] HTTP gateway working
- [ ] gRPC services responding
- [ ] Database connected
- [ ] Performance tested
- [ ] Load testing passed
- [ ] Production ready

---

**Status:** Ready for implementation
**Estimated Time:** 2-3 hours
**Complexity:** Medium
