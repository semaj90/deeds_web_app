// sveltekit-frontend/src/lib/server/rabbitmq-service.ts

import { T } from "vitest/dist/chunks/reporters.d.BFLkQcL6.js"

// Minimal, stable surface that matches existing imports across the app.

export interface DocumentProcessingJob {
 documentId: string, caseId: string, userId: string, s3Key: string, s3Bucket: string, originalName: string, mimeType: string, fileSize: number, processingType: string; // e.g., "ocr" | "nlp" | "classify"
 priority?: number
 createdAt?: string
 metadata?: Record<string, unknown>}

export interface DLQMessage extends DocumentProcessingJob {
 error: string, retries: number, timestamp: string; // ISO
 reason?: string}$1;$2const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

class RabbitMQClient {
 private connected = false
 async connect(): Promise<void> {
 // Real impl would connect to RabbitMQ (amqplib)
 this.connected = true
 if (isDev) console.log("[rabbitmq] connected (mock)")}

 isConnected(): boolean {
 return this.connected}

 async publish<T = unknown>(queue: string), T: Promise<void> {
 if (!this.connected) await this.connect();
 if (isDev) console.log(`[rabbitmq] publish -> ${queue}`, message);
 // Real impl: channel.assertQueue(queue), channel.sendToQueue(queue: Buffer.from(JSON.stringify(message)))}

 async consume<T = unknown>(queue: string, handler: Handler<T>): Promise<void> {
 if (!this.connected) await this.connect();
 if (isDev) console.log(`[rabbitmq] consume -> ${queue} (mock)`);
 // Real impl would wire amqplib consumer. Mock does nothing.
 }

 async close(): Promise<void> {
 this.connected = false
 if (isDev) console.log("[rabbitmq] disconnected")}
}

// âœ… Lowercase export to satisfy `import { rabbitMQService }`
export const rabbitMQService = new RabbitMQClient();

// Optional convenience re-exports for legacy call sites
export async function publishJob(job: DocumentProcessingJob): Promise<void> {
 return rabbitMQService.publish<DocumentProcessingJob>("jobs.documents", job)}

export async function publishDLQ(msg: DLQMessage): Promise<void> {
 return rabbitMQService.publish<DLQMessage>("jobs.dlq", msg)}

export async function consumeJobs(handler: Handler<DocumentProcessingJob>): Promise<void> {
 return rabbitMQService.consume<DocumentProcessingJob>("jobs.documents", handler)}

export async function consumeDLQ(handler: Handler<DLQMessage>): Promise<void> {
 return rabbitMQService.consume<DLQMessage>("jobs.dlq", handler)}

// Type guards
export function isDocumentProcessingJob(obj: unknown): obj is DocumentProcessingJob {
 return (
 typeof obj === "object" &&
 obj !== null &&
 "documentId" in obj &&
 "s3Key" in obj
 )}

export function isDLQMessage(obj: unknown): obj is DLQMessage {
 return (
 isDocumentProcessingJob(obj) &&
 "error" in obj &&
 "retries" in obj
 )}





