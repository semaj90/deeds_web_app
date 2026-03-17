import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const { label } = params;

	if (!label) {
		throw redirect(303, '/citations');
	}

	// 1. Resolve the citation via the internal API
	const res = await fetch(`/api/library/resolve-citation?q=${encodeURIComponent(label)}`);

	if (res.ok) {
		const data = await res.json();
		if (data.success && data.result) {
			const { document_id, node_id } = data.result;
			// 2. Redirect to the high-fidelity node dashboard
			throw redirect(303, `/library/${document_id}/node/${node_id}`);
		}
	}

	// 3. If resolution fails, we show a 'citation not found' or 'multiple results' view
	return {
		label,
		error: 'Citation not found in the legal corpus.'
	};
};
