import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve } from 'path';
import { env } from '$env/dynamic/private';

const RETRIEVAL_GRPC_URL = env.RETRIEVAL_GRPC_URL ?? '127.0.0.1:50053';
const PROTO_PATH = resolve(process.cwd(), '../proto/active/retrieval.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const retrievalService = protoDescriptor.yorha.retrieval.RetrievalService;

const client = new retrievalService(
  RETRIEVAL_GRPC_URL,
  grpc.credentials.createInsecure(),
  {
    'grpc.keepalive_time_ms': 10_000,
    'grpc.keepalive_timeout_ms': 5_000,
    'grpc.keepalive_permit_without_calls': 1,
  }
);

/**
 * gRPC Client for the Go Retrieval Service.
 * Implements Lane 1 and Lane 2 high-speed retrieval paths.
 */
export const retrievalClient = {
  /**
   * Search for generic chunks (Codebase or Research)
   */
  searchChunks: (query: string, limit: number = 10, collection: string = 'codebase_chunks_768') => {
    return new Promise<any>((resolve, reject) => {
      client.SearchChunks({ query, limit, collection }, (err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  },

  /**
   * Fetch summary for a GPU/SOM cluster
   */
  getClusterSummary: (clusterId: number, clusterType: 'gpu' | 'som' = 'gpu') => {
    return new Promise<any>((resolve, reject) => {
      client.GetClusterSummary({ clusterId, clusterType }, (err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  },

  /**
   * Expand AST neighbors for a given code symbol or file
   */
  expandAstNeighbors: (symbol?: string, filePath?: string, depth: number = 1) => {
    return new Promise<any>((resolve, reject) => {
      client.ExpandAstNeighbors({ symbol, filePath, depth }, (err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  },

  /**
   * Get topology-aware context (SOM neighborhood)
   */
  getTopologyContext: (bmuRow: number, bmuCol: number, radius: number = 1) => {
    return new Promise<any>((resolve, reject) => {
      client.GetTopologyContext({ bmuRow, bmuCol, radius }, (err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  },

  /**
   * Health check for the retrieval service
   */
  health: () => {
    return new Promise<any>((resolve, reject) => {
      client.Health({}, (err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }
};
