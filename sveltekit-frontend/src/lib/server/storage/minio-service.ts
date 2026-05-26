// Legacy compatibility shim.
// New code should import from $lib/server/seaweed-service or
// $lib/server/storage/seaweed.ts.
import { SeaweedService } from '$lib/server/seaweed-service';

export { SeaweedService as MinIOService };
export const minioService = new SeaweedService();
