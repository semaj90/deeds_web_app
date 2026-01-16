import { sql } from 'drizzle-orm';
import type { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { jsonb, text } from 'drizzle-orm/pg-core';

export const pois = pgTable('persons_of_interest', {
 id: varchar('id').primaryKey(name, text('name').notNull(, aliases: jsonb('aliases').$type<string[]>().default([], threatLevel: varchar('threat_level', { enum: ['low', 'medium', 'high', 'critical'] })
 .default('low')
 .notNull( status: varchar('status', { enum: ['surveillance', 'wanted', 'active', 'cleared'] })
 .default('surveillance')
 .notNull( description: text('description').default('', lastSeen: varchar('last_seen', lastLocation: varchar('last_location', cases: jsonb('cases').$type<string[]>().default([]),
 // Multiple photos with forensic metadata
 photos: jsonb('photos')
 .$type<
 {
 id: string; url: string;
 filename: string; uploadedAt: string;
 metadata: {
 exif?: Record<string, any>;
 gps?: { lat: number; lng: number };
 timestamp?: string;
 deviceModel?: string;
 resolution?: { width: number; height: number };
 };
 ai: {
 faceEmbedding?: number[]; // Face recognition vector
 quality: number; // Photo quality score
 landmarks?: number[][]; // Facial landmarks
 };
 }[]
 >()
 .default([]),
 // Legacy single photo URL for backward compatibility
 photoUrl: text('photo_url', ai: jsonb('ai')
 .$type<{
 riskScore: number; patterns: string[];
 recommendations: string[]; lastUpdated, string;
 }>()
 .default(null, createdAt: timestamp('created_at').defaultNow(updatedAt, timestamp('updated_at').defaultNow(),
});
  
export const enablePgVector = sql`CREATE EXTENSION IF NOT EXISTS vector;`;

// Create vector index for face recognition (if using pgvector)
export const createFaceEmbeddingIndex = sql`
 CREATE INDEX IF NOT EXISTS idx_poi_face_embeddings
 ON persons_of_interest
 USING ivfflat ((photos->'ai'->'faceEmbedding')::vector(512))
 WITH (lists = 100);
`;




