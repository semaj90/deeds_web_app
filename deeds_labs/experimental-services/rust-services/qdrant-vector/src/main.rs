use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use clap::Parser;
use futures::stream::{self, StreamExt};
use parking_lot::RwLock;
use qdrant_client::{
    prelude::*,
    qdrant::{
        CreateCollection, Distance, PointStruct, SearchPoints, UpsertPoints, VectorParams, VectorsConfig
    },
};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tokio::signal;
use tracing::{error, info, warn};
use uuid::Uuid;
use warp::Filter;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Port to run the service on
    #[arg(short, long, default_value = "6334")]
    port: u16,

    /// Qdrant server URL
    #[arg(short, long, default_value = "http://127.0.0.1:6333")]
    qdrant_url: String,

    /// Vector dimension
    #[arg(short, long, default_value = "768")]
    vector_dim: usize,

    /// Collection name
    #[arg(short, long, default_value = "legal_documents")]
    collection: String,

    /// Enable WASM bridge
    #[arg(long, default_value = "true")]
    webasm_bridge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Document {
    pub id: String,
    pub content: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub embedding: Option<Vec<f32>>,
    pub auto_tags: Vec<AutoTag>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AutoTag {
    pub name: String,
    pub confidence: f32,
    pub category: String,
    pub source: String, // "ml", "similarity", "manual"
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchRequest {
    pub query_vector: Vec<f32>,
    pub limit: Option<usize>,
    pub filter: Option<HashMap<String, serde_json::Value>>,
    pub with_payload: Option<bool>,
    pub score_threshold: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResponse {
    pub documents: Vec<ScoredDocument>,
    pub total_found: usize,
    pub processing_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ScoredDocument {
    pub document: Document,
    pub score: f32,
}

#[derive(Debug, Serialize, Deserialize)]
struct UpsertRequest {
    pub documents: Vec<Document>,
    pub auto_generate_embeddings: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UpsertResponse {
    pub success: bool,
    pub processed_count: usize,
    pub errors: Vec<String>,
    pub processing_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct AutoTagRequest {
    pub content: String,
    pub existing_tags: Option<Vec<String>>,
    pub min_confidence: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AutoTagResponse {
    pub tags: Vec<AutoTag>,
    pub processing_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct HealthResponse {
    pub status: String,
    pub version: String,
    pub qdrant_connected: bool,
    pub collection_exists: bool,
    pub document_count: u64,
    pub uptime_seconds: u64,
}

pub struct QdrantVectorService {
    client: QdrantClient,
    collection_name: String,
    vector_dim: usize,
    start_time: Instant,
    stats: Arc<RwLock<ServiceStats>>,
}

#[derive(Debug, Default)]
struct ServiceStats {
    documents_processed: u64,
    searches_performed: u64,
    embeddings_generated: u64,
    auto_tags_created: u64,
}

impl QdrantVectorService {
    pub async fn new(qdrant_url: &str, collection_name: String, vector_dim: usize) -> Result<Self> {
        let client = QdrantClient::from_url(qdrant_url).build()?;
        
        let service = Self {
            client,
            collection_name,
            vector_dim,
            start_time: Instant::now(),
            stats: Arc::new(RwLock::new(ServiceStats::default())),
        };

        // Initialize collection
        service.ensure_collection().await?;
        
        Ok(service)
    }

    async fn ensure_collection(&self) -> Result<()> {
        // Check if collection exists
        let collections = self.client.list_collections().await?;
        
        let exists = collections
            .collections
            .iter()
            .any(|c| c.name == self.collection_name);

        if !exists {
            info!("Creating collection: {}", self.collection_name);
            
            self.client
                .create_collection(&CreateCollection {
                    collection_name: self.collection_name.clone(),
                    vectors_config: Some(VectorsConfig {
                        config: Some(qdrant_client::qdrant::vectors_config::Config::Params(
                            VectorParams {
                                size: self.vector_dim as u64,
                                distance: Distance::Cosine.into(),
                                ..Default::default()
                            },
                        )),
                    }),
                    ..Default::default()
                })
                .await?;
            
            info!("Collection {} created successfully", self.collection_name);
        } else {
            info!("Collection {} already exists", self.collection_name);
        }

        Ok(())
    }

    pub async fn upsert_documents(&self, documents: Vec<Document>) -> Result<UpsertResponse> {
        let start_time = Instant::now();
        let mut errors = Vec::new();
        let mut processed_count = 0;

        // Convert documents to Qdrant points
        let points: Vec<PointStruct> = documents
            .into_par_iter()
            .filter_map(|doc| {
                match self.document_to_point(doc) {
                    Ok(point) => {
                        processed_count += 1;
                        Some(point)
                    }
                    Err(e) => {
                        errors.push(format!("Failed to convert document: {}", e));
                        None
                    }
                }
            })
            .collect();

        if !points.is_empty() {
            let upsert_request = UpsertPoints {
                collection_name: self.collection_name.clone(),
                points,
                ..Default::default()
            };

            if let Err(e) = self.client.upsert_points(upsert_request).await {
                errors.push(format!("Qdrant upsert failed: {}", e));
            } else {
                // Update stats
                self.stats.write().documents_processed += processed_count as u64;
            }
        }

        Ok(UpsertResponse {
            success: errors.is_empty(),
            processed_count,
            errors,
            processing_time_ms: start_time.elapsed().as_millis() as u64,
        })
    }

    pub async fn search_documents(&self, request: SearchRequest) -> Result<SearchResponse> {
        let start_time = Instant::now();
        
        let search_request = SearchPoints {
            collection_name: self.collection_name.clone(),
            vector: request.query_vector,
            limit: request.limit.unwrap_or(10) as u64,
            with_payload: Some(request.with_payload.unwrap_or(true)),
            score_threshold: request.score_threshold,
            filter: request.filter.map(|f| self.build_filter(f)),
            ..Default::default()
        };

        let search_result = self.client.search_points(&search_request).await?;
        
        let documents: Vec<ScoredDocument> = search_result
            .result
            .into_iter()
            .filter_map(|scored_point| {
                self.point_to_document(scored_point)
                    .map(|doc| ScoredDocument {
                        document: doc,
                        score: scored_point.score,
                    })
                    .ok()
            })
            .collect();

        // Update stats
        self.stats.write().searches_performed += 1;

        Ok(SearchResponse {
            total_found: documents.len(),
            documents,
            processing_time_ms: start_time.elapsed().as_millis() as u64,
        })
    }

    pub async fn auto_tag_content(&self, request: AutoTagRequest) -> Result<AutoTagResponse> {
        let start_time = Instant::now();
        let mut tags = Vec::new();

        // Generate embedding for content
        let embedding = self.generate_mock_embedding(&request.content);
        
        // Find similar documents for tag suggestion
        let similar_docs = self.search_documents(SearchRequest {
            query_vector: embedding,
            limit: Some(10),
            filter: None,
            with_payload: Some(true),
            score_threshold: Some(0.7), // High similarity threshold
        }).await?;

        // Extract tags from similar documents
        for scored_doc in similar_docs.documents {
            for existing_tag in &scored_doc.document.auto_tags {
                let confidence = existing_tag.confidence * scored_doc.score;
                let min_confidence = request.min_confidence.unwrap_or(0.5);
                
                if confidence >= min_confidence {
                    tags.push(AutoTag {
                        name: existing_tag.name.clone(),
                        confidence,
                        category: existing_tag.category.clone(),
                        source: "similarity".to_string(),
                    });
                }
            }
        }

        // Generate ML-based tags (mock implementation)
        let ml_tags = self.generate_ml_tags(&request.content);
        tags.extend(ml_tags);

        // Remove duplicates and sort by confidence
        tags.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        tags.dedup_by(|a, b| a.name == b.name);

        // Update stats
        self.stats.write().auto_tags_created += tags.len() as u64;

        Ok(AutoTagResponse {
            tags,
            processing_time_ms: start_time.elapsed().as_millis() as u64,
        })
    }

    pub async fn get_health(&self) -> Result<HealthResponse> {
        let qdrant_connected = self.client.health_check().await.is_ok();
        
        let collections = self.client.list_collections().await.unwrap_or_default();
        let collection_exists = collections
            .collections
            .iter()
            .any(|c| c.name == self.collection_name);

        let document_count = if collection_exists {
            self.client
                .count_points(&self.collection_name)
                .await
                .map(|r| r.result.map(|c| c.count).unwrap_or(0))
                .unwrap_or(0)
        } else {
            0
        };

        Ok(HealthResponse {
            status: if qdrant_connected { "healthy".to_string() } else { "unhealthy".to_string() },
            version: "1.0.0".to_string(),
            qdrant_connected,
            collection_exists,
            document_count,
            uptime_seconds: self.start_time.elapsed().as_secs(),
        })
    }

    fn document_to_point(&self, doc: Document) -> Result<PointStruct> {
        let embedding = doc.embedding
            .ok_or_else(|| anyhow!("Document must have embedding"))?;

        if embedding.len() != self.vector_dim {
            return Err(anyhow!(
                "Embedding dimension mismatch: expected {}, got {}",
                self.vector_dim,
                embedding.len()
            ));
        }

        let mut payload = HashMap::new();
        payload.insert("content".to_string(), doc.content.into());
        payload.insert("created_at".to_string(), doc.created_at.to_rfc3339().into());
        payload.insert("updated_at".to_string(), doc.updated_at.to_rfc3339().into());
        payload.insert("auto_tags".to_string(), serde_json::to_value(&doc.auto_tags)?.into());

        // Add metadata
        for (key, value) in doc.metadata {
            payload.insert(key, value.into());
        }

        Ok(PointStruct {
            id: Some(doc.id.into()),
            vectors: Some(embedding.into()),
            payload,
        })
    }

    fn point_to_document(&self, point: ScoredPoint) -> Result<Document> {
        let id = point.id
            .ok_or_else(|| anyhow!("Point must have ID"))?
            .to_string();

        let payload = point.payload;
        
        let content = payload.get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let created_at = payload.get("created_at")
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let updated_at = payload.get("updated_at")
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let auto_tags: Vec<AutoTag> = payload.get("auto_tags")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        // Extract metadata (excluding system fields)
        let mut metadata = HashMap::new();
        for (key, value) in payload {
            if !["content", "created_at", "updated_at", "auto_tags"].contains(&key.as_str()) {
                metadata.insert(key, value.into());
            }
        }

        Ok(Document {
            id,
            content,
            metadata,
            embedding: None, // Don't return embeddings in search results by default
            auto_tags,
            created_at,
            updated_at,
        })
    }

    fn build_filter(&self, _filter: HashMap<String, serde_json::Value>) -> qdrant_client::qdrant::Filter {
        // Simplified filter implementation
        // In production, this would convert the filter map to proper Qdrant filters
        qdrant_client::qdrant::Filter::default()
    }

    fn generate_mock_embedding(&self, content: &str) -> Vec<f32> {
        // Mock embedding generation - in production, this would call the Legal-BERT service
        let mut embedding = vec![0.0; self.vector_dim];
        
        // Generate deterministic embedding based on content hash
        let mut hash = 0u32;
        for byte in content.bytes() {
            hash = hash.wrapping_mul(31).wrapping_add(byte as u32);
        }

        for (i, val) in embedding.iter_mut().enumerate() {
            let seed = (hash.wrapping_add(i as u32)) as f32;
            *val = (seed % 2000.0 - 1000.0) / 1000.0 * 0.1;
        }

        // Normalize
        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for val in &mut embedding {
                *val /= norm;
            }
        }

        embedding
    }

    fn generate_ml_tags(&self, content: &str) -> Vec<AutoTag> {
        // Mock ML tag generation - in production, this would use a proper ML model
        let mut tags = Vec::new();
        
        let legal_terms = [
            ("contract", "legal_document"),
            ("litigation", "legal_process"),
            ("evidence", "legal_evidence"),
            ("statute", "legal_code"),
            ("precedent", "case_law"),
            ("jurisdiction", "legal_territory"),
            ("plaintiff", "legal_party"),
            ("defendant", "legal_party"),
            ("damages", "legal_remedy"),
            ("injunction", "legal_remedy"),
        ];

        for (term, category) in &legal_terms {
            if content.to_lowercase().contains(term) {
                let confidence = 0.8 + (content.matches(term).count() as f32 * 0.1).min(0.2);
                tags.push(AutoTag {
                    name: term.to_string(),
                    confidence,
                    category: category.to_string(),
                    source: "ml".to_string(),
                });
            }
        }

        tags
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let args = Args::parse();

    info!("Starting Qdrant Vector Service");
    info!("Port: {}", args.port);
    info!("Qdrant URL: {}", args.qdrant_url);
    info!("Vector dimension: {}", args.vector_dim);
    info!("Collection: {}", args.collection);

    // Initialize service
    let service = Arc::new(
        QdrantVectorService::new(&args.qdrant_url, args.collection, args.vector_dim).await?
    );

    // Setup routes
    let health_route = warp::path("health")
        .and(warp::get())
        .and(with_service(service.clone()))
        .and_then(handle_health);

    let upsert_route = warp::path("upsert")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_service(service.clone()))
        .and_then(handle_upsert);

    let search_route = warp::path("search")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_service(service.clone()))
        .and_then(handle_search);

    let auto_tag_route = warp::path("auto-tag")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_service(service.clone()))
        .and_then(handle_auto_tag);

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["GET", "POST", "OPTIONS"]);

    let routes = health_route
        .or(upsert_route)
        .or(search_route)
        .or(auto_tag_route)
        .with(cors)
        .with(warp::log("qdrant_vector_service"));

    // Start server
    info!("Qdrant Vector Service listening on 0.0.0.0:{}", args.port);
    
    let server = warp::serve(routes).run(([0, 0, 0, 0], args.port));
    
    // Wait for shutdown signal
    tokio::select! {
        _ = server => {},
        _ = signal::ctrl_c() => {
            info!("Shutdown signal received");
        }
    }

    info!("Qdrant Vector Service stopped");
    Ok(())
}

fn with_service(
    service: Arc<QdrantVectorService>,
) -> impl Filter<Extract = (Arc<QdrantVectorService>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || service.clone())
}

async fn handle_health(
    service: Arc<QdrantVectorService>,
) -> Result<impl warp::Reply, warp::Rejection> {
    match service.get_health().await {
        Ok(health) => Ok(warp::reply::json(&health)),
        Err(e) => {
            error!("Health check failed: {}", e);
            Ok(warp::reply::json(&serde_json::json!({
                "status": "error",
                "error": e.to_string()
            })))
        }
    }
}

async fn handle_upsert(
    request: UpsertRequest,
    service: Arc<QdrantVectorService>,
) -> Result<impl warp::Reply, warp::Rejection> {
    match service.upsert_documents(request.documents).await {
        Ok(response) => Ok(warp::reply::json(&response)),
        Err(e) => {
            error!("Upsert failed: {}", e);
            Ok(warp::reply::json(&serde_json::json!({
                "success": false,
                "error": e.to_string()
            })))
        }
    }
}

async fn handle_search(
    request: SearchRequest,
    service: Arc<QdrantVectorService>,
) -> Result<impl warp::Reply, warp::Rejection> {
    match service.search_documents(request).await {
        Ok(response) => Ok(warp::reply::json(&response)),
        Err(e) => {
            error!("Search failed: {}", e);
            Ok(warp::reply::json(&serde_json::json!({
                "documents": [],
                "total_found": 0,
                "error": e.to_string()
            })))
        }
    }
}

async fn handle_auto_tag(
    request: AutoTagRequest,
    service: Arc<QdrantVectorService>,
) -> Result<impl warp::Reply, warp::Rejection> {
    match service.auto_tag_content(request).await {
        Ok(response) => Ok(warp::reply::json(&response)),
        Err(e) => {
            error!("Auto-tag failed: {}", e);
            Ok(warp::reply::json(&serde_json::json!({
                "tags": [],
                "error": e.to_string()
            })))
        }
    }
}