import { createHash } from 'node:crypto';
import type { TensorHeadRouteV1 } from './tensor-head-router.js';

export interface TensorHeadRouteOutboxEventV1 {
  schema: 'atlas.tensor-head-route-event.v1';
  eventType: 'atlas.tensor-head.route.observed.v1';
  aggregateType: 'tensor_head_route';
  aggregateId: string;
  partitionKey: string;
  routeId: string;
  requestId: string;
  featureRevision: string;
  routerRevision: string;
  routingMode: string;
  selectedHeadIds: string[];
  shadowHeadIds: string[];
  canonicalWrites: false;
  payloadChecksum: string;
  producerRevision: string;
}

/**
 * Pure adapter for the existing Postgres outbox. Kafka/CDC may consume this
 * downstream later, but Postgres/outbox stays authoritative and no CDC consumer
 * is allowed to become the router or canonical feature owner.
 */
export function buildTensorHeadRouteOutboxEvent(route: TensorHeadRouteV1): TensorHeadRouteOutboxEventV1 {
  const payload = {
    routeId: route.routeId,
    requestId: route.requestId,
    featureRevision: route.featureRevision,
    routerRevision: route.routerRevision,
    routingMode: route.routingMode,
    selectedHeadIds: route.selectedHeads.map((head) => head.headId),
    shadowHeadIds: route.shadowHeads.map((head) => head.headId),
    canonicalWrites: false as const,
  };
  return {
    schema: 'atlas.tensor-head-route-event.v1',
    eventType: 'atlas.tensor-head.route.observed.v1',
    aggregateType: 'tensor_head_route',
    aggregateId: route.routeId,
    partitionKey: route.requestId,
    ...payload,
    payloadChecksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    producerRevision: 'tensor-head-outbox-adapter-v1',
  };
}
