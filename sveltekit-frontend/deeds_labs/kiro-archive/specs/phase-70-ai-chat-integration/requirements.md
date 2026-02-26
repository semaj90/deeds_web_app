# Phase 70: AI Chat Integration - Requirements

## Introduction

Phase 70 implements the AI Chat Integration system, enabling legal professionals to have real-time conversations with an AI legal assistant powered by Gemma-2b-it. The system integrates evidence search results as context, maintains conversation history, enforces legal guardrails, and provides citation linking.

The system integrates:
- Streaming chat responses via SSE
- Evidence context injection from Phase 3B search
- Conversation persistence in Postgres
- Legal guardrails and disclaimers
- Citation linking and evidence memory
- Real-time token-by-token rendering

## Glossary

- **Chat Message**: User or assistant message in conversation
- **Conversation**: Thread of messages for a case
- **Context Window**: Last 10 messages used for LLM context
- **Evidence Context**: Search results injected into prompt
- **Legal Guardrails**: Disclaimers and citation enforcement
- **Citation**: Reference to statute, case, or evidence
- **Evidence Memory**: Tracking of evidence referenced in chat
- **Streaming Response**: Token-by-token response via SSE
- **Gemma-2b-it**: Google's 2B parameter instruction-tuned LLM
- **Prosecutor/Detective**: User roles in chat interface

## Requirements

### Requirement 1: Chat Message Storage

**User Story:** As a legal professional, I want my conversations saved, so that I can reference them later.

#### Acceptance Criteria

1. WHEN a user sends a message, THE system SHALL store message in Postgres with timestamp
2. WHEN a message is stored, THE system SHALL associate message with case_id and user_id
3. WHEN messages are stored, THE system SHALL maintain conversation history with message order
4. WHEN conversation history is retrieved, THE system SHALL return messages in chronological order
5. WHERE message exceeds 5000 characters, THE system SHALL truncate and store full text separately

### Requirement 2: Context Window Management

**User Story:** As a system administrator, I want to limit context size, so that LLM latency stays acceptable.

#### Acceptance Criteria

1. WHEN a chat request is made, THE system SHALL retrieve last 10 messages from conversation
2. WHEN context is prepared, THE system SHALL include user and assistant messages
3. WHEN context exceeds token limit (2048), THE system SHALL truncate oldest messages
4. WHEN context is prepared, THE system SHALL format messages as conversation history
5. WHERE context is insufficient, THE system SHALL use empty context and proceed

### Requirement 3: Evidence Context Injection

**User Story:** As a legal professional, I want evidence search results in chat context, so that the AI can reference them.

#### Acceptance Criteria

1. WHEN a user references evidence in chat, THE system SHALL search for matching evidence
2. WHEN evidence is found, THE system SHALL inject top-3 results into prompt
3. WHEN evidence is injected, THE system SHALL include chunk text and metadata
4. WHEN evidence is injected, THE system SHALL mark evidence as "referenced in chat"
5. WHERE no evidence matches, THE system SHALL proceed without evidence context

### Requirement 4: Streaming Chat Responses

**User Story:** As a user, I want to see responses in real-time, so that I don't wait for full response.

#### Acceptance Criteria

1. WHEN a chat request is submitted, THE system SHALL establish SSE connection
2. WHEN LLM generates tokens, THE system SHALL stream tokens to client
3. WHEN tokens are streamed, THE system SHALL emit token-by-token updates
4. WHEN streaming completes, THE system SHALL emit "done" event with full response
5. WHERE streaming fails, THE system SHALL return error event with message

### Requirement 5: Legal Guardrails

**User Story:** As a legal professional, I want disclaimers and guardrails, so that I understand AI limitations.

#### Acceptance Criteria

1. WHEN chat interface is displayed, THE system SHALL show disclaimer stripe
2. WHEN disclaimer is shown, THE system SHALL state "This assistant cannot determine guilt or innocence"
3. WHEN LLM response is generated, THE system SHALL inject guardrail prefix
4. WHEN response contains claims, THE system SHALL require citation references
5. WHERE response lacks citations, THE system SHALL append "Please verify with official sources"

### Requirement 6: Citation Linking

**User Story:** As a legal professional, I want clickable citations, so that I can quickly reference sources.

#### Acceptance Criteria

1. WHEN LLM response contains statute references, THE system SHALL render as clickable links
2. WHEN statute reference is clicked, THE system SHALL navigate to statute details
3. WHEN response contains case references, THE system SHALL render as clickable links
4. WHEN case reference is clicked, THE system SHALL navigate to case details
5. WHERE reference is ambiguous, THE system SHALL show disambiguation menu

### Requirement 7: Evidence Memory Panel

**User Story:** As a legal professional, I want to see evidence referenced in chat, so that I can track what was used.

#### Acceptance Criteria

1. WHEN evidence is referenced in chat, THE system SHALL add to evidence memory panel
2. WHEN evidence is added, THE system SHALL track relevance score and reference count
3. WHEN evidence memory is displayed, THE system SHALL show top-10 referenced evidence
4. WHEN evidence is clicked, THE system SHALL navigate to evidence details
5. WHERE evidence is no longer relevant, THE system SHALL allow removal from memory

### Requirement 8: Conversation Persistence

**User Story:** As a legal professional, I want to resume conversations, so that I don't lose context.

#### Acceptance Criteria

1. WHEN a conversation is started, THE system SHALL create conversation record in Postgres
2. WHEN messages are added, THE system SHALL update conversation last_updated timestamp
3. WHEN conversation is closed, THE system SHALL persist all messages
4. WHEN conversation is reopened, THE system SHALL load all previous messages
5. WHERE conversation is deleted, THE system SHALL remove all associated messages

### Requirement 9: Chat Performance

**User Story:** As a system administrator, I want chat to be fast, so that users have responsive experience.

#### Acceptance Criteria

1. WHEN a chat request is submitted, THE system SHALL start streaming within 500ms
2. WHEN tokens are streamed, THE system SHALL emit tokens at <100ms intervals
3. WHEN context is prepared, THE system SHALL complete within 100ms
4. WHEN evidence is searched, THE system SHALL complete within 200ms
5. WHERE latency exceeds targets, THE system SHALL log warning with breakdown

### Requirement 10: Chat Error Handling

**User Story:** As a user, I want clear error messages, so that I understand what went wrong.

#### Acceptance Criteria

1. IF LLM service is unavailable, THEN THE system SHALL display "Chat service unavailable"
2. IF evidence search fails, THEN THE system SHALL display "Could not load evidence context"
3. IF message storage fails, THEN THE system SHALL display "Could not save message"
4. IF streaming connection fails, THEN THE system SHALL display "Connection lost"
5. IF user is not authenticated, THEN THE system SHALL display "Please log in to chat"

---

## Summary

Phase 70 implements a complete AI Chat Integration system with:
- Streaming chat responses via SSE
- Evidence context injection from search
- Conversation persistence in Postgres
- Legal guardrails and disclaimers
- Citation linking and evidence memory
- Real-time token-by-token rendering

The system integrates with Phase 3B (Evidence Search) to provide contextual AI assistance for legal professionals.
