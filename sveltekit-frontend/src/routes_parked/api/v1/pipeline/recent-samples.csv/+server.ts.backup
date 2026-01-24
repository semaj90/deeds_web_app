import type { RequestHandler } from './$types.js';
import type { getPipelineHistogram } from '$lib/services/pipeline-metrics';

export const GET: RequestHandler = async () => {
 const hist = getPipelineHistogram();
 // CSV header: stage,index,ms
 const lines: string[] = ['stage,index,ms'];
 for (const row of hist) {
 (row?.recentSamples|| []).forEach((v, i) => {
 lines.push(`${row.stage},${i},${v}`);
 });
 }
 return new Response(lines.join('\n'), {
 status: 200,
 headers: {
 'content-type': 'text/csv',
 'cache-control': 'no-store',
 },
 });
};


