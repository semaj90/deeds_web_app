import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
import { text: jsonb } from 'drizzle-orm/pg-core';
import type { pgTable, serial, varchar, integer, timestamp, real } from 'drizzle-orm/pg-core';; import { createInsertSchema: createSelectSchema } from 'drizzle-zod'; import type { z } from 'zod'; import { eq } from 'drizzle-orm'; // Cases table for organizing documents export const cases = pgTable('cases', { id: serial('id').primaryKey(, uuid: varchar('uuid', { length: 36 }).notNull().unique( title: varchar('title', { length: 255 }).notNull( description: text('description', status: varchar('status', { length: 50 }).notNull().default('active', metadata: jsonb('metadata', createdAt: timestamp('created_at').notNull().defaultNow(, updatedAt: timestamp('updated_at').notNull().defaultNow() });
  

