export class ScenePreviewRequestErrorV1 extends Error {
	constructor(message: string, readonly status: number, readonly code: string | null = null) {
		super(message);
		this.name = 'ScenePreviewRequestErrorV1';
	}
	get sourceStale() { return this.status === 409 || /source.*(stale|revision)|revision.*(stale|changed)/i.test(this.code ?? this.message); }
}

export async function requestScenePreviewV1(input: {
	caseId: string;
	parameters: unknown;
	buildCandidate: (parameters: unknown) => unknown;
	onValidate: () => void;
	signal: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<unknown> {
	const { signal } = input;
	async function post(route: 'parameters' | 'plans', body: unknown) {
		signal.throwIfAborted();
		const response = await fetcher(`/api/cases/${encodeURIComponent(input.caseId)}/scene-reconstruction/${route}`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
			cache: 'no-store', signal, body: JSON.stringify(body)
		});
		signal.throwIfAborted();
		const reply = await response.json().catch(() => null);
		signal.throwIfAborted();
		const key = route === 'parameters' ? 'parameters' : 'plan';
		if (!response.ok || reply?.ok !== true || !reply[key]) {
			throw new ScenePreviewRequestErrorV1(typeof reply?.error === 'string' ? reply.error :
				route === 'parameters' ? 'Could not validate selected case sources.' : 'The server did not resolve this scene proposal.',
				response.status, typeof reply?.code === 'string' ? reply.code : null);
		}
		return reply[key];
	}

	const parameters = await post('parameters', input.parameters);
	signal.throwIfAborted();
	const candidate = input.buildCandidate(parameters);
	input.onValidate();
	return await post('plans', candidate);
}
