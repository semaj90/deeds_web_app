// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatAttachmentSessionUuidV1 } from '$lib/server/chat/chat-session-owner-v1.js';
import { acpKanbanErrorTaskInputV1Schema } from '$lib/server/atlas/kanban-acp-dag-contracts.js';

const documentsReturning = vi.hoisted(() => vi.fn());
const getAuthorizedCase = vi.hoisted(() => vi.fn());
const putObject = vi.hoisted(() => vi.fn());
const publishWhenReady = vi.hoisted(() => vi.fn());
const attachmentReturning = vi.hoisted(() => vi.fn());
const inserts = vi.hoisted(() => [] as Array<{ table: string; values: Record<string, unknown> }>);
const ownerState = vi.hoisted(() => ({
	session: null as { userId: number; caseId: string | null } | null,
	hasMessages: false,
	findFails: false,
	created: [] as Array<{ chatId: string; userId: number; caseId: string | null }>,
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase }));
vi.mock('$lib/server/chat/chat-session-owner-db-v1.js', () => ({
	chatSessionOwnerDepsV1: () => ({
		findSession: async () => {
			if (ownerState.findFails) throw new Error('owner lookup down');
			return ownerState.session;
		},
		hasMessages: async () => ownerState.hasMessages,
		createIfAbsent: async (input: { chatId: string; userId: number; caseId: string | null }) => {
			ownerState.created.push(input);
			ownerState.session ??= { userId: input.userId, caseId: input.caseId };
		},
		canAccessCase: async (caseId: string, userId: number) => Boolean(await getAuthorizedCase(caseId, userId)),
	}),
}));
vi.mock('$lib/server/seaweed-client.js', () => ({
	getSeaweedClient: () => ({
		bucketExists: vi.fn().mockResolvedValue(true),
		makeBucket: vi.fn(),
		putObject,
	}),
}));
vi.mock('$lib/server/queue/rabbitmq-manager-fixed', () => ({ rabbitmq: { publishWhenReady } }));
vi.mock('$lib/server/db/schema-postgres', () => ({
	documents: { name: 'documents' },
	chatDocumentAttachments: { name: 'chat_document_attachments' },
}));
vi.mock('$lib/server/db/client', () => ({
	db: {
		// Staged inserts are committed to `inserts` only if the callback resolves, so a rollback is observable.
		transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
			const staged: Array<{ table: string; values: Record<string, unknown> }> = [];
			const tx = {
				insert: (table: { name: string }) => ({
					values: (values: Record<string, unknown>) => {
						staged.push({ table: table.name, values });
						return { returning: table.name === 'documents' ? documentsReturning : attachmentReturning };
					},
				}),
			};
			const result = await callback(tx);
			inserts.push(...staged);
			return result;
		},
	},
}));

import { POST } from './+server';

const CASE_ID = 'a2b6d51c-5595-4ccd-a86b-ff89c0d349cc';
const BOARD_CHAT = `board-${CASE_ID}`;
const tables = () => inserts.map((entry) => entry.table);

function call(fields: Record<string, string>, user: unknown = { id: 7 }) {
	const form = new FormData();
	form.set('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return POST({
		request: new Request('http://localhost/api/documents/upload', { method: 'POST', body: form }),
		locals: { user },
	} as never);
}

function expectNothingWritten() {
	expect(putObject).not.toHaveBeenCalled();
	expect(inserts).toEqual([]);
	expect(publishWhenReady).not.toHaveBeenCalled();
}

beforeEach(() => {
	inserts.length = 0;
	ownerState.session = null;
	ownerState.hasMessages = false;
	ownerState.findFails = false;
	ownerState.created.length = 0;
	getAuthorizedCase.mockReset().mockResolvedValue({ id: CASE_ID });
	putObject.mockReset().mockResolvedValue(undefined);
	publishWhenReady.mockReset().mockResolvedValue(undefined);
	attachmentReturning.mockReset().mockResolvedValue([{ id: 'att-1' }]);
	documentsReturning.mockReset().mockResolvedValue([{ id: 'doc' }]);
});

