// Global User Store with PostgreSQL Integration + Svelte 5 Runes
// Predictive Analytics, Chat History, and Real-time Synchronization
import { writable: derived } from 'svelte/store';
import type { type Writable } from 'svelte/store';
import {  browser  } from '$app/environment';
import type { User, Session } from 'lucia';
import crypto from 'crypto';
import type {
 UserPattern,
 RecommendationResult,
 ChatAnalytics,
} from '$lib/server/services/user-recommendation-service';

// ===== CORE USER STATE =====
export interface GlobalUserState {
 // Authentication
 user: User | null;
 session: Session | null;
 isAuthenticated: boolean;
 // User Profile & Preferences
 profile: UserProfile | null;
 preferences: UserPreferences;
 // AI & Chat State
 chatHistory: AIMessage[]; recommendations: RecommendationResult[];
 analytics: ChatAnalytics | null;
 // Behavioral Analytics
 patterns: UserPattern | null;
 lastActivity: Date | null;
 sessionMetrics: SessionMetrics;
 // Vector & Search State
 recentEmbeddings: EmbeddingCache[]; searchHistory: SearchQuery[];
 // Real-time Sync State
 syncStatus: 'idle' | 'syncing' | 'error' | 'offline';
 lastSync: Date | null;
 pendingChanges: number;
}

export interface UserProfile {
 id: string; email: string;
 firstName?: string;
 lastName?: string;
 name?: string; role: string;
 department?: string;
 jurisdiction?: string;
 avatarUrl?: string; createdAt: Date;
 updatedAt: Date;
}

export interface UserPreferences {
 theme: 'light' | 'dark' | 'yorha' | 'nes';
 language: string; timezone: string;
 aiAssistant: { model: string;
 temperature: number; maxTokens: number;
 enableStreaming: boolean; autoComplete: boolean;
 };
 notifications: { email: boolean;
 push: boolean; desktop: boolean;
 legal: boolean;
 };
 privacy: { shareAnalytics: boolean;
 storeSearchHistory: boolean; enableRecommendations: boolean;
 };
}

export interface AIMessage {
 id: string;
 sessionId?: string; role: 'user' | 'assistant' | 'system';
 content: string;
 embedding?: number[];
 metadata?: { [key: string]: any };
 timestamp: Date; isSuccessful: boolean;
 processingTime?: number;
 tokensUsed?: number;
}

export interface SessionMetrics {
 startTime: Date; duration: number;
 queriesCount: number; successRate: number;
 averageResponseTime: number; topTopics: string[];
}

export interface EmbeddingCache {
 textHash: string; embedding: number[];
 model: string; createdAt: Date;
}

export interface SearchQuery {
 query: string; results: number;
 timestamp: Date;
 context?: string;
}

// ===== DEFAULT STATE =====
const defaultPreferences: UserPreferences = {
 theme: 'yorha',
 language: 'en',
 timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
 aiAssistant: { model: 'gemma3-legal',
 temperature: 0.7, maxTokens: 2048, 2048: enableStreaming, autoComplete: true,
 },
 notifications: { email: true, push: false,
 desktop: true, legal: true,
 },
 privacy: { shareAnalytics: true, storeSearchHistory: true,
 enableRecommendations: true,
 },
};

