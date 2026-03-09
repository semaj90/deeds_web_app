/**
 * Enhanced REST API Architecture for Legal AI
 * Self-Organizing Map + K-Means Clustering with Multi-Database Integration
 */

import type { QdrantClient } from '@qdrant/js-client-rest';
import type { Redis } from 'ioredis';
import type { Driver as Neo4jDriver } from 'neo4j-driver';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// =============================================================================
// CORE TYPES & INTERFACES
// =============================================================================

export interface EnhancedRestApiConfig {
  // Database Connections
  postgresql: PostgresJsDatabase<any>;
  redis: Redis;
  qdrant: QdrantClient;
  neo4j: Neo4jDriver;
  
  // Message Queue
  rabbitmq: {
    url: string;
    exchanges: {
      clustering: string;
      embeddings: string;
      analysis: string;
    };
  };
  
  // ML Configuration
  clustering: {
    som: SOMConfig;
    kmeans: KMeansConfig;
  };
}

export interface SOMConfig {
  width: number;
  height: number;
  learningRate: number;
  radius: number;
  iterations: number;
  dimensions: number; // Embedding dimensions (384 for Gemma3)
}

export interface KMeansConfig {
  k: number; // Number of clusters
  maxIterations: number;
  tolerance: number;
  initMethod: 'random' | 'kmeans++';
}

// Document Clustering Results
export interface ClusterResult {
  clusterId: string;
  centroid: number[];
  documents: DocumentCluster[];
  coherenceScore: number;
  somPosition: { x: number; y: number };
}

export interface DocumentCluster {
  documentId: string;
  similarity: number;
  embedding: number[];
  metadata: Record<string, any>;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata: {
    timestamp: string;
    processingTime: number;
    clusterId?: string;
    confidence?: number;
  };
}

// =============================================================================
// CLUSTERING SERVICE INTERFACES
// =============================================================================

export interface SelfOrganizingMap {
  train(embeddings: number[][]): Promise<void>;
  cluster(embedding: number[]): Promise<{ x: number; y: number; confidence: number }>;
  getNeighborhood(x: number, y: number, radius: number): Promise<number[][]>;
  visualize(): Promise<{ width: number; height: number; neurons: number[][] }>;
}

export interface KMeansClusterer {
  fit(embeddings: number[][]): Promise<ClusterResult[]>;
  predict(embedding: number[]): Promise<string>;
  getCentroids(): Promise<number[][]>;
  silhouetteScore(): Promise<number>;
}

// =============================================================================
// MESSAGE QUEUE INTERFACES
// =============================================================================

export interface ClusteringMessage {
  messageId: string;
  type: 'som_training' | 'kmeans_clustering' | 'document_analysis';
  payload: {
    documentIds: string[];
    embeddings: number[][];
    metadata: Record<string, any>;
  };
  priority: 'high' | 'medium' | 'low';
  timestamp: string;
}

export interface EmbeddingMessage {
  messageId: string;
  documentId: string;
  content: string;
  extractedText: string;
  requestedBy: string;
  callbackUrl?: string;
}

// =============================================================================
// DATABASE SCHEMA INTERFACES
// =============================================================================

export interface DocumentEmbedding {
  id: string;
  documentId: string;
  embedding: number[]; // pgvector
  chunkIndex: number;
  clusterId?: string;
  somPosition?: { x: number; y: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface ClusterAnalysis {
  id: string;
  clusterId: string;
  algorithmType: 'som' | 'kmeans' | 'hybrid';
  centroid: number[];
  coherenceScore: number;
  documentCount: number;
  keywords: string[];
  legalTopics: string[];
  confidence: number;
  createdAt: Date;
}

export interface GraphRelationship {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: 'similar' | 'references' | 'contradicts' | 'supports';
  strength: number;
  clusterId?: string;
  extractedBy: 'som' | 'kmeans' | 'graph_analysis';
}

// =============================================================================
// API ENDPOINT INTERFACES
// =============================================================================

export interface ClusteringApiEndpoints {
  // Document Processing
  '/api/documents/embed': {
    POST: {
      body: { documentId: string; content: string; priority?: 'high' | 'medium' | 'low' };
      response: ApiResponse<{ embeddingId: string; queuePosition: number }>;
    };
  };
  
  // Clustering Operations
  '/api/clustering/som/train': {
    POST: {
      body: { documentIds: string[]; config?: Partial<SOMConfig> };
      response: ApiResponse<{ trainingId: string; estimatedTime: number }>;
    };
  };
  
  '/api/clustering/kmeans/cluster': {
    POST: {
      body: { documentIds: string[]; k?: number };
      response: ApiResponse<{ clusters: ClusterResult[] }>;
    };
  };
  
  // Search & Analysis
  '/api/search/semantic': {
    POST: {
      body: { query: string; clusterId?: string; useKnowledge?: boolean };
      response: ApiResponse<{ results: DocumentCluster[]; clusters: string[] }>;
    };
  };
  
  '/api/analysis/cluster-insights': {
    GET: {
      params: { clusterId: string };
      response: ApiResponse<{ 
        insights: string;
        legalTopics: string[];
        riskFactors: string[];
        recommendations: string[];
      }>;
    };
  };
  
  // Real-time Status
  '/api/clustering/status': {
    GET: {
      response: ApiResponse<{
        som: { trained: boolean; accuracy: number };
        kmeans: { clusters: number; silhouetteScore: number };
        queue: { pending: number; processing: number };
      }>;
    };
  };
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

export interface ClusteringMetrics {
  som: {
    trainingTime: number;
    accuracy: number;
    convergence: boolean;
    neuronsActivated: number;
  };
  kmeans: {
    silhouetteScore: number;
    inertia: number;
    iterations: number;
    convergenceTime: number;
  };
  system: {
    documentsProcessed: number;
    averageProcessingTime: number;
    queueBacklog: number;
    errorRate: number;
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type ClusteringAlgorithm = 'som' | 'kmeans' | 'hybrid';
export type ProcessingStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type LegalDocumentType = 'contract' | 'case_law' | 'regulation' | 'filing' | 'evidence';

export interface ProcessingPipeline {
  documentId: string;
  stages: {
    embedding: ProcessingStatus;
    clustering: ProcessingStatus;
    analysis: ProcessingStatus;
    indexing: ProcessingStatus;
  };
  estimatedCompletion: Date;
  priority: 'high' | 'medium' | 'low';
}