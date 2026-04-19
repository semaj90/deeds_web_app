import { json } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

export const GET: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        return json({ user: null }, { status: 401 });
    }

    const responseData = { user: locals.user };

    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
        headers: { ...cacheControl.private, ETag: etag }
    });
};
