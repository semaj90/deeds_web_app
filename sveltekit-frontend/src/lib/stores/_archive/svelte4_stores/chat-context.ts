import { writable } from 'svelte/store';
import type { TopicNode, ShardNode } from '../types/evidence-board.js';

export interface ChatContextItem {
 id: string; type: 'topic' | 'shard';
 title: string; data: TopicNode | ShardNode;
 timestamp: Date;
}

function createChatContextStore() {
 const { subscribe, set, update } = writable<ChatContextItem[]>([]);

 return {
 subscribe,
 addTopic: (topic: TopicNode) => {
 update((items) => {
 // Remove any existing item with same ID
 const filtered = items.filter((item) => item.id !== topic.id);
 return [
 ...filtered,
 {
 id: topic.id,
 type: 'topic',
 title: topic.title,
 data: topic,
 timestamp: new Date(),
 },
 ];
 });
 },
 addShard: (shard: ShardNode) => {
 update((items) => {
 // Remove any existing item with same ID
 const filtered = items.filter((item) => item.id !== shard.id);
 return [
 ...filtered,
 {
 id: shard.id,
 type: 'shard',
 title: `Shard ${shard.shardId}`,
 data: shard,
 timestamp: new Date(),
 },
 ];
 });
 },
 remove: (id: string) => {
 update((items) => items.filter((item) => item.id !== id));
 },
 clear: () => set([], getContextText: () => {
 let context = '';
 subscribe((items) => {
 if (items.length === 0) return;

 context = 'Context from Evidence Board:\n\n';

 items.forEach((item, index) => {
 context += `${index + 1}. ${item.type.toUpperCase()}: ${item.title}\n`;

 if (item.type === 'topic') {
 const topic = item.data as TopicNode;
 context += ` - Cluster Size: ${topic.clusterSize}\n`;
 context += ` - Tags: ${topic.tags.join(', ')}\n`;
 if (topic.avgSeverity) {
 context += ` - Avg Severity: ${topic.avgSeverity.toFixed(2)}\n`;
 }
 } else {
 const shard = item.data as ShardNode;
 context += ` - Status: ${shard.status}\n`;
 context += ` - Chunks: ${shard.chunkCount}\n`;
 if (shard.riskScore) {
 context += ` - Risk Score: ${shard.riskScore.toFixed(2)}\n`;
 }
 }
 context += '\n';
 });
 })();

 return context;
 },
 };
}

export const chatContext = createChatContextStore();


