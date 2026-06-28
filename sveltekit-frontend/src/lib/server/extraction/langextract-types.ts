/**
 * LangExtract Type Definitions
 * Structured extraction from legal documents using Gemma4 + llama-server
 */

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'time'
  | 'statute'
  | 'case'
  | 'charge'
  | 'weapon'
  | 'vehicle'
  | 'property'
  | 'medical'
  | 'digital_account'
  | 'amount'
  | 'contact';

export type EventType =
  | 'incident'
  | 'communication'
  | 'threat'
  | 'injury'
  | 'property_damage'
  | 'entry'
  | 'theft'
  | 'arrest'
  | 'search'
  | 'seizure'
  | 'report_filed';

export type ClaimKind = 'fact' | 'allegation' | 'inference' | 'unknown';

export interface ExtractedEntity {
  type: EntityType;
  text: string;
  confidence: number; // 0.0 to 1.0
  role_or_context?: string;
}

export interface ExtractedEvent {
  type: EventType;
  description: string;
  time?: string;
  location?: string;
  participants?: string[];
  confidence: number; // 0.0 to 1.0
}

export interface ExtractedClaim {
  claim: string;
  kind: ClaimKind;
  speaker?: string;
  confidence: number; // 0.0 to 1.0
}

export interface CrimeSignal {
  label: string;
  statute?: string;
  elements?: string[];
  jurisdiction?: string;
  confidence: number; // 0.0 to 1.0
}

export interface LangExtractResult {
  entities: ExtractedEntity[];
  events: ExtractedEvent[];
  claims: ExtractedClaim[];
  crime_signals: CrimeSignal[];
  summary: string;
  warnings: string[];
}

export interface LangExtractRequest {
  caseId?: string;
  evidenceId: string;
  sourceType: 'docling_markdown' | 'docling_json' | 'ocr_text' | 'transcript' | 'plain_text';
  text: string;
  schemaMode?: 'legal_evidence' | 'statute' | 'case_law' | 'codebase' | 'general';
}
