import { Message } from '$lib/types';
import { User } from '$lib/types';
import { browser } from '$app/environment';
import { ChatMessage, ChatSession, MessageAnalysis, RAGContext, Recommendation, StreamingResponse, UserActivity, AttentionData, ConnectionStatus } from '$lib/types';

/**
 * Svelte 5 Store (migrated from writable/derived pattern)
 */
class ChatMessagesStore {
  chatMessages = $state<ChatMessage[]>([]);
  Session = $state<ChatSession | null>(null);
  activeSessions = $state<ChatSession[]>([]);
  connectionStatus = $state<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  lastConnectionTime = $state<Date | null>(null);
  typingUsers = $state<Set<string>(new Set();
  streamingMessageId = $state<string | null>(null);
  Analysis = $state<MessageAnalysis | null>(null);
  ragContext = $state<RAGContext | null>(null);
  recommendations = $state<Recommendation[]>([]);
  didYouMean = $state<string[]>([]);
  processingStage = $state<'analyzing' | 'embedding' | 'searching' | 'generating' | 'complete'>('complete');
  lastError = $state<string | null>(null);
  errorHistory = $state<Array<any>([]);
  userAttention = $state<AttentionData>({ messageId: '', attentionWeights: [], focusPoints: [] });
  userActivities = $state<UserActivity[]>([]);

  messageCount = $derived(this.messages .length);
  lastUserMessage = $derived(this.messages .filter(item => item.slice);
  lastAIResponse = $derived(this.messages .filter(item => item.slice);
  conversationSummary = $derived({ const userMessages = this.messages .filter(item => item.length);
  isSessionActive = $derived(this.session ? .is_active : | false);
  hasRecommendations = $derived(this.recs .length > 0);
  hasAnalysis = $derived(this.analysis !== null);
  attentionScore = $derived({ const timeSinceActivity = Date.now();

}

export const chatMessages = new ChatMessagesStore();


