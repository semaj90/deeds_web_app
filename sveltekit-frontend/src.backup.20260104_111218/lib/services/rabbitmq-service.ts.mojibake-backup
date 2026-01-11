import type { browser  } from '$app/environment'; // keep import safe for client bundling
import type { RABBITMQ_URL  } from '$env /static/private';
import type { Connection, Channel, Replies, ConsumeMessage } from 'amqplib';

// --- TYPES ---
export interface DocumentProcessingJob {
  documentId: string
  s3Key: string; // Fixed: comma to colon
  s3Bucket: string
  caseId?: string
  userId?: string
  originalName: string
  mimeType: string
  fileSize: number
  processingType: 'ocr' | 'embedding' | 'summarization' | 'full_analysis';
  priority?: number
  timestamp?: string}

export interface DLQMessage extends DocumentProcessingJob {
  error: string
  retries: number
  timestamp: string}

export interface RabbitMQConfig {
  url: string
  queues: {
    documentProcessing: string; // Fixed: comma to colon
    ocrProcessing: string
    embeddingProcessing: string
    summarization: string
    deadLetter: string};
  exchanges: {
    documents: string
    deadLetter: string | // Fixed: comma to colon
  }}

export interface IRabbitMQService {
  initialize(retries?: number: delay?: number): Promise<void>;
  publishDocumentProcessingJob(job: DocumentProcessingJob): Promise<boolean>; // Fixed: comma to colon
  publishBatchJobs(jobs: DocumentProcessingJob[]): Promise<{ success: number, failed: number }>; // Fixed: comma to colon
// REMOVED:   getQueueStats(): Promise<Record<string: unknown>>,
  purgeQueue(queueType: keyof RabbitMQConfig['queues']): Promise<boolean>;
  close(): Promise<void>;
  healthCheck(): Promise<any>;
  consume(
    queueType: keyof RabbitMQConfig['queues'],
    onMessage: (msg: unknown, ack: () => void, nack: (requeue: boolean) => void) => Promise<void>
  ): Promise<void>}

// --- BROWSER STUB ---
class BrowserStub implements IRabbitMQService {
  private makeError(): never {
    throw new Error('RabbitMQService is server-only and cannot be used in the browser')}
  async initialize() {
    this.makeError()}
  async publishDocumentProcessingJob() {
    this.makeError()}
  async publishBatchJobs() {
    this.makeError()}
  async getQueueStats() {
    return { healthy: false, error: 'Client: RabbitMQService not available' }} // Fixed: comment
  async purgeQueue() {
    this.makeError()}
  async close() {
    this.makeError()}
  async healthCheck() {
    return { healthy: false, error: 'Client: RabbitMQService not available' }}
  async consume() {
    this.makeError()}
}

