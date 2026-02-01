/**
 * Evidence Upload Service
 * Handles file upload, progress tracking, and processing for legal evidence
 */

import type { ProcessingEvent } from './types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

export interface UploadInitiation {
  evidence_id: string;
	job_id: string;
  presigned_url: string;
	expires_in: number;
  bucket: string;
	object_name: string;
}

export interface UploadCompletion {
  evidence_id: string;
	job_id: string;
  status: string;
	message: string;
}

export interface UploadStatus {
  stage: string;
	percentage: number;
  eta_seconds: number | null;
  last_update: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const API_BASE = '/api/evidence';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

/**
 * Validate file before upload
 */
export async function validateFile(file: File): Promise<ValidationResult> {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'File type not allowed. Supported types: PDF, PNG, JPG, TIFF, DOCX',
    };
  }

  return { valid: true };
}

/**
 * Initiate upload and get presigned URL
 */
export async function initiateUpload(
  caseId: string,
  filename: string,
  fileSize: number,
  contentType: string
): Promise<UploadInitiation> {
  const params = new URLSearchParams({
    case_id: caseId,
    filename: filename,
    file_size: fileSize.toString(),
    content_type: contentType,
  });

  const response = await fetch(`${API_BASE}/upload/initiate?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.error ?? 'Failed to initiate upload');
  }

  return response.json();
}

/**
 * Upload file to MinIO using presigned URL
 */
export async function uploadFileToMinIO(
  presignedUrl: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Complete upload and start processing
 */
export async function completeUpload(
  evidenceId: string,
  checksum?: string
): Promise<UploadCompletion> {
  const params = new URLSearchParams({ evidence_id: evidenceId });
  if (checksum) {
    params.append('checksum', checksum);
  }

  const response = await fetch(`${API_BASE}/${evidenceId}/complete?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.error ?? 'Failed to complete upload');
  }

  return response.json();
}

/**
 * Get current upload status
 */
export async function getUploadStatus(jobId: string): Promise<UploadStatus> {
  const response = await fetch(`${API_BASE}/${jobId}/progress`);

  if (!response.ok) {
    throw new Error('Failed to get upload status');
  }

  return response.json();
}

/**
 * Stream processing events via SSE
 */
export async function streamProcessingEvents(
  jobId: string,
  onEvent: (event: ProcessingEvent) => void,
  onError?: (error: Error) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${API_BASE}/${jobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);

        // Resolve when processing completes
        if (data.event_type === 'completion') {
          eventSource.close();
          resolve();
        }
      } catch (error) {
        console.error('Failed to parse event:', error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      const err = new Error('SSE connection failed');
      if (onError) {
        onError(err);
      }
      reject(err);
    };
  });
}

/**
 * Full upload flow: initiate → upload → complete → stream
 */
export async function uploadEvidence(
  caseId: string,
  file: File,
  onProgress?: (progress: number) => void,
  onProcessingEvent?: (event: ProcessingEvent) => void,
  onError?: (error: Error) => void
): Promise<{
	evidenceId: string; jobId: string }> {
  try {
    // Validate file
    const validation = await validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Initiate upload
    const initiation = await initiateUpload(caseId, file.name, file.size, file.type);

    // Upload to MinIO
    await uploadFileToMinIO(initiation.presigned_url, file, onProgress);

    // Complete upload
    const completion = await completeUpload(initiation.evidence_id);

    // Stream processing events
    if (onProcessingEvent) {
      streamProcessingEvents(completion.job_id, onProcessingEvent, onError).catch((error) => {
        if (onError) {
          onError(error);
        }
      });
    }

    return {
      evidenceId: initiation.evidence_id,
      jobId: completion.job_id,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (onError) {
      onError(err);
    }
    throw err;
  }
}

/**
 * Retry failed processing
 */
export async function retryProcessing(evidenceId: string): Promise<{
	jobId: string }> {
  const response = await fetch(`${API_BASE}/${evidenceId}/retry`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.error ?? 'Failed to retry processing');
  }

  return response.json();
}

/**
 * Get evidence details
 */
export async function getEvidenceDetails(evidenceId: string) {
  const response = await fetch(`${API_BASE}/${evidenceId}`);

  if (!response.ok) {
    throw new Error('Failed to get evidence details');
  }

  return response.json();
}

/**
 * List evidence for a case
 */
export async function listEvidence(
  caseId: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  if (status) {
    params.append('status', status);
  }

  const response = await fetch(`${API_BASE}/case/${caseId}/list?${params}`);

  if (!response.ok) {
    throw new Error('Failed to list evidence');
  }

  return response.json();
}

/**
 * Delete evidence
 */
export async function deleteEvidence(evidenceId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${evidenceId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete evidence');
  }
}
