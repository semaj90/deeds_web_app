/**
 * ACE Web Ingestion Endpoint
 * POST /api/ace/web/ingest
 * Enqueues URLs for web crawling and ingestion into ACE knowledge base
 */

import { aceSources } from '$lib/db/schema/ace-web';
import db from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import * as amqp from 'amqplib';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

interface IngestRequest {
  urls: string[];
  tags?: string[];
  priority?: 'high' | 'normal' | 'low';
}

interface IngestResponse {
  success: boolean;
  jobIds: string[];
  message: string;
  errors?: string[];
}

/**
 * POST /api/ace/web/ingest
 * Enqueue URLs for ingestion
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: IngestRequest = await request.json();

    // Validate input
    const validation = validateInput(body);
    if (!validation.valid) {
      return json(
        { error: validation.error, success: false },
        { status: 400 }
      );
    }

    // Connect to RabbitMQ
    let connection: any;
    let channel: any;

    try {
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      connection = await amqp.connect(rabbitmqUrl);
      channel = await connection.createChannel();
      await channel.assertQueue('ace_web_ingest', { durable: true });
    } catch (error) {
      console.error('[ACE Ingest] Failed to connect to RabbitMQ:', error);
      return json(
        {
          error: 'Message queue unavailable',
          success: false,
          message: 'Unable to enqueue jobs. Please try again later.',
        },
        { status: 503 }
      );
    }

    const jobIds: string[] = [];
    const errors: string[] = [];

    // Process each URL
    for (const url of body.urls) {
      try {
        // Validate URL format
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Check if URL already exists in database
        const existing = await db
          .select()
          .from(aceSources)
          .where(eq(aceSources.canonicalUrl, url))
          .limit(1);

        let sourceId: string;

        if (existing.length > 0) {
          // Update existing source
          sourceId = existing[0].id;
          await db
            .update(aceSources)
            .set({
              firstSeen: new Date(),
              crawlStatus: 'new',
            })
            .where(eq(aceSources.id, sourceId));

          console.log(`[ACE Ingest] Updated existing source: ${sourceId}`);
        } else {
          // Insert new source
          const [newSource] = await db
            .insert(aceSources)
            .values({
              canonicalUrl: url,
              domain,
              sourceType: 'web',
              crawlStatus: 'new',
              title: null,
              etag: null,
              contentHash: null,
            })
            .returning();

          sourceId = newSource.id;
          console.log(`[ACE Ingest] Created new source: ${sourceId}`);
        }

        // Create job for RabbitMQ
        const job = {
          jobId: crypto.randomUUID(),
          sourceId,
          url,
          tags: body.tags || [],
          priority: body.priority || 'normal',
          enqueuedAt: new Date().toISOString(),
        };

        // Enqueue job with priority
        const priorityValue = getPriorityValue(body.priority);
        channel.sendToQueue('ace_web_ingest', Buffer.from(JSON.stringify(job)), {
          persistent: true,
          priority: priorityValue,
        });

        jobIds.push(job.jobId);
        console.log(`[ACE Ingest] Enqueued job ${job.jobId} for ${url}`);
      } catch (error) {
        const errorMsg = `Failed to process URL ${url}: ${error}`;
        console.error(`[ACE Ingest] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Close RabbitMQ connection
    try {
      await channel.close();
      await connection.close();
    } catch (error) {
      console.warn('[ACE Ingest] Failed to close RabbitMQ connection:', error);
    }

    // Build response
    const response: IngestResponse = {
      success: jobIds.length > 0,
      jobIds,
      message: `Enqueued ${jobIds.length} of ${body.urls.length} URLs for processing`,
    };

    if (errors.length > 0) {
      response.errors = errors;
    }

    const statusCode = jobIds.length > 0 ? 200 : 400;

    return json(response, { status: statusCode });
  } catch (error) {
    console.error('[ACE Ingest] Endpoint error:', error);
    return json(
      {
        error: 'Internal server error',
        success: false,
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
};

/**
 * Validate ingestion request
 */
function validateInput(body: any): { valid: boolean; error?: string } {
  if (!body) {
    return { valid: false, error: 'Request body is required' };
  }

  if (!body.urls) {
    return { valid: false, error: 'urls field is required' };
  }

  if (!Array.isArray(body.urls)) {
    return { valid: false, error: 'urls must be an array' };
  }

  if (body.urls.length === 0) {
    return { valid: false, error: 'urls array must not be empty' };
  }

  if (body.urls.length > 100) {
    return { valid: false, error: 'Maximum 100 URLs per request' };
  }

  // Validate each URL is a string
  for (const url of body.urls) {
    if (typeof url !== 'string' || url.trim() === '') {
      return { valid: false, error: 'All URLs must be non-empty strings' };
    }
  }

  // Validate tags if provided
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return { valid: false, error: 'tags must be an array' };
    }

    for (const tag of body.tags) {
      if (typeof tag !== 'string' || tag.trim() === '') {
        return { valid: false, error: 'All tags must be non-empty strings' };
      }
    }
  }

  // Validate priority if provided
  if (body.priority !== undefined) {
    const validPriorities = ['high', 'normal', 'low'];
    if (!validPriorities.includes(body.priority)) {
      return {
        valid: false,
        error: 'priority must be one of: high, normal, low',
      };
    }
  }

  return { valid: true };
}

/**
 * Convert priority string to RabbitMQ priority value
 */
function getPriorityValue(priority?: 'high' | 'normal' | 'low'): number {
  switch (priority) {
    case 'high':
      return 10;
    case 'low':
      return 1;
    case 'normal':
    default:
      return 5;
  }
}
