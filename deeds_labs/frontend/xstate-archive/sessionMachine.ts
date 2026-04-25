/**
 * XState v5 Machine for Session Management
 * Handles: auth lifecycle, session refresh, timeout, security elevation, health checks
 */
import { assign, createMachine, fromPromise } from 'xstate';
import type { User } from '../stores/auth.svelte.js';

// Session context
export interface SessionContext {
	user: User | null;
	sessionId: string | null;
	expiresAt: Date | null;
	lastActivity: Date | null;
	securityLevel: 'standard' | 'elevated' | 'secure';
	permissions: string[];
	currentRoute: string;
	deviceFingerprint?: string;
	sessionHealth: {
		isValid: boolean;
		warningCount: number;
		lastHealthCheck: Date | null;
	};
	analyticsData: {
		loginTime: Date | null;
		activityCount: number;
		featuresUsed: string[];
	};
}

// Session events
type SessionEvent =
	| { type: 'AUTHENTICATE'; user: User; sessionId: string }
	| { type: 'REFRESH_SESSION' }
	| { type: 'LOGOUT' }
	| { type: 'SESSION_EXPIRED' }
	| { type: 'ACTIVITY'; route: string; action: string }
	| { type: 'SECURITY_CHECK' }
	| { type: 'PERMISSION_CHECK'; permission: string }
	| { type: 'EXTEND_SESSION' }
	| { type: 'ELEVATE_SECURITY'; reason: string }
	| { type: 'HEALTH_CHECK' };

// Service result types
interface AuthenticationResult {
	expiresAt: string;
	permissions: string[];
	valid: boolean;
}

interface RefreshSessionResult {
	expiresAt: string;
}

interface ExtendSessionResult {
	expiresAt: string;
}

interface ElevateSecurityLevelResult {
	newLevel: 'elevated';
}

interface PerformSecurityCheckResult {
	warningCount: number;
}

interface PerformHealthCheckResult {
	healthy: boolean;
}

// Helper: get user permissions based on role
function getUserPermissions(role: string): string[] {
	const permissions: Record<string, string[]> = {
		admin: ['all'],
		lead_prosecutor: ['manage_cases', 'view_all_evidence', 'assign_tasks', 'generate_reports'],
		prosecutor: ['create_cases', 'manage_own_cases', 'view_evidence', 'generate_reports'],
		investigator: ['view_cases', 'add_evidence', 'view_evidence'],
		analyst: ['view_cases', 'analyze_evidence', 'generate_reports'],
		viewer: ['view_cases', 'view_evidence']
	};
	return permissions[role] || permissions.viewer;
}

