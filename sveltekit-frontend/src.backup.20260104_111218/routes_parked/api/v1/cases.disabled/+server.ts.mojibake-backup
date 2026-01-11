/*
 * Cases API Routes with Lucia v3 Authentication
 * GET /api/v1/cases - List user's cases (with pagination)
 * POST /api/v1/cases - Create new case
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import makeHttpErrorPayload from '$lib/server/api/makeHttpError';
import {
    CasesCRUDService,
    CreateCaseSchema,
    type CreateCaseData,
} from '$lib/server/services/user-scoped-crud';
import { queueCaseSynthesis } from '$lib/server/services/background-job-queue';
import { z } from 'zod';

// Helper to get user ID safely
const getUserId = (locals: App.Locals) => locals.session?.user?.id;

// Query parameters schema for GET requests
const CasesQuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.enum(['title', 'created_at', 'updated_at', 'status', 'priority']).default('created_at'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    status: z.enum(['open', 'closed', 'pending', 'archived']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
});

/*
 * GET /api/v1/cases
 * List user's cases with pagination and filtering
 */
export const GET: RequestHandler = async ({ request, locals }) => {
    try {
        // Check authentication
        if (!locals.session || !locals.user) {
            return error(401, makeHttpErrorPayload({ message: 'Authentication required', code: 'AUTH_REQUIRED' }));
        }

        // Parse query parameters
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        const validatedQuery = CasesQuerySchema.parse(queryParams);

        // Create service instance
        const casesService = new CasesCRUDService(getUserId(locals)!);

        // Get cases with pagination
        const result = await casesService.list({
            page: validatedQuery.page,
            limit: validatedQuery.limit,
            sortBy: validatedQuery.sortBy,
            sortOrder: validatedQuery.sortOrder
        });

        // Map service ListResult<T> => route payload shape
        // Validate response shape with zod before returning
        const CaseItemSchema = z.object({
            id: z.string(),
            title: z.string().optional(),
            description: z.any().optional(),
            status: z.string().optional(),
            priority: z.string().optional(),
            caseNumber: z.string().optional(),
            createdAt: z.string().optional(),
            updatedAt: z.string().optional()
        }).passthrough();

        const CasesListResponse = z.object({
            success: z.literal(true),
            data: z.array(CaseItemSchema),
            pagination: z.object({
                page: z.number(),
                limit: z.number(),
                total: z.number(),
                totalPages: z.number(),
                hasNext: z.boolean(),
                hasPrev: z.boolean()
            }),
            meta: z.record(z.any()).optional()
        }).passthrough();

        const payload = {
            success: true,
            data: (result as any).items,
            pagination: {
                page: (result as any).pagination.page,
                limit: (result as any).pagination.limit,
                total: (result as any).pagination.totalCount,
                totalPages: (result as any).pagination.totalPages,
                hasNext: (result as any).pagination.hasNext,
                hasPrev: (result as any).pagination.hasPrev
            },
            meta: {
                userId: getUserId(locals),
                timestamp: new Date().toISOString()
            }
        };

        const validated = CasesListResponse.safeParse(payload);
        if (!validated.success) {
            console.error('Cases list response validation failed', validated.error);
            return error(500, makeHttpErrorPayload({ message: 'Invalid response shape', code: 'RESPONSE_VALIDATION_FAILED' }));
        }

        return json(payload);
    } catch (err: unknown) {
        console.error('Error fetching cases: ', err);
        if (err instanceof z.ZodError) {
            return error(400, makeHttpErrorPayload({ message: 'Invalid query parameters', code: 'INVALID_QUERY', details: err.errors }));
        }
        return error(500, makeHttpErrorPayload({ message: 'Failed to fetch cases', code: 'FETCH_FAILED', details: (err as Error).message }));
    }
};

/*
 * POST /api/v1/cases
 * Create a new case
 */
export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        // Check authentication
        if (!locals.session || !locals.user) {
            return error(401, makeHttpErrorPayload({ message: 'Authentication required', code: 'AUTH_REQUIRED' }));
        }

        // Parse request body
        const body = await request.json();
        const validatedData = CreateCaseSchema.parse(body) as CreateCaseData;

        // Create service instance
        const casesService = new CasesCRUDService(getUserId(locals)!);

        // Create case
        const caseId = await casesService.create(validatedData);

        // Get the created case details
        const createdCase = await casesService.getById(caseId);

        // Queue background synthesis
        try {
            const jobId = await queueCaseSynthesis(caseId, getUserId(locals)!);
            console.log(`[Cases API] Queued synthesis job ${jobId} for case ${caseId}`);
        } catch (queueError) {
            console.error('Failed to queue case synthesis: ', queueError);
            // Don't fail the request, just log the error
        }

        return json({
            success: true,
            data: createdCase,
            meta: {
                caseId,
                userId: getUserId(locals),
                timestamp: new Date().toISOString(),
                synthesisQueued: true
            }
        }, { status: 201 });
    } catch (err: unknown) {
        console.error('Error creating case: ', err);
        if (err instanceof z.ZodError) {
            return error(400, makeHttpErrorPayload({ message: 'Invalid case data', code: 'INVALID_DATA', details: err.errors }));
        }
        if ((err as Error).message.includes('not found') || (err as Error).message.includes('access denied')) {
            return error(403, makeHttpErrorPayload({ message: (err as Error).message, code: 'ACCESS_DENIED' }));
        }
        return error(500, makeHttpErrorPayload({ message: 'Failed to create case', code: 'CREATE_FAILED', details: (err as Error).message }));
    }
};
}
}