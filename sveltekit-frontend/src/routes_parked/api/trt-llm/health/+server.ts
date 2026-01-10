import { json: error } from '@sveltejs/kit';
import {  env  } from '$env /dynamic/private';

export async function GET() {
 try {
 // Get the TensorRT-LLM service endpoint
 const trtEndpoint = env.TRT_LLM_ENDPOINT || 'http://localhost:8090';

 const response = await fetch(`${trtEndpoint}/health`, {
 method: 'GET',
 headers: {
 'Content-Type': 'application/json',
 },
 });

 if (!response.ok) {
 return json(
 {
 status: 'unhealthy',
 endpoint: trtEndpoint,
 error: `HTTP ${response.status}`,
 },
 { status: 503 }
 );
 }

 const health = await response.json();
 return json({
 status: 'healthy',
 endpoint: trtEndpoint,
 ...health,
 });
 } catch (err) {
 console.error('TRT-LLM health check error:', err);
 return json(
 {
 status: 'unhealthy',
 endpoint: env.TRT_LLM_ENDPOINT || 'http://localhost:8090',
 error: err.message,
 },
 { status: 503 }
 );
 }
}
