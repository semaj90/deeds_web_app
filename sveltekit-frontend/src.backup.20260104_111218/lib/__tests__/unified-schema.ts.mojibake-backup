import type { z } from 'zod';

/**
 * Schema for a TokenEntry, as seen in redis-streams.
 * This provides a unified validation and type definition for token data.
 */
export const TokenEntrySchema = z.object({
  id: z.string(),
  seq: z.number(),
  chunk: z.string(),
  meta: z.record(z.any()), // Assuming meta can be any JSON object
});

export type TokenEntry = z.infer<typeof TokenEntrySchema>;

// Example of another potential schema (uncomment and expand as needed)
// export const UserSchema = z.object({
// id: z.string().uuid(),
// name: z.string().min(1),
// email: z.string().email(),
// });
// export type User = z.infer<typeof UserSchema>;
