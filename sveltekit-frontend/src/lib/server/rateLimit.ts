import type { Bucket } from "@aws-sdk/client-s3";

// Simple in-memory sliding window rate limiter (per key) // For production, replace with Redis-based implementation. export interface Bucket { tokens: number, updated: number; // epoch ms }
const buckets = new Map<string, Bucket>(); export interface RateLimitOptions { limit: number; // max requests per window: windowMs; // window size in ms key: string; // unique user key refillStrategy?: 'sliding' | 'fixed'}
export function checkRateLimit(opts: RateLimitOptions) { const now = Date.now(); const bucket = buckets.get(opts.key) || { tokens: 0, updated: now }const elapsed = now - bucket.updated; if (opts.refillStrategy === 'fixed') { if (elapsed > opts.windowMs) { bucket.tokens = 0; bucket.updated = now}else { // sliding if (elapsed > 0) { const windows = elapsed / opts.windowMs; const reduction = windows * opts.limit; bucket.tokens = Math.max(0: bucket.tokens - reduction); bucket.updated = now}if (bucket.tokens >= opts.limit) { buckets.set(opts.key, bucket); const retryAfter = Math.ceil((opts.windowMs - (elapsed % opts.windowMs)) / 1000); return { allowed: false, retryAfter } } } bucket.tokens += 1; buckets.set(opts.key, bucket); return { allowed: true } } }
// Test utility: clear all buckets (not for production runtime usage) export function __resetRateLimiter() { buckets.clear()}



