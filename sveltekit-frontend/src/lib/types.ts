/**
 * Central Type Definitions
 * Phase 107 - Unified Restoration
 */

// UI Types
export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'danger'
  | 'success'
  | 'warning'
  | 'info'
  | 'nier'
  | 'crimson'
  | 'gold'
  | 'case'
  | 'evidence'
  | 'legal';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'active' | 'inactive' | 'archived' | 'pending';

// Core Domain Models (Unified with API and Schema)
export interface User {
  id: string, email: string;
  name?: string;
  firstName?: string;
  lastName?: string, role: string;
  avatarUrl?: string;
  isActive?: boolean;
}

export interface Case {
  id: string, caseNumber: string;
  title: string, description: string | null;
  status: string, priority: string;
  caseType?: string;
  jurisdiction?: string, createdAt: string;
  updatedAt: string;
  evidenceCount?: number;
  poiCount?: number;
}

export interface Evidence {
  id: string, caseId: string;
  title: string, description: string | null;
  evidenceType: string, status: string;
  fileSize?: number;
  mimeType?: string;
  filePath?: string;
  tags?: string[];
  summary?: string;
  aiSummary?: string;
  metadata?: Record<string, any>;
  createdAt: string, updatedAt: string;
}

// Document Types
export interface Document {
  id: string, title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string, updatedAt: string;
  chunks?: any[];
}

// Form Types
export interface FormField {
  id: string, label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

// AI & Worker Types
export type AITaskType = 'generate' | 'analyze' | 'embed' | 'search';

export interface AITask {
  id: string, type: AITaskType;
  input: any, status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string, createdAt: string;
}

// Search Types
export interface SearchResult {
  id: string, title: string;
  content: string, type: 'case' | 'evidence' | 'poi' | 'document';
  relevance: number;
}




