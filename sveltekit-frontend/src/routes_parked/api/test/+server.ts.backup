import { json } from '@sveltejs/kit';

export const GET = async () => {
 return json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
};

export const POST = async ({ request }) => {
 const body = await request.json();
 return json({
 message: 'POST test endpoint working',
 received: body,
 timestamp: new Date().toISOString(),
 });
};