describe('POST /api/documents/upload case and chat-session handling', () => {
	it('requires a real authenticated actor and touches nothing without one', async () => {
		for (const user of [null, { id: 'abc' }, { id: 0 }]) {
			expect((await call({ sessionId: BOARD_CHAT }, user)).status).toBe(401);
		}
		expectNothingWritten();
	});

	it('rejects a case the actor cannot access before the chat session, storage, database or queue is touched', async () => {
		getAuthorizedCase.mockResolvedValue(null);
		const response = await call({ sessionId: BOARD_CHAT, caseId: CASE_ID });
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: 'Case not found' });
		expect(ownerState.created).toEqual([]);
		expectNothingWritten();
	});

	it('claims a new chat session for the actor and links the attachment through the deterministic key', async () => {
		const response = await call({ sessionId: BOARD_CHAT, caseId: CASE_ID });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ success: true, attachmentId: 'att-1', attachmentLinked: true });
		expect(body).not.toHaveProperty('attachmentWarning');
		expect(ownerState.created).toEqual([{ chatId: BOARD_CHAT, userId: 7, caseId: CASE_ID }]);
		expect(tables()).toEqual(['documents', 'chat_document_attachments']);
		const attachment = inserts[1].values;
		expect(attachment.chat_session_id).toBe(chatAttachmentSessionUuidV1(BOARD_CHAT));
		expect(attachment.metadata).toMatchObject({ caseId: CASE_ID, chatId: BOARD_CHAT, uploadedBy: 7 });
		expect(publishWhenReady).toHaveBeenCalledWith(
			'document.processing',
			'document.chat.embed',
			expect.objectContaining({ caseId: CASE_ID, userId: 7, sessionId: BOARD_CHAT })
		);
	});

	it('links a non-uuid, non-case chat id without a warning and does not consult case access', async () => {
		const response = await call({ sessionId: 'terminal-1' });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ attachmentLinked: true });
		expect(getAuthorizedCase).not.toHaveBeenCalled();
		expect(inserts[1].values.chat_session_id).toBe(chatAttachmentSessionUuidV1('terminal-1'));
	});

	it('accepts a session the actor already owns and does not recreate it', async () => {
		ownerState.session = { userId: 7, caseId: null };
		const response = await call({ sessionId: 'chat_1793428718893_tinxio84' });
		expect(response.status).toBe(200);
		expect(ownerState.created).toEqual([]);
	});

	it('returns a non-disclosing 404 for a session owned by someone else and writes nothing', async () => {
		ownerState.session = { userId: 8, caseId: null };
		const response = await call({ sessionId: 'chat_foreign' });
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: 'Conversation not found' });
		expectNothingWritten();
	});

	it('refuses a session whose case differs from the supplied case', async () => {
		ownerState.session = { userId: 7, caseId: '11111111-2222-4333-8444-555555555555' };
		const response = await call({ sessionId: BOARD_CHAT, caseId: CASE_ID });
		expect(response.status).toBe(404);
		expectNothingWritten();
	});

	it('refuses to claim a legacy chat that has messages but no owner row', async () => {
		ownerState.hasMessages = true;
		const response = await call({ sessionId: 'widget-7vp2uf' });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: 'Legacy chat requires account recovery' });
		expect(ownerState.created).toEqual([]);
		expectNothingWritten();
	});

	it('fails closed with 503 when ownership cannot be verified', async () => {
		ownerState.findFails = true;
		const response = await call({ sessionId: 'chat_x' });
		expect(response.status).toBe(503);
		expectNothingWritten();
	});

	it('fails the request, rolls the document row back and skips the queue when the attachment link fails', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		attachmentReturning.mockRejectedValue(Object.assign(new Error('duplicate key value'), { code: '23505' }));
		const response = await call({ sessionId: BOARD_CHAT, caseId: CASE_ID });
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: 'Failed to link the document to the chat session',
			code: 'ATTACHMENT_LINK_FAILED',
		});
		expect(inserts).toEqual([]); // transaction rolled back: no documents row, no attachment row
		expect(publishWhenReady).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('prints one ACP-ready error line (task input + orphaned object) for the agentic error-fixing path', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		attachmentReturning.mockRejectedValue(Object.assign(new Error('duplicate key value'), { code: '23505' }));
		await call({ sessionId: BOARD_CHAT, caseId: CASE_ID });
		const lines = errorSpy.mock.calls.map((args) => String(args[0])).filter((line) => line.startsWith('[acp-error] '));
		expect(lines).toHaveLength(1);
		const payload = JSON.parse(lines[0].slice(lines[0].indexOf('{')));
		expect(acpKanbanErrorTaskInputV1Schema.safeParse(payload.acpKanbanErrorTaskInput).success).toBe(true);
		expect(payload.acpKanbanErrorTaskInput).toMatchObject({
			relativePath: 'src/routes/api/documents/upload/+server.ts',
			targetAgent: 'a2a-error-fixer',
		});
		expect(payload.acpKanbanErrorTaskInput.errorSignature).toContain('ATTACHMENT_LINK_FAILED: duplicate key value');
		expect(payload.context).toMatchObject({
			route: 'POST /api/documents/upload',
			pgCode: '23505',
			chatId: BOARD_CHAT,
			caseId: CASE_ID,
			published: false,
			rolledBack: ['documents', 'chat_document_attachments'],
		});
		expect(payload.context.orphanedObject).toMatchObject({ bucket: 'documents' });
		expect(payload.context.orphanedObject.key).toMatch(/\/note\.txt$/);
		expect(lines[0]).not.toContain('hello'); // never the file content
		errorSpy.mockRestore();
	});

	it('keeps a document-row failure as the generic upload error, with no ACP attachment report', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		documentsReturning.mockRejectedValue(new Error('documents insert failed'));
		const response = await call({ sessionId: 'terminal-2' });
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'Failed to upload document' });
		expect(inserts).toEqual([]);
		expect(publishWhenReady).not.toHaveBeenCalled();
		expect(errorSpy.mock.calls.some((args) => String(args[0]).startsWith('[acp-error] '))).toBe(false);
		errorSpy.mockRestore();
	});
});
