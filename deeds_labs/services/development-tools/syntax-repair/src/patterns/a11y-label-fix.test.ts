/**
 * Tests for Accessibility Label Fix Patterns
 *
 * Tests the a11y label fix patterns that handle a11y_label_has_associated_control warnings.
 *
 * @requirements 1.3
 */

import { describe, it, expect } from 'vitest';
import {
  fixA11yLabels,
  detectA11yLabelIssues,
  validateLabelAssociation,
  validateNoA11yLabelIssues,
  getA11yLabelPatterns,
} from './a11y-label-fix';

describe('a11y-label-fix patterns', () => {
  describe('getA11yLabelPatterns', () => {
    it('should return all patterns sorted by priority', () => {
      const patterns = getA11yLabelPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Verify patterns are sorted by priority
      for (let i = 1; i < patterns.length; i++) {
        const prevPriority = patterns[i - 1].priority ?? 100;
        const currPriority = patterns[i].priority ?? 100;
        expect(currPriority).toBeGreaterThanOrEqual(prevPriority);
      }
    });
  });

  describe('fixA11yLabels', () => {
    it('should add for/id association when label is followed by input', () => {
      const input = '<label>Name</label>\n<input type="text">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toMatch(/<label for="[^"]+">Name<\/label>/);
      expect(result).toMatch(/<input id="[^"]+" type="text">/);
    });

    it('should add for/id association for self-closing input', () => {
      const input = '<label>Email</label>\n<input type="email" />';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toMatch(/<label for="[^"]+">Email<\/label>/);
      expect(result).toMatch(/<input id="[^"]+" type="email" \/>/);
    });

    it('should add for attribute when input already has id', () => {
      const input = '<label>Username</label>\n<input id="user-input" type="text">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toContain('<label for="user-input">Username</label>');
      expect(result).toContain('id="user-input"');
    });

    it('should not modify labels that already have for attribute', () => {
      const input = '<label for="existing-id">Name</label>\n<input id="existing-id" type="text">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(0);
      expect(result).toBe(input);
    });

    it('should not modify labels that wrap controls (implicit association)', () => {
      const input = '<label>Name <input type="text" /></label>';
      const { result, fixCount } = fixA11yLabels(input);

      // Wrapping is valid, should not be modified by the primary patterns
      expect(result).toContain('<label>');
    });

    it('should fix labels followed by select elements', () => {
      const input = '<label>Country</label>\n<select><option>USA</option></select>';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBeGreaterThan(0);
      expect(result).toMatch(/<label for="[^"]+">Country<\/label>/);
      expect(result).toMatch(/<select id="[^"]+">/);
    });

    it('should fix labels followed by textarea elements', () => {
      const input = '<label>Description</label>\n<textarea></textarea>';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBeGreaterThan(0);
      expect(result).toMatch(/<label for="[^"]+">Description<\/label>/);
      expect(result).toMatch(/<textarea id="[^"]+">/);
    });

    it('should remove empty for attributes', () => {
      const input = '<label for="">Name</label>';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toBe('<label>Name</label>');
    });

    it('should add aria-label to inputs with placeholder but no label', () => {
      const input = '<input placeholder="Enter name" type="text">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toContain('aria-label="Enter name"');
    });

    it('should add aria-label to empty buttons', () => {
      const input = '<button></button>';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toContain('aria-label="Button"');
    });

    it('should add aria-label to checkbox inputs without labels', () => {
      const input = '<input type="checkbox" name="agree">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toContain('aria-label="Checkbox option"');
    });

    it('should add aria-label to radio inputs without labels', () => {
      const input = '<input type="radio" name="option">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toContain('aria-label="Radio option"');
    });

    it('should track fixes by pattern name', () => {
      const input = `
        <label>Name</label>
        <input type="text">
        <label for="">Empty</label>
        <button></button>
      `;
      const { fixesByPattern } = fixA11yLabels(input);

      expect(Object.keys(fixesByPattern).length).toBeGreaterThan(0);
    });

    it('should generate valid HTML ids from label text', () => {
      const input = '<label>First Name</label>\n<input type="text">';
      const { result } = fixA11yLabels(input);

      // Should generate id like "first-name"
      expect(result).toMatch(/id="first-name"/);
      expect(result).toMatch(/for="first-name"/);
    });

    it('should handle special characters in label text', () => {
      const input = '<label>User\'s Email!</label>\n<input type="email">';
      const { result } = fixA11yLabels(input);

      // Should generate a valid id (no special chars in the id attribute value)
      expect(result).toMatch(/id="[a-z0-9-]+"/);
      // Extract the id value and verify it has no special characters
      const idMatch = result.match(/id="([^"]+)"/);
      expect(idMatch).not.toBeNull();
      expect(idMatch![1]).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe('detectA11yLabelIssues', () => {
    it('should detect labels without associations', () => {
      const content = '<label>Name</label>\n<input type="text">';
      const { hasIssues, totalMatches } = detectA11yLabelIssues(content);

      expect(hasIssues).toBe(true);
      expect(totalMatches).toBeGreaterThan(0);
    });

    it('should not detect issues in properly associated labels', () => {
      const content = '<label for="name">Name</label>\n<input id="name" type="text">';
      const { hasIssues, totalMatches } = detectA11yLabelIssues(content);

      expect(hasIssues).toBe(false);
      expect(totalMatches).toBe(0);
    });

    it('should return pattern match breakdown', () => {
      const content = `
        <label>Name</label>
        <input type="text">
        <button></button>
      `;
      const { patternMatches } = detectA11yLabelIssues(content);

      expect(Object.keys(patternMatches).length).toBeGreaterThan(0);
    });
  });

  describe('validateLabelAssociation', () => {
    it('should return true for labels with for attribute', () => {
      const label = '<label for="name">Name</label>';
      expect(validateLabelAssociation(label)).toBe(true);
    });

    it('should return true for labels that wrap controls', () => {
      const label = '<label>Name <input type="text" /></label>';
      expect(validateLabelAssociation(label)).toBe(true);
    });

    it('should return false for labels without association', () => {
      const label = '<label>Name</label>';
      expect(validateLabelAssociation(label)).toBe(false);
    });
  });

  describe('validateNoA11yLabelIssues', () => {
    it('should return true when no issues exist', () => {
      const content = '<label for="name">Name</label>\n<input id="name" type="text">';
      expect(validateNoA11yLabelIssues(content)).toBe(true);
    });

    it('should return false when issues exist', () => {
      const content = '<label>Name</label>\n<input type="text">';
      expect(validateNoA11yLabelIssues(content)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple labels and inputs', () => {
      const input = `
        <label>First Name</label>
        <input type="text">
        <label>Last Name</label>
        <input type="text">
      `;
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(2);
      expect(result).toMatch(/for="first-name"/);
      expect(result).toMatch(/for="last-name"/);
    });

    it('should handle labels with extra whitespace', () => {
      const input = '<label>  Name  </label>\n<input type="text">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toMatch(/<label for="[^"]+">/);
    });

    it('should handle labels with attributes', () => {
      const input = '<label class="form-label">Name</label>\n<input type="text">';
      const { result, fixCount } = fixA11yLabels(input);

      expect(fixCount).toBe(1);
      expect(result).toMatch(/<label for="[^"]+" class="form-label">/);
    });

    it('should not break existing valid HTML', () => {
      const input = `
        <form>
          <label for="email">Email</label>
          <input id="email" type="email" required>
          <button type="submit">Submit</button>
        </form>
      `;
      const { result, fixCount } = fixA11yLabels(input);

      // Should not modify already valid associations
      expect(result).toContain('for="email"');
      expect(result).toContain('id="email"');
    });
  });
});
