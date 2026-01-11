import { json } from '@sveltejs/kit';
import type { callTRTFP16, callTRTFP8, callTRTINT8 } from '$lib/server/trt-router';

export async function POST({ request }) {
 const { prompt, mode } = await request.json();

 try {
 if (mode === 'fp8') {
 return json(await callTRTFP8(prompt));
 }
 if (mode === 'int8') {
 return json(await callTRTINT8(prompt));
 }

 // default to FP16
 return json(await callTRTFP16(prompt));
 } catch (error) {
 return json({ error: error.message }, { status: 500 });
 }
}
