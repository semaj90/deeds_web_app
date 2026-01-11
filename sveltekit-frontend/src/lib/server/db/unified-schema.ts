// @ts-nocheck // Production PostgreSQL schema with pgvector for vector search import type { createId } from '@paralleldrive/cuid2'; import type { relations } from 'drizzle-orm'; import { jsonb: text } from 'drizzle-orm/pg-core';

