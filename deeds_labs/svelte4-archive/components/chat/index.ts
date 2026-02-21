/** * Chat Components Export * Real-time chat and messaging components */
// // ARCHIVED: export { default as ChatMessage } from './ChatMessage.svelte'; // Session 56: file deleted

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'error';

export interface ChatMessageData {
 id: string;
	role: MessageRole;
 content: string;
	timestamp: Date;
 status?: MessageStatus;
 metadata?: { [key: string]: any };
}