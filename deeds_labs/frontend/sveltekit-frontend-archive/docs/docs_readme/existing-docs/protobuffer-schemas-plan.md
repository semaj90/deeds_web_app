# Protobuffer/FlatBuffer Schema Architecture Plan

## Overview

This document outlines the transition from JSON to binary serialization formats (Protocol Buffers
and FlatBuffers) for the legal AI platform, optimizing performance for high-throughput legal
document processing and real-time AI inference.

## Current State Analysis

- **Current Format**: JSON for all API communication
- **Performance Issues**:
  - Large legal document payloads (100MB+ files)
  - High latency for real-time chat
  - Excessive bandwidth usage for vector embeddings
- **Existing Binary Dependencies**: `flatbuffers`, `google-protobuf` already installed

## Proposed Schema Architecture

### 1. Protocol Buffers (.proto) - For Structured Data

**Use Cases:**

- API request/response messages
- Configuration data
- User authentication tokens
- Metadata structures

**Schema Design:**

```protobuf
// legal_api.proto
syntax = "proto3";

package legal.api;

// User and authentication
message User {
  string id = 1;
  string email = 2;
  string name = 3;
  repeated string roles = 4;
  int64 created_at = 5;
  int64 updated_at = 6;
}

message AuthRequest {
  string email = 1;
  string password = 2;
  bool remember_me = 3;
}

message AuthResponse {
  bool success = 1;
  string token = 2;
  User user = 3;
  string error_message = 4;
}

// Legal Document Core
message LegalDocument {
  string id = 1;
  string title = 2;
  string content = 3; // For smaller docs
  string file_url = 4; // For larger docs
  DocumentType type = 5;
  repeated string tags = 6;
  DocumentMetadata metadata = 7;
  int64 created_at = 8;
  int64 updated_at = 9;
}

enum DocumentType {
  UNKNOWN = 0;
  CONTRACT = 1;
  BRIEF = 2;
  EVIDENCE = 3;
  CITATION = 4;
  RULING = 5;
}

message DocumentMetadata {
  string jurisdiction = 1;
  string court_level = 2;
  repeated Party parties = 3;
  repeated string practice_areas = 4;
  float confidence_score = 5;
  string risk_level = 6;
}

message Party {
  string name = 1;
  string role = 2; // plaintiff, defendant, etc.
  string type = 3; // individual, organization
}

// Search and Query
message SearchRequest {
  string query = 1;
  repeated string filters = 2;
  int32 limit = 3;
  int32 offset = 4;
  SearchType type = 5;
  bool include_embeddings = 6;
}

enum SearchType {
  FULL_TEXT = 0;
  SEMANTIC = 1;
  VECTOR = 2;
  HYBRID = 3;
}

message SearchResponse {
  repeated SearchResult results = 1;
  int32 total_count = 2;
  float max_score = 3;
  string query_id = 4;
}

message SearchResult {
  LegalDocument document = 1;
  float score = 2;
  repeated string highlights = 3;
  VectorSimilarity similarity = 4;
}

// AI and Chat
message ChatMessage {
  string id = 1;
  string user_id = 2;
  string content = 3;
  MessageType type = 4;
  repeated Attachment attachments = 5;
  int64 timestamp = 6;
}

enum MessageType {
  USER = 0;
  ASSISTANT = 1;
  SYSTEM = 2;
  ERROR = 3;
}

message ChatResponse {
  string response = 1;
  repeated string sources = 2;
  float confidence = 3;
  string model_used = 4;
  int32 tokens_used = 5;
}

message Attachment {
  string filename = 1;
  string content_type = 2;
  int64 size = 3;
  string url = 4;
}
```

### 2. FlatBuffers (.fbs) - For High-Performance Data

**Use Cases:**

- Large legal document content
- Vector embeddings (1536+ dimensions)
- Real-time streaming data
- Cache data structures

**Schema Design:**

