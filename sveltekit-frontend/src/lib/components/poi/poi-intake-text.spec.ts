// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	POI_INTAKE_FIELD_MAX_CHARS,
	POI_INTAKE_MAX_BYTES,
	parsePoiIntakeText,
	validatePoiIntakeFile,
} from './poi-intake-text.js';

describe('parsePoiIntakeText', () => {
	it('fills name, aliases and the four sections from labelled lines', () => {
		const { fields, filled, truncated } = parsePoiIntakeText(
			[
				'Name: Marcus Hale',
				'Alias: "Mack", M. Hale; Mack',
				'Who: Warehouse shift supervisor at Arulian Corp.',
				'What: Removed sealed inventory records on 4 March.',
				'continued on a second line.',
				'Why: Covering a shortfall before the audit.',
				'How: Used a borrowed access badge after hours.',
			].join('\r\n')
		);
		expect(fields.name).toBe('Marcus Hale');
		expect(fields.aliases).toEqual(['Mack', 'M. Hale']);
		expect(fields.who).toBe('Warehouse shift supervisor at Arulian Corp.');
		expect(fields.what).toBe('Removed sealed inventory records on 4 March.\ncontinued on a second line.');
		expect(fields.why).toBe('Covering a shortfall before the audit.');
		expect(fields.how).toBe('Used a borrowed access badge after hours.');
		expect(filled).toEqual(['name', 'aliases', 'who', 'what', 'why', 'how']);
		expect(truncated).toBe(false);
	});

	it('accepts markdown headings, bold labels and upper-case bare labels', () => {
		const { fields } = parsePoiIntakeText('## Who\nA courier.\n\n**What:** Delivered the package.\n\nWHY\nPaid in cash.\n\nHOW - By bicycle.');
		expect(fields.who).toBe('A courier.');
		expect(fields.what).toBe('Delivered the package.');
		expect(fields.why).toBe('Paid in cash.');
		expect(fields.how).toBe('By bicycle.');
	});

	it('puts unlabelled text in description and does not treat prose words as labels', () => {
		const { fields, filled } = parsePoiIntakeText('Seen near the depot twice.\nNobody knows how\nhe got in.');
		expect(fields.description).toBe('Seen near the depot twice.\nNobody knows how\nhe got in.');
		expect(fields.how).toBe('');
		expect(filled).toEqual(['description']);
	});

	it('keeps text before the first label as description', () => {
		const { fields } = parsePoiIntakeText('Intake note 12.\nWho: The night guard.');
		expect(fields.description).toBe('Intake note 12.');
		expect(fields.who).toBe('The night guard.');
	});

	it('strips a BOM and control characters, and never invents values', () => {
		const { fields, filled } = parsePoiIntakeText('﻿Who: A\u0000 clerk\u0007.');
		expect(fields.who).toBe('A clerk.');
		expect(fields.name).toBe('');
		expect(filled).toEqual(['who']);
		expect(parsePoiIntakeText('').filled).toEqual([]);
	});

	it('truncates an oversized section and reports it', () => {
		const { fields, truncated } = parsePoiIntakeText(`What: ${'x'.repeat(POI_INTAKE_FIELD_MAX_CHARS + 50)}`);
		expect(fields.what).toHaveLength(POI_INTAKE_FIELD_MAX_CHARS);
		expect(truncated).toBe(true);
	});
});

describe('validatePoiIntakeFile', () => {
	it('accepts a small .txt file', () => {
		expect(validatePoiIntakeFile({ name: 'note.txt', type: 'text/plain', size: 120 })).toBeNull();
		expect(validatePoiIntakeFile({ name: 'NOTE.TXT', type: '', size: 120 })).toBeNull();
	});

	it('rejects other types, empty files and oversized files', () => {
		expect(validatePoiIntakeFile({ name: 'note.pdf', type: 'application/pdf', size: 120 })).toMatch(/Only \.txt/);
		expect(validatePoiIntakeFile({ name: 'note.txt', type: 'text/html', size: 120 })).toMatch(/Only \.txt/);
		expect(validatePoiIntakeFile({ name: 'note.txt', type: 'text/plain', size: 0 })).toMatch(/empty/);
		expect(validatePoiIntakeFile({ name: 'note.txt', type: 'text/plain', size: POI_INTAKE_MAX_BYTES + 1 })).toMatch(/too large/);
	});
});
