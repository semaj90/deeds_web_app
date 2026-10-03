import { z } from 'zod';

/** Client input for the legacy streaming route; cache identity is server-owned. */
export const aceStreamRequestV1Schema = z.object({
  query: z.string().min(1),
}).strict();

export type AceStreamRequestV1 = z.infer<typeof aceStreamRequestV1Schema>;
