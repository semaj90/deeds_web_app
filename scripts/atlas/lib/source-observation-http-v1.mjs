export async function fetchSourceObservationJsonV1(url, options, { fetchImpl = globalThis.fetch } = {}) {
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchImpl(url, options);
      if (!response.ok) throw new Error(`SOURCE_OBSERVATION_HTTP_${response.status}`);
      const body = await response.json();
      attempts.push({ attempt, status: 'RECEIVED' });
      return { body, attempts };
    } catch (error) {
      attempts.push({ attempt, status: 'FAILED', error: String(error?.message ?? error),
        ...(typeof error?.cause?.code === 'string' ? { causeCode: error.cause.code } : {}) });
      if (!(error instanceof TypeError && error.message === 'fetch failed') || attempt === 2 || options.signal?.aborted) {
        error.observationAttempts = attempts;
        throw error;
      }
    }
  }
}
