import { v5 as uuidv5 } from 'uuid';
import { CHAT_ATTACHMENT_SESSION_NAMESPACE_V1 } from '$lib/server/atlas/identity/atlas-uuid-namespaces-v1.js';

/**
 * Deterministic uuid for `chat_document_attachments.chat_session_id`, derived from the exact chat id
 * (case-sensitive, no normalization). Chat ids are free-form strings (`chat_<ts>_<rand>`,
 * `board-<case uuid>`, `terminal-N`, ...) and the column is a uuid, so the raw id can never be stored
 * or compared there. This is a lookup key only, never ownership: callers must have passed
 * `ensureChatSessionOwnerV1` for the same chat id before reading or writing attachments.
 */
export function chatAttachmentSessionUuidV1(chatId: string): string {
	if (typeof chatId !== 'string' || chatId.length === 0 || chatId.length > 200) {
		throw new Error('CHAT_ATTACHMENT_SESSION_CHAT_ID_INVALID');
	}
	return uuidv5(chatId, CHAT_ATTACHMENT_SESSION_NAMESPACE_V1);
}

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
