import { json } from '@sveltejs/kit';
import { traceMcpClient } from '$lib/server/mcp-client.js';

export async function GET({ url, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const query = url.searchParams.get('query');
	if (!query) {
		return json({ error: 'Query parameter is required.' }, { status: 400 });
	}

	try {
		const result = await traceMcpClient.callTool('trace.kag_search', {
			query,
			limit: 5,
		});

		const content = Array.isArray((result as any)?.content)
			? (result as any).content
			: [];

		const hits = content
			.filter((c: any) => c?.type === 'text')
			.map((c: any) => {
				try {
					return JSON.parse(c.text);
				} catch {
					return { text: c.text };
				}
			});

		return json({ status: 'ok', query, hits });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ status: 'error', query, hits: [], error: message }, { status: 200 });
	}
}
