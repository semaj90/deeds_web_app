export type VlmToolName = 'rg' | 'qdrant' | 'searxng' | 'postgres';

export type VlmToolRequest = Readonly<{
	name: VlmToolName;
	args: Record<string, unknown>;
	reason?: string;
}>;

export type VlmPlan = Readonly<{
	answer?: string;
	observations?: readonly string[];
	requestedTools?: readonly VlmToolRequest[];
	sourceRef?: string;
	feature_id?: string;
}>;

const ALLOWED_TOOL_NAMES = new Set<VlmToolName>(['rg', 'qdrant', 'searxng', 'postgres']);

function coerceToolRequest(raw: unknown): VlmToolRequest | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (!ALLOWED_TOOL_NAMES.has(r.name as VlmToolName)) return null;
	return {
		name: r.name as VlmToolName,
		args: typeof r.args === 'object' && r.args !== null ? (r.args as Record<string, unknown>) : {},
		reason: typeof r.reason === 'string' ? r.reason : undefined,
	};
}

export function parseVlmPlan(text: string): VlmPlan {
	const jsonStart = text.indexOf('{');
	const jsonEnd = text.lastIndexOf('}');

	if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
		return { answer: text, observations: [text], requestedTools: [] };
	}

	try {
		const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
		const rawTools = Array.isArray(parsed.requestedTools) ? parsed.requestedTools : [];
		const requestedTools = rawTools.map(coerceToolRequest).filter(Boolean) as VlmToolRequest[];

		return {
			answer: typeof parsed.answer === 'string' ? parsed.answer : undefined,
			observations: Array.isArray(parsed.observations) ? (parsed.observations as string[]) : [],
			requestedTools,
			sourceRef: typeof parsed.sourceRef === 'string' ? parsed.sourceRef : undefined,
			feature_id: typeof parsed.feature_id === 'string' ? parsed.feature_id : undefined,
		};
	} catch {
		return { answer: text, observations: [text], requestedTools: [] };
	}
}
