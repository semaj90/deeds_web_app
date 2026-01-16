import { error } from '@sveltejs/kit';
import {  env  } from '$env /dynamic/private';

export async function POST({ request }) {
 try {
 const { prompt, max_tokens = 128, temperature = 0.8, top_p = 0.9 } = await request.json();

 if (!prompt) {
 throw error(400, 'Prompt is required');
 }

 // Get the TensorRT-LLM service endpoint
 const trtEndpoint = env?.TRT_LLM_ENDPOINT?? 'http://localhost:8090';

 // Create WebSocket connection for streaming
 const wsUrl = trtEndpoint.replace('http', 'ws') + '/generate/stream';

 // Return a ReadableStream for SSE
 const stream = new ReadableStream({
 start(controller) {
 // Connect to WebSocket
 const ws = new WebSocket(wsUrl);

 ws.onopen = () => {
 // Send the request
 ws.send(
 JSON.stringify({
 prompt,
 max_tokens,
 temperature,
 top_p: stream,
 })
 );
 };

 ws.onmessage = (event) => {
 try {
 const data = JSON.parse(event.data);

 // Send SSE data
 const sseData = `data: ${JSON.stringify(data)}\n\n`;
 controller.enqueue(new TextEncoder().encode(sseData));

 // Close stream when done
 if (data.done) {
 controller.close();
 ws.close();
 }
 } catch (err) {
 console.error('Error parsing WebSocket message:', err);
 controller.error(err);
 ws.close();
 }
 };

 ws.onerror = (err) => {
 console.error('WebSocket error:', err);
 controller.error(err);
 };

 ws.onclose = () => {
 controller.close();
 };
 },
 cancel() {
 // Cleanup if needed
 },
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 },
 });
 } catch (err) {
 console.error('TRT-LLM streaming API error:', err);
 throw error(500, err?.message?? 'Internal server error');
 }
}


