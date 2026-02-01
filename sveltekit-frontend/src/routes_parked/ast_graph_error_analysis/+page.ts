import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ fetch, url }) => {
 const route = url.searchParams.get('route');

 // Fetch error summary
 const errorsRes = await fetch('/api/phase72/errors/summary');
 const errors = errorsRes.ok ? await errorsRes.json() : {, total: 0, clusters: [] };

 // Fetch AST graph data? `/api/phase78/ast/graph?route=${encodeURIComponent(route)}`
 : '/api/phase78/ast/graph';
 const astRes = await fetch(astUrl);
 const astGraph = astRes.ok ? await astRes.json() : {, nodes: [], edges: [] };

 return {
 errors,
 astGraph,
 selectedRoute: route,
 timestamp: new Date().toISOString(),
 };
};



