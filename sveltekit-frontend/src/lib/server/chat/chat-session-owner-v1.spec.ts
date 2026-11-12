import { describe, expect, it, vi } from 'vitest';
import { v5 as uuidv5 } from 'uuid';
import {
	CHAT_ATTACHMENT_SESSION_NAMESPACE_V1,
	ATLAS_ROOT_NAMESPACE_V1,
} from '$lib/server/atlas/identity/atlas-uuid-namespaces-v1.js';
import {
	ChatSessionOwnerErrorV1,
	chatAttachmentSessionUuidV1,
	ensureChatSessionOwnerV1,
} from './chat-session-owner-v1.js';

describe('chatAttachmentSessionUuidV1', () => {
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

	it('keeps the frozen namespace derivation reproducible from the Atlas root', () => {
		expect(uuidv5('atlas:chat-attachment-session:v1', ATLAS_ROOT_NAMESPACE_V1)).toBe(
			CHAT_ATTACHMENT_SESSION_NAMESPACE_V1
		);
	});

	it('is deterministic and returns a valid uuid for every observed chat id shape', () => {
		const shapes = [
			'chat_1793428718893_tinxio84',
			'board-ced1490c-e0ac-4701-b61c-1d23c95d1c37',
			'terminal-1',
			'widget-7vp2uf',
			'conv_1792318363344_4w9xs',
			'chat-session_1793429010109',
			'case-101',
			'case-[id]',
		];
		const seen = new Set<string>();
		for (const shape of shapes) {
			const first = chatAttachmentSessionUuidV1(shape);
			expect(first).toMatch(UUID_RE);
			expect(chatAttachmentSessionUuidV1(shape)).toBe(first);
			seen.add(first);
		}
		expect(seen.size).toBe(shapes.length);
	});

	it('does not normalize: case and whitespace differences yield different keys', () => {
		expect(chatAttachmentSessionUuidV1('Chat-A')).not.toBe(chatAttachmentSessionUuidV1('chat-a'));
		expect(chatAttachmentSessionUuidV1('chat-a ')).not.toBe(chatAttachmentSessionUuidV1('chat-a'));
	});

	it('rejects empty and oversize ids rather than hashing them', () => {
		expect(() => chatAttachmentSessionUuidV1('')).toThrow('CHAT_ATTACHMENT_SESSION_CHAT_ID_INVALID');
		expect(() => chatAttachmentSessionUuidV1('x'.repeat(201))).toThrow(
			'CHAT_ATTACHMENT_SESSION_CHAT_ID_INVALID'
		);
		expect(chatAttachmentSessionUuidV1('x'.repeat(200))).toMatch(UUID_RE);
	});
});

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
