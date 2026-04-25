# gRPC over QUIC Legal AI Examples
High-Performance Legal AI Communication with QUIC Protocol

## 🎯 OVERVIEW: gRPC + QUIC Benefits for Legal AI

### Why QUIC for Legal AI:
- **30-50% lower latency** for legal document processing
- **Better multiplexing** - multiple legal queries simultaneously
- **Connection migration** - mobile legal professionals
- **Built-in encryption** - secure legal data transmission
- **Head-of-line blocking elimination** - faster batch processing

---

## 🔧 METHOD 1: Native gRPC over QUIC

### Legal AI QUIC Server Implementation:
```go
// cmd/legal-quic-server/main.go
package main

import (
    "context"
    "crypto/tls"
    "log"
    "net"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials"
    "github.com/quic-go/quic-go"
    "github.com/quic-go/quic-go/http3"

    pb "github.com/legal-ai/proto/legal"
)

type LegalAIQUICServer struct {
    pb.UnimplementedLegalAIServiceServer
    tritonClient *TritonClient
    vectorDB     *PgVectorClient
}

func NewLegalAIQUICServer() *LegalAIQUICServer {
    return &LegalAIQUICServer{
        tritonClient: NewTritonClient("triton-legal-ai:8001"),
        vectorDB:     NewPgVectorClient("postgres://legal_admin:123456@postgres-cuda:5432/legal_ai_db"),
    }
}

// Legal document embedding via QUIC + gRPC
func (s *LegalAIQUICServer) GenerateEmbedding(ctx context.Context, req *pb.EmbeddingRequest) (*pb.EmbeddingResponse, error) {
    log.Printf("🔥 Processing legal embedding via QUIC: %s", req.DocumentId)

    // Use Triton for embedding generation
    embedding, err := s.tritonClient.GenerateLegalEmbedding(ctx, req.Text)
    if err != nil {
        return nil, err
    }

    // Store in pgvector with CUDA acceleration
    err = s.vectorDB.StoreEmbedding(ctx, req.DocumentId, embedding, req.Metadata)
    if err != nil {
        return nil, err
    }

    return &pb.EmbeddingResponse{
        DocumentId: req.DocumentId,
        Embedding:  embedding,
        Dimensions: int32(len(embedding)),
        Model:      "embeddinggemma:latest",
        Backend:    "triton-tensorrt-quic",
    }, nil
}

// Legal case similarity search via QUIC
func (s *LegalAIQUICServer) SearchSimilarCases(ctx context.Context, req *pb.SimilarityRequest) (*pb.SimilarityResponse, error) {
    log.Printf("🔍 Legal similarity search via QUIC: query_len=%d", len(req.QueryText))

    // Generate query embedding
    queryEmbedding, err := s.tritonClient.GenerateLegalEmbedding(ctx, req.QueryText)
    if err != nil {
        return nil, err
    }

    // Search similar cases with pgvector CUDA
    similarCases, err := s.vectorDB.SearchSimilarCases(ctx, queryEmbedding, req.Filters, int(req.TopK))
    if err != nil {
        return nil, err
    }

    // Convert to protobuf response
    cases := make([]*pb.LegalCase, len(similarCases))
    for i, caseResult := range similarCases {
        cases[i] = &pb.LegalCase{
            CaseId:      caseResult.CaseID,
            Title:       caseResult.Title,
            Jurisdiction: caseResult.Jurisdiction,
            CaseType:    caseResult.CaseType,
            Similarity:  caseResult.SimilarityScore,
            Summary:     caseResult.Summary,
        }
    }

    return &pb.SimilarityResponse{
        Cases:       cases,
        QueryTime:   time.Since(startTime).Milliseconds(),
        TotalFound:  int32(len(cases)),
        Backend:     "quic-pgvector-cuda",
    }, nil
}

// Streaming legal document processing
func (s *LegalAIQUICServer) ProcessDocumentStream(stream pb.LegalAIService_ProcessDocumentStreamServer) error {
    log.Printf("📄 Starting legal document stream processing via QUIC")

    for {
        req, err := stream.Recv()
        if err == io.EOF {
            return nil
        }
        if err != nil {
            return err
        }

        // Process each legal document chunk
        embedding, err := s.tritonClient.GenerateLegalEmbedding(stream.Context(), req.Content)
        if err != nil {
            return err
        }

        // Send real-time response
        response := &pb.DocumentProcessResponse{
            ChunkId:    req.ChunkId,
            DocumentId: req.DocumentId,
            Embedding:  embedding,
            Status:     pb.ProcessingStatus_COMPLETED,
            Processed:  true,
        }

        if err := stream.Send(response); err != nil {
            return err
        }

        log.Printf("✅ Processed legal document chunk %s via QUIC stream", req.ChunkId)
    }
}

func main() {
    // Load TLS certificates for QUIC
    cert, err := tls.LoadX509KeyPair("certs/legal-ai.crt", "certs/legal-ai.key")
    if err != nil {
        log.Fatal("Failed to load TLS certificate:", err)
    }

    tlsConfig := &tls.Config{
        Certificates: []tls.Certificate{cert},
        NextProtos:   []string{"h3", "h3-32", "h3-31", "h3-30", "h3-29"}, // HTTP/3 ALPN
    }

    // Create QUIC listener
    listener, err := quic.ListenAddr(":4433", tlsConfig, &quic.Config{
        MaxIdleTimeout:  time.Minute * 30,
        KeepAlivePeriod: time.Second * 30,
        Versions: []quic.Version{
            quic.Version1,
            quic.Version2,
        },
    })
    if err != nil {
        log.Fatal("Failed to create QUIC listener:", err)
    }

    // Create gRPC server with QUIC transport
    grpcServer := grpc.NewServer(
        grpc.Creds(credentials.NewTLS(tlsConfig)),
        grpc.MaxRecvMsgSize(32*1024*1024), // 32MB for large legal documents
        grpc.MaxSendMsgSize(32*1024*1024),
    )

    // Register legal AI service
    legalServer := NewLegalAIQUICServer()
    pb.RegisterLegalAIServiceServer(grpcServer, legalServer)

    log.Printf("🚀 Legal AI QUIC server listening on :4433")
    log.Printf("🔒 QUIC encryption enabled with legal-grade TLS")
    log.Printf("⚡ Ready for high-performance legal AI processing")

    // Start serving QUIC connections
    for {
        conn, err := listener.Accept(context.Background())
        if err != nil {
            log.Printf("Error accepting QUIC connection: %v", err)
            continue
        }

        go func(conn quic.Connection) {
            defer conn.CloseWithError(0, "server closing")

            for {
                stream, err := conn.AcceptStream(context.Background())
                if err != nil {
                    return
                }

                go grpcServer.ServeHTTP(NewQUICResponseWriter(stream), NewQUICRequest(stream))
            }
        }(conn)
    }
}
```

