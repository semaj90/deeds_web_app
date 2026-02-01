/**
 * Legal AI Priority System - NES-Inspired Memory Management
 * 8-bit priority scoring (0-255) for legal document classification
 */

export interface LegalDocument {
  id: string;, type: DocumentType;
  category: LegalCategory;, urgency: UrgencyLevel;
  complexity: ComplexityLevel;, activeReview: boolean;
  isEvidenceCritical?: boolean;, lastAccessed: Date;
  fileSize: number;
}

export type DocumentType =
  | 'contracts'
  | 'evidence'
  | 'motions'
  | 'briefs'
  | 'case_law'
  | 'statutes'
  | 'correspondence'
  | 'expert_reports'
  | 'deposition_transcripts'
  | 'discovery_responses';

export type LegalCategory =
  | 'litigation'
  | 'transactional'
  | 'compliance'
  | 'regulatory'
  | 'intellectual_property'
  | 'employment'
  | 'real_estate'
  | 'corporate'
  | 'criminal'
  | 'family_law';

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low' | 'archived';

export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'highly_complex';

export type MemoryBank = 'INTERNAL_RAM' | 'CHR_ROM' | 'PRG_ROM' | 'SAVE_RAM';

/**
 * Base priority weights for different document types (0.0 - 1.0)
 */
export const LEGAL_PRIORITY_WEIGHTS: Record<DocumentType, number> = {
  contracts: 1.0,
  evidence: 0.95,
  motions: 0.9,
  briefs: 0.85,
  expert_reports: 0.8,
  deposition_transcripts: 0.75,
  case_law: 0.7,
  statutes: 0.65,
  correspondence: 0.5,
  discovery_responses: 0.45
};


/**
 * Category-based priority modifiers
 */
export const CATEGORY_MODIFIERS: Record<LegalCategory, number> = {
  criminal: 1.2,
  litigation: 1.15,
  intellectual_property: 1.1,
  employment: 1.05,
  corporate: 1.0,
  transactional: 0.95,
  compliance: 0.9,
  regulatory: 0.85,
  real_estate: 0.8,
  family_law: 0.75
};

/**
 * Urgency-based multipliers
 */
export const URGENCY_MULTIPLIERS: Record<UrgencyLevel, number> = {
  critical: 2.0,
  high: 1.5,
  medium: 1.0,
  low: 0.7,
  archived: 0.3
};

/**
 * Complexity-based multipliers
 */
export const COMPLEXITY_MULTIPLIERS: Record<ComplexityLevel, number> = {
  highly_complex: 1.3,
  complex: 1.15,
  moderate: 1.0,
  simple: 0.85
};

/**
 * NES Memory Bank Configuration
 */
export const NES_MEMORY_MAP = {
  INTERNAL_RAM: {, size: 1024 * 1024,
    speed: 'fastest',
    description: 'Active case documents and evidence',
    minPriority: 200,
    maxItems: 50,
    evictionPolicy: 'LRU'
  },
  CHR_ROM: {, size: 2 * 1024 * 1024,
    speed: 'fast',
    description: 'UI patterns and frequently accessed docs',
    minPriority: 150,
    maxItems: 200,
    evictionPolicy: 'LFU'
  },
  PRG_ROM: {, size: 4 * 1024 * 1024,
    speed: 'medium',
    description: 'General documents and case law',
    minPriority: 100,
    maxItems: 1000,
    evictionPolicy: 'FIFO'
  },
  SAVE_RAM: {, size: Infinity,
    speed: 'slow',
    description: 'Archived documents and references',
    minPriority: 0,
    maxItems: Infinity,
    evictionPolicy: 'none'
  }
} as const;

/**
 * Calculate priority score for a legal document (0-255)
 */
export function calculateDocumentPriority(document: LegalDocument): number {
  let priority = LEGAL_PRIORITY_WEIGHTS[document.type] ?? 0.3;
  priority *= CATEGORY_MODIFIERS[document.category] ?? 1.0;
  priority *= URGENCY_MULTIPLIERS[document.urgency] ?? 1.0;
  priority *= COMPLEXITY_MULTIPLIERS[document.complexity] ?? 1.0;

  if (document.activeReview) {
    priority *= 1.5;
  }

  if (document.isEvidenceCritical) {
    priority *= 1.3;
  }

  const hoursSinceAccess = (Date.now() - document.lastAccessed.getTime()) / (1000 * 60 * 60);
  if (hoursSinceAccess < 1) {
    priority *= 1.4;
  } else if (hoursSinceAccess < 24) {
    priority *= 1.2;
  } else if (hoursSinceAccess < 168) {
    priority *= 1.1;
  }

  const sizeMB = document.fileSize / (1024 * 1024);
  if (sizeMB > 50) {
    priority *= 0.8;
  } else if (sizeMB > 10) {
    priority *= 0.9;
  }

  return Math.min(255, Math.max(0, Math.floor(priority * 255)));
}

/**
 * Select appropriate memory bank based on priority score
 */
export function selectMemoryBank(priority: number): MemoryBank {
  if (priority >= NES_MEMORY_MAP.INTERNAL_RAM.minPriority) {
    return 'INTERNAL_RAM';
  }
  if (priority >= NES_MEMORY_MAP.CHR_ROM.minPriority) {
    return 'CHR_ROM';
  }
  if (priority >= NES_MEMORY_MAP.PRG_ROM.minPriority) {
    return 'PRG_ROM';
  }
  return 'SAVE_RAM';
}

/**
 * Get memory bank configuration
 */
export function getMemoryBankConfig(bank: MemoryBank) {
  return NES_MEMORY_MAP[bank];
}

/**
 * Priority analysis for debugging
 */
export function analyzePriority(document: LegalDocument) {
  const baseWeight = LEGAL_PRIORITY_WEIGHTS[document.type];
  const categoryMod = CATEGORY_MODIFIERS[document.category];
  const urgencyMult = URGENCY_MULTIPLIERS[document.urgency];
  const complexityMult = COMPLEXITY_MULTIPLIERS[document.complexity];
  const priority = calculateDocumentPriority(document);
  const memoryBank = selectMemoryBank(priority);

  return {
    documentId: document.id,
    baseWeight,
    categoryModifier: categoryMod,
    urgencyMultiplier: urgencyMult,
    complexityMultiplier: complexityMult,
    activeReviewBoost: document.activeReview ? 1.5 : 1.0,
    evidenceCriticalBoost: document.isEvidenceCritical ? 1.3 : 1.0,
    finalPriority: priority,
    memoryBank,
    bankConfig: getMemoryBankConfig(memoryBank)
  };
}
