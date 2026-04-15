import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockShouldEscalateToServer: vi.fn(),
  mockFetchCapabilities: vi.fn(),
  mockSaveChatMessage: vi.fn(),
  mockCacheRouterDecision: vi.fn(),
  mockGetChatHistory: vi.fn(),
  mockUpdateTextEmotion: vi.fn(),
}));

vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$lib/ai/client-router.js', () => ({
  shouldEscalateToServer: mocks.mockShouldEscalateToServer,
  fetchCapabilities: mocks.mockFetchCapabilities,
}));

vi.mock('$lib/ai/client-cache.js', () => ({
  clientCache: {
    saveChatMessage: mocks.mockSaveChatMessage,
    cacheRouterDecision: mocks.mockCacheRouterDecision,
    getChatHistory: mocks.mockGetChatHistory,
    putCartridge: vi.fn(),
  },
}));

vi.mock('$lib/ai/emotion-context.js', () => ({
  updateTextEmotion: mocks.mockUpdateTextEmotion,
  getEmotionSystemPrompt: vi.fn(() => ''),
  getEmotionState: vi.fn(() => ({ composite: { mood: 'focused' } })),
}));

vi.mock('@huggingface/transformers', () => ({
  AutoTokenizer: {
    from_pretrained: vi.fn(async () => ({ encode: vi.fn(() => ({ length: 10 })) })),
  },
}));

vi.mock('onnxruntime-web', () => ({
  Tensor: vi.fn(),
  InferenceSession: { create: vi.fn() },
}));

vi.mock('$lib/ai/onnx/session.js', () => ({
  getOnnxSession: vi.fn(async () => ({ run: vi.fn() })),
  getProviderLabel: vi.fn(() => 'cpu'),
}));

import { ChatSession } from '../src/lib/models/ChatSession.svelte.ts';

function makeAttachmentFile(name: string, text = 'Attachment source text for testing.') {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(text).buffer,
  });
  return file;
}

const serverDecision = {
  source: 'server-ollama',
  reason: 'user-forced-server',
  confidence: 1,
  intent: 'analysis',
} as const;

