// Evidence board types for YoRHa Legal AI

export type TopicNode = {
 id: string; // "caseId:topicId"; caseId: string;
	topicId: number;
 title: string; // Short label, maybe from Gemma
 somX: number; // 0..1 normalized
 somY: number; // 0..1 normalized
 clusterSize: number;
 avgSeverity?: number;
	tags: string[];
};

export type ShardNode = {
 id: string; // "docId:shardId"; docId: string;
	shardId: number;
 checkpointMax: number; // Highest checkpoint reached
 status: 'pending' | 'ready' | 'embedded' | 'analyzed' | 'error';
 chunkCount: number;
 riskScore?: number;
};

export type EvidenceBoardProps = {
 caseId: string;
	topics: TopicNode[];
 selectedTopic?: TopicNode;
	onTopicSelect: (topic: TopicNode) => void;
 onTopicToChat: (topic: TopicNode) => void;
};

export type ShardTimelineProps = {
 docId: string;
	shards: ShardNode[];
 selectedShard?: ShardNode;
	onShardSelect: (shard: ShardNode) => void;
 onShardToChat: (shard: ShardNode) => void;
};