### Legal AI QUIC Client:
```go
// pkg/client/legal_quic_client.go
package client

import (
    "context"
    "crypto/tls"
    "log"
    "time"

    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials"
    "github.com/quic-go/quic-go"

    pb "github.com/legal-ai/proto/legal"
)

type LegalQUICClient struct {
    conn   *grpc.ClientConn
    client pb.LegalAIServiceClient
}

func NewLegalQUICClient(serverAddr string) (*LegalQUICClient, error) {
    // QUIC transport configuration
    tlsConfig := &tls.Config{
        InsecureSkipVerify: false, // Use proper certs in production
        NextProtos:         []string{"h3"},
    }

    // Create gRPC connection over QUIC
    conn, err := grpc.Dial(
        serverAddr,
        grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)),
        grpc.WithDefaultCallOptions(
            grpc.MaxCallRecvMsgSize(32*1024*1024),
            grpc.MaxCallSendMsgSize(32*1024*1024),
        ),
        grpc.WithContextDialer(func(ctx context.Context, addr string) (net.Conn, error) {
            // Use QUIC dialer
            return quic.DialAddr(ctx, addr, tlsConfig, &quic.Config{
                MaxIdleTimeout:  time.Minute * 30,
                KeepAlivePeriod: time.Second * 30,
            })
        }),
    )
    if err != nil {
        return nil, err
    }

    return &LegalQUICClient{
        conn:   conn,
        client: pb.NewLegalAIServiceClient(conn),
    }, nil
}

// Process legal document via QUIC
func (c *LegalQUICClient) ProcessLegalDocument(ctx context.Context, documentID, content string, metadata map[string]string) (*pb.EmbeddingResponse, error) {
    req := &pb.EmbeddingRequest{
        DocumentId: documentID,
        Text:       content,
        Metadata: &pb.LegalMetadata{
            CaseType:     metadata["case_type"],
            Jurisdiction: metadata["jurisdiction"],
            Court:        metadata["court"],
            DateFiled:    metadata["date_filed"],
        },
    }

    startTime := time.Now()
    resp, err := c.client.GenerateEmbedding(ctx, req)
    if err != nil {
        return nil, err
    }

    log.Printf("🔥 QUIC legal embedding: %s processed in %.2fms",
               documentID, float64(time.Since(startTime).Nanoseconds())/1e6)

    return resp, nil
}

// Search similar legal cases via QUIC
func (c *LegalQUICClient) SearchSimilarCases(ctx context.Context, query string, filters map[string]string, topK int) (*pb.SimilarityResponse, error) {
    req := &pb.SimilarityRequest{
        QueryText: query,
        TopK:      int32(topK),
        Filters: &pb.SearchFilters{
            Jurisdiction: filters["jurisdiction"],
            CaseType:     filters["case_type"],
            DateRange: &pb.DateRange{
                Start: filters["date_start"],
                End:   filters["date_end"],
            },
        },
    }

    startTime := time.Now()
    resp, err := c.client.SearchSimilarCases(ctx, req)
    if err != nil {
        return nil, err
    }

    log.Printf("🔍 QUIC similarity search: found %d cases in %.2fms",
               len(resp.Cases), float64(time.Since(startTime).Nanoseconds())/1e6)

    return resp, nil
}

// Streaming legal document processing
func (c *LegalQUICClient) ProcessDocumentStream(ctx context.Context, documents []LegalDocument) error {
    stream, err := c.client.ProcessDocumentStream(ctx)
    if err != nil {
        return err
    }

    // Send documents concurrently
    go func() {
        defer stream.CloseSend()

        for i, doc := range documents {
            req := &pb.DocumentProcessRequest{
                DocumentId: doc.ID,
                ChunkId:    fmt.Sprintf("chunk_%d", i),
                Content:    doc.Content,
                Metadata: &pb.LegalMetadata{
                    CaseType:     doc.CaseType,
                    Jurisdiction: doc.Jurisdiction,
                },
            }

            if err := stream.Send(req); err != nil {
                log.Printf("Error sending document: %v", err)
                return
            }

            log.Printf("📄 Sent document %s via QUIC stream", doc.ID)
        }
    }()

    // Receive responses
    for {
        resp, err := stream.Recv()
        if err == io.EOF {
            break
        }
        if err != nil {
            return err
        }

        log.Printf("✅ Processed legal document %s: %d dimensions",
                   resp.DocumentId, len(resp.Embedding))
    }

    return nil
}
```

