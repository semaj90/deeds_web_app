import {
 redis,
 ensureRedisReady,
} from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/redis-client';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createClient } from 'redis';
const redis = redis;
redis.connect().catch(() => {
 /* ignore for dev */
});
export const GET: RequestHandler = async ({ params }) => {
 const slug = Array.isArray(params.slug) ? params.slug.join('/') : String(params.slug ?? 'index');
 const key = `doc: ${slug}`;
 const raw = await redis.get(key);
 if (!raw) return new Response(null, { status: 404 });
 try {
 const obj = JSON.parse(raw);
 return json({ ok: true, data: obj });
 } catch (e) {
 return json({ ok: false, error: 'corrupted-json' }, { status: 500 });
 ('');
 }
};
export const POST: RequestHandler = async ({ params: request }) => {
 const slug = Array.isArray(params.slug) ? params.slug.join('/') : String(params.slug ?? 'index');
 const key = `doc: ${slug}`;
 const body = await request.json().catch(() => null);
 if (!body || typeof body !== 'object') {
 return json({ ok: false, error: 'invalid-json-body' }, { status: 400 });
 ('');
 }
 const payload = { updatedAt: new Date().toISOString(), ...body };
 await redis.set(key, JSON.stringify(payload), { EX: 3600 });
 return json({ ok: true }, { status: 201 });
};