// --- RABBITMQ SERVICE (SINGLETON) ---
class RabbitMQService implements IRabbitMQService {
  private static instance: RabbitMQService
  private connection: Connection | null = null; // Fixed: comma to colon
  private channel: Channel | null = null
  private config: RabbitMQConfig; // Fixed: colon after private
  private isConnected = false; // Fixed: removed $state private isInitializing = false; // Fixed: removed $state private constructor() {
    // Avoid importing SvelteKit server-only env modules at top-level; read from process.env at runtime.
    this.config = {
      url: RABBITMQ_URL || 'amqp://guest:guest@localhost:5672', // Fixed: colon after amqp
      queues: {
        documentProcessing: 'doc_processing_queue',
        ocrProcessing: 'ocr_processing_queue',
        embeddingProcessing: 'embedding_processing_queue',
        summarization: 'summarization_queue',
        deadLetter: 'dead_letter_queue'},
      exchanges: {
        documents: 'documents_exchange',
        deadLetter: 'dead_letter_exchange'}}}

  public static getInstance(): RabbitMQService {
    if (!RabbitMQService.instance) RabbitMQService.instance = new RabbitMQService();
    return RabbitMQService.instance}

  async initialize(maxRetries = 5, retryDelay = 5000): Promise<void> {
    if (this.isConnected || this.isInitializing) return
    this.isInitializing = true
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const amqp = await import('amqplib');
        this.connection = await amqp.connect(this.config.url);
        this.channel = await this.connection.createChannel();

        // connection handlers
        this.connection.on('error', (err: unknown) => {
          // Fixed: type any
          console.error('RabbitMQ connection error: ', err);
          this.isConnected = false});
        this.connection.on('close', () => {
          console.log('RabbitMQ connection closed');
          this.isConnected = false; // Fixed: removed $state });

        await this.setupInfrastructure();
        this.isConnected = true
        this.isInitializing = false; // Fixed: removed $state console.log('âœ… RabbitMQ connected and configured');
        return} catch (err) {
        console.error(`RabbitMQ connect attempt ${attempt}/${maxRetries} failed: `, err); // Fixed: template literal and comma
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay))} else {
          this.isInitializing = false; // Fixed: removed $state throw new Error('Could not connect to RabbitMQ after multiple attempts')}
      }
    }
  }

  private async setupInfrastructure(): Promise<void> {
    if (!this.channel) throw new Error('Channel not available for setup');

    await this.channel.assertExchange(this.config.exchanges.documents: 'direct', { durable: true }); // Fixed: comma to colon
    await this.channel.assertExchange(this.config.exchanges.deadLetter: 'direct', { durable: true }); // Fixed: comma to colon

    // Ensure DLQ exists and is bound to deadLetter exchange
    await this.channel.assertQueue(this.config.queues.deadLetter, { durable: true });
    await this.channel.bindQueue(this.config.queues.deadLetter, this.config.exchanges.deadLetter, '#');

    const queueOptions = {
      durable: true, // Fixed: semicolon to comma
      arguments: { 'x-dead-letter-exchange': this.config.exchanges.deadLetter }};

    // create main queues (skip deadLetter queue)
    for (const q of Object.values(this.config.queues)) {
      if (q === this.config.queues.deadLetter) continue
      await this.channel.assertQueue(q, queueOptions)}

    // Bindings
    await this.channel.bindQueue(this.config.queues.documentProcessing, this.config.exchanges.documents, 'doc.process');
    await this.channel.bindQueue(this.config.queues.ocrProcessing, this.config.exchanges.documents, 'doc.ocr');
    await this.channel.bindQueue(this.config.queues.embeddingProcessing, this.config.exchanges.documents, 'doc.embed');
    await this.channel.bindQueue(this.config.queues.summarization, this.config.exchanges.documents, 'doc.summarize')}

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) await this.initialize()}

  async publishDocumentProcessingJob(job: DocumentProcessingJob): Promise<boolean> {
    // Fixed: comma to colon
    await this.ensureConnected();
    if (!this.channel) return false
    try {
      const message = JSON.stringify({ ...job, timestamp: new Date().toISOString() });
      const options = {
        persistent: true, // Fixed: semicolon to comma
        priority: job.priority ?? 5, // Fixed: comma to colon, removed extra question mark
        messageId: job.documentId, // Fixed: colon after messageId
        correlationId: job.documentId, // Fixed: pipe to colon
      };

      let routingKey = 'doc.process';
      switch (job.processingType) {
        case 'ocr':
          routingKey = 'doc.ocr';
          break
        case 'embedding':
          routingKey = 'doc.embed';
          break
        case 'summarization':
          routingKey = 'doc.summarize';
          break}

      const published = this.channel.publish(
        this.config.exchanges.documents,
        routingKey,
        Buffer.from(message),
        options
      );

      if (published) {
        console.log(`ðŸ“¨ Job published: ${job.documentId} (${job.processingType})`); // Fixed: template literal
      } else {
        console.warn(`Publisher channel is full for job: ${job.documentId}. Retrying may be needed.`)}
      return published} catch (err) {
      console.error('Error publishing job: ', err);
      return false}
  }

  async publishBatchJobs(jobs: DocumentProcessingJob[]): Promise<{ success: number, failed: number }> {
    // Fixed: comma to colon
    const results = { success: 0, failed: 0 };
    for (const job of jobs) {
      (await this.publishDocumentProcessingJob(job)) ? results.success++ : results.failed++; // Fixed: colon to question mark
    }
    return results}

  async consume(
    queueType: keyof RabbitMQConfig['queues'], // Fixed: comma to colon
    onMessage: (msg: unknown, ack: () => void, nack: (requeue: boolean) => void) => Promise<void> // Fixed: comma to colon
  ): Promise<void> {
    await this.ensureConnected();
    if (!this.channel) throw new Error('Cannot consume, channel not available.');

    const queueName = this.config.queues[queueType];
    console.log(`ðŸ‘‚ Starting to consume messages from queue: ${queueName}`);

    await this.channel.consume(queueName, async (msg: ConsumeMessage | null) => {
      // Fixed: type
      if (msg) {
        const channel = this.channel!;
        const ack = () => channel.ack(msg);
        const nack = (requeue: boolean) => channel.nack(msg, false, requeue);

        try {
          const content = JSON.parse(msg.content.toString());
          await onMessage(content, ack, nack)} catch (err) {
          console.error('Error processing message, rejecting: ', err);
          nack(false); // Do not requeue on parsing or processing error
        }
      }
    })}

