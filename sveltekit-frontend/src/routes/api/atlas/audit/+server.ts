export async function GET({ url }) {
	const query = url.searchParams.get('query');
	if (!query) {
		return new Response(JSON.stringify({ error: 'Query parameter is missing.' }), { status: 400 });
	}
	return new Response(
		JSON.stringify({ status: 'error', message: 'agent-executor not implemented' }),
		{ status: 501, headers: { 'Content-Type': 'application/json' } }
	);
}