export const sessionMachine = createMachine({
	id: 'sessionManager',
	initial: 'unauthenticated',
	context: {
		user: null,
		sessionId: null,
		expiresAt: null,
		lastActivity: null,
		securityLevel: 'standard',
		permissions: [],
		currentRoute: '/',
		sessionHealth: { isValid: false, warningCount: 0, lastHealthCheck: null },
		analyticsData: { loginTime: null, activityCount: 0, featuresUsed: [] }
	} as SessionContext,

	states: {
		unauthenticated: {
			entry: assign({
				user: null,
				sessionId: null,
				expiresAt: null,
				lastActivity: null,
				securityLevel: 'standard' as const,
				permissions: [],
				currentRoute: '/',
				sessionHealth: { isValid: false, warningCount: 0, lastHealthCheck: null },
				analyticsData: { loginTime: null, activityCount: 0, featuresUsed: [] }
			}),
			on: {
				AUTHENTICATE: { target: 'authenticating' }
			}
		},

		authenticating: {
			invoke: {
				src: fromPromise(async ({ input }: { input: { user: User; sessionId: string } }) => {
					const res = await fetch('/api/auth/validate', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ sessionId: input.sessionId })
					});
					if (!res.ok) throw new Error('Authentication failed');
					return (await res.json()) as AuthenticationResult;
				}),
				input: ({ event }) => {
					const e = event as Extract<SessionEvent, { type: 'AUTHENTICATE' }>;
					return { user: e.user, sessionId: e.sessionId };
				},
				onDone: {
					target: 'authenticated',
					actions: assign(({ context, event }) => {
						const result = event.output as AuthenticationResult;
						const authEvent = context; // user/sessionId set by prior assign
						const role = (context.user as any)?.role ?? 'viewer';
						return {
							permissions: result.permissions.length > 0 ? result.permissions : getUserPermissions(role),
							expiresAt: new Date(result.expiresAt),
							lastActivity: new Date(),
							sessionHealth: {
								...context.sessionHealth,
								isValid: result.valid,
								lastHealthCheck: new Date()
							},
							analyticsData: {
								...context.analyticsData,
								loginTime: new Date()
							}
						};
					})
				},
				onError: { target: 'unauthenticated' }
			}
		},

		authenticated: {
			initial: 'active',
			on: {
				LOGOUT: { target: '#sessionManager.logging_out' },
				SESSION_EXPIRED: { target: '#sessionManager.expired' },
				SECURITY_CHECK: { target: '.security_validation' },
				HEALTH_CHECK: { target: '.health_checking' }
			},
			states: {
				active: {
					on: {
						ACTIVITY: {
							actions: assign(({ context, event }) => {
								const e = event as Extract<SessionEvent, { type: 'ACTIVITY' }>;
								return {
									lastActivity: new Date(),
									currentRoute: e.route,
									analyticsData: {
										...context.analyticsData,
										activityCount: context.analyticsData.activityCount + 1
									}
								};
							})
						},
						REFRESH_SESSION: { target: 'refreshing' },
						EXTEND_SESSION: { target: 'extending' },
						PERMISSION_CHECK: { target: 'checking_permissions' },
						ELEVATE_SECURITY: { target: 'elevating_security' }
					},
					after: {
						300000: { target: 'checking_timeout' }
					}
				},

				refreshing: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { sessionId: string | null } }) => {
							const res = await fetch('/api/auth/refresh', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ sessionId: input.sessionId })
							});
							if (!res.ok) throw new Error('Refresh failed');
							return (await res.json()) as RefreshSessionResult;
						}),
						input: ({ context }) => ({ sessionId: context.sessionId }),
						onDone: {
							target: 'active',
							actions: assign(({ context, event }) => {
								const result = event.output as RefreshSessionResult;
								return {
									expiresAt: new Date(result.expiresAt),
									lastActivity: new Date(),
									sessionHealth: { ...context.sessionHealth, lastHealthCheck: new Date() }
								};
							})
						},
						onError: { target: '#sessionManager.expired' }
					}
				},

				extending: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { sessionId: string | null } }) => {
							const res = await fetch('/api/auth/extend', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ sessionId: input.sessionId, duration: 3600000 })
							});
							if (!res.ok) throw new Error('Extend failed');
							return (await res.json()) as ExtendSessionResult;
						}),
						input: ({ context }) => ({ sessionId: context.sessionId }),
						onDone: {
							target: 'active',
							actions: assign(({ event }) => {
								const result = event.output as ExtendSessionResult;
								return { expiresAt: new Date(result.expiresAt) };
							})
						},
						onError: { target: 'active' }
					}
				},

				checking_permissions: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { permission: string; permissions: string[] } }) => {
							if (input.permissions.includes('all') || input.permissions.includes(input.permission)) {
								return true;
							}
							throw new Error('Permission denied');
						}),
						input: ({ context, event }) => {
							const e = event as Extract<SessionEvent, { type: 'PERMISSION_CHECK' }>;
							return { permission: e.permission, permissions: context.permissions };
						},
						onDone: { target: 'active' },
						onError: { target: 'permission_denied' }
					}
				},

				permission_denied: {
					after: {
						3000: { target: 'active' }
					}
				},

				elevating_security: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { sessionId: string | null; reason: string } }) => {
							const res = await fetch('/api/auth/elevate', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ sessionId: input.sessionId, reason: input.reason })
							});
							if (!res.ok) throw new Error('Elevation failed');
							return (await res.json()) as ElevateSecurityLevelResult;
						}),
						input: ({ context, event }) => {
							const e = event as Extract<SessionEvent, { type: 'ELEVATE_SECURITY' }>;
							return { sessionId: context.sessionId, reason: e.reason };
						},
						onDone: {
							target: 'active',
							actions: assign(({ event }) => {
								const result = event.output as ElevateSecurityLevelResult;
								return { securityLevel: result.newLevel };
							})
						},
						onError: { target: 'active' }
					}
				},

				checking_timeout: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { expiresAt: Date | null } }) => {
							if (input.expiresAt && new Date() > input.expiresAt) {
								throw new Error('Session expired');
							}
							return true;
						}),
						input: ({ context }) => ({ expiresAt: context.expiresAt }),
						onDone: { target: 'active' },
						onError: { target: '#sessionManager.expired' }
					}
				},

				security_validation: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { sessionId: string | null } }) => {
							const res = await fetch('/api/auth/security-check', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ sessionId: input.sessionId })
							});
							if (!res.ok) throw new Error('Security check failed');
							return (await res.json()) as PerformSecurityCheckResult;
						}),
						input: ({ context }) => ({ sessionId: context.sessionId }),
						onDone: {
							target: 'active',
							actions: assign(({ context, event }) => {
								const result = event.output as PerformSecurityCheckResult;
								return {
									sessionHealth: {
										...context.sessionHealth,
										warningCount: result.warningCount,
										lastHealthCheck: new Date()
									}
								};
							})
						},
						onError: {
							target: 'security_compromised',
							actions: assign(({ context }) => ({
								sessionHealth: {
									...context.sessionHealth,
									isValid: false,
									warningCount: context.sessionHealth.warningCount + 1
								}
							}))
						}
					}
				},

				security_compromised: {
					after: {
						5000: { target: '#sessionManager.logging_out' }
					}
				},

				health_checking: {
					invoke: {
						src: fromPromise(async ({ input }: { input: { sessionId: string | null } }) => {
							const res = await fetch('/api/health');
							if (!res.ok) throw new Error('Health check failed');
							return (await res.json()) as PerformHealthCheckResult;
						}),
						input: ({ context }) => ({ sessionId: context.sessionId }),
						onDone: {
							target: 'active',
							actions: assign(({ context, event }) => {
								const result = event.output as PerformHealthCheckResult;
								return {
									sessionHealth: {
										...context.sessionHealth,
										lastHealthCheck: new Date(),
										isValid: result.healthy
									}
								};
							})
						},
						onError: { target: 'active' }
					}
				}
			}
		},

		logging_out: {
			invoke: {
				src: fromPromise(async ({ input }: { input: { sessionId: string | null } }) => {
					await fetch('/api/auth/logout', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ sessionId: input.sessionId })
					});
				}),
				input: ({ context }) => ({ sessionId: context.sessionId }),
				onDone: { target: 'unauthenticated' },
				onError: { target: 'unauthenticated' }
			}
		},

		expired: {
			after: {
				3000: { target: 'unauthenticated' }
			}
		}
	}
});
