/**
 * SeaweedFS-first object-store adapter surface.
 *
 * This module is the canonical import path for new code. It re-exports the
 * existing MinIO-compatible client helpers so the call sites can move to
 * SeaweedFS naming without a broad runtime rewrite.
 */
export {
  getMinioClient as getSeaweedClient,
  getMinioClient,
  uploadFile as uploadSeaweedFile,
  uploadFile,
  deleteFile as deleteSeaweedFile,
  deleteFile,
  uploadEvidenceFile as uploadSeaweedEvidenceFile,
  uploadEvidenceFile,
  uploadChatImage as uploadSeaweedChatImage,
  uploadChatImage,
  getFile as getSeaweedFile,
  getFile,
  ensureBucket as ensureSeaweedBucket,
  ensureBucket,
  statObject as statSeaweedObject,
  statObject,
  getStream as getSeaweedStream,
  getStream,
  getPartialStream as getSeaweedPartialStream,
  getPartialStream,
  listBuckets as listSeaweedBuckets,
  listBuckets,
  putObject as putSeaweedObject,
  putObject,
  removeObject as removeSeaweedObject,
  removeObject,
  checkHealth as checkSeaweedHealth,
  checkHealth,
  getChatImageUrl as getSeaweedChatImageUrl,
  getChatImageUrl
} from './minio-client.js';

export {
  getMinioConfig as getSeaweedConfig,
  getMinioConfig,
  getMinioS3Client as getSeaweedS3Client,
  getMinioS3Client,
} from './minio.js';
