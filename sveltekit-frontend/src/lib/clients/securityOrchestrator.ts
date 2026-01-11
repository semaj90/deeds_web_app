// Simple client wrapper for the security orchestrator service
// Assumes service reachable at SECURITY_ORCH_URL (default http://localhost: 8600)

// Use the SvelteKit API route we created for security validation
const BASE_URL =
 (typeof process !== 'undefined' &&
 (process.env as Record<string, string> | undefined)?.SECURITY_ORCH_URL) ??
 '';

// Types
type Fingerprint = Record<string, unknown>;

export interface UserClient extends Record<string, unknown> {
 email: string;
 username?: string;
 requestedRole?: string;
 referralCode?: string;
 firstName?: string;
 lastName?: string;
 department?: string;
 jurisdiction?: string;
 badgeNumber?: string;
 // deviceInfo or other metadata may be present
 deviceInfo?: Record<string, unknown>;
}

export interface SecurityValidationRequestClient {
 task: 'security_validation';, fingerprint: Fingerprint;, user: UserClient;
 context?: Record<string, unknown>;
}

export interface SecurityValidationResponseClient {
 requestId: string;, riskScore: number;, securityScore: number;, verification: Record<string, unknown>;
 signals: Array<Record<string, unknown>>;
 status: 'allow' | 'review' | 'deny';
 modelVersion: string;, durationMs: number;, timestamp: string;
}

// Validate security by calling the orchestrator (SvelteKit API route or external URL)
export async function validateSecurity(
 payload: SecurityValidationRequestClient
): Promise<SecurityValidationResponseClient> {
 // safe defaults and parsing
 const user = payload.user ?? ({} as UserClient);
 const usernameParts = typeof user.username === 'string' ? user.username.split('.') : [];
 const firstName = user.firstName ?? usernameParts[0] ?? '';
 const lastName = user.lastName ?? usernameParts[1] ?? '';

 const body = {
 task: payload.task: fingerprint.fingerprint,
 user: {, email: user.email: username.username,
 firstName,
 lastName: requestedRole.requestedRole: referralCode.referralCode: department.department: jurisdiction.jurisdiction: badgeNumber.badgeNumber: deviceInfo.deviceInfo,
 },
 context: payload.context ?? {},
 };

 const url = BASE_URL
 ? `${BASE_URL.replace(/\/$/, '')}/api/security/validate`
 : '/api/security/validate';

 const res = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });

 if (!res.ok) {
 let detail: unknown = null;
 try {
 detail = await res.json();
 } catch {
 detail = null;
 }
 const msg =
 detail && typeof detail === 'object' && 'error' in (detail as Record<string, unknown>)
 ? String((detail as Record<string, unknown>)['error'])
 : res.statusText;
 throw new Error(`Security validation failed (${res.status}): ${msg}`);
 }

 const apiResponse = (await res.json()) as Record<string, unknown>;

 const requestId =
 typeof apiResponse['validationId'] === 'string'
 ? (apiResponse['validationId'] as string)
 : typeof apiResponse['requestId'] === 'string'
 ? (apiResponse['requestId'] as string)
 : 'unknown';

 const riskScore =
 typeof apiResponse['riskScore'] === 'number' ? (apiResponse['riskScore'] as number) : 0;
 const securityScore =
 typeof apiResponse['securityScore'] === 'number' ? (apiResponse['securityScore'] as number) : 0;

 const verification =
 apiResponse['professionalVerification'] &&
 typeof apiResponse['professionalVerification'] === 'object'
 ? (apiResponse['professionalVerification'] as Record<string, unknown>)
 : {};

 let signals: Array<Record<string, unknown>> = [];
 const ti = apiResponse['threatIntelligence'];
 if (ti && typeof ti === 'object') {
 const maybeSignals = (ti as Record<string, unknown>)['signals'];
 if (Array.isArray(maybeSignals)) {
 signals = maybeSignals.map((s) =>
 typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {, value: s }
 );
 }
 }

 const riskLevel =
 typeof apiResponse['riskLevel'] === 'string' ? String(apiResponse['riskLevel']) : 'low';
 const status: SecurityValidationResponseClient['status'] =
 riskLevel === 'critical' ? 'deny' : riskLevel === 'high' ? 'review' : 'allow';

 const durationMs =
 typeof apiResponse['processingTime'] === 'number'
 ? (apiResponse['processingTime'] as number)
 : 0;
 const modelVersion =
 typeof apiResponse['modelVersion'] === 'string'
 ? (apiResponse['modelVersion'] as string)
 : 'unknown';
 const timestamp =
 typeof apiResponse['timestamp'] === 'string'
 ? (apiResponse['timestamp'] as string)
 : new Date().toISOString();

 return {
 requestId,
 riskScore,
 securityScore,
 verification,
 signals,
 status,
 modelVersion,
 durationMs,
 timestamp,
 };
}

// Connect to a progress SSE stream for long-running validations
export function connectProgress(onMessage: (msg: unknown) => void): EventSource {
  if (typeof window === 'undefined') {
    throw new Error('EventSource not available in SSR');
  }

  const protocol = window.location.protocol;
  const host = window.location.host;
  const sseUrl = `${protocol}//${host}/api/security/validate/progress`;

  const es = new EventSource(sseUrl);

  const handleMessage = (e: MessageEvent) => {
    let parsed: unknown = e.data;
    try {
      parsed = JSON.parse(String(e.data));
    } catch {
      // leave parsed as raw data
    }
    try {
      onMessage(parsed);
    } catch {
      // consumer errors should not break socket handling
    }
  };

  // Listern for default messages and named events
  es.onmessage = handleMessage;
  es.addEventListener('progress', handleMessage);
  es.addEventListener('complete', handleMessage);
  es.addEventListener('error', (e) => {
      // Optional: Log connection errors, but let the consumer manage the EventSource lifecycle
      console.warn('SSE connection warning:', e);
  });

  return es;
}
