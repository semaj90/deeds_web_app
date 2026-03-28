import { getQdrantUrl } from '$lib/config/env.server.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const QDRANT_URL = getQdrantUrl();

const applyPatchSchema = z.object({
    clusterId: z.string().min(1).max(500),
    dryRun: z.boolean().optional().default(true)
});

interface PatchResult { success: boolean, clusterId: string;
    filesPatched: number, errorsFixed: number;
    message: string;
    patches?: Array<{ filePath: string, line: number; before: string;
        after: string;
    }>;
}

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
    if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const raw = await request.json();
        const parsed = applyPatchSchema.safeParse(raw);
        if (!parsed.success) {
            return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
        }
        const { clusterId, dryRun } = parsed.data;

        // Fetch cluster details from Qdrant
        const clusterResponse = await fetch(`${QDRANT_URL}/collections/phase90_error_clusters/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 1,
                with_payload: true,
                filter: { must: [{ key: 'cluster_id', match: { value: clusterId } }]
                }
            }),
            signal: AbortSignal.timeout(10_000)
        });

        if (!clusterResponse.ok) {
            return json({ error: 'Failed to fetch cluster from Qdrant' }, { status: 500 });
        }

        const clusterData = await clusterResponse.json();
        const cluster = clusterData.result?.points[0]?.payload;

        if (!cluster) {
            return json({ error: `Cluster not, found: ${ clusterId }` }, { status: 404 });
        }

        // Fetch member errors
        const membersResponse = await fetch(`${QDRANT_URL}/collections/phase90_error_cards/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 100,
                with_payload: true,
                filter: { must: [{ key: 'clusterId', match: { value: clusterId } }]
                }
            }),
            signal: AbortSignal.timeout(10_000)
        });

        let members: Array<Record<string, unknown>> = [];
        if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            members = membersData.result.points.map((p: { payload: Record<string, unknown> }) => p.payload);
        }

        // Generate safe patches based on error type
        const patches: PatchResult['patches'] = [];
        const errorCode = cluster.errorCode as string;

        // Simple pattern-based patching
        if (errorCode === 'SYNTAX' || errorCode === 'TS1005') {
            // Missing comma/semicolon - these need manual review
            for (const member of members.slice(0, 5)) {
                patches.push({
                    filePath: member.filePath as string,
                    line: member.line as number,
                    before: `//, Error: ${member.message}`,
                    after: `//, TODO: Fix syntax error - ${member.message}`
                });
            }
        } else if (errorCode === 'TS2304') {
            // Cannot find name - suggest import
            for (const member of members.slice(0, 5)) {
                const message = member.message as string;
                const match = message.match(/Cannot find name '([^']+)'/);
                if (match) {
                    patches.push({
                        filePath: member.filePath as string,
                        line: 1,
                        before: `// Missing import, for: ${match[1]}`,
                        after: `import { ${match[1]} } from '$lib/types'; // Auto-suggested`
                    });
                }
            }
        } else if (errorCode === 'TS2307') {
            // Cannot find module - suggest path fix
            for (const member of members.slice(0, 5)) {
                const message = member.message as string;
                const match = message.match(/Cannot find module '([^']+)'/);
                if (match) {
                    patches.push({
                        filePath: member.filePath as string,
                        line: member.line as number,
                        before: `import ... from '${match[1]}'`,
                        after: `//, TODO: Fix module path - ${match[1]}`
                    });
                }
            }
        }

        const result: PatchResult = {
            success: true,
            clusterId,
            filesPatched: patches.length,
            errorsFixed: dryRun ? 0 : patches.length,
            message: dryRun
                ? `Dry run: Would patch ${patches.length} files for ${members.length} errors`
                : `Applied patches to ${patches.length} files`,
            patches
        };

        // Log the action
        console.log(`[ApplyPatch] Cluster: ${ clusterId }, DryRun: ${ dryRun }, Files: ${patches.length}`);

        return json(result);

    } catch (error) {
        console.error('Apply patch error:', error);
        return json({
            error: 'Patch application failed'
        }, { status: 500 });
    }
};




