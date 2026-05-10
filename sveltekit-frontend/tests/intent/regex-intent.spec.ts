import { describe, expect, it } from 'vitest';
import { inferIntent, type IntentLabel } from '$lib/intent/regex-intent.js';

type IntentCase = {
	name: string;
	text: string;
	label: IntentLabel | 'unknown';
	confidence: number;
	fallback: boolean;
	keywords: string[];
};

const cases: IntentCase[] = [
	{
		name: 'evidence upload high confidence',
		text: 'upload the evidence pdf',
		label: 'evidence_upload',
		confidence: 0.9,
		fallback: false,
		keywords: ['upload', 'evidence', 'pdf'],
	},
	{
		name: 'evidence upload regex plus one keyword',
		text: 'upload the document',
		label: 'evidence_upload',
		confidence: 0.7,
		fallback: false,
		keywords: ['upload'],
	},
	{
		name: 'evidence upload keywords only',
		text: 'upload file hash',
		label: 'evidence_upload',
		confidence: 0.5,
		fallback: false,
		keywords: ['upload', 'file', 'hash'],
	},
	{
		name: 'evidence upload low confidence fallback',
		text: 'attach this',
		label: 'evidence_upload',
		confidence: 0.3,
		fallback: true,
		keywords: ['attach'],
	},
	{
		name: 'schema drift high confidence',
		text: 'schema drift in postgres',
		label: 'schema_drift',
		confidence: 0.9,
		fallback: false,
		keywords: ['postgres', 'schema', 'drift'],
	},
	{
		name: 'schema drift regex plus one keyword',
		text: 'schema mismatch',
		label: 'schema_drift',
		confidence: 0.7,
		fallback: false,
		keywords: ['schema'],
	},
	{
		name: 'schema drift keywords only',
		text: 'schema table postgres',
		label: 'schema_drift',
		confidence: 0.5,
		fallback: false,
		keywords: ['postgres', 'schema', 'table'],
	},
	{
		name: 'schema drift low confidence fallback',
		text: 'postgres',
		label: 'schema_drift',
		confidence: 0.3,
		fallback: true,
		keywords: ['postgres'],
	},
	{
		name: 'graph search high confidence',
		text: 'expand the graph neighborhood with cypher',
		label: 'graph_search',
		confidence: 0.9,
		fallback: false,
		keywords: ['cypher', 'neighborhood', 'graph'],
	},
	{
		name: 'graph search regex plus one keyword',
		text: 'trace the graph',
		label: 'graph_search',
		confidence: 0.7,
		fallback: false,
		keywords: ['graph'],
	},
	{
		name: 'graph search keywords only',
		text: 'graph cypher pagerank',
		label: 'graph_search',
		confidence: 0.5,
		fallback: false,
		keywords: ['cypher', 'graph', 'pagerank'],
	},
	{
		name: 'graph search low confidence fallback',
		text: 'pagerank',
		label: 'graph_search',
		confidence: 0.3,
		fallback: true,
		keywords: ['pagerank'],
	},
	{
		name: 'gpu rerank high confidence',
		text: 'rerank the gpu attention stack',
		label: 'gpu_rerank',
		confidence: 0.9,
		fallback: false,
		keywords: ['gpu', 'attention', 'rerank'],
	},
	{
		name: 'gpu rerank regex plus one keyword',
		text: 'blend the gpu model',
		label: 'gpu_rerank',
		confidence: 0.7,
		fallback: false,
		keywords: ['gpu'],
	},
	{
		name: 'gpu rerank keywords only',
		text: 'gpu tensor cosine',
		label: 'gpu_rerank',
		confidence: 0.5,
		fallback: false,
		keywords: ['gpu', 'cosine', 'tensor'],
	},
	{
		name: 'gpu rerank low confidence fallback',
		text: 'cuda',
		label: 'gpu_rerank',
		confidence: 0.3,
		fallback: true,
		keywords: ['cuda'],
	},
	{
		name: 'ui bug high confidence',
		text: 'render modal card',
		label: 'ui_bug',
		confidence: 0.9,
		fallback: false,
		keywords: ['modal', 'card'],
	},
	{
		name: 'ui bug regex plus one keyword',
		text: 'click the card',
		label: 'ui_bug',
		confidence: 0.7,
		fallback: false,
		keywords: ['card'],
	},
	{
		name: 'ui bug keywords only',
		text: 'broken modal card',
		label: 'ui_bug',
		confidence: 0.5,
		fallback: false,
		keywords: ['broken', 'modal', 'card'],
	},
	{
		name: 'ui bug low confidence fallback',
		text: 'undefined',
		label: 'ui_bug',
		confidence: 0.3,
		fallback: true,
		keywords: ['undefined'],
	},
	{
		name: 'legal research high confidence',
		text: 'case law in court ruling',
		label: 'legal_research',
		confidence: 0.9,
		fallback: false,
		keywords: ['court', 'ruling'],
	},
	{
		name: 'legal research regex plus one keyword',
		text: 'case law and court',
		label: 'legal_research',
		confidence: 0.7,
		fallback: false,
		keywords: ['court'],
	},
	{
		name: 'legal research keywords only',
		text: 'court ruling plaintiff',
		label: 'legal_research',
		confidence: 0.5,
		fallback: false,
		keywords: ['court', 'ruling', 'plaintiff'],
	},
	{
		name: 'legal research low confidence fallback',
		text: 'appeal',
		label: 'legal_research',
		confidence: 0.3,
		fallback: true,
		keywords: ['appeal'],
	},
	{
		name: 'ambiguous query one',
		text: 'can you help with this',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
	{
		name: 'ambiguous query two',
		text: 'what should I do next',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
	{
		name: 'ambiguous query three',
		text: 'please review this message',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
	{
		name: 'ambiguous query four',
		text: 'I need some guidance here',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
	{
		name: 'ambiguous query five',
		text: 'this needs assistance',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
	{
		name: 'blank query fallback',
		text: '',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
	{
		name: 'punctuation only fallback',
		text: '???',
		label: 'unknown',
		confidence: 0,
		fallback: true,
		keywords: [],
	},
];

describe('inferIntent', () => {
	it.each(cases)('$name', ({ text, label, confidence, fallback, keywords }) => {
		const result = inferIntent(text);

		expect(result.label).toBe(label);
		expect(result.confidence).toBeCloseTo(confidence, 6);
		expect(result.fallback).toBe(fallback);
		expect(result.keywords).toEqual(keywords);
	});
});
