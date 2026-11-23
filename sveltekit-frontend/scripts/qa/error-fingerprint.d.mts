// Type declarations for error-fingerprint.mjs, used by the Playwright fixtures.
export function redact(text: unknown, max?: number): string;
export function routeTemplate(pathname: unknown): string;
export function stackSignature(stack: unknown, frames?: number): string;
export const CODES: Readonly<Record<string, string>>;
export const SEVERITY: Readonly<Record<string, string>>;
export function classify(event: unknown): { error_code: string; confidence: string; needsConfirmation: boolean } | null;
export function fingerprint(input: { error_code?: string; feature_label?: string; route?: string; stack?: string }): string;
export function groupIssues(events: unknown[]): Array<Record<string, unknown>>;
