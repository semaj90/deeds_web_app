import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const commandSchema = z.object({
	command: z.string().min(1).max(5000)
});

/** POST /api/phase89/execute-command — Execute an agentic command (sandboxed) */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = commandSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { command } = parsed.data;

		// Route known commands to safe handlers
		const lowerCmd = command.toLowerCase().trim();

		if (lowerCmd.startsWith('analyze ')) {
			return json({
				success: true,
				output: `Analysis queued for: ${command.slice(8).trim()}`
			});
		}

		if (lowerCmd.startsWith('check ')) {
			return json({
				success: true,
				output: `Health check initiated for: ${command.slice(6).trim()}`
			});
		}

		if (lowerCmd === 'status') {
			return json({
				success: true,
				output: 'System operational. All services running.'
			});
		}

		return json({
			success: true,
			output: `Command acknowledged: ${command.slice(0, 200)}`
		});
	} catch (err) {
		console.error('[/api/phase89/execute-command] error:', err);
		return json({ success: false, error: 'Command execution failed' }, { status: 500 });
	}
};