```flatbuffers
// legal_data.fbs
namespace LegalData;

// High-performance document storage
table DocumentContent {
  id: string;
  title: string;
  content: [ubyte]; // Raw document bytes
  content_type: string;
  compressed: bool;
  checksum: uint32;
}

// Vector embeddings optimized for memory
table VectorEmbedding {
  document_id: string;
  embedding: [float]; // 1536 dimensions for OpenAI
  model: string;
  version: string;
  metadata: VectorMetadata;
}

table VectorMetadata {
  created_at: uint64;
  chunk_index: uint32;
  chunk_text: string;
  confidence: float;
}

// Batch operations for performance
table EmbeddingBatch {
  embeddings: [VectorEmbedding];
  batch_id: string;
  total_count: uint32;
  processed_at: uint64;
}

// Search results optimized for speed
table SearchResults {
  query: string;
  results: [SearchHit];
  total_hits: uint32;
  processing_time_ms: uint32;
}

table SearchHit {
  document_id: string;
  score: float;
  highlights: [string];
  embedding: VectorEmbedding;
}

// Real-time chat streaming
table ChatStream {
  session_id: string;
  messages: [ChatMessage];
  active_users: [string];
  last_activity: uint64;
}

table ChatMessage {
  id: string;
  user_id: string;
  content: string;
  message_type: ubyte; // 0=user, 1=ai, 2=system
  timestamp: uint64;
  tokens: uint32;
}

// Legal analysis cache structures
table AnalysisCache {
  key: string;
  analysis_type: string;
  result: [ubyte]; // Serialized analysis result
  confidence: float;
  expires_at: uint64;
  dependencies: [string]; // Document IDs this analysis depends on
}

root_type DocumentContent;
```

## Implementation Strategy

### Phase 1: Core API Migration

1. **Convert authentication endpoints** to protobuf
2. **Convert document CRUD** operations to protobuf
3. **Keep JSON fallback** for compatibility

### Phase 2: Performance-Critical Paths

1. **Vector embeddings** to FlatBuffers
2. **Search results** to FlatBuffers
3. **Chat streaming** to FlatBuffers

### Phase 3: Full Migration

1. **All API endpoints** using protobuf
2. **Large document storage** using FlatBuffers
3. **Remove JSON fallbacks**

## Integration Points

### Frontend (SvelteKit)

```typescript
// Generated TypeScript from protobuf
import { AuthRequest, AuthResponse } from './proto/legal_api_pb';
import { DocumentContent } from './flatbuf/legal_data_generated';

// Protobuf usage
const authReq = new AuthRequest();
authReq.setEmail(email);
authReq.setPassword(password);

const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-protobuf' },
  body: authReq.serializeBinary(),
});

// FlatBuffer usage for large data
const builder = new flatbuffers.Builder(1024);
const contentOffset = builder.createString(documentText);
const docContent = DocumentContent.createDocumentContent(
  builder,
  idOffset,
  titleOffset,
  contentOffset
);
```

### Backend (Go/Node.js)

```go
// Go protobuf integration
func LoginHandler(w http.ResponseWriter, r *http.Request) {
    var authReq pb.AuthRequest
    body, _ := ioutil.ReadAll(r.Body)
    proto.Unmarshal(body, &authReq)

    // Process login...

    response := &pb.AuthResponse{
        Success: true,
        Token: token,
        User: userProto,
    }

    data, _ := proto.Marshal(response)
    w.Header().Set("Content-Type", "application/x-protobuf")
    w.Write(data)
}
```

## Performance Benefits

### Expected Improvements:

- **Payload size reduction**: 60-80% smaller than JSON
- **Serialization speed**: 5-10x faster than JSON.parse/stringify
- **Memory usage**: 40-60% reduction for large documents
- **Network bandwidth**: 50-70% reduction for API calls
- **Parse time**: 3-5x faster for complex structures

### Benchmarks Target:

- **Document upload**: JSON: 2.3s → Protobuf: 0.8s (65% improvement)
- **Search results**: JSON: 450ms → FlatBuffer: 120ms (73% improvement)
- **Chat streaming**: JSON: 50ms/message → FlatBuffer: 15ms/message (70% improvement)

## Fallback Strategy

