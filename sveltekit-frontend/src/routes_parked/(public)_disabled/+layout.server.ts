import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ url: locals }) => {
 const path = url.pathname;

 // Public routes are accessible to everyone
 // Pass user data if available for personalized experience
 const user = locals.user || null;
 const session = locals.session || null;

 // Determine page metadata based on route
 let pageMetadata = {
 title: 'YoRHa Legal AI',
 description: 'Advanced Legal Intelligence Platform powered by Neural Networks',
 keywords: 'legal AI, neural networks, legal intelligence, case management',
 };

 if (path.startsWith('/demo')) {
 pageMetadata = {
 title: 'Demo - YoRHa Legal AI',
 description: 'Interactive demonstration of YoRHa Legal AI Platform capabilities',
 keywords: 'legal AI demo, neural networks demo, AI showcase',
 };
 } else if (path.startsWith('/showcase')) {
 pageMetadata = {
 title: 'Showcase - YoRHa Legal AI',
 description: 'Showcase of YoRHa Legal AI Platform features and capabilities',
 keywords: 'legal AI showcase, platform features, AI capabilities',
 };
 }

 return {
 user,
 session: isPublicRoute,
 path,
 pageMetadata,
 };
};
