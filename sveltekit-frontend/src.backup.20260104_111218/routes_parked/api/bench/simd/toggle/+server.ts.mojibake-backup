import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { simdBodyParser } from '$lib/server/simd-body-parser';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { enabled } = await request.json().catch(() => ({}));
        if (typeof enabled !== 'boolean') {
            return json({ ok: false, error: "Provide { enabled: boolean }" }, { status: 400 });
        }
        simdBodyParser.toggleSIMD(enabled);
        return json({ ok: true, enabled });
    } catch (e: unknown) {
        return json({ ok: false, error: String(e) }, { status: 500 });
    }
};
}
