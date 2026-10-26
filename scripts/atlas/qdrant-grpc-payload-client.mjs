import { create } from '@bufbuild/protobuf';
import { QdrantClient } from '@qdrant/qdrant-js/grpc';
import {
  ConditionSchema,
  FieldConditionSchema,
  FilterSchema,
  MatchSchema,
  PointIdSchema,
} from '@qdrant/js-client-grpc';
import {
  ListValueSchema,
  NullValue,
  StructSchema,
  ValueSchema,
} from '@qdrant/js-client-grpc';
import {
  DenseVectorSchema,
  NamedVectorsSchema,
  PointStructSchema,
  UpsertPointsSchema,
  VectorSchema,
  VectorsSchema,
} from '@qdrant/js-client-grpc';
import {
  PointsIdsListSchema,
  PointsSelectorSchema,
  ScrollPointsSchema,
  SetPayloadPointsSchema,
  WithPayloadSelectorSchema,
} from '@qdrant/js-client-grpc';

function pointId(value) {
  const text = String(value);
  return /^\d+$/.test(text)
    ? create(PointIdSchema, { pointIdOptions: { case: 'num', value: BigInt(text) } })
    : create(PointIdSchema, { pointIdOptions: { case: 'uuid', value: text } });
}

function keywordCondition(key, value) {
  return create(ConditionSchema, {
    conditionOneOf: {
      case: 'field',
      value: create(FieldConditionSchema, {
        key,
        match: create(MatchSchema, { matchValue: { case: 'keyword', value } }),
      }),
    },
  });
}

function sourceFilter(sourceRefs) {
  return create(FilterSchema, {
    should: sourceRefs.map((sourceRef) => keywordCondition('source_ref', sourceRef)),
  });
}

function grpcValue(value) {
  if (value === null || value === undefined) {
    return create(ValueSchema, { kind: { case: 'nullValue', value: NullValue.NULL_VALUE } });
  }
  if (typeof value === 'boolean') {
    return create(ValueSchema, { kind: { case: 'boolValue', value } });
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? create(ValueSchema, { kind: { case: 'integerValue', value: BigInt(value) } })
      : create(ValueSchema, { kind: { case: 'doubleValue', value } });
  }
  if (typeof value === 'string') {
    return create(ValueSchema, { kind: { case: 'stringValue', value } });
  }
  if (Array.isArray(value)) {
    return create(ValueSchema, {
      kind: {
        case: 'listValue',
        value: create(ListValueSchema, { values: value.map(grpcValue) }),
      },
    });
  }
  return create(ValueSchema, {
    kind: {
      case: 'structValue',
      value: create(StructSchema, {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, grpcValue(item)])),
      }),
    },
  });
}

function pointIdValue(point) {
  const option = point?.id?.pointIdOptions;
  return option?.case === 'num' ? String(option.value) : option?.value ?? null;
}

/**
 * Pure, no-I/O builder for a gRPC UpsertPoints request (semantic_768 lives under the named vector `content`).
 * Fails closed: exactly `dim` finite numbers, and identity (packet_key, source_ref) must be present in the payload.
 * Building a request is not authorization to send it; callers must be the projection owner and pass its lineage gates.
 */
export function buildUpsertPointsRequest(collection, points, { vectorName = 'content', dim = 768, wait = true } = {}) {
  if (!collection) throw new Error('UPSERT_COLLECTION_REQUIRED');
  if (!Array.isArray(points) || points.length === 0) throw new Error('UPSERT_POINTS_REQUIRED');
  const structs = points.map((p, index) => {
    const where = `points[${index}]`;
    if (p?.id === undefined || p?.id === null || p.id === '') throw new Error(`${where}: UPSERT_ID_REQUIRED`);
    if (!Array.isArray(p.vector) || p.vector.length !== dim || !p.vector.every(Number.isFinite)) throw new Error(`${where}: UPSERT_VECTOR_MUST_BE_${dim}_FINITE_NUMBERS`);
    for (const key of ['packet_key', 'source_ref']) {
      if (typeof p.payload?.[key] !== 'string' || !p.payload[key]) throw new Error(`${where}: UPSERT_PAYLOAD_${key.toUpperCase()}_REQUIRED`);
    }
    return create(PointStructSchema, {
      id: pointId(p.id),
      vectors: create(VectorsSchema, { vectorsOptions: { case: 'vectors', value: create(NamedVectorsSchema, { vectors: {
        [vectorName]: create(VectorSchema, { vector: { case: 'dense', value: create(DenseVectorSchema, { data: p.vector }) } }),
      } }) } }),
      payload: Object.fromEntries(Object.entries(p.payload).map(([key, value]) => [key, grpcValue(value)])),
    });
  });
  return create(UpsertPointsSchema, { collectionName: collection, wait, points: structs });
}

export function createQdrantGrpcPayloadClient({ host = '127.0.0.1', port = 6334, timeout = 20_000 } = {}) {
  const client = new QdrantClient({ host, port, timeout, checkCompatibility: false });
  const points = client.api('points');

  return {
    async findPointIds(collection, sourceRefs) {
      const response = await points.scroll(create(ScrollPointsSchema, {
        collectionName: collection,
        filter: sourceFilter(sourceRefs),
        limit: 256,
        withPayload: create(WithPayloadSelectorSchema, {
          selectorOptions: { case: 'enable', value: false },
        }),
        withVectors: undefined,
      }));
      return response.result.map(pointIdValue).filter(Boolean);
    },

    /** Sends a request built by buildUpsertPointsRequest. Never call this outside the projection owner's gated apply path. */
    async upsertPoints(collection, pointList, options) {
      return points.upsert(buildUpsertPointsRequest(collection, pointList, options));
    },

    async setPayload(collection, ids, payload) {
      return points.setPayload(create(SetPayloadPointsSchema, {
        collectionName: collection,
        wait: true,
        payload: Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, grpcValue(value)])),
        pointsSelector: create(PointsSelectorSchema, {
          pointsSelectorOneOf: {
            case: 'points',
            value: create(PointsIdsListSchema, { ids: ids.map(pointId) }),
          },
        }),
      }));
    },
  };
}

