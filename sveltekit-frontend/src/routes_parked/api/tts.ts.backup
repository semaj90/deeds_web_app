// SvelteKit endpoint: /api/tts
// Proxies text to a Coqui TTS HTTP server and returns audio (WAV)
import type { RequestHandler } from '@sveltejs/kit';

// Set this to your Coqui TTS server URL
const COQUI_TTS_URL = 'http://localhost:5002/api/tts';

export const GET: RequestHandler = async ({ url }) => {
 const text = url.searchParams.get('text');
 if (!text) {
 return new Response('Missing text', { status: 400 });
 }

 // Forward to Coqui TTS server
 const ttsRes = await fetch(COQUI_TTS_URL + '?text=' + encodeURIComponent(text));

 if (!ttsRes.ok) {
 return new Response('TTS server error', { status: 502 });
 }

 const audio = await ttsRes.arrayBuffer();
 return new Response(audio, {
 headers: {
 'Content-Type': 'audio/wav',
 'Cache-Control': 'no-store',
 },
 });
};