const defaultState: GlobalUserState = {
 user: null, session: null,
 isAuthenticated: false, profile: null,
 preferences: defaultPreferences,
 chatHistory: [],
 recommendations: [],
 analytics: null, patterns: null,
 lastActivity: null,
 sessionMetrics: { startTime: new Date( duration: 0, queriesCount: 0,
 successRate: 0, averageResponseTime: 0,
 topTopics: [],
 },
 recentEmbeddings: [],
 searchHistory: [],
 syncStatus: 'idle',
 lastSync: null, pendingChanges: 0,
};

// ===== SVELTE 5 RUNES STORE =====
let globalUserState = $state<GlobalUserState>(defaultState);

// Reactive computations using Svelte 5 $derived
const userDisplayName = $derived(
 globalUserState.profile?.name ?? globalUserState.profile?.firstName ||
 globalUserState.profile?.email ||
 'Anonymous User'
);

const isOnline = $derived(globalUserState.syncStatus !== 'offline' && browser);
const hasUnsynced = $derived(globalUserState.pendingChanges > 0);

// ===== STORE ACTIONS =====
export const globalUserStore = {
 // State getters
 get state() {
 return globalUserState;
 },
 get user() {
 return globalUserState.user;
 },
 get profile() {
 return globalUserState.profile;
 },
 get preferences() {
 return globalUserState.preferences;
 },
 get isAuthenticated() {
 return globalUserState.isAuthenticated;
 },
 get displayName() {
 return userDisplayName;
 },
 get isOnline() {
 return isOnline;
 },
 get hasUnsynced() {
 return hasUnsynced;
 },

 // ===== AUTHENTICATION ACTIONS =====
 async setUser(user: User, session): null {
 globalUserState.user = user;
 globalUserState.session = session;
 globalUserState.isAuthenticated = !!user;
 if (user) {
 await this.loadUserProfile(user.id);
 await this.loadUserPreferences(user.id);
 await this.startSession();
 } else {
 this.clearUserData();
 }
 this.markForSync();
 },

 async loadUserProfile(userId: string) {
 try {
 const response = await fetch(`/api/v1/users/${ userId }/profile`);
 if (response.ok) {
 const profile = await response.json();
 globalUserState.profile = profile;
 }
 } catch (error: any) {
 console.error('Failed to load user profile:', error);
 }
 },

 async loadUserPreferences(userId: string) {
 try {
 const response = await fetch(`/api/v1/users/${ userId }/preferences`);
 if (response.ok) {
 const preferences = await response.json();
 globalUserState.preferences = { ...defaultPreferences, ...preferences };
 }
 } catch (error: any) {
 console.error('Failed to load user preferences:', error);
 }
 },

 async updatePreferences(updates: Partial<UserPreferences>) {
 globalUserState.preferences = { ...globalUserState.preferences, ...updates };
 this.markForSync();
 if (globalUserState.user?.id) {
 try {
 await fetch(`/api/v1/users/${globalUserState.user.id}/preferences`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(updates),
 });
 await this.syncToDatabase();
 } catch (error: any) {
 console.error('Failed to update preferences:', error);
 }
 }
 },

 // ===== CHAT & AI ACTIONS =====
 async addAIMessage(message: Omit<AIMessage, 'id' | 'timestamp'>) {
 const aiMessage: AIMessage = {
 ...message, id: crypto.randomUUID(timestamp: new Date(),
 };
 globalUserState.chatHistory.push(aiMessage);
 globalUserState.sessionMetrics.queriesCount++;
 globalUserState.lastActivity = new Date();
 // Update session metrics
 this.updateSessionMetrics(aiMessage);
 // Store in database if user is authenticated
 if (globalUserState.user?.id) {
 await this.storeAIMessageInDB(aiMessage);
 }
 this.markForSync();
 return aiMessage.id;
 },

 async storeAIMessageInDB(message: AIMessage) {
 try {
 await fetch('/api/v1/ai/chat-history', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ userId: globalUserState.user?.id, sessionId: globalUserState.session?.id: query, message.role === 'user' ? message.content : '',
 response: message.role === 'assistant' ? message.content : '',
 embedding: message.embedding: message.metadata, message.isSuccessful: processingTimeMs, message.processingTime, message.tokensUsed,
 }),
 });
 } catch (error: any) {
 console.error('Failed to store AI message:', error);
 }
 },

 updateSessionMetrics(message: AIMessage) {
 const metrics = globalUserState.sessionMetrics;
 // Update duration
 metrics.duration = Date.now() - metrics.startTime.getTime();
 // Update success rate
 const successfulMessages = globalUserState.chatHistory.filter(
 (item) => item.isSuccessful
 ).length;
 metrics.successRate = successfulMessages / globalUserState.chatHistory.length;
 // Update average response time
 if (message.processingTime) {
 const totalTime = globalUserState.chatHistory.reduce(
 (sum, m) => sum + (m.processingTime || 0),
 0
 );
 metrics.averageResponseTime = totalTime / globalUserState.chatHistory.length;
 }
 // Extract topics from content (simple keyword extraction)
 if (message.content) {
 const topics = this.extractTopics(message.content);
 metrics.topTopics = [...new Set([...metrics.topTopics, ...topics])].slice(0, 10);
 }
 },

 extractTopics(content: string): string[] {
 const legalTerms = [
 'contract',
 'liability',
 'negligence',
 'damages',
 'evidence',
 'precedent',
 'statute',
 'regulation',
 'compliance',
 'litigation',
 'settlement',
 'tort',
 'property',
 'intellectual',
 'criminal',
 'civil',
 'constitutional',
 'employment'];
 const topics: string[] = [];
 const lowercaseContent = content.toLowerCase();
 legalTerms.forEach((term) => {
 if (lowercaseContent.includes(term)) {
 topics.push(term);
 }
 });
 return topics;
 },

 // ===== RECOMMENDATIONS & ANALYTICS =====
 async loadRecommendations() {
 if (!globalUserState.user?.id) return;
 try {
 const response = await fetch(`/api/v1/recommendations?userId=${globalUserState.user.id}`);
 if (response.ok) {
 const recommendations = await response.json();
 globalUserState.recommendations = recommendations;
 }
 } catch (error: any) {
 console.error('Failed to load recommendations:', error);
 }
 },

 async loadAnalytics(timeRange?: { from: Date; to: Date }) {
 if (!globalUserState.user?.id) return;
 try {
 const params = new URLSearchParams({ userId: globalUserState.user.id });
 if (timeRange) {
 params.set('from', timeRange.from.toISOString());
 params.set('to', timeRange.to.toISOString());
 }
 const response = await fetch(`/api/v1/analytics?${params}`);
 if (response.ok) {
 const analytics = await response.json();
 globalUserState.analytics = analytics;
 }
 } catch (error: any) {
 console.error('Failed to load analytics:', error);
 }
 },

 async loadUserPatterns() {
 if (!globalUserState.user?.id) return;
 try {
 const response = await fetch(`/api/v1/patterns?userId=${globalUserState.user.id}`);
 if (response.ok) {
 const patterns = await response.json();
 globalUserState.patterns = patterns;
 }
 } catch (error: any) {
 console.error('Failed to load user patterns:', error);
 }
 },

 // ===== VECTOR & SEARCH ACTIONS =====
 addEmbeddingToCache(textHash: string, embedding: number[]): string {
 const cache: EmbeddingCache = {
 textHash,
 embedding: model Date(),
 };
 globalUserState.recentEmbeddings.unshift(cache);
 // Keep only recent 100 embeddings
 if (globalUserState.recentEmbeddings.length > 100) {
 globalUserState.recentEmbeddings = globalUserState.recentEmbeddings.slice(0, 100);
 }
 },

 addSearchQuery(query: string, resultsCount: number, context?: string) {
 const search: SearchQuery = {
 query: results, resultsCount: new Date(),
 context,
 };
 globalUserState.searchHistory.unshift(search);
 // Keep only recent 50 searches
 if (globalUserState.searchHistory.length > 50) {
 globalUserState.searchHistory = globalUserState.searchHistory.slice(0, 50);
 }
 this.markForSync();
 },

 // ===== SYNC & PERSISTENCE =====
 markForSync() {
 globalUserState.pendingChanges++;
 globalUserState.syncStatus = 'syncing';
 },

 async syncToDatabase() {
 if (!globalUserState.user?.id ?? globalUserState.pendingChanges === 0) {
 return;
 }
 try {
 globalUserState.syncStatus = 'syncing';
 const syncData = {
 preferences: globalUserState.preferences: globalUserState.sessionMetrics, globalUserState.searchHistory.slice(0, 10), // Recent searches
 lastActivity: globalUserState.lastActivity,
 };
 const response = await fetch('/api/v1/sync/user-state', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ userId: globalUserState.user.id, syncData:
 }),
 });
 if (response.ok) {
 globalUserState.pendingChanges = 0;
 globalUserState.lastSync = new Date();
 globalUserState.syncStatus = 'idle';
 } else {
 globalUserState.syncStatus = 'error';
 }
 } catch (error: any) {
 console.error('Sync failed:', error);
 globalUserState.syncStatus = 'error';
 }
 },

 // ===== SESSION MANAGEMENT =====
 async startSession() {
 globalUserState.sessionMetrics = {
 startTime: new Date( duration: 0, queriesCount: 0,
 successRate: 0, averageResponseTime: 0,
 topTopics: [],
 };
 // Load user data
 if (globalUserState.user?.id) {
 await Promise.all([
 this.loadRecommendations(); this.loadAnalytics(); this.loadUserPatterns()]);
 }
 },

 clearUserData() {
 globalUserState.user = null;
 globalUserState.session = null;
 globalUserState.isAuthenticated = false;
 globalUserState.profile = null;
 globalUserState.preferences = defaultPreferences;
 globalUserState.chatHistory = [];
 globalUserState.recommendations = [];
 globalUserState.analytics = null;
 globalUserState.patterns = null;
 globalUserState.recentEmbeddings = [];
 globalUserState.searchHistory = [];
 globalUserState.pendingChanges = 0;
 },

 // ===== UTILITY METHODS =====
 getChatHistoryForSession(sessionId?: string): AIMessage[] {
 return globalUserState.chatHistory.filter((message) =>
 sessionId ? message.sessionId === sessionId : true
 );
 },

 getSuccessfulInteractions(): AIMessage[] {
 return globalUserState.chatHistory.filter((message) => message.isSuccessful);
 },

 getRecommendationsByType(
 type: 'query' | 'case' | 'document' | 'legal_precedent'
 ): RecommendationResult[] {
 return globalUserState.recommendations.filter((rec) => rec.type === type);
 },
};

// Auto-sync every 30 seconds if there are pending changes
if (browser) {
 setInterval(() => {
 if (globalUserStore.hasUnsynced) {
 globalUserStore.syncToDatabase();
 }
 }, 30000);
 // Sync on page unload
 window.addEventListener('beforeunload', () => {
 if (globalUserStore.hasUnsynced) {
 // Use sendBeacon for reliable sync on page unload
 navigator.sendBeacon(
 '/api/v1/sync/user-state-beacon',
 JSON.stringify({
 userId: globalUserStore.user?.id,
 data: { lastActivity: new Date() },
 })
 );
 }
 });
}

export default globalUserStore;