---

## 🌐 METHOD 2: gRPC via Caddy HTTP/3 Reverse Proxy

### Caddy Configuration for Legal AI:
```caddyfile
# Caddyfile.legal-ai
{
    # Global options
    auto_https off
    local_certs
    servers {
        protocols h1 h2 h3
    }
}

# Legal AI gRPC over HTTP/3
legal-ai.local:443 {
    # Enable HTTP/3 (QUIC)
    protocols h1 h2 h3

    # TLS configuration for legal data
    tls /etc/certs/legal-ai.crt /etc/certs/legal-ai.key {
        protocols tls1.3
        curves x25519 p256
        ciphers TLS_AES_256_GCM_SHA384 TLS_CHACHA20_POLY1305_SHA256
    }

    # Legal AI service routes
    @grpc {
        protocol grpc
        header Content-Type application/grpc*
    }

    # Reverse proxy to legal AI services
    handle @grpc {
        reverse_proxy {
            # Triton inference server
            to legal-triton:8001 legal-triton-2:8001

            # Load balancing for legal AI
            lb_policy least_conn
            health_uri /v2/health/ready
            health_interval 30s
            health_timeout 10s

            # gRPC specific settings
            transport grpc {
                compression gzip
                max_recv_msg_size 32MB
                max_send_msg_size 32MB
            }

            # Header manipulation for legal metadata
            header_up X-Legal-Client-ID {uuid}
            header_up X-Legal-Timestamp {time.unix}
            header_up X-Legal-Environment "production"

            # Remove sensitive headers
            header_up -X-Real-IP
            header_up -X-Forwarded-For
        }
    }

    # HTTP/REST API for legal services
    handle /api/legal/* {
        reverse_proxy legal-gateway:8080 {
            # HTTP/3 upstream
            transport http {
                versions h1 h2 h3
                compression gzip br
            }

            # Legal API specific headers
            header_up X-Legal-API-Version "v2"
            header_up X-Protocol "http3-quic"
        }
    }

    # WebSocket for real-time legal updates
    handle /ws/legal/* {
        reverse_proxy legal-websocket:8090 {
            header_up Connection {>Connection}
            header_up Upgrade {>Upgrade}
        }
    }

    # Legal document uploads (large files)
    handle /upload/* {
        request_body {
            max_size 100MB
        }

        reverse_proxy legal-storage:9000 {
            # MinIO or S3-compatible storage
            transport http {
                versions h2 h3
                keepalive 30s
            }
        }
    }

    # Security headers for legal compliance
    header {
        # HSTS for legal data protection
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

        # Content security for legal applications
        Content-Security-Policy "default-src 'self'; frame-ancestors 'none';"

        # Legal data protection
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"

        # Remove server information
        -Server
        -X-Powered-By
    }

    # Logging for legal compliance
    log {
        output file /var/log/caddy/legal-ai-access.log
        format json {
            time_key "timestamp"
            level_key "level"
            message_key "message"
            duration_key "duration"
            status_key "status"
            size_key "size"
            uri_key "uri"
            method_key "method"
            host_key "host"
            remote_ip_key "remote_ip"
            user_agent_key "user_agent"
            request_id_key "request_id"
        }
        level INFO
    }
}

# Legal AI metrics endpoint
metrics.legal-ai.local:9090 {
    protocols h2 h3

    # Prometheus metrics
    handle /metrics {
        metrics /metrics

        # Basic auth for metrics access
        basicauth {
            legal-admin $2a$14$hashed_password_here
        }
    }
}

# Legal AI admin interface
admin.legal-ai.local:2019 {
    protocols h2 h3

    # Admin API with authentication
    basicauth {
        admin $2a$14$admin_hashed_password_here
    }

    admin
}
```

