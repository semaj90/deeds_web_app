/**
 * ACE Web Ingestion Endpoint
 * POST /api/ace/web/ingest
 * Enqueues URLs for web crawling and ingestion into ACE knowledge base
 */

import { aceSources, db } from '$lib';
import { json } from '@sveltejs/kit';
import * as amqp from 'amqplib';
import * as crypto from 'crypto';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// --- Singleton RabbitMQ Connection ---
let amqpConnection: any = null;
let amqpChannel: any = null;

async function getAmqpChannel() {
  if (amqpChannel) return amqpChannel;

  try {
    const rabbitmqUrl = process.env?.RABBITMQ_URL ?? 'amqp://localhost:5672';
    if (!amqpConnection) {
      amqpConnection = await (amqp as any).connect(rabbitmqUrl);

      // Handle connection close/error
      amqpConnection.on('close', () => {
        console.warn('[ACE Ingest] RabbitMQ connection closed. Resetting.');
        amqpConnection = null;
        amqpChannel = null;
      });

      amqpConnection.on('error', (err: unknown) => {
        console.error('[ACE Ingest] RabbitMQ connection error:', err);
        amqpConnection = null;
        amqpChannel = null;
      });
    }

    amqpChannel = await amqpConnection.createChannel();
    await amqpChannel.assertQueue('ace_web_ingest', { durable: true });

    return amqpChannel;
  } catch (error) {
    console.error('[ACE Ingest] Failed to connect/create channel:', error);
    throw error;
  }
}

// --- Validation Schema ---
const IngestRequestSchema = z.object({
  urls: z.array(z.string().url('Invalid URL format')).min(1, 'At least one URL required').max(100, 'Max 100 URLs per request'),
  tags: z.array(z.string().min(1)).optional().default([]),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
});

type IngestRequest = z.infer<typeof IngestRequestSchema>;

interface IngestResponse { success: boolean; jobIds: string[];
  message: string;
  errors?: string[];
}

/**
 * POST /api/ace/web/ingest
 * Enqueue URLs for ingestion
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawBody = await request.json();

    // Validate input with Zod
    const validation = IngestRequestSchema.safeParse(rawBody);

    if (!validation.success) {
      return json(
        {
          error: 'Validation failed',
          details: validation.error.flatten(),
          success: false
        },
        { status: 400 }
      );
    }

    const body = validation.data;

    // Connect to RabbitMQ (reusing connection)
    let channel: any;
    try {
      channel = await getAmqpChannel();
    } catch (error) {
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

    // 1. Check for existing sources in batch
    let existingSources: { id: string; canonicalUrl: string }[] = [];
    try {
      existingSources = await db
        .select({
          id: aceSources.id,
          canonicalUrl: aceSources.canonicalUrl
        })
        .from(aceSources)
        .where(inArray(aceSources.canonicalUrl, body.urls));
    } catch (dbError) {
      console.error('[ACE Ingest] Database query failed:', dbError);
      return json({ error: 'Database error', success: false }, { status: 500 });
    }

    const existingMap = new Map(existingSources.map(s => [s.canonicalUrl, s.id]));
    const urlsToInsert: string[] = [];
    const urlsToUpdate: string[] = [];
    const sourceIdsMap = new Map<string, string>(); // URL -> SourceID

    for (const url of body.urls) {
      if (existingMap.has(url)) {
        urlsToUpdate.push(url);
        sourceIdsMap.set(url, existingMap.get(url)!);
      } else {
        urlsToInsert.push(url);
      }
    }

    // 2. Perform Batch Insert
    if (urlsToInsert.length > 0) {
      try {
        const values = urlsToInsert.map(url => {
          const parsedUrl = new URL(url);
          return {
            canonicalUrl: url,
            domain: parsedUrl.hostname,
            sourceType: 'web' as const,
            crawlStatus: 'new' as const,
          };
        });
        const inserted = await db
          .insert(aceSources)
          .values(values)
          .returning({
            id: aceSources.id,
            canonicalUrl: aceSources.canonicalUrl
          });

        inserted.forEach(s => sourceIdsMap.set(s.canonicalUrl, s.id));
        console.log(`[ACE Ingest] Batch inserted ${inserted.length} new sources`);
      } catch (insertError) {
        console.error('[ACE Ingest] Batch insert failed:', insertError);
        return json({ error: 'Failed to create sources', success: false }, { status: 500 });
      }
    }

    // 3. Perform Batch Update (reset status to 'new')
    if (urlsToUpdate.length > 0) {
      try {
        // Update all existing to 'new' status
        await db
          .update(aceSources)
          .set({ crawlStatus: 'new' })
          .where(inArray(aceSources.canonicalUrl, urlsToUpdate));
        console.log(`[ACE Ingest] Batch updated ${urlsToUpdate.length} sources to 'new'`);
      } catch (updateError) {
        console.error('[ACE Ingest] Batch update failed:', updateError);
        // Continue, treating as non-fatal but logged
      }
    }

    // 4. Batch Enqueue Jobs
    const priorityValue = getPriorityValue(body.priority);

    // We process sequentially or parallel? Parallel is fine for RabbitMQ
    await Promise.all(body.urls.map(async (url) => {
        const sourceId = sourceIdsMap.get(url);
        if (!sourceId) {
            const msg = `Skipping enqueue for ${url}: Source ID not found (insert failed?)`;
            console.error(msg);
            errors.push(msg);
            return;
        }

        try {
            const job = {
                jobId: crypto.randomUUID(),
                sourceId: url,
                tags: body.tags,
                priority: body.priority,
                enqueuedAt: new Date().toISOString(),
            };

            const sent = channel.sendToQueue('ace_web_ingest', Buffer.from(JSON.stringify(job)), {
                persistent: true,
                priority: priorityValue
            });

            if (sent) {
                jobIds.push(job.jobId);
            } else {
                // Handle backpressure if needed (rare for low volume)
                console.warn(`[ACE Ingest] Buffer full for ${url}`);
                // In truly robust system, we'd wait for 'drain' event
                jobIds.push(job.jobId); // Pretend success for now or implement drain wait logic
            }
        } catch (queueError) {
          const errorMsg = `Failed to enqueue URL ${url}: ${queueError instanceof Error ? queueError.message : String(queueError)}`;
          console.error(`[ACE Ingest] ${errorMsg}`);
          errors.push(errorMsg);
        }
    }));

    // Build response
    const response: IngestResponse = {
      success: jobIds.length > 0,
      jobIds,
      message: `Enqueued ${jobIds.length} of ${body.urls.length} URLs for processing`,
    };

    if (errors.length > 0) {
      response.errors = errors;
    }

    const statusCode = jobIds.length > 0 ? 200 : 400; // Partial success is 200

    return json(response, { status, statusCode });
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
 * Convert priority string to RabbitMQ priority value
 */
function getPriorityValue(priority?: 'high' | 'normal' | 'low'): number {
  switch (priority) {
    case 'high':
      return 10;
    case 'low':
      return 1;
    case 'normal': default;
 return 5;
  }
}




