import { z } from 'zod';

export const CouchDbPageRankRequestSchema = z
	.object({
		syncQdrant: z.boolean().default(false),
		syncNeo4j: z.boolean().default(false),
		dryRun: z.boolean().default(true),
		apply: z.boolean().default(false),
	})
	.strict();

export type CouchDbPageRankRequest = z.infer<typeof CouchDbPageRankRequestSchema>;

export function parseCouchDbPageRankRequest(raw: unknown) {
	return CouchDbPageRankRequestSchema.safeParse(raw === undefined ? {} : raw);
}

export function requiresCouchDbPageRankApply(request: CouchDbPageRankRequest): boolean {
	return !request.dryRun;
}