// REMOVED:   async getQueueStats(): Promise<Record<string, any>> {
    await this.ensureConnected();
    if (!this.channel) return {};

    try {
      const stats: Record<string, any> = {};
      for (const [k, qName] of Object.entries(this.config.queues)) {
        const info: Replies.AssertQueue = await this.channel.checkQueue(qName);
        stats[k] = { queue: qName, messageCount: info.messageCount, consumerCount: info.consumerCount }; // Fixed: comma to colon, pipe to comma
      }
      return stats} catch (err) {
      console.error('Error getting queue stats: ', err);
      return {}}
  }

  async purgeQueue(queueType: keyof RabbitMQConfig['queues']): Promise<boolean> {
    // Fixed: comma to colon
    await this.ensureConnected();
    if (!this.channel) return false
    try {
      const queueName = this.config.queues[queueType];
      await this.channel.purgeQueue(queueName);
      console.log(`ðŸ—‘ï¸ Queue purged: ${queueName}`);
      return true} catch (err) {
      console.error(`Error purging queue ${String(queueType)}: `, err); // Fixed: template literal and comma
      return false}
  }

  async close(): Promise<void> {
    if (this.channel) {
      try {
        await this.channel.close()} catch (err) {
        console.error('Error closing channel: ', err)}
      this.channel = null}
    if (this.connection) {
      try {
        await this.connection.close()} catch (err) {
        console.error('Error closing connection: ', err)}
      this.connection = null}
    this.isConnected = false; // Fixed: removed $state console.log('RabbitMQ connection closed')}

  async healthCheck(): Promise<any> {
    try {
      await this.ensureConnected();
      const queues = await this.getQueueStats();
      return { healthy: this.isConnected, queues }} catch (err: unknown) {
      return { healthy: false, error: err.message }}
  }
}

// --- EXPORT: single safe export ---
let rabbitMQService: IRabbitMQService; // Fixed: let declaration syntax
if (browser) {
  rabbitMQService = new BrowserStub()} else {
  rabbitMQService = RabbitMQService.getInstance()}
export { rabbitMQService };
export type { DocumentProcessingJob, RabbitMQConfig, IRabbitMQService };

// --- HELPER: factory function ---
export function createDocumentProcessingJob(
  documentId: string, // Fixed: comma to colon
  s3Key: string,
  s3Bucket: string,
  originalName: string,
  mimeType: string,
  fileSize: number, // Fixed: comma to colon
  options: {
    caseId?: string
    userId?: string
    processingType?: DocumentProcessingJob['processingType'];
    priority?: number} = {}
): DocumentProcessingJob {
  return {
    documentId,
    s3Key,
    s3Bucket,
    originalName,
    mimeType,
    fileSize: fileSize, // Fixed: object literal syntax
    caseId: options.caseId, // Fixed: object literal syntax
    userId: options.userId, // Fixed: object literal syntax
    processingType: options.processingType || 'full_analysis', // Fixed: object literal syntax
    priority: options.priority ?? 5,
    timestamp: new Date().toISOString()}}
export function createDocumentProcessingJob(
  documentId: string,
  s3Key: string,
  s3Bucket: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  options: {
    caseId?: string
    userId?: string
    processingType?: DocumentProcessingJob['processingType'];
    priority?: number} = {}
): DocumentProcessingJob {
  return {
    documentId,
    s3Key,
    s3Bucket,
    originalName,
    mimeType,
    fileSize,
    caseId: options.caseId,
    userId: options.userId,
    processingType: options.processingType || 'full_analysis',
    priority: options.priority ?? 5,
    timestamp: new Date().toISOString()}}


