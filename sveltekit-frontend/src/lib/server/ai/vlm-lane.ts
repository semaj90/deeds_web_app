import { generateText } from 'ai';
import { llamaServer, LOCAL_VLM_MODEL } from './local-llama-provider.js';
import { parseVlmPlan, type VlmPlan } from './vlm-plan-parser.js';
import { dispatchTools, type ToolResult } from './tool-dispatcher.js';
import type { LaneRequest } from './lane-router.js';

export type VlmLaneResult = {
	answer: string;
	plan: VlmPlan;
	toolResults: ToolResult[];
	model: string;
	durationMs: number;
};

const MAX_TOOL_ROUNDS = 3;
const MAX_CONTEXT_CHARS = 8_000;

function buildVlmPrompt(req: LaneRequest, priorToolResults?: ToolResult[]): string {
	const toolContext = priorToolResults?.length
		? `\n\nTool results from prior round:\n${priorToolResults.map(r => `[${r.tool}]: ${r.error ? 'ERROR: ' + r.error : r.output.slice(0, MAX_CONTEXT_CHARS / priorToolResults.length)}`).join('\n\n')}`
		: '';

	return `You are a legal AI assistant with access to tools. Analyse the query and, if you need more information, request tools. Otherwise provide a direct answer.

Query: ${req.query}${toolContext}

Respond with compact JSON only — no markdown fences, no preamble:
{
  "answer": "direct answer or null if tool calls needed",
  "observations": ["key observations"],
  "requestedTools": [
    { "name": "rg|qdrant|searxng|postgres", "args": { ... }, "reason": "why" }
  ]
}

If you have enough information, set "answer" to a complete response and "requestedTools" to [].
If you need tool results first, set "answer" to null and populate "requestedTools".`;
}

function buildImageContent(req: LaneRequest): Array<{ type: 'image'; image: string }> {
	const images: Array<{ type: 'image'; image: string }> = [];
	for (const url of req.imageUrls ?? []) {
		images.push({ type: 'image', image: url });
	}
	for (const b64 of req.imageBase64 ?? []) {
		images.push({ type: 'image', image: `data:image/jpeg;base64,${b64}` });
	}
	for (const att of req.attachments ?? []) {
		if (att.base64) {
			const mime = att.mimeType ?? 'image/jpeg';
			images.push({ type: 'image', image: `data:${mime};base64,${att.base64}` });
		} else if (att.url) {
			images.push({ type: 'image', image: att.url });
		}
	}
	return images;
}

export async function runVlmLane(req: LaneRequest): Promise<VlmLaneResult> {
	const start = performance.now();
	const allToolResults: ToolResult[] = [];
	let finalPlan: VlmPlan = {};
	let answer = '';

	const imageContent = buildImageContent(req);

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const promptText = buildVlmPrompt(req, round > 0 ? allToolResults : undefined);

		const userContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
			{ type: 'text', text: promptText },
			...imageContent,
		];

		let rawText = '';
		try {
			const result = await generateText({
				model: llamaServer(LOCAL_VLM_MODEL),
				messages: [{ role: 'user', content: userContent }],
				maxTokens: 1024,
				temperature: 0.2,
				abortSignal: AbortSignal.timeout(60_000),
			});
			rawText = result.text ?? '';
		} catch (err) {
			answer = `VLM inference failed: ${(err as Error).message}`;
			break;
		}

		const plan = parseVlmPlan(rawText);
		finalPlan = plan;

		if (plan.answer) {
			answer = plan.answer;
			break;
		}

		if (!plan.requestedTools?.length) {
			answer = rawText;
			break;
		}

		const roundResults = await dispatchTools(plan.requestedTools);
		allToolResults.push(...roundResults);
	}

	if (!answer) {
		answer = allToolResults.length
			? `Analysis complete. Tool results collected: ${allToolResults.length} results.`
			: 'No response generated.';
	}

	return {
		answer,
		plan: finalPlan,
		toolResults: allToolResults,
		model: LOCAL_VLM_MODEL,
		durationMs: Math.round(performance.now() - start),
	};
}
