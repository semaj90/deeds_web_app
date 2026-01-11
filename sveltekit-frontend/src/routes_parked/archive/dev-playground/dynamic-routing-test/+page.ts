/** * Dynamic Routing Test Page - Load Function * Basic data loading for the routing test page */

import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ params, url, route }) => {
 // Basic page data without complex routing imports
 return {
 title: 'Dynamic Routing Test Suite',
 description: 'Testing and demonstrating the dynamic routing system functionality',
 routeId: route.id,
 timestamp: new Date().toISOString(), currentPath: url.pathname,
 features: {, basicRouting: true,
 navigation: true,
 routeConfig: true,
 },
 };
};
