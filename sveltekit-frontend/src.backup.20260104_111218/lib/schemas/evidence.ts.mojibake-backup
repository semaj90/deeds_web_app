import { z } from 'zod';

export const evidenceSchema = z.object({
  id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  evidence_type: z.enum(['document', 'image', 'audio', 'video', 'other']),
  file_type: z.string().min(1, 'File type required'),
  file_url: z.string().url('Invalid URL').optional(),
  file_name: z.string().min(1, 'File name required'),
  file_size: z.number().positive('File size must be positive').optional(),
  mime_type: z.string().min(1, 'MIME type required').optional(),
  hash: z.string().optional(),
  tags: z.array(z.string()).default([]),
  ai_summary: z.string().optional(),
  ai_tags: z.array(z.string()).default([]),
  uploaded_by: z.string().uuid().optional(),
  uploaded_at: z.date().optional(),
  created_by: z.string().uuid().optional(),
  created_at: z.date().optional(),
});

export type Evidence = z.infer<typeof evidenceSchema>;

export const evidenceUploadSchema = z.object({
  title: z.string().min(1, 'Title required').max(255),
  evidence_type: z.enum(['document', 'image', 'audio', 'video', 'other']),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type EvidenceUpload = z.infer<typeof evidenceUploadSchema>;
