import type { ColdObjectStorePort } from '@deeds/parent-atlas';
import {
  getFileFromSeaweed,
  headFileInSeaweed,
  putFileToSeaweed,
} from '../../storage/seaweed.js';

/**
 * SvelteKit-owned runtime binding for Parent Atlas cold artifacts.
 *
 * Parent Atlas owns the checksum/receipt semantics through ColdObjectStorePort;
 * this adapter owns only the concrete AWS SDK -> SeaweedFS S3 transport.
 */
export function createSeaweedColdObjectStore(): ColdObjectStorePort {
  return {
    async putObject(input) {
      return putFileToSeaweed({
        bucket: input.bucket,
        objectKey: input.objectKey,
        bytes: input.bytes,
        contentType: input.contentType,
        metadata: input.metadata,
      });
    },
    async getObject(input) {
      return getFileFromSeaweed({
        bucket: input.bucket,
        objectKey: input.objectKey,
        maximumBytes: input.maximumBytes,
      });
    },
    async headObject(input) {
      return headFileInSeaweed({
        bucket: input.bucket,
        objectKey: input.objectKey,
      });
    },
  };
}
