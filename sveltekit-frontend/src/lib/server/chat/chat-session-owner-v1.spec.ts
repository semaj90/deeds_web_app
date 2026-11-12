import { describe, expect, it, vi } from 'vitest';
import { ChatSessionOwnerErrorV1, ensureChatSessionOwnerV1 } from './chat-session-owner-v1.js';

function dependencies(overrides: Record<string, unknown> = {}) {
	const state: { session: { userId: number; caseId: string | null } | null; hasMessages: boolean } = {
		session: null,
		hasMessages: false,
	};
	const deps = {
		findSession: vi.fn(async () => state.session),
		hasMessages: vi.fn(async () => state.hasMessages),
		createIfAbsent: vi.fn(async (input: { userId: number; caseId: string | null }) => {
			state.session ??= { userId: input.userId, caseId: input.caseId };
		}),
		canAccessCase: vi.fn(async () => true),
		...overrides,
	};
	return { deps, state };
}

describe('ensureChatSessionOwnerV1', () => {
	it('claims an empty new session for the authenticated actor and verifies it by readback', async () => {
		const { deps } = dependencies();
		await expect(ensureChatSessionOwnerV1({ chatId: 'chat-new', userId: 7, caseId: null }, deps)).resolves.toEqual({
			userId: 7,
			caseId: null,
		});
		expect(deps.createIfAbsent).toHaveBeenCalledWith({ chatId: 'chat-new', userId: 7, caseId: null });
		expect(deps.findSession).toHaveBeenCalledTimes(2);
	});

	it('rejects a session owned by a different actor', async () => {
		const { deps } = dependencies({ findSession: vi.fn(async () => ({ userId: 8, caseId: null })) });
		await expect(ensureChatSessionOwnerV1({ chatId: 'chat-owned', userId: 7, caseId: null }, deps))
			.rejects.toMatchObject<ChatSessionOwnerErrorV1>({ code: 'CHAT_SESSION_NOT_OWNED' });
		expect(deps.createIfAbsent).not.toHaveBeenCalled();
	});

	it('refuses to claim legacy messages whose owner is unknown', async () => {
		const { deps } = dependencies({ hasMessages: vi.fn(async () => true) });
		await expect(ensureChatSessionOwnerV1({ chatId: 'legacy-chat', userId: 7, caseId: null }, deps))
			.rejects.toMatchObject({ code: 'CHAT_SESSION_LEGACY_OWNER_UNKNOWN' });
		expect(deps.createIfAbsent).not.toHaveBeenCalled();
	});

	it('rejects a different case association and rechecks the current case grant', async () => {
		const caseId = 'a2b6d51c-5595-4ccd-a86b-ff89c0d349cc';
		const mismatch = dependencies({ findSession: vi.fn(async () => ({ userId: 7, caseId: 'other-case' })) });
		await expect(ensureChatSessionOwnerV1({ chatId: 'chat-case', userId: 7, caseId }, mismatch.deps))
			.rejects.toMatchObject({ code: 'CHAT_SESSION_CASE_MISMATCH' });

		const revoked = dependencies({
			findSession: vi.fn(async () => ({ userId: 7, caseId })),
			canAccessCase: vi.fn(async () => false),
		});
		await expect(ensureChatSessionOwnerV1({ chatId: 'chat-case', userId: 7, caseId }, revoked.deps))
			.rejects.toMatchObject({ code: 'CHAT_SESSION_CASE_ACCESS_DENIED' });
	});

	it('fails closed if a conflicting create cannot be read back', async () => {
		const { deps } = dependencies({
			findSession: vi.fn(async () => null),
			createIfAbsent: vi.fn(async () => {}),
		});
		await expect(ensureChatSessionOwnerV1({ chatId: 'chat-race', userId: 7, caseId: null }, deps))
			.rejects.toMatchObject({ code: 'CHAT_SESSION_OWNER_READBACK_FAILED' });
	});
});
