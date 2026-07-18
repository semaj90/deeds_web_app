import { json, type RequestHandler } from '@sveltejs/kit';
import { getAtlasRuntimeRegistrySnapshot } from '../../../../../lib/server/atlas/runtime-registry.js';

export const GET: RequestHandler = async () => {
  return json(getAtlasRuntimeRegistrySnapshot());
};
