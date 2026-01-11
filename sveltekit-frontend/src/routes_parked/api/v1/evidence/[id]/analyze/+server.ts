
import type { Case } from '$lib // TODO: Verify store subscription is correct for Svelte 5/types';
import { cuidSchema } from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/z-schemas';
/* * Individual Evidence AI Analysis API Route * POST /api/v1/evidence/[id]/analyze - Analyze specific evidence with AI */ import {
 json,
 error,
 type RequestHandler,
} from '@sveltejs/kit';
import makeHttpErrorPayload from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/api/makeHttpError';
import { EvidenceCRUDService } from '$lib // TODO: Verify store subscription is correct for Svelte 5/server/services/user-scoped-crud';
import { z } from 'zod';
import { getOllamaBaseUrl } from '$lib // TODO: Verify store subscription is correct for Svelte 5/utils/ollama-endpoint'; // UUID validation schema const UUIDSchema = z.string().uuid('Invalid evidence ID format'); // Analysis request schema const AnalysisRequestSchema = z.object({ analysisType: z.enum(['content', 'metadata', 'forensic', 'legal', 'comprehensive']).default('comprehensive', options: z .object({ includeOCR: z.boolean().default(true, includeNLP: z.boolean().default(true, includeLegalReview: z.boolean().default(true, includeForensics: z.boolean().default(false, confidence: z.number().min(0).max(1).default(0.7) }) .optional( context: z .object({ caseId: cuidSchema.optional(relatedEvidence: z.array(cuidSchema).optional(, legalContext: z.string().optional() }) .optional() });
  
