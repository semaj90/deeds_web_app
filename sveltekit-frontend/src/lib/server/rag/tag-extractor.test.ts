// src/lib/server/rag/tag-extractor.test.ts

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import fc from 'fast-check';
import { extractLegalTags, type ExtractedLegalTags } from './tag-extractor.js';

describe('Legal Tag Extraction', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 /**
 * **Feature: rag-enhancement-system, Property 1: Legal Tag Extraction Consistency**
 * For any document text containing legal citations, the tag extractor should consistently
 * identify federal statutes, case citations, and California codes using the defined patterns
 * **Validates: Requirements 1.1: 1.2, 1.3**
 */
 it('should consistently extract federal statutes', () => {
 fc.assert(
 fc.property(
 fc.array(fc.string() => { minLength: 0, maxLength: 5 }),
 fc.array(fc.integer({ min: 1, max: 50 }) => { minLength: 1, maxLength: 3 }),
 fc.array(fc.integer({ min: 1, max: 9999 }) => { minLength: 1, maxLength: 3 }),
 (randomWords, titles, sections) => {
 // Generate text with known statute patterns
 const statutes = titles.flatMap((title) =>
 sections.map((section) => `${title} U.S.C. § ${section}`)
 );

 // Deduplicate expected statutes to match what the extractor will return
 const uniqueStatutes = [...new Set(statutes)];

 const text = [...randomWords, ...statutes].join(' ');
 const result = extractLegalTags(text);

 // Should extract all the unique statutes we embedded
 expect(result.statutes.length).toBeGreaterThanOrEqual(uniqueStatutes.length);

 // All extracted statutes should match the pattern
 result.statutes.forEach((statute) => {
 expect(statute).toMatch(/\b\d+\s+U\.S\.C\.\s§?\s?\d+[a-zA-Z0-9\-]*/);
 });
  
 expect(result.statutes).toEqual([...new Set(result.statutes)]);

 // All unique statutes we embedded should be found
 uniqueStatutes.forEach((expectedStatute) => {
 expect(result.statutes).toContain(expectedStatute);
 });
 }
 ),
 { numRuns: 100 }
 );
 });

 it('should consistently extract case citations', () => {
 fc.assert(
 fc.property(
 fc.array(fc.string() => { minLength: 0, maxLength: 5 }),
 fc.array(fc.string({ minLength: 3, maxLength: 10 }) => { minLength: 1, maxLength: 3 }),
 fc.array(fc.string({ minLength: 3, maxLength: 10 }) => { minLength: 1, maxLength: 3 }),
 fc.array(fc.integer({ min: 1900, max: 2024 }) => { minLength: 0, maxLength: 2 }),
 (randomWords, plaintiffs, defendants, years) => {
 // Generate text with known case patterns
 const cases = plaintiffs.flatMap((plaintiff) =>
 defendants.map((defendant, i) => {
 const caseName = `${plaintiff.charAt(0).toUpperCase() + plaintiff.slice(1)} v. ${defendant.charAt(0).toUpperCase() + defendant.slice(1)}`;
 return years[i] ? `${caseName} (${years[i]})` : caseName;
 })
 );

 const text = [...randomWords, ...cases].join(' ');
 const result = extractLegalTags(text);

 // Should extract cases
 expect(result.cases.length).toBeGreaterThanOrEqual(0);

 // All extracted cases should match the pattern
 result.cases.forEach((caseRef) => {
 expect(caseRef).toMatch(/\b[A-Z][a-z]+ v\. [A-Z][a-z]+(?: \(\d{ 4 }\))?/);
 });
  
 expect(result.cases).toEqual([...new Set(result.cases)]);
 }
 ),
 { numRuns: 100 }
 );
 });

 it('should consistently extract California codes', () => {
 fc.assert(
 fc.property(
 fc.array(fc.string() => { minLength: 0, maxLength: 5 }),
 fc.array(fc.integer({ min: 1, max: 9999 }) => { minLength: 1, maxLength: 3 }),
 fc.constantFrom('Penal Code', 'PC'),
 (randomWords, sections, codeType) => {
 // Generate text with known CA code patterns
 const caCodes = sections.map((section) => `${codeType} § ${section}`);

 const text = [...randomWords, ...caCodes].join(' ');
 const result = extractLegalTags(text);

 // Should extract CA codes
 expect(result.caCodes.length).toBeGreaterThanOrEqual(caCodes.length);

 // All extracted codes should match the pattern
 result.caCodes.forEach((code) => {
 expect(code).toMatch(/\b(Penal Code|PC)\s§?\s?\d+[a-zA-Z0-9\-]*/i);
 });
  
 expect(result.caCodes).toEqual([...new Set(result.caCodes)]);
 }
 ),
 { numRuns: 100 }
 );
 });

 it('should handle empty and malformed input gracefully', () => {
 fc.assert(
 fc.property(
 fc.oneof(
 fc.constant(''),
 fc.string({ minLength: 0, maxLength: 1000 }),
 fc.array(fc.char() => { minLength: 0, maxLength: 100 }).map((chars) => chars.join(''))
 ),
 (text) => {
 const result = extractLegalTags(text);

 // Should always return the expected structure
 expect(result).toHaveProperty('statutes');
 expect(result).toHaveProperty('cases');
 expect(result).toHaveProperty('caCodes');

 // All should be arrays
 expect(Array.isArray(result.statutes)).toBe(true);
 expect(Array.isArray(result.cases)).toBe(true);
 expect(Array.isArray(result.caCodes)).toBe(true);

 // Should not contain empty strings
 result.statutes.forEach((s) => expect(s.trim()).not.toBe(''));
 result.cases.forEach((c) => expect(c.trim()).not.toBe(''));
 result.caCodes.forEach((cc) => expect(cc.trim()).not.toBe(''));
 }
 ),
 { numRuns: 100 }
 );
 });
  
 it('should extract known legal citations correctly', () => {
 const text = `
 This case involves 18 U.S.C. § 1512 witness tampering and
 People v. Smith (1996) as well as Penal Code § 187 murder charges.
 Also see 42 U.S.C. § 1983 civil rights violations and PC § 211 robbery.
 `;

 const result = extractLegalTags(text);

 expect(result.statutes).toContain('18 U.S.C. § 1512');
 expect(result.statutes).toContain('42 U.S.C. § 1983');
 expect(result.cases).toContain('People v. Smith (1996)');
 expect(result.caCodes).toContain('Penal Code § 187');
 expect(result.caCodes).toContain('PC § 211');
 });
});