describe('ChatSession attachment handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mocks.mockShouldEscalateToServer.mockReturnValue(serverDecision);
    mocks.mockFetchCapabilities.mockResolvedValue(null);
    mocks.mockGetChatHistory.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('routes queued attachment previews through server inference with source-hash grounding', async () => {
    const session = new ChatSession('case-abc123', [], true) as any;
    const attachment = makeAttachmentFile('notes.txt', 'First line.\nSecond line.');
    const handleServerInference = vi.fn(async () => undefined);
    const ingestAttachment = vi.fn(async () => ({
      jobId: 'attachment-job-12345678',
      attachmentSourceHash: 'hash-123',
      title: 'Uploaded Notes',
      filename: 'notes.txt',
      extractionMethod: 'utf8',
      contentPreview: 'First line. Second line.',
      indexingStatus: 'queued',
      statusMessage: 'Preview ready, background indexing queued.',
    }));
    const watchAttachmentJob = vi.fn(async () => undefined);

    session._handleServerInference = handleServerInference;
    session._ingestAttachment = ingestAttachment;
    session._watchAttachmentJob = watchAttachmentJob;

    await session.sendMessage('Return the first line of the attachment.', { attachment });

    expect(ingestAttachment).toHaveBeenCalledWith(attachment);
    expect(watchAttachmentJob).toHaveBeenCalledWith('attachment-job-12345678', 'Uploaded Notes');
    expect(mocks.mockUpdateTextEmotion).toHaveBeenCalledWith('Return the first line of the attachment.');

    const messageContents = session.messages.map((message: { content: string }) => message.content);
    expect(messageContents).toContain('Return the first line of the attachment.');
    expect(messageContents).toContain('Indexing attachment: notes.txt');
    expect(messageContents).toContain(
      'Answering from extracted preview while background indexing completes.'
    );
    expect(
      messageContents.some((content: string) =>
        content.includes('Preview ready: Uploaded Notes') &&
        content.includes('via utf8') &&
        content.includes('job 12345678')
      )
    ).toBe(true);

    expect(handleServerInference).toHaveBeenCalledWith(
      expect.stringContaining('ATTACHMENT SOURCE TEXT PROVIDED BELOW'),
      serverDecision,
      expect.objectContaining({
        attachment,
        forceServer: true,
        attachmentSourceHash: 'hash-123',
      })
    );
    expect(handleServerInference.mock.calls[0][0]).toContain(
      'Fresh attachment uploaded just now: "Uploaded Notes".'
    );
    expect(handleServerInference.mock.calls[0][0]).toContain('[ATTACHMENT SOURCE START]');
    expect(session.lastSource).toBe('server-ollama');
  });

  it('surfaces attachment ingest failures and still routes the user prompt', async () => {
    const session = new ChatSession('case-abc123', [], true) as any;
    const attachment = makeAttachmentFile('notes.txt');
    const handleServerInference = vi.fn(async () => undefined);
    const ingestAttachment = vi.fn(async () => {
      throw new Error('Attachment ingest failed upstream');
    });

    session._handleServerInference = handleServerInference;
    session._ingestAttachment = ingestAttachment;

    await session.sendMessage('Summarize this attachment.', { attachment });

    expect(session.error).toBe('Attachment ingest failed upstream');
    expect(session.messages.map((message: { content: string }) => message.content)).toContain(
      'Attachment ingest failed: Attachment ingest failed upstream'
    );
    expect(handleServerInference).toHaveBeenCalledWith(
      'Summarize this attachment.',
      serverDecision,
      expect.objectContaining({ attachment })
    );
  });

  it('announces successful background indexing completion after polling', async () => {
    vi.useFakeTimers();

    const session = new ChatSession('case-abc123', [], true) as any;
    const fetchAttachmentJobStatus = vi.fn(async () => ({
      jobId: 'attachment-job-1',
      status: 'completed',
      step: 'complete',
      progress: 100,
      message: 'Ingest completed.',
    }));

    session._fetchAttachmentJobStatus = fetchAttachmentJobStatus;

    const watchPromise = session._watchAttachmentJob('attachment-job-1', 'Uploaded Notes');
    await vi.advanceTimersByTimeAsync(2000);
    await watchPromise;

    expect(fetchAttachmentJobStatus).toHaveBeenCalledWith('attachment-job-1');
    expect(session.messages.map((message: { content: string }) => message.content)).toContain(
      'Attachment indexed for retrieval: Uploaded Notes'
    );
  });

  it('announces deferred background indexing after polling', async () => {
    vi.useFakeTimers();

    const session = new ChatSession('case-abc123', [], true) as any;
    const fetchAttachmentJobStatus = vi.fn(async () => ({
      jobId: 'attachment-job-1',
      status: 'deferred',
      step: 'deferred',
      progress: 100,
      message: 'Background retrieval indexing deferred because the embedding service timed out.',
    }));

    session._fetchAttachmentJobStatus = fetchAttachmentJobStatus;

    const watchPromise = session._watchAttachmentJob('attachment-job-1', 'Uploaded Notes');
    await vi.advanceTimersByTimeAsync(2000);
    await watchPromise;

    expect(fetchAttachmentJobStatus).toHaveBeenCalledWith('attachment-job-1');
    expect(session.messages.map((message: { content: string }) => message.content)).toContain(
      'Attachment retrieval indexing deferred for Uploaded Notes. Preview-grounded answers remain available.'
    );
  });

  it('announces explicit indexing errors after polling', async () => {
    vi.useFakeTimers();

    const session = new ChatSession('case-abc123', [], true) as any;
    const fetchAttachmentJobStatus = vi.fn(async () => ({
      jobId: 'attachment-job-1',
      status: 'error',
      step: 'error',
      progress: 100,
      message: 'Background indexing failed.',
      error: 'Embedding worker crashed',
    }));

    session._fetchAttachmentJobStatus = fetchAttachmentJobStatus;

    const watchPromise = session._watchAttachmentJob('attachment-job-1', 'Uploaded Notes');
    await vi.advanceTimersByTimeAsync(2000);
    await watchPromise;

    expect(fetchAttachmentJobStatus).toHaveBeenCalledWith('attachment-job-1');
    expect(session.messages.map((message: { content: string }) => message.content)).toContain(
      'Attachment indexing failed after preview extraction: Embedding worker crashed'
    );
  });

  it('falls back after repeated polling failures', async () => {
    vi.useFakeTimers();

    const session = new ChatSession('case-abc123', [], true) as any;
    const fetchAttachmentJobStatus = vi.fn(async () => {
      throw new Error('status unavailable');
    });

    session._fetchAttachmentJobStatus = fetchAttachmentJobStatus;

    const watchPromise = session._watchAttachmentJob('attachment-job-1', 'Uploaded Notes');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await vi.advanceTimersByTimeAsync(2000);
    }
    await watchPromise;

    expect(fetchAttachmentJobStatus).toHaveBeenCalledTimes(5);
    expect(session.messages.map((message: { content: string }) => message.content)).toContain(
      'Attachment indexing status unavailable for Uploaded Notes. Preview-grounded answers are still available.'
    );
  });
});