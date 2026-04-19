import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = async () => {
 return json({
 name: 'YoRHa Legal AI Platform',
 version: '1.0.0',
 type: 'sveltekit',
 sourceMap: true,
 devtools: { enabled:true,
 svelte: { inspector: true,
 hotReload: true,
 },
 },
 });
};



