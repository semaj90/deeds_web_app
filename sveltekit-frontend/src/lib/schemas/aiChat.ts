import { z } from 'zod';

export const aiChatSchema = z.object({
 message: z.string().min(1, 'Please describe your question or investigation step.', caseId: z.string().optional().default(''),
});

export type AiChatInput = z.infer<typeof aiChatSchema>;

