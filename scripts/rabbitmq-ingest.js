#!/usr/bin/env node
/**
 * RabbitMQ Ingestion Helper for Legal AI Platform
 * Publishes crawled documents to RAG ingestion pipeline
 */

import amqp from 'amqplib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';

class RabbitMQIngestHelper {
    constructor() {
        this.rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672/';
        this.ingestionQueue = 'rag_ingestion_jobs';
        this.connection = null;
        this.channel = null;
    }

    async connect() {
        try {
            this.connection = await amqp.connect(this.rabbitmqUrl);
            this.channel = await this.connection.createChannel();
            await this.channel.assertQueue(this.ingestionQueue, { durable: true });
            console.log('✅ Connected to RabbitMQ');
        } catch (error) {
            console.error('❌ RabbitMQ connection failed:', error);
            throw error;
        }
    }

    async publishIngestionJob(jobData) {
        try {
            const message = Buffer.from(JSON.stringify(jobData));
            await this.channel.sendToQueue(this.ingestionQueue, message, {
                persistent: true,
                messageId: jobData.job_id,
                timestamp: Date.now()
            });
            console.log(`📤 Published ingestion job: ${jobData.job_id}`);
        } catch (error) {
            console.error('❌ Failed to publish ingestion job:', error);
            throw error;
        }
    }

    async publishCrawledDocuments(crawlResults, sourceMetadata = {}) {
        try {
            const jobId = `crawl_${Date.now()}_${Math.random().toString(36).substring(2)}`;

            // Extract documents from crawl results
            const documents = [];
            if (crawlResults.pages && Array.isArray(crawlResults.pages)) {
                for (const page of crawlResults.pages) {
                    documents.push({
                        url: page.url,
                        title: page.title || 'Untitled',
                        text: page.content || page.text || '',
                        metadata: {
                            ...page.metadata,
                            crawled_at: page.crawled_at || new Date().toISOString(),
                            content_hash: page.content_hash,
                            links_found: page.links?.length || 0
                        }
                    });
                }
            }

            if (documents.length === 0) {
                console.warn('⚠️ No documents found in crawl results');
                return null;
            }

            const jobData = {
                job_id: jobId,
                source: 'web_crawl',
                documents: documents,
                metadata: {
                    ...sourceMetadata,
                    crawl_url: crawlResults.url || sourceMetadata.url,
                    pages_crawled: crawlResults.pages_crawled || documents.length,
                    total_size: crawlResults.total_size || 0,
                    duration: crawlResults.duration || 0,
                    created_at: new Date().toISOString()
                },
                priority: sourceMetadata.priority || 1
            };

            await this.publishIngestionJob(jobData);
            return jobId;

        } catch (error) {
            console.error('❌ Failed to publish crawled documents:', error);
            throw error;
        }
    }

    async publishUploadedDocuments(files, metadata = {}) {
        try {
            const jobId = `upload_${Date.now()}_${Math.random().toString(36).substring(2)}`;

            // Process uploaded files
            const documents = [];
            for (const file of files) {
                try {
                    // Read file content (assuming text files for now)
                    const content = await fs.readFile(file.path, 'utf-8');

                    documents.push({
                        url: `file://${file.path}`,
                        title: file.originalname || path.basename(file.path),
                        text: content,
                        metadata: {
                            ...metadata,
                            file_size: file.size,
                            mime_type: file.mimetype,
                            uploaded_at: new Date().toISOString()
                        }
                    });
                } catch (error) {
                    console.warn(`⚠️ Failed to read file ${file.path}:`, error);
                }
            }

            if (documents.length === 0) {
                console.warn('⚠️ No valid documents found in upload');
                return null;
            }

            const jobData = {
                job_id: jobId,
                source: 'file_upload',
                documents: documents,
                metadata: {
                    ...metadata,
                    total_files: files.length,
                    processed_files: documents.length,
                    created_at: new Date().toISOString()
                },
                priority: metadata.priority || 2
            };

            await this.publishIngestionJob(jobData);
            return jobId;

        } catch (error) {
            console.error('❌ Failed to publish uploaded documents:', error);
            throw error;
        }
    }

    async getQueueStatus() {
        try {
            const queueInfo = await this.channel.assertQueue(this.ingestionQueue, { durable: true });
            return {
                queue: this.ingestionQueue,
                messageCount: queueInfo.messageCount,
                consumerCount: queueInfo.consumerCount
            };
        } catch (error) {
            console.error('❌ Failed to get queue status:', error);
            throw error;
        }
    }

    async close() {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
            console.log('🧹 RabbitMQ connection closed');
        } catch (error) {
            console.error('❌ Error closing RabbitMQ connection:', error);
        }
    }
}

// CLI interface for testing
async function main() {
    const helper = new RabbitMQIngestHelper();

    try {
        await helper.connect();

        // Check command line arguments
        const command = process.argv[2];

        if (command === 'status') {
            const status = await helper.getQueueStatus();
            console.log('📊 Queue Status:', JSON.stringify(status, null, 2));

        } else if (command === 'test-crawl') {
            // Test with mock crawl data
            const mockCrawlResults = {
                url: 'https://example.com/legal',
                pages_crawled: 2,
                pages: [
                    {
                        url: 'https://example.com/legal/terms',
                        title: 'Terms of Service',
                        content: 'This is the terms of service document. It contains legal terms and conditions...',
                        metadata: { description: 'Legal terms' },
                        crawled_at: new Date().toISOString()
                    },
                    {
                        url: 'https://example.com/legal/privacy',
                        title: 'Privacy Policy',
                        content: 'This privacy policy explains how we collect and use your data...',
                        metadata: { description: 'Privacy policy' },
                        crawled_at: new Date().toISOString()
                    }
                ]
            };

            const jobId = await helper.publishCrawledDocuments(mockCrawlResults);
            console.log(`✅ Published test crawl job: ${jobId}`);

        } else {
            console.log('Usage:');
            console.log('  node rabbitmq-ingest.js status          # Check queue status');
            console.log('  node rabbitmq-ingest.js test-crawl      # Publish test crawl data');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await helper.close();
    }
}

// Export for use as module
export { RabbitMQIngestHelper };

// Run CLI if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}