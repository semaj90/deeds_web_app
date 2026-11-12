export interface ChatSessionOwnerV1 {
	userId: number;
	caseId: string | null;
}

export interface ChatSessionOwnerDependenciesV1 {
	findSession(chatId: string): Promise<ChatSessionOwnerV1 | null>;
	hasMessages(chatId: string): Promise<boolean>;
	createIfAbsent(input: { chatId: string; userId: number; caseId: string | null }): Promise<void>;
	canAccessCase(caseId: string, userId: number): Promise<boolean>;
}

export type ChatSessionOwnerFailureV1 =
	| 'CHAT_SESSION_NOT_OWNED'
	| 'CHAT_SESSION_LEGACY_OWNER_UNKNOWN'
	| 'CHAT_SESSION_CASE_MISMATCH'
	| 'CHAT_SESSION_OWNER_READBACK_FAILED'
	| 'CHAT_SESSION_CASE_ACCESS_DENIED';

export class ChatSessionOwnerErrorV1 extends Error {
	constructor(readonly code: ChatSessionOwnerFailureV1) {
		super(code);
		this.name = 'ChatSessionOwnerErrorV1';
	}
}

/**
 * Bind a chat ID to its authenticated actor before any history read or stream work.
 * New IDs may be claimed only if they have no metadata or legacy messages; insertion
 * must be conflict-safe and followed by an owner readback to close races.
 */
export async function ensureChatSessionOwnerV1(
	input: { chatId: string; userId: number; caseId: string | null },
	deps: ChatSessionOwnerDependenciesV1
): Promise<ChatSessionOwnerV1> {
	let session = await deps.findSession(input.chatId);

	if (!session) {
		if (await deps.hasMessages(input.chatId)) {
			throw new ChatSessionOwnerErrorV1('CHAT_SESSION_LEGACY_OWNER_UNKNOWN');
		}
		await deps.createIfAbsent(input);
		session = await deps.findSession(input.chatId);
		if (!session) throw new ChatSessionOwnerErrorV1('CHAT_SESSION_OWNER_READBACK_FAILED');
	}

	if (session.userId !== input.userId) {
		throw new ChatSessionOwnerErrorV1('CHAT_SESSION_NOT_OWNED');
	}
	if (input.caseId && session.caseId !== input.caseId) {
		throw new ChatSessionOwnerErrorV1('CHAT_SESSION_CASE_MISMATCH');
	}
	const caseId = session.caseId ?? input.caseId;
	if (caseId && !(await deps.canAccessCase(caseId, input.userId))) {
		throw new ChatSessionOwnerErrorV1('CHAT_SESSION_CASE_ACCESS_DENIED');
	}
	return session;
}
