import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import type { DiagnosticResult } from './agentic-diagnostic';

export interface RepairProposal {
	explanation: string;
	diff: string;
	confidence: number;
}

export class CodeRepairAgent {
	/**
	 * Proposes a code fix based on a diagnostic result.
	 */
	static async proposeFix(diagnostic: DiagnosticResult): Promise<RepairProposal> {
		const context = diagnostic.suspectedFiles.map(f => `FILE: ${f.path}\n\`\`\`\n${f.snippet}\n\`\`\``).join('\n\n');
		
		const prompt = `
[AGENTIC CODE REPAIR - ACE]
Analyze the following error and the suspected codebase snippets.
Propose a concise fix in unified diff format.

ERROR: "${diagnostic.error}"
ANALYSIS: ${diagnostic.rootCauseAnalysis}

CODE CONTEXT:
${context}

Return ONLY a JSON object with:
{
  "explanation": "Brief explanation of the fix",
  "diff": "The unified diff block",
  "confidence": 0.0-1.0
}
`.trim();

		try {
			const response = await bifrostChat(
				[{ role: 'user', content: prompt }],
				ENV.GEMMA4_MODEL,
				{ temperature: 0.1, maxTokens: 800 }
			);

			const match = response.match(/\{.*\}/s);
			if (match) {
				return JSON.parse(match[0]);
			}
		} catch (err) {
			console.error('[CodeRepairAgent] Failed to generate fix:', err);
		}

		return {
			explanation: 'Failed to generate proposal.',
			diff: '',
			confidence: 0
		};
	}
}
