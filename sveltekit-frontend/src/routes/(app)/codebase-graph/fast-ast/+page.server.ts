import type { PageServerLoad } from './$types';
import {
  getGraphOverview,
  getGraphPageRankTop,
} from '$lib/server/graph/graph-remote-functions.js';

export const load: PageServerLoad = async () => {
  const [overview, pageRankTop] = await Promise.all([
    getGraphOverview().catch(() => null),
    getGraphPageRankTop(30).catch(() => []),
  ]);

  return { overview, pageRankTop };
};
