# YOLO/SAM Legal Document Analysis Pipeline

A comprehensive legal document analysis pipeline using YOLO object detection and SAM segmentation models, with MinIO (M1) and PostgreSQL BLOB (M3) storage integration.

## Features

- **YOLO Object Detection**: Identifies legal entities (signatures, stamps, text blocks, form fields)
- **SAM Segmentation**: Precise segmentation masks for detected entities
- **Dual Storage**: MinIO for document storage (M1) + PostgreSQL BLOB for metadata (M3)
- **Real-time Processing**: WebSocket support for live analysis updates
- **REST API**: HTTP endpoints for document upload and analysis retrieval
- **Vector Embeddings**: pgvector integration for similarity search
- **Multi-format Support**: JPEG, PNG, TIFF, PDF processing

## Architecture

```
Document Upload → YOLO Detection → SAM Segmentation → Entity Classification → Storage (MinIO + Postgres)
```

## Installation

```bash
npm install
```

## Setup

### 1. Environment Variables

Create a `.env` file:

```env
# MinIO Configuration (M1 Storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# PostgreSQL Configuration (M3 Storage)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=legal_ai_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Pipeline Configuration
NODE_ENV=development
PORT=3001
```

### 2. Database Setup

```bash
npm run setup-db
```

This creates the necessary tables:
- `document_analyses`: Analysis results and metadata
- `document_embeddings`: Vector embeddings for similarity search

### 3. Model Download

```bash
npm run download-models
```

Downloads YOLO and SAM models to the `models/` directory.

## Usage

### Start the Pipeline

```bash
npm start
```

The server will start on port 3001 with WebSocket support on port 8083.

### API Endpoints

#### POST /analyze
Upload and analyze a document.

```bash
curl -X POST -F "document=@legal_document.pdf" http://localhost:3001/analyze
```

**Response:**
```json
{
  "id": "uuid",
  "filename": "legal_document.pdf",
  "mimeType": "application/pdf",
  "width": 2480,
  "height": 3508,
  "entities": [
    {
      "id": "uuid",
      "type": "signature",
      "bbox": [100, 200, 300, 250],
      "confidence": 0.95,
      "metadata": {
        "samScore": 0.89,
        "mask": [...]
      }
    }
  ],
  "processingTime": 1250,
  "timestamp": "2024-01-01T12:00:00Z",
  "minioPath": "analyses/uuid/legal_document.pdf"
}
```

#### GET /analysis/:id
Retrieve analysis results by ID.

```bash
curl http://localhost:3001/analysis/uuid
```

#### GET /analyses
List recent analyses.

```bash
curl "http://localhost:3001/analyses?limit=10&offset=0"
```

#### GET /health
Health check endpoint.

```bash
curl http://localhost:3001/health
```

### WebSocket Real-time Analysis

Connect to `ws://localhost:8083` for real-time analysis updates:

```javascript
const ws = new WebSocket('ws://localhost:8083');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'analysis_started':
      console.log('Analysis started:', data.id);
      break;
    case 'progress':
      console.log(`Progress: ${data.progress}% - ${data.step}`);
      break;
    case 'analysis_complete':
      console.log('Analysis complete:', data.result);
      break;
  }
};

// Start analysis
ws.send(JSON.stringify({
  type: 'analyze_document',
  id: 'document-uuid'
}));
```

## Legal Entity Types

The pipeline classifies detected entities into:

- **signature**: Handwritten signatures
- **stamp**: Official stamps or seals
- **text_block**: Blocks of text content
- **form_field**: Form input fields
- **document_boundary**: Document edges or boundaries

## Storage Strategy

### MinIO (M1): Document Storage
- Original documents stored as objects
- Path structure: `analyses/{analysis_id}/{filename}`
- Bucket: `legal-documents`

### PostgreSQL (M3): Metadata & Vectors
- Analysis metadata and entity information
- Vector embeddings for similarity search using pgvector
- JSON storage for complex entity data

## Model Configuration

### YOLO Model
- Input size: 640x640
- Confidence threshold: 0.5
- Detects legal document entities

### SAM Model
- ViT-Base architecture
- Generates segmentation masks for detected entities
- Supports point and box prompts

## Performance

- **Typical processing time**: 1-3 seconds per document
- **Memory usage**: ~2-4GB RAM during processing
- **Concurrent requests**: Up to 5 simultaneous analyses

## Development

```bash
# Development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Integration with SvelteKit Frontend

The pipeline integrates seamlessly with the SvelteKit frontend:

1. Upload documents via the frontend
2. Real-time progress updates via WebSocket
3. Display analysis results with bounding boxes
4. Store results in shared PostgreSQL database

## Dependencies

- **@huggingface/transformers**: YOLO model inference
- **onnxruntime-node**: SAM model inference
- **minio**: MinIO client for document storage
- **pg**: PostgreSQL client with pgvector support
- **sharp**: Image processing and resizing
- **canvas**: Canvas API for image manipulation
- **express**: REST API server
- **multer**: File upload handling
- **ws**: WebSocket server for real-time updates

## Error Handling

The pipeline includes comprehensive error handling:
- Invalid file types rejected at upload
- Model loading failures with graceful degradation
- Database connection issues with retry logic
- WebSocket connection errors handled gracefully

## Security

- File type validation on upload
- Size limits (50MB max)
- CORS configuration for frontend integration
- Environment variable configuration for credentials

## Monitoring

- Health check endpoints
- Processing time metrics
- Error logging and reporting
- WebSocket connection monitoring

## Future Enhancements

- **OCR Integration**: Extract text from detected regions
- **Multi-language Support**: Support for non-English legal documents
- **Batch Processing**: Process multiple documents simultaneously
- **Model Fine-tuning**: Custom training on legal document datasets
- **Advanced Classification**: More granular entity type detection