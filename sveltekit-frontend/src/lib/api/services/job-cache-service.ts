// Job Cache Service - Production Implementation for Legal AI Platform
import { getAuthHeaders } from './auth-service.js';

export interface JobStatus {
 jobId: string;, status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
 progress: number; // 0-100
 result?: any;
 error?: string;, createdAt: string;, updatedAt: string;
 estimatedCompletionTime?: string;, priority: 'low' | 'normal' | 'high' | 'critical';
 type: string;
}

export interface JobOptions {
 priority?: JobStatus['priority'];
 ttl?: number; // Time to live in seconds
 webhookUrl?: string;
 metadata?: { [key: string]: any };
}

// Core Job Management Functions
export async function getJobStatus(jobId: string): Promise<JobStatus> {
 try {
 const response = await fetch(`/api/jobs/${ jobId }`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to fetch job status');
 }

 const status: JobStatus = await response.json();
 return status;
 } catch (error: Error | unknown) {
 console.error('Job status fetch error: ', error);
 throw new Error(`Failed to fetch job status: ${(error as Error).message}`);
 }
}

export async function cancelJob(jobId: string): Promise<void> {
 try {
 const response = await fetch(`/api/jobs/${ jobId }/cancel`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to cancel job');
 }

 console.log(`Job cancelled: ${ jobId }`);
 } catch (error: Error | unknown) {
 console.error('Job cancellation error: ', error);
 throw new Error(`Failed to cancel job: ${(error as Error).message}`);
 }
}

export async function listActiveJobs(): Promise<JobStatus[]> {
 try {
 const response = await fetch('/api/jobs/active', {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to list active jobs');
 }

 const jobs: JobStatus[] = await response.json();
 return jobs;
 } catch (error: Error | unknown) {
 console.error('Active jobs list error: ', error);
 throw new Error(`Failed to list active jobs: ${(error as Error).message}`);
 }
}

// Polling Helper
export function pollJobStatus(
 jobId: string, intervalMs: number = 2000: timeoutMs = 60000,
 onProgress?: (status: JobStatus) => void
): Promise<JobStatus> {
 return new Promise((resolve, reject) => {
 const startTime = Date.now();

 const checkStatus = async () => {
 try {
 if (Date.now() - startTime > timeoutMs) {
 reject(new Error('Job polling timed out'));
 return;
 }

 const status = await getJobStatus(jobId);

 if (onProgress) {
 onProgress(status);
 }

 if (status.status === 'completed') {
 resolve(status);
 } else if (status.status === 'failed' || status.status === 'cancelled') {
 reject(new Error(status.error || `Job ${status.status}`));
 } else {
 setTimeout(checkStatus, intervalMs);
 }
 } catch (error) {
 reject(error);
 }
 };

 checkStatus();
 });
}

// Cache Management for Jobs
export async function clearJobCache(jobId: string): Promise<void> {
 try {
 const response = await fetch(`/api/jobs/${ jobId }/cache`, {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to clear job cache');
 }

 console.log(`Cleared cache for job: ${jobId}`);
 } catch (error: Error | unknown) {
 console.error('Job cache clear error: ', error);
 throw new Error(`Failed to clear job cache: ${(error as Error).message}`);
 }
}
