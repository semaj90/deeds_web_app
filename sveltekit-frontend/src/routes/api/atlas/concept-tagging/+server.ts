import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
  buildPosConceptTaggingPacket,
  PosConceptTaggingRequestSchema,
} from '$lib/server/atlas/pos-concept-tagging-lane.js';

const requestSchema = PosConceptTaggingRequestSchema;

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json(
      {
        success: false,
        error: 'Unauthorized',
        packet: null,
        tuples: [],
        tupleCount: 0,
      },
      { status: 401 }
    );
  }

  try {
    const payload = await request.json();
    const validated = requestSchema.parse(payload);
    const packet = buildPosConceptTaggingPacket(validated);

    return json({
      success: true,
      packet,
      tuples: packet.ontologyLinkedTuples,
      tupleCount: packet.ontologyLinkedTuples.length,
      error: null,
    });
  } catch (err) {
    const message = err instanceof z.ZodError
      ? `Validation error: ${err.issues[0]?.message ?? err.message}`
      : err instanceof Error
        ? err.message
        : 'Unknown error';

    return json(
      {
        success: false,
        error: message,
        packet: null,
        tuples: [],
        tupleCount: 0,
      },
      { status: 400 }
    );
  }
};
