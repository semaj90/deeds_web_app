/**
 * SeaweedFS-first knowledge store alias.
 *
 * This module lets new code use SeaweedFS terminology without breaking the
 * existing MinIO-compatible storage implementation.
 */
export {
  MinioKnowledgeStore as SeaweedKnowledgeStore,
  MinioKnowledgeStore,
  getMinioKnowledgeStore as getSeaweedKnowledgeStore,
  getMinioKnowledgeStore,
} from './MinioKnowledgeStore.js';

export type {
  MinioConfig as SeaweedConfig,
  MinioConfig,
  StoredDocument,
} from './MinioKnowledgeStore.js';