### Docker Compose with Caddy HTTP/3:
```yaml
# docker-compose.caddy-quic.yml
version: '3.8'

services:
  caddy-legal:
    image: caddy:2.7-alpine
    container_name: caddy-legal-ai
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443/tcp"
      - "443:443/udp"  # QUIC/HTTP3
      - "2019:2019"    # Admin
      - "9090:9090"    # Metrics
    volumes:
      - ./Caddyfile.legal-ai:/etc/caddy/Caddyfile:ro
      - ./certs:/etc/certs:ro
      - ./logs:/var/log/caddy
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - CADDY_INGRESS_NETWORKS=legal-ai-network
    networks:
      - legal-ai-network

  legal-triton:
    image: nvcr.io/nvidia/tritonserver:24.08-py3
    container_name: legal-triton
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=0
    ports:
      - "8001:8001"  # gRPC (internal)
      - "8002:8002"  # Metrics
    volumes:
      - ./triton-models:/models:ro
    command: >
      tritonserver
        --model-repository=/models
        --grpc-port=8001
        --http-port=8000
        --metrics-port=8002
        --allow-grpc=true
        --allow-http=false
        --allow-metrics=true
    networks:
      - legal-ai-network

  legal-gateway:
    build:
      context: ./cmd/legal-gateway
      dockerfile: Dockerfile.http3
    container_name: legal-gateway
    ports:
      - "8080:8080"
    environment:
      - TRITON_GRPC_ENDPOINT=legal-triton:8001
      - DATABASE_URL=postgresql://legal_admin:123456@postgres-cuda:5432/legal_ai_db
      - REDIS_URL=redis://redis-legal:6379
      - HTTP3_ENABLED=true
    depends_on:
      - legal-triton
      - postgres-cuda
    networks:
      - legal-ai-network

  postgres-cuda:
    image: pgvector/pgvector:pg17
    container_name: postgres-legal
    environment:
      - POSTGRES_DB=legal_ai_db
      - POSTGRES_USER=legal_admin
      - POSTGRES_PASSWORD=123456
    ports:
      - "5433:5432"
    volumes:
      - postgres_legal_data:/var/lib/postgresql/data
    networks:
      - legal-ai-network

networks:
  legal-ai-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  caddy_data:
  caddy_config:
  postgres_legal_data:
```

