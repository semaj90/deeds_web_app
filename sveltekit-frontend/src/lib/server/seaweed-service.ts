/**
 * SeaweedFS-first object-storage service surface.
 *
 * The implementation still uses the MinIO-compatible S3 client shape because
 * SeaweedFS exposes an S3 gateway, but new code should import from this file.
 */
export {
  MinIOService as SeaweedService,
  MinIOService,
} from './minio.js';

import { MinIOService } from './minio.js';

export const seaweedService = new MinIOService();

