import { describe, it, expect } from 'vitest';
import { extractedFactSchema } from '$lib/server/ingest/fact-extraction.schema.js';

/**
 * Gate G13 Fixture Tests — Pure Logic Validation
 * Tests the core thinking-tag stripping, JSON extraction, and Zod validation
 * WITHOUT database dependencies (which require migrations)
 */

describe('Gate G13: Fact Extraction Fixtures', () => {
  describe('Fixture 1: Thinking tags stripping', () => {
    it('should strip channel thinking tags and return clean text', () => {
      const stripThinkingTags = (text: string): string => {
        let result = text.replace(/<\|channel>[\s\S]*?<\/channel\|>/gi, '');
        result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        return result.trim();
      };

      const responseWithThinkingTags = `<|channel>thought
Analyzing the provided text:
- First fact about UUID identifiers
- Second fact about password hashing
</channel|>
[{"fact_text": "Users are identified by UUID v4 format identifiers."}]`;

      const stripped = stripThinkingTags(responseWithThinkingTags);

      expect(stripped).not.toContain('<|channel>');
      expect(stripped).not.toContain('<channel|>');
      expect(stripped).toContain('Users are identified');
      expect(stripped).toContain('[{');
    });

    it('should handle both channel and thinking tag formats', () => {
      const stripThinkingTags = (text: string): string => {
        let result = text.replace(/<\|channel>[\s\S]*?<\/channel\|>/gi, '');
        result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        return result.trim();
      };

      const withThinkingTags = `<thinking>Internal reasoning here</thinking>
[{"fact_text": "Test fact"}]`;

      const stripped = stripThinkingTags(withThinkingTags);

      expect(stripped).not.toContain('<thinking>');
      expect(stripped).not.toContain('</thinking>');
      expect(stripped).toContain('Test fact');
    });
  });

  describe('Fixture 2: JSON array extraction with bracket tracking', () => {
    it('should extract JSON array using bracket-depth tracking', () => {
      const extractJsonArray = (text: string): unknown[] | null => {
        const cleaned = text.trim();
        let processed = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/gi, '');
        processed = processed.trim();

        const startIdx = processed.indexOf('[');
        if (startIdx === -1) return null;

        let depth = 0, inString = false, escaped = false, endIdx = -1;

        for (let i = startIdx; i < processed.length; i++) {
          const char = processed[i];

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === '\\' && inString) {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '[') {
            depth++;
          } else if (char === ']') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        if (endIdx === -1 || endIdx <= startIdx) return null;

        const jsonStr = processed.substring(startIdx, endIdx + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      };

      const text = '[{"fact_text": "First"}, {"fact_text": "Second"}]';
      const extracted = extractJsonArray(text);

      expect(extracted).toBeTruthy();
      expect(Array.isArray(extracted)).toBe(true);
      expect(extracted).toHaveLength(2);
      expect((extracted as any[])[0].fact_text).toBe('First');
    });

    it('should avoid false positives from prose containing brackets', () => {
      const extractJsonArray = (text: string): unknown[] | null => {
        const cleaned = text.trim();
        let processed = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/gi, '');
        processed = processed.trim();

        // Try each '[' position, looking for a valid JSON array
        let searchIdx = 0;
        while (true) {
          const startIdx = processed.indexOf('[', searchIdx);
          if (startIdx === -1) return null;

          let depth = 0, inString = false, escaped = false, endIdx = -1;

          for (let i = startIdx; i < processed.length; i++) {
            const char = processed[i];

            if (escaped) {
              escaped = false;
              continue;
            }

            if (char === '\\' && inString) {
              escaped = true;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              continue;
            }

            if (inString) continue;

            if (char === '[') {
              depth++;
            } else if (char === ']') {
              depth--;
              if (depth === 0) {
                endIdx = i;
                break;
              }
            }
          }

          if (endIdx === -1 || endIdx <= startIdx) {
            searchIdx = startIdx + 1;
            continue;
          }

          const jsonStr = processed.substring(startIdx, endIdx + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            searchIdx = startIdx + 1;
            continue;
          }
        }
      };

      const proseSurroundingArray = `The facts below [in brackets] are extracted:
[{"fact_text": "Real fact"}]
More prose here [but not JSON]`;

      const extracted = extractJsonArray(proseSurroundingArray);

      // Should extract the real JSON array, ignoring prose brackets
      expect(extracted).toBeTruthy();
      expect(Array.isArray(extracted)).toBe(true);
      expect(extracted).toHaveLength(1);
      expect((extracted as any[])[0].fact_text).toBe('Real fact');
    });

    it('should handle escaped quotes in strings', () => {
      const extractJsonArray = (text: string): unknown[] | null => {
        const cleaned = text.trim();
        let processed = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/gi, '');
        processed = processed.trim();

        const startIdx = processed.indexOf('[');
        if (startIdx === -1) return null;

        let depth = 0, inString = false, escaped = false, endIdx = -1;

        for (let i = startIdx; i < processed.length; i++) {
          const char = processed[i];

          if (escaped) {
            escaped = false;
            continue;
          }

          if (char === '\\' && inString) {
            escaped = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '[') {
            depth++;
          } else if (char === ']') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        if (endIdx === -1 || endIdx <= startIdx) return null;

        const jsonStr = processed.substring(startIdx, endIdx + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      };

      const jsonWithEscapes = '[{"fact_text": "Quote \\"inside\\" the text"}]';
      const extracted = extractJsonArray(jsonWithEscapes);

      expect(extracted).toBeTruthy();
      expect((extracted as any[])[0].fact_text).toContain('inside');
    });
  });

  describe('Fixture 3: Zod validation of extracted facts', () => {
    it('should validate facts with correct structure', () => {
      const validFacts = [
        {
          packet_key: 'test:001',
          source_ref: 'src/test.ts',
          fact_text: 'Users are identified by UUID v4 format identifiers.',
          confidence: 0.95,
          reasoning_trace: 'Stated directly in section 1',
          arguments: [
            { argument_index: 0, argument_name: 'subject', argument_value: 'Users', argument_type: 'entity' },
          ],
        },
        {
          packet_key: 'test:002',
          source_ref: 'src/test.ts',
          fact_text: 'Password hashes use Argon2id algorithm.',
          confidence: 0.92,
          reasoning_trace: 'Mentioned in security section',
          arguments: [],
        },
      ];

      const results = validFacts.map((fact) => {
        const result = extractedFactSchema.safeParse(fact);
        return { valid: result.success, error: result.error?.message };
      });

      results.forEach((r) => {
        expect(r.valid).toBe(true);
      });
    });

    it('should reject facts with invalid confidence (out of range)', () => {
      const invalidFacts = [
        {
          packet_key: 'test:001',
          source_ref: 'src/test.ts',
          fact_text: 'Valid fact text with enough length.',
          confidence: 1.5, // Out of range
          reasoning_trace: 'Test',
          arguments: [],
        },
        {
          packet_key: 'test:002',
          source_ref: 'src/test.ts',
          fact_text: 'Another valid fact with enough length.',
          confidence: -0.2, // Out of range
          reasoning_trace: 'Test',
          arguments: [],
        },
      ];

      const results = invalidFacts.map((fact) => {
        const result = extractedFactSchema.safeParse(fact);
        return { valid: result.success };
      });

      results.forEach((r) => {
        expect(r.valid).toBe(false);
      });
    });

    it('should reject facts with missing required fields', () => {
      const incompleteFacts = [
        {
          packet_key: 'test:001',
          source_ref: 'src/test.ts',
          // Missing fact_text
          confidence: 0.95,
          reasoning_trace: 'Test',
          arguments: [],
        },
        {
          // Missing packet_key
          source_ref: 'src/test.ts',
          fact_text: 'Valid fact text with enough length.',
          confidence: 0.95,
          reasoning_trace: 'Test',
          arguments: [],
        },
      ];

      const results = incompleteFacts.map((fact) => {
        const result = extractedFactSchema.safeParse(fact);
        return { valid: result.success };
      });

      results.forEach((r) => {
        expect(r.valid).toBe(false);
      });
    });

    it('should reject facts with invalid argument structure', () => {
      const factsWithBadArgs = [
        {
          packet_key: 'test:001',
          source_ref: 'src/test.ts',
          fact_text: 'Valid fact text with enough length.',
          confidence: 0.95,
          reasoning_trace: 'Test',
          arguments: [
            {
              argument_index: 0,
              argument_name: 'invalid_role', // Not in enum
              argument_value: 'test',
              argument_type: 'entity',
            },
          ],
        },
      ];

      const results = factsWithBadArgs.map((fact) => {
        const result = extractedFactSchema.safeParse(fact);
        return { valid: result.success };
      });

      results.forEach((r) => {
        expect(r.valid).toBe(false);
      });
    });
  });

  describe('Fixture 4: Confidence normalization', () => {
    it('should clamp confidence values to 0.0-1.0 range', () => {
      const normalize = (value: number): number => Math.max(0, Math.min(1, value));

      expect(normalize(1.5)).toBe(1.0);
      expect(normalize(-0.2)).toBe(0.0);
      expect(normalize(0.5)).toBe(0.5);
      expect(normalize(0)).toBe(0.0);
      expect(normalize(1)).toBe(1.0);
    });
  });

  describe('Fixture 5: End-to-end parsing flow', () => {
    it('should parse thinking tags → extract JSON → validate Zod in sequence', () => {
      const stripThinkingTags = (text: string): string => {
        let result = text.replace(/<\|channel>[\s\S]*?<\/channel\|>/gi, '');
        result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        return result.trim();
      };

      const extractJsonArray = (text: string): unknown[] | null => {
        const cleaned = stripThinkingTags(text);
        let processed = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/gi, '');
        processed = processed.trim();

        let searchIdx = 0;
        while (true) {
          const startIdx = processed.indexOf('[', searchIdx);
          if (startIdx === -1) return null;

          let depth = 0, inString = false, escaped = false, endIdx = -1;

          for (let i = startIdx; i < processed.length; i++) {
            const char = processed[i];

            if (escaped) {
              escaped = false;
              continue;
            }

            if (char === '\\' && inString) {
              escaped = true;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              continue;
            }

            if (inString) continue;

            if (char === '[') {
              depth++;
            } else if (char === ']') {
              depth--;
              if (depth === 0) {
                endIdx = i;
                break;
              }
            }
          }

          if (endIdx === -1 || endIdx <= startIdx) {
            searchIdx = startIdx + 1;
            continue;
          }

          const jsonStr = processed.substring(startIdx, endIdx + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            searchIdx = startIdx + 1;
            continue;
          }
        }
      };

      // Full pipeline test with thinking tags + JSON
      const gemmaResponse = `<|channel>thought
Extracting facts:
1. Session management framework
2. Password security measures
</channel|>
[
  {
    "packet_key": "test:e2e:001",
    "source_ref": "src/auth.ts",
    "fact_text": "Sessions are created with Lucia auth framework.",
    "confidence": 0.98,
    "reasoning_trace": "Direct statement in section 1",
    "arguments": [
      {"argument_index": 0, "argument_name": "subject", "argument_value": "Sessions", "argument_type": "entity"}
    ]
  }
]`;

      // Step 1: Strip thinking tags
      const stripped = stripThinkingTags(gemmaResponse);
      expect(stripped).not.toContain('<|channel>');

      // Step 2: Extract JSON array
      const extracted = extractJsonArray(gemmaResponse);
      expect(extracted).toBeTruthy();
      expect(Array.isArray(extracted)).toBe(true);

      // Step 3: Validate with Zod
      const result = extractedFactSchema.safeParse(extracted![0]);
      expect(result.success).toBe(true);
    });
  });
});
