/**
 * gRPC Client for Parent Atlas Retrieval Service
 *
 * Internal service-to-service communication.
 * Lower latency and bandwidth than HTTP for frequent calls.
 *
 * TODO: Implement with @grpc/grpc-js after protobuf definitions are ready
 */

import type { RetrievalFacade, RetrievalRequest, RetrievalResult } from '@deeds/parent-atlas-core';
import { GrpcTransportError } from '../errors.js';

export interface GrpcClientConfig {
  address: string;
  port: number;
  ssl?: boolean;
}

/**
 * gRPC client for Parent Atlas RetrievalFacade
 *
 * Placeholder implementation (TODO: full gRPC wiring)
 */
export class GrpcRetrievalClient implements RetrievalFacade {
  private config: GrpcClientConfig;

  constructor(config: GrpcClientConfig) {
    this.config = config;
  }

  async search(request: RetrievalRequest): Promise<RetrievalResult> {
    // TODO: Implement gRPC call to Parent Atlas service
    // const channel = new grpc.ChannelCredentials(...);
    // const client = new parentAtlas.RetrievalServiceClient(
    //   `${this.config.address}:${this.config.port}`,
    //   channel
    // );
    // return new Promise((resolve, reject) => {
    //   client.search(request, (err, result) => {
    //     if (err) reject(new GrpcTransportError(err.message, err.code));
    //     else resolve(result);
    //   });
    // });

    throw new GrpcTransportError('gRPC client not yet implemented');
  }

  async health(): Promise<boolean> {
    // TODO: Implement gRPC health check
    return false;
  }
}

/**
 * Factory function
 */
export function createGrpcClient(config: GrpcClientConfig): GrpcRetrievalClient {
  return new GrpcRetrievalClient(config);
}

export type { GrpcTransportError } from '../errors.js';
