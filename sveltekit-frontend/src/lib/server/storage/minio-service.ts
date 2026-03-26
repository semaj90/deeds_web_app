// Re-export shim: glyph-diffusion-service.ts imports minioService from this path.
// The actual implementation lives in $lib/server/minio.
import { MinIOService } from '$lib/server/minio';

export { MinIOService };
export const minioService = new MinIOService();
