#!/usr/bin/env node
/**
 * Publish summary-envelope jobs to RabbitMQ.
 *
 * Input:
 *   .tmp/rabbitmq-gemma4-summary-jobs.ndjson
 *
 * Default target queue:
 *   phase8.summary.envelopes
 *
 * This is intentionally separate from the live Phase 7 chunk summarization
 * queue. The builder emits grouped envelope jobs; this publisher forwards that
 * artifact to a dedicated queue for downstream fan-out stages.
 */

import amqp from 'amqplib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function resolveInputPath(rawInput) {
  const candidates = [];
  if (rawInput) {
    candidates.push(path.resolve(ROOT, rawInput));
    candidates.push(path.resolve(ROOT, 'sveltekit-frontend', rawInput));
  } else {
    candidates.push(path.resolve(ROOT, '.tmp/rabbitmq-gemma4-summary-jobs.ndjson'));
    candidates.push(path.resolve(ROOT, 'sveltekit-frontend', '.tmp/rabbitmq-gemma4-summary-jobs.ndjson'));
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

const INPUT = resolveInputPath(process.argv.find((arg) => arg.startsWith('--input='))?.split('=')[1] || '');
const QUEUE_NAME = process.argv.find((arg) => arg.startsWith('--queue='))?.split('=')[1] || 'phase8.summary.envelopes';
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const LIMIT = LIMIT_ARG ? Math.max(0, Number.parseInt(LIMIT_ARG, 10) || 0) : 0;
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`Failed to parse NDJSON line ${index + 1}: ${err.message}`);
      }
    });
}

async function sendToQueueAwaitDrain(channel, queueName, content, options) {
  const accepted = channel.sendToQueue(queueName, content, options);
  if (!accepted) {
    await new Promise((resolve) => channel.once('drain', resolve));
  }
}

async function publishJobs(jobs) {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  try {
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    let published = 0;
    for (const job of jobs) {
      const payload = Buffer.from(JSON.stringify(job));
      await sendToQueueAwaitDrain(channel, QUEUE_NAME, payload, {
        persistent: true,
        contentType: 'application/json',
        messageId: String(job.job_id || job.id || `job-${published + 1}`),
        priority: Math.max(0, Math.min(10, Number(job.priority ?? 5) || 5)),
        headers: {
          job_type: job.job_type || 'feature_envelope_summary',
          group_key: job.group_key || null,
          feature_id: job.feature_id || null,
          source_ref: job.source_ref || null,
          model: job.model || null,
        }
      });
      published++;
    }

    return published;
  } finally {
    await channel.close().catch(() => null);
    await connection.close().catch(() => null);
  }
}

async function main() {
  const jobs = readNdjson(INPUT);
  const selected = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;

  console.log(`[summary-envelope-queue] Input: ${INPUT}`);
  console.log(`[summary-envelope-queue] Queue: ${QUEUE_NAME}`);
  console.log(`[summary-envelope-queue] Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`);
  console.log(`[summary-envelope-queue] Jobs loaded: ${jobs.length}`);
  console.log(`[summary-envelope-queue] Jobs selected: ${selected.length}`);

  if (selected.length > 0) {
    const preview = selected.slice(0, 3).map((job) => ({
      job_id: job.job_id,
      job_type: job.job_type,
      group_key: job.group_key,
      feature_label: job.feature_label,
      tuple_count: job.tuple_count,
      priority: job.priority,
    }));
    console.log('[summary-envelope-queue] Preview:', JSON.stringify(preview, null, 2));
  }

  if (DRY_RUN) {
    console.log('[summary-envelope-queue] Dry-run complete; no messages published.');
    return;
  }

  const published = await publishJobs(selected);
  const report = {
    timestamp: new Date().toISOString(),
    input: path.relative(ROOT, INPUT),
    queue: QUEUE_NAME,
    published,
    total_loaded: jobs.length,
    total_selected: selected.length,
  };

  fs.mkdirSync(path.resolve(ROOT, '.tmp'), { recursive: true });
  fs.writeFileSync(
    path.resolve(ROOT, '.tmp', 'rabbitmq-summary-envelope-publish.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  console.log(`[summary-envelope-queue] Published ${published} jobs to ${QUEUE_NAME}`);
  console.log(`[summary-envelope-queue] Report: .tmp/rabbitmq-summary-envelope-publish.json`);
}

main().catch((err) => {
  console.error('[summary-envelope-queue] Fatal error:', err.message);
  process.exit(1);
});
