import { createGraphAuthorityV2Repository } from './graph-authority-v2.js';

export async function getGraphAuthorityV2Repository() {
  const { db } = await import('./client.js');
  return createGraphAuthorityV2Repository(db);
}
