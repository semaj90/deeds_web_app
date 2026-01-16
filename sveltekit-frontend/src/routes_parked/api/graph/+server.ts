import { json } from '@sveltejs/kit';
import type { mergePromptCluster, mergeTransition } from '$lib/server/graph-service';

export async function POST({ request }): Promise<any> {
 const body = await request.json().catch(() => ({}));

 if (body.action === 'mergePrompt') {$1;$2 String(body?.prompt?? ''),
 String(body?.cluster?? ''),
 body.userId
 );
 return json({ ok: true, result: res });
 }

 if (body.action === 'mergeTransition') {
 const res = await mergeTransition(String(body?.from?? ''), String(body?.to?? ''));
 return json({ ok: true, result: res });
 }

 return json({ ok: false, error: 'unknown action' }, { status: 400 });
}


