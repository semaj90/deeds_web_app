// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  getTemplateFields,
  REPORT_TEMPLATES,
} from '$lib/services/report-auto-populator';

describe('report-auto-populator template registry', () => {
  it('REPORT_TEMPLATES lists all 6 template IDs', () => {
    expect(REPORT_TEMPLATES).toHaveLength(6);
    expect(REPORT_TEMPLATES).toContain('incident-summary');
    expect(REPORT_TEMPLATES).toContain('chronology');
    expect(REPORT_TEMPLATES).toContain('parties-profile');
    expect(REPORT_TEMPLATES).toContain('evidence-summary');
    expect(REPORT_TEMPLATES).toContain('legal-analysis');
    expect(REPORT_TEMPLATES).toContain('recommendations');
  });

  it('getTemplateFields returns non-empty field list for each template', () => {
    for (const template of REPORT_TEMPLATES) {
      const fields = getTemplateFields(template);
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field).toHaveProperty('key');
        expect(field).toHaveProperty('label');
        expect(typeof field.key).toBe('string');
        expect(typeof field.label).toBe('string');
      }
    }
  });

  it('incident-summary has overview, jurisdiction, parties fields', () => {
    const fields = getTemplateFields('incident-summary');
    const keys = fields.map((f) => f.key);
    expect(keys).toContain('overview');
    expect(keys).toContain('jurisdiction');
    expect(keys).toContain('parties');
  });

  it('legal-analysis has elements, precedent, strengths fields', () => {
    const fields = getTemplateFields('legal-analysis');
    const keys = fields.map((f) => f.key);
    expect(keys).toContain('elements');
    expect(keys).toContain('precedent');
    expect(keys).toContain('strengths');
  });

  it('all field labels are non-empty strings', () => {
    for (const template of REPORT_TEMPLATES) {
      const fields = getTemplateFields(template);
      for (const field of fields) {
        expect(field.label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
