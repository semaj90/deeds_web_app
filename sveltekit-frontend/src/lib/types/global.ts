import type { Snippet } from 'svelte';

// =====================================================
// CORE COMPONENT INTERFACES
// =====================================================
export interface Props {
  data?: any;
  children?: Snippet;
  [key: string]: any;
}

export interface LayoutProps {
  children?: Snippet;
  data?: any;
}

export interface PageProps {
  data: any;
  form?: any;
}

// =====================================================
// SYSTEM STATUS & HEALTH
// =====================================================
export interface SystemStatus {
  database?: boolean;
  redis?: boolean;
  ollama?: boolean;
  qdrant?: boolean;
  gpu?: boolean;
  cuda?: boolean;
  memory_usage?: number;
  cpu_usage?: number;
  uptime?: number;
  version?: string;
  localModels?: any[];
  recommendations?: string[];
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  last_check: string;
  response_time: number;
  error_count: number;
  metadata?: Record<string, any>;
}

// =====================================================
// SEARCH & RETRIEVAL
// =====================================================
export interface SearchResults {
  documents: LegalDocument[];
  total: number;
  processingTime: number;
  query: string;
  facets?: Record<string, any>;
  suggestions?: string[];
  results?: any[];
  hasMore?: boolean;
  nextCursor?: string;
}

export interface TestResults {
  query?: string;
  results?: any[];
  timestamp?: string;
  performance?: {
    embedding_time?: number;
    search_time?: number;
    total_time?: number;
  };
  accuracy?: number;
  error?: string | { message: string; code: string; stack?: string };
  executionTime?: number;
  passed?: boolean;
}

// =====================================================
// LEGAL DOMAIN TYPES
// =====================================================
export interface LegalDocument {
  id: string;
  title: string;
  content: string;
  type: 'contract' | 'case_law' | 'statute' | 'regulation' | 'brief' | 'evidence';
  status: 'draft' | 'reviewed' | 'approved' | 'archived';
  created: string;
  updated: string;
  metadata?: {
    author?: string;
    jurisdiction?: string;
    practice_area?: string;
    tags?: string[];
    confidence_score?: number;
    source?: string;
    case_number?: string;
  };
  embedding?: number[];
  vector_id?: string;
}

export interface CaseFile {
  id: string;
  case_name: string;
  case_number: string;
  status: 'open' | 'closed' | 'pending';
  documents: LegalDocument[];
  persons_of_interest: PersonOfInterest[];
  evidence: Evidence[];
  timeline: TimelineEvent[];
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  case_id: string;
  type: 'document' | 'photo' | 'video' | 'audio' | 'physical';
  title: string;
  description: string;
  file_path?: string;
  hash?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PersonOfInterest {
  id: string;
  name: string;
  role: 'suspect' | 'witness' | 'victim' | 'expert' | 'attorney';
  contact_info?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  notes: string;
  cases: string[];
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  title: string;
  description: string;
  date: string;
  type: 'incident' | 'investigation' | 'legal' | 'evidence';
  participants?: string[];
}

// =====================================================
// USER & AUTHENTICATION
// =====================================================
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'prosecutor' | 'defense' | 'judge' | 'investigator' | 'admin' | 'analyst' | 'user';
  permissions: Permission[];
  preferences: UserPreferences;
  created_at: string;
  last_login?: string;
}

export interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'admin')[];
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: boolean;
  ai_assistance: boolean;
}

// =====================================================
// AI & MACHINE LEARNING
// =====================================================
export interface AIResponse {
  response: string;
  confidence: number;
  model: string;
  processing_time: number;
  tokens_used: number;
  suggestions?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
    processing_time?: number;
  };
}

export interface ChatSession {
  id: string;
  user_id: string;
  messages: ChatMessage[];
  title?: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// ERROR HANDLING
// =====================================================
export interface APIError {
  code: string;
  message: string;
  details?: any;
}

export interface ValidationError {
  field: string;
  message: string;
}

// =====================================================
// SYSTEM UTILS
// =====================================================
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}






