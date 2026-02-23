import { logger } from '../utils/logger.js';

export interface ForensicFlag {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

export function detectSuspiciousPatterns(text: string): ForensicFlag[] {
  const flags: ForensicFlag[] = [];

  if (!text || text.trim().length === 0) {
    return flags;
  }

  // High email count
  const emailMatches = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g);
  if (emailMatches && emailMatches.length > 5) {
    flags.push({
      type: 'many_emails',
      description: `Document contains ${emailMatches.length} email addresses`,
      severity: 'medium',
      metadata: { count: emailMatches.length },
    });
  }

  // High phone number count
  const phoneMatches = text.match(/\+?\d[\d \-()]{6,}\d/g);
  if (phoneMatches && phoneMatches.length > 3) {
    flags.push({
      type: 'many_phones',
      description: `Document contains ${phoneMatches.length} phone numbers`,
      severity: 'medium',
      metadata: { count: phoneMatches.length },
    });
  }

  // SSN patterns
  if (/\b\d{3}-?\d{2}-?\d{4}\b/.test(text) || /\b(ssn|social security number)\b/i.test(text)) {
    flags.push({
      type: 'possible_ssn',
      description: 'Document may contain Social Security Numbers',
      severity: 'high',
    });
  }

  // Credit card patterns
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(text)) {
    flags.push({
      type: 'possible_credit_card',
      description: 'Document may contain credit card numbers',
      severity: 'high',
    });
  }

  // Legal keywords
  const legalKeywords = [
    'confidential', 'privileged', 'attorney-client', 'work product',
    'settlement', 'deposition', 'testimony', 'plaintiff', 'defendant'
  ];

  const foundKeywords = legalKeywords.filter((keyword) =>
    text.toLowerCase().includes(keyword)
  );

  if (foundKeywords.length > 0) {
    flags.push({
      type: 'legal_keywords',
      description: `Document contains legal keywords: ${foundKeywords.join(', ')}`,
      severity: 'low',
      metadata: { keywords: foundKeywords },
    });
  }

  // Date clusters (multiple dates in document)
  const dateMatches = text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g);
  if (dateMatches && dateMatches.length > 5) {
    flags.push({
      type: 'date_cluster',
      description: `Document contains ${dateMatches.length} dates`,
      severity: 'low',
      metadata: { count: dateMatches.length },
    });
  }

  logger.info('Forensic analysis completed', { flagCount: flags.length });
  return flags;
}
