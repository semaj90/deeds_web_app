/**
 * Parses a plain-text intake note into person-of-interest form fields.
 *
 * Deterministic and local: no model call, nothing is inferred. A line that starts with a known
 * label ("Who:", "## What", "WHY -", "Name:", "Alias:", ...) opens that section; following lines
 * belong to it until the next label. Text before any label goes to `description`.
 * The caller decides what to do with the result; this never writes anywhere.
 */

export const POI_INTAKE_MAX_BYTES = 256 * 1024;
export const POI_INTAKE_FIELD_MAX_CHARS = 5000;

export type PoiIntakeSection = 'who' | 'what' | 'why' | 'how';

export interface PoiIntakeFields {
	name: string;
	aliases: string[];
	who: string;
	what: string;
	why: string;
	how: string;
	description: string;
}

export interface PoiIntakeResult {
	fields: PoiIntakeFields;
	/** Fields that received text from the file, in form order. */
	filled: Array<keyof PoiIntakeFields>;
	/** True when any field was cut to POI_INTAKE_FIELD_MAX_CHARS. */
	truncated: boolean;
}

type Target = keyof PoiIntakeFields;

const LABELS: Array<{ target: Target; pattern: RegExp }> = [
	{ target: 'name', pattern: /^(?:full\s+)?name$|^subject$|^person(?:\s+of\s+interest)?$/ },
	{ target: 'aliases', pattern: /^alias(?:es)?$|^a\.?k\.?a\.?$|^also\s+known\s+as$|^known\s+as$/ },
	{ target: 'who', pattern: /^who$/ },
	{ target: 'what', pattern: /^what$/ },
	{ target: 'why', pattern: /^why$|^motive$/ },
	{ target: 'how', pattern: /^how$|^method$/ },
	{ target: 'description', pattern: /^description$|^notes?$|^summary$|^background$/ },
];

/** Matches "Label: rest", "Label - rest", "## Label", "**Label:** rest", "LABEL". */
const LABEL_LINE = /^\s*(?:#{1,6}\s*)?(?:[-*•]\s*)?(?:\*\*|__)?\s*([A-Za-z][A-Za-z. ]{0,30}?)\s*(?:\*\*|__)?\s*(?:[:\-–—]\s*(.*))?$/;

function matchLabel(line: string): { target: Target; rest: string } | null {
	const match = LABEL_LINE.exec(line);
	if (!match) return null;
	const label = match[1].trim().toLowerCase().replace(/\s+/g, ' ');
	const hasSeparator = match[2] !== undefined;
	const isHeading = /^\s*#{1,6}\s/.test(line) || /^\s*(?:\*\*|__)/.test(line);
	const isBareUpper = !hasSeparator && /^[A-Z][A-Z .]*$/.test(line.trim());
	// A bare word such as "how" inside prose must not open a section.
	if (!hasSeparator && !isHeading && !isBareUpper) return null;
	const found = LABELS.find((entry) => entry.pattern.test(label));
	if (!found) return null;
	// "**What:** text" closes the bold after the separator; drop that stray marker from either end.
	const rest = (match[2] ?? '').replace(/^\s*(?:\*\*|__)\s*/, '').replace(/\s*(?:\*\*|__)\s*$/, '').trim();
	return { target: found.target, rest };
}

function clean(value: string): { text: string; truncated: boolean } {
	const text = value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
	return text.length > POI_INTAKE_FIELD_MAX_CHARS
		? { text: text.slice(0, POI_INTAKE_FIELD_MAX_CHARS), truncated: true }
		: { text, truncated: false };
}

export function parsePoiIntakeText(raw: string): PoiIntakeResult {
	// Strip a UTF-8 BOM and normalize line endings; drop other control characters.
	const text = String(raw ?? '')
		.replace(/^﻿/, '')
		.replace(/\r\n?/g, '\n')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

	const buckets: Record<Target, string[]> = {
		name: [], aliases: [], who: [], what: [], why: [], how: [], description: [],
	};
	let current: Target = 'description';
	for (const line of text.split('\n')) {
		const label = matchLabel(line);
		if (label) {
			current = label.target;
			if (label.rest) buckets[current].push(label.rest);
			continue;
		}
		buckets[current].push(line);
	}

	let truncated = false;
	const take = (target: Target): string => {
		const result = clean(buckets[target].join('\n'));
		truncated ||= result.truncated;
		return result.text;
	};

	const nameText = take('name');
	const fields: PoiIntakeFields = {
		// A name is one line; anything after the first line is not a name.
		name: (nameText.split('\n')[0] ?? '').trim().slice(0, 500),
		aliases: take('aliases')
			.split(/[\n,;]+/)
			.map((alias) => alias.replace(/^["'“”]+|["'“”]+$/g, '').trim())
			.filter((alias, index, all) => alias.length > 0 && alias.length <= 200 && all.indexOf(alias) === index)
			.slice(0, 20),
		who: take('who'),
		what: take('what'),
		why: take('why'),
		how: take('how'),
		description: take('description'),
	};

	const order: Array<keyof PoiIntakeFields> = ['name', 'aliases', 'who', 'what', 'why', 'how', 'description'];
	const filled = order.filter((key) => (key === 'aliases' ? fields.aliases.length > 0 : fields[key].length > 0));
	return { fields, filled, truncated };
}

/** Client-side gate for a dropped file. Returns an error message, or null when the file may be read. */
export function validatePoiIntakeFile(file: { name: string; type: string; size: number }): string | null {
	const isText = file.type === 'text/plain' || (file.type === '' && /\.txt$/i.test(file.name));
	if (!isText || !/\.txt$/i.test(file.name)) return 'Only .txt files can be dropped here.';
	if (file.size === 0) return 'That file is empty.';
	if (file.size > POI_INTAKE_MAX_BYTES) return 'That file is too large (limit 256 KB).';
	return null;
}
