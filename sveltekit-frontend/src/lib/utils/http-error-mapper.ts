// Lightweight HTTP/Fetch -> ServiceError mapper
// Converts network/fetch/http errors into a normalized ServiceError shape

export type ServiceError = {
	code: string;
	status?: number;
	message: string;
	details?: unknown;
};

/**
 * Map a fetch Response to a ServiceError
 */
export async function mapResponseToServiceError(res: Response): Promise<ServiceError> {
	const text = await res.text().catch(() => null);
	let parsed: unknown = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = text;
	}

	const status = res.status;

	if (status >= 500) {
		return {
			code: `server_error_${status}`,
			status,
			message: `Upstream service error (${status})`,
			details: parsed ?? text
		};
	}

	if (status >= 400) {
		const parsedObj = parsed && typeof parsed === 'object'
			? (parsed as Record<string, unknown>)
			: null;
		const code = (parsedObj && (parsedObj['code'] as string)) || `client_error_${status}`;
		const msg = (parsedObj && (parsedObj['message'] as string)) || `Client error (${status})`;
		return {
			code,
			status,
			message: String(msg),
			details: parsed ?? text
		};
	}

	return {
		code: 'unknown_response_error',
		status,
		message: 'Unexpected response from upstream service',
		details: parsed ?? text
	};
}

/**
 * Map a thrown error (network, timeout, etc.) to ServiceError
 */
export function mapErrorToServiceError(err: unknown): ServiceError {
	if (err instanceof TypeError && String(err.message).toLowerCase().includes('failed to fetch')) {
		return {
			code: 'network_error',
			message: 'Network error while calling upstream service',
			details: err
		};
	}

	const message = err && typeof err === 'object' && 'message' in (err as Record<string, unknown>)
		? String((err as Record<string, unknown>)['message'])
		: String(err ?? 'Unknown error');

	if (String(message).toLowerCase().includes('timeout')) {
		return {
			code: 'timeout',
			message: 'Request to upstream service timed out',
			details: err
		};
	}

	return {
		code: 'service_error',
		message: String(message),
		details: err
	};
}

export default { mapResponseToServiceError, mapErrorToServiceError };