### Graceful Degradation:

1. **Content negotiation**: Check `Accept` header for format preference
2. **Automatic conversion**: Convert between formats at API boundary
3. **Error handling**: Fall back to JSON on protobuf parsing errors
4. **Client detection**: Serve JSON to unsupported clients

```typescript
// Middleware example
app.use('/api', (req, res, next) => {
  if (req.headers.accept?.includes('application/x-protobuf')) {
    req.useProtobuf = true;
  }
  next();
});
```

## Schema Evolution

### Version Management:

- **Semantic versioning** for schema files
- **Field deprecation** rather than removal
- **Backward compatibility** for at least 2 major versions
- **Migration scripts** for breaking changes

### Example Schema Evolution:

```protobuf
message LegalDocument {
  string id = 1;
  string title = 2;
  string content = 3;

  // v2.0 additions
  DocumentStatus status = 10;
  repeated string collaborators = 11;

  // v2.1 additions
  SecurityLevel security_level = 12;
}
```

## Development Tools

### Required Tools:

- **protoc**: Protocol buffer compiler
- **flatc**: FlatBuffer compiler
- **protobuf-js**: JavaScript protobuf runtime
- **flatbuffers**: JavaScript flatbuffers runtime

### Build Integration:

```json
{
  "scripts": {
    "proto:generate": "protoc --js_out=import_style=commonjs,binary:src/proto proto/*.proto",
    "flatbuf:generate": "flatc --ts -o src/flatbuf schemas/*.fbs",
    "proto:watch": "nodemon --watch proto --ext proto --exec npm run proto:generate"
  }
}
```

## Testing Strategy

### Test Coverage:

1. **Unit tests**: Schema validation and serialization
2. **Integration tests**: End-to-end API workflows
3. **Performance tests**: Benchmark against JSON baseline
4. **Compatibility tests**: Cross-language serialization

### Example Test:

```typescript
describe('Legal Document Protobuf', () => {
  it('should serialize and deserialize correctly', () => {
    const doc = new LegalDocument();
    doc.setId('doc_123');
    doc.setTitle('Test Contract');
    doc.setType(DocumentType.CONTRACT);

    const bytes = doc.serializeBinary();
    const parsed = LegalDocument.deserializeBinary(bytes);

    expect(parsed.getId()).toBe('doc_123');
    expect(parsed.getType()).toBe(DocumentType.CONTRACT);
  });
});
```

## Security Considerations

### Data Protection:

- **Encryption at rest**: FlatBuffer data encrypted in database
- **Encryption in transit**: TLS for all protobuf communication
- **Access control**: Field-level permissions in schemas
- **Data validation**: Strict schema enforcement

### Schema Security:

```protobuf
message SecureLegalDocument {
  string id = 1;
  string title = 2;
  // Sensitive fields marked for encryption
  bytes encrypted_content = 3; // AES-256 encrypted
  repeated string authorized_users = 4;
  SecurityClassification classification = 5;
}
```

## Migration Timeline

### Week 1-2: Setup and Infrastructure

- Install protobuf/flatbuffer tools
- Create initial schemas
- Set up build pipeline
- Create test endpoints

### Week 3-4: Core API Migration

- Auth endpoints → protobuf
- Document CRUD → protobuf
- User management → protobuf

### Week 5-6: Performance Features

- Vector embeddings → FlatBuffers
- Search results → FlatBuffers
- Chat streaming → FlatBuffers

### Week 7-8: Full Migration and Optimization

- Remaining endpoints → protobuf
- Performance testing and optimization
- Remove JSON fallbacks
- Documentation and deployment

## Success Metrics

### Performance KPIs:

- API response time reduction: >50%
- Bandwidth usage reduction: >60%
- Memory usage reduction: >40%
- Client app startup time: >30% faster

### Quality KPIs:

- Zero data corruption incidents
- 99.9% backward compatibility
- <1% fallback to JSON usage
- Developer satisfaction: >8/10

This migration will significantly improve the performance and scalability of the legal AI platform
while maintaining backward compatibility and providing a smooth transition path.
