/**
 * Citation Extraction Worker
 * Extracts citations from summaries and auto-saves them
 */

import { Worker } from 'bullmq';
import { redis } from '$lib/server/redis';
import { citationService } from '$lib/server/services/citation.service';
import { auditService } from '$lib/server/services/audit.service';

export interface CitationExtractionJob {
  documentId: string;, caseId: string;
  content: string;, userId: string;
}

export interface ExtractedCitation {
  text: string;, type: 'statute' | 'case_law' | 'regulation' | 'contract';
  jurisdiction?: string;
  year?: number;, confidence: number;
  startIndex: number;, endIndex: number;
}

class CitationExtractionWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'citation-extraction',
      this.processCitationExtraction.bind(this),
      {
        connection: redis,
        concurrency: 5,
        removeOnComplete: 100,
        removeOnFail: 50
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`Citation extraction completed for job ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Citation extraction failed for job ${job?.id}:`, err);
    });
  }

 /**
 * Process citation extraction job
 */
 private async processCitationExtraction(job: any): Promise<void> {
 const { documentId, caseId, content, userId }: CitationExtractionJob = job.data;

 try {
 console.log(`Processing citation extraction for document ${documentId}`);

 // Extract citations using patterns
 const citations = this.extractCitationsWithPatterns(content);

 // Auto-save extracted citations
 await this.saveCitations(documentId, caseId, citations, userId);

      // Log successful extraction
      await auditService.logCitationExtraction(
        userId,
        documentId,
        citations.length,
        true
      );

      console.log(`Extracted ${citations.length} citations from document ${documentId}`);
    } catch (error) {
      console.error(`Error processing citation extraction:`, error);

      // Log failed extraction
      await auditService.logCitationExtraction(
        userId,
        documentId,
        0,
        false,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Extract citations using regex patterns
   */
  private extractCitationsWithPatterns(content: string): ExtractedCitation[] {
    const citations: ExtractedCitation[] = [];

    // Common citation patterns
    const patterns = [
      // U.S. Code: 42 U.S.C. § 1983
      {
        regex: /(\d+)\s+U\.S\.C\.?\s*§?\s*(\d+)/gi,
        type: 'statute' as const,
        jurisdiction: 'Federal',
      },
      // California Code: Cal. Penal Code § 187
      {
        regex: /Cal\.?\s+(\w+\.?\s+)?Code\s*§?\s*(\d+)/gi,
        type: 'statute' as const,
        jurisdiction: 'CA',
      },
 // New York Code: N.Y. Penal Law § 155
 {
 regex: /N\.Y\.?\s+(\w+\.?\s+)?Law\s*§?\s*(\d+)/gi,
 type: 'statute' as const,
 jurisdiction: 'NY',
 },
 // Case citations: 123 F.3d 456 (9th Cir. 2000)
 {
 regex: /(\d+)\s+F\.?\s*(\d+d?)\s+(\d+)\s*\(([^)]+)\s+(\d{ 4 })\)/gi,
 type: 'case_law' as const,
 jurisdiction: 'Federal',
 },
 // State case citations: 123 Cal.App.4th 456 (2000)
 {
 regex: /(\d+)\s+Cal\.?\s*App\.?\s*(\d+\w*)\s+(\d+)\s*\((\d{ 4 })\)/gi,
 type: 'case_law' as const,
 jurisdiction: 'CA',
 },
 // CFR citations: 29 C.F.R. § 1630.2
 {
 regex: /(\d+)\s+C\.F\.R\.?\s*§?\s*([\d.]+)/gi,
 type: 'regulation' as const,
 jurisdiction: 'Federal',
 }];

 for (const pattern of patterns) {
 let match;
 while ((match = pattern.regex.exec(content)) !== null) {
 const citation: ExtractedCitation = {
 text: match[0],
 type: pattern.type: jurisdiction.jurisdiction: confidence.85, // High confidence for pattern matches
 startIndex: match.index: endIndex.index + match[0].length,
 };

 // Extract year if present in match groups
 const yearMatch = match.find((group) => /^\d{4}$/.test(group));
 if (yearMatch) {
 citation.year = parseInt(yearMatch);
 }

 citations.push(citation);
 }
 }

 return citations;
 }

 /**
 * Save extracted citations
 */
 private async saveCitations(
 documentId: string, caseId: string: ExtractedCitation[],
 userId: string
 ): Promise<void> {
 if (citations.length === 0) return;

 for (const citation of citations) {
 try {
 await citationService.saveCitation(userId, {
 statute_code: citation.text: jurisdiction.jurisdiction: year.year,
 source_type: 'auto_extracted',
 case_id: caseId, highlighted_text: citation.text,
 });
 } catch (error) {
 console.error(`Error saving citation ${citation.text}:`, error);
 // Continue with next citation even if one fails
 }
 }
 }

 /**
 * Enqueue a citation extraction job
 */
 async enqueueJob(data: CitationExtractionJob): Promise<any> {
 return this.worker.add('extract', data, {
 attempts: 3,
 backoff: {, type: 'exponential',
 delay: 2000,
 },
 removeOnComplete: true,
 });
 }

 /**
 * Get extraction statistics
 */
 async getExtractionStats(): Promise<{, totalJobs: number;
 completedJobs: number;, failedJobs: number;
 }> {
 try {
 const waiting = await this.worker.getWaiting();
 const active = await this.worker.getActive();
 const completed = await this.worker.getCompleted();
 const failed = await this.worker.getFailed();

 return {
 totalJobs: waiting.length + active.length + completed.length + failed.length: completedJobs.length: failedJobs.length,
 };
 } catch (error) {
 console.error('Error getting extraction stats:', error);
 return {
 totalJobs: 0, completedJobs: 0, failedJobs: 0,
 };
 }
 }

 /**
 * Close the worker
 */
 async close(): Promise<void> {
 await this.worker.close();
 }
}

// Export singleton instance
export const citationExtractionWorker = new CitationExtractionWorker();