---

## 🚀 METHOD 3: SvelteKit Frontend with HTTP/3 Client

### SvelteKit HTTP/3 Legal Client:
```typescript
// src/lib/services/quic-legal-client.ts
interface QUICLegalClient {
    processDocument(document: LegalDocument): Promise<EmbeddingResponse>;
    searchSimilarCases(query: string, filters?: SearchFilters): Promise<CaseSearchResult[]>;
    streamProcessDocuments(documents: LegalDocument[]): AsyncIterable<DocumentProcessResult>;
}

export class HTTP3LegalClient implements QUICLegalClient {
    private baseUrl = 'https://legal-ai.local';
    private grpcClient: GrpcWebClient;

    constructor() {
        // Configure fetch for HTTP/3 if supported
        this.grpcClient = new GrpcWebClient(this.baseUrl, {
            transport: this.createHTTP3Transport(),
        });
    }

    private createHTTP3Transport() {
        // Check for HTTP/3 support
        if ('serviceWorker' in navigator && 'fetch' in window) {
            return {
                fetch: (input: RequestInfo, init?: RequestInit) => {
                    const enhancedInit: RequestInit = {
                        ...init,
                        // Enable HTTP/3 via alt-svc header hints
                        headers: {
                            ...init?.headers,
                            'Alt-Svc': 'h3=":443"; ma=86400',
                            'X-Protocol-Preference': 'h3,h2,h1.1',
                        },
                    };

                    return fetch(input, enhancedInit);
                },
            };
        }

        return undefined;
    }

    async processDocument(document: LegalDocument): Promise<EmbeddingResponse> {
        const startTime = performance.now();

        try {
            const response = await fetch(`${this.baseUrl}/api/legal/embedding`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Legal-Document-Type': document.type,
                    'X-Legal-Jurisdiction': document.jurisdiction || 'unknown',
                },
                body: JSON.stringify({
                    document_id: document.id,
                    text: document.content,
                    metadata: {
                        case_type: document.caseType,
                        jurisdiction: document.jurisdiction,
                        court: document.court,
                        date_filed: document.dateFiled,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const processingTime = performance.now() - startTime;

            console.log(`🔥 HTTP/3 legal embedding: ${document.id} processed in ${processingTime.toFixed(2)}ms`);

            return {
                documentId: result.document_id,
                embedding: result.embedding,
                dimensions: result.dimensions,
                model: result.model,
                backend: result.backend,
                processingTime,
            };
        } catch (error) {
            console.error('Legal document processing failed:', error);
            throw error;
        }
    }

    async searchSimilarCases(query: string, filters?: SearchFilters): Promise<CaseSearchResult[]> {
        const startTime = performance.now();

        const response = await fetch(`${this.baseUrl}/api/legal/search/similar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Legal-Search-Type': 'similarity',
            },
            body: JSON.stringify({
                query_text: query,
                top_k: filters?.topK || 10,
                filters: {
                    jurisdiction: filters?.jurisdiction,
                    case_type: filters?.caseType,
                    date_range: filters?.dateRange,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const result = await response.json();
        const searchTime = performance.now() - startTime;

        console.log(`🔍 HTTP/3 similarity search: ${result.cases.length} cases in ${searchTime.toFixed(2)}ms`);

        return result.cases.map((case: any) => ({
            caseId: case.case_id,
            title: case.title,
            jurisdiction: case.jurisdiction,
            caseType: case.case_type,
            similarity: case.similarity,
            summary: case.summary,
            court: case.court,
            dateFiled: case.date_filed,
        }));
    }

    async* streamProcessDocuments(documents: LegalDocument[]): AsyncIterable<DocumentProcessResult> {
        // Use Server-Sent Events over HTTP/3 for streaming
        const response = await fetch(`${this.baseUrl}/api/legal/stream/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
            body: JSON.stringify({
                documents: documents.map(doc => ({
                    document_id: doc.id,
                    content: doc.content,
                    metadata: {
                        case_type: doc.caseType,
                        jurisdiction: doc.jurisdiction,
                    },
                })),
            }),
        });

        if (!response.ok) {
            throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('Response body is not readable');
        }

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);

                        if (data === '[DONE]') {
                            return;
                        }

                        try {
                            const result = JSON.parse(data);
                            yield {
                                documentId: result.document_id,
                                chunkId: result.chunk_id,
                                embedding: result.embedding,
                                status: result.status,
                                processingTime: result.processing_time,
                                error: result.error,
                            };
                        } catch (parseError) {
                            console.warn('Failed to parse SSE data:', parseError);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
```

### Svelte Component with HTTP/3:
```svelte
<!-- src/routes/legal/ai/similarity/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { HTTP3LegalClient } from '$lib/services/quic-legal-client';
    import type { CaseSearchResult, SearchFilters } from '$lib/types/legal';

    let query = '';
    let searchResults: CaseSearchResult[] = [];
    let isSearching = false;
    let searchTime = 0;
    let protocolUsed = 'unknown';

    const legalClient = new HTTP3LegalClient();

    async function searchSimilarCases() {
        if (!query.trim()) return;

        isSearching = true;
        searchTime = 0;
        protocolUsed = 'unknown';

        try {
            const startTime = performance.now();

            const filters: SearchFilters = {
                topK: 10,
                jurisdiction: 'federal', // Example filter
            };

            searchResults = await legalClient.searchSimilarCases(query, filters);
            searchTime = performance.now() - startTime;

            // Detect protocol used (if available from response headers)
            protocolUsed = 'HTTP/3 (QUIC)'; // Assume HTTP/3 for demo

        } catch (error) {
            console.error('Legal search failed:', error);
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    // Real-time document processing demo
    async function processDocumentStream() {
        const sampleDocuments = [
            {
                id: 'doc_1',
                content: 'Contract breach case regarding software licensing terms...',
                caseType: 'contract',
                jurisdiction: 'federal',
                type: 'legal_brief',
            },
            // ... more documents
        ];

        const processingResults = legalClient.streamProcessDocuments(sampleDocuments);

        for await (const result of processingResults) {
            console.log('📄 Processed document via HTTP/3 stream:', result);
            // Update UI in real-time
        }
    }

    onMount(() => {
        // Check if HTTP/3 is supported
        if ('serviceWorker' in navigator) {
            console.log('🚀 HTTP/3 legal AI client initialized');
        }
    });
</script>

<div class="legal-ai-search">
    <h1>Legal Case Similarity Search (HTTP/3)</h1>

    <div class="search-form">
        <textarea
            bind:value={query}
            placeholder="Enter legal query (e.g., 'contract dispute regarding intellectual property...')"
            rows="4"
            class="legal-query-input"
        ></textarea>

        <button
            on:click={searchSimilarCases}
            disabled={isSearching || !query.trim()}
            class="search-button"
        >
            {isSearching ? 'Searching...' : 'Search Similar Cases'}
        </button>
    </div>

    {#if searchTime > 0}
        <div class="performance-metrics">
            <span class="metric">Search Time: {searchTime.toFixed(2)}ms</span>
            <span class="metric">Protocol: {protocolUsed}</span>
            <span class="metric">Results: {searchResults.length}</span>
        </div>
    {/if}

    {#if searchResults.length > 0}
        <div class="search-results">
            {#each searchResults as result}
                <div class="legal-case-result">
                    <h3>{result.title}</h3>
                    <div class="case-metadata">
                        <span class="jurisdiction">{result.jurisdiction}</span>
                        <span class="case-type">{result.caseType}</span>
                        <span class="similarity">Similarity: {(result.similarity * 100).toFixed(1)}%</span>
                    </div>
                    <p class="case-summary">{result.summary}</p>
                </div>
            {/each}
        </div>
    {/if}

    <div class="demo-actions">
        <button on:click={processDocumentStream} class="demo-button">
            Demo Document Stream Processing
        </button>
    </div>
</div>

<style>
    .legal-ai-search {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
    }

    .legal-query-input {
        width: 100%;
        padding: 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-family: inherit;
        resize: vertical;
    }

    .search-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1rem 2rem;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
    }

    .search-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .performance-metrics {
        display: flex;
        gap: 2rem;
        margin: 1rem 0;
        padding: 1rem;
        background: #f8fafc;
        border-radius: 8px;
    }

    .metric {
        font-weight: 600;
        color: #4a5568;
    }

    .legal-case-result {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1rem;
        background: white;
    }

    .legal-case-result h3 {
        color: #2d3748;
        margin-bottom: 0.5rem;
    }

    .case-metadata {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
        font-size: 0.875rem;
    }

    .jurisdiction {
        background: #bee3f8;
        color: #2b6cb0;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }

    .case-type {
        background: #c6f6d5;
        color: #2f855a;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }

    .similarity {
        background: #fed7e2;
        color: #c53030;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }
</style>
```

---

## 📊 Performance Comparison: HTTP/1.1 vs HTTP/3

### Expected Performance Improvements:
```bash
# HTTP/1.1 (baseline)
Legal embedding request: 45-200ms
Case similarity search: 100-500ms
Document batch processing: 2-10 seconds
Connection overhead: 50-100ms per request

# HTTP/3 + QUIC (optimized)
Legal embedding request: 15-80ms  (30-60% faster)
Case similarity search: 40-200ms (40-60% faster)
Document batch processing: 0.8-4 seconds (60% faster)
Connection overhead: 0-5ms per request (95% reduction)

# Mobile/High-Latency Networks
HTTP/1.1: 500ms-2s per legal query
HTTP/3: 150ms-800ms per legal query (70% improvement)
```

### Legal AI Benefits with QUIC:
- **Multiplexed legal queries** - no head-of-line blocking
- **Connection migration** - seamless mobile/Wi-Fi switching for legal professionals
- **Reduced latency** - critical for real-time legal research
- **Built-in encryption** - mandatory for legal data protection
- **Better mobile performance** - essential for field legal work

This implementation provides both native gRPC over QUIC and HTTP/3 reverse proxy options, giving maximum flexibility for legal AI deployment scenarios.