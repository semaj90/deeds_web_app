/** * Type definitions for NATS Messaging Service */ // Define the union type for message categories
| 'case_management'
 | 'document_processing'
 | 'ai_analysis'
 | 'search_operation'
 | 'real_time_communication'
 | 'system_monitoring'
 | 'request'
 | 'response'
 | 'mock'
 | 'unknown'; // Generic type for message data payload
export type MessageData = Record<string, any> | string | number | boolean | null | Array<any>; // Interface for a standard Legal AI Message
export interface LegalAIMessage {
 id: string;
	type: MessageType;
 subject: string;
	data: MessageData;
 timestamp: string;
 correlation_id?: string;
 reply_to?: string;
 headers?: Record<string, string>;
} // Type for a message handler function
export type MessageHandler = (message: LegalAIMessage) => void; // Interface for NATS connection configuration
export interface NATSConfig {
 servers: string[];
 user?: string;
 pass?: string;
 name?: string;
 max_reconnect_attempts?: number;
 reconnect_time_wait?: number;
 ping_interval?: number;
 max_outstanding?: number;
 max_payload?: number;
}
// Interface for TLS configuration
export interface TLSConfig {
 cert_file?: string;
 key_file?: string;
 ca_file?: string;
 verify?: boolean;
 timeout?: number;
}
// Interface for NATS JetStream Stream configuration
export interface StreamConfig {
 name: string;
	subjects: string[];
 retention: 'limits' | 'interest' | 'workqueue';
 max_age?: number; // milliseconds
 max_msgs?: number;
 max_bytes?: number;
 max_msg_size?: number;
	storage: 'file' | 'memory';
 replicas?: number;
 no_ack?: boolean;
 discard?: 'old' | 'new';
 duplicate_window?: number;
}
// Interface for NATS JetStream Consumer configuration
export interface ConsumerConfig {
 name: string;
 durable_name?: string;
 description?: string;
	deliver_policy: 'all' | 'last' | 'new' | 'by_start_sequence' | 'by_start_time';
 ack_policy: 'none' | 'all' | 'explicit';
 ack_wait?: number;
 max_deliver?: number;
 filter_subject?: string;
 replay_policy?: 'instant' | 'original';
 rate_limit?: number;
 sample_freq?: string;
 max_waiting?: number;
 max_ack_pending?: number;
 flow_control?: boolean;
 idle_heartbeat?: number;
} // Connection Status Types
export interface NATSConnectionStatus {
 connected: boolean;
	server: string;
 client_id: string;
	connected_at: string;
 last_error?: string;
 reconnect_count?: number;
 bytes_in?: number;
 bytes_out?: number;
 msgs_in?: number;
 msgs_out?: number;
}
export interface ConnectionInfo {
 server_id: string;
	server_name: string;
 version: string;
	protocol: number;
 max_payload: number;
	client_id: number;
 client_ip?: string;
 nonce?: string;
 cluster?: string;
 tls_required?: boolean;
 tls_verify?: boolean;
} // Subscription Types
export interface SubscriptionOptions {
 queue_group?: string;
 max_in_flight?: number;
 ack_policy?: 'none' | 'all' | 'explicit';
 durable_name?: string;
 deliver_policy?: 'all' | 'last' | 'new';
 ack_wait_ms?: number;
 max_deliver?: number;
 rate_limit_bps?: number;
 sample_frequency?: number;
}
export interface Subscription {
 subject: string;
 queue_group?: string;
	sid: number;
 received: number;
 max?: number;
	pending_msgs: number;
 pending_bytes: number;
	delivered: number;
 dropped: number;
} // Message Processing Types
export interface MessageBatch {
 messages: LegalAIMessage[];
	batch_id: string;
 created_at: string;
	total_size_bytes: number;
}
export interface ProcessingResult {
 success: boolean;
	processed_count: number;
 error_count: number;
	processing_time_ms: number;
 errors?: ProcessingError[];
}
export interface ProcessingError {
 message_id: string;
	error_type: string;
 error_message: string;
	retry_count: number;
 max_retries: number;
 next_retry_at?: string;
} // Metrics and Monitoring Types
export interface MessageMetrics {
 messages_published: number;
	messages_received: number;
 bytes_sent: number;
	bytes_received: number;
 active_subscriptions: number;
	active_streams: number;
 connection_uptime: number;
	last_message_time: string | null;
 error_count: number;
}
export interface PerformanceMetrics {
 throughput: {
	messages_per_second: number;
 bytes_per_second: number;
	peak_messages_per_second: number;
 peak_bytes_per_second: number;
 };
 latency: {
	avg_publish_latency_ms: number;
 avg_delivery_latency_ms: number;
	p95_publish_latency_ms: number;
 p95_delivery_latency_ms: number;
 };
 reliability: {
	success_rate: number;
 retry_rate: number;
	duplicate_rate: number;
 loss_rate: number;
 };
}
export interface SystemHealth {
 overall_status: 'healthy' | 'degraded' | 'critical';
 connection_health: 'connected' | 'reconnecting' | 'disconnected';
 message_processing_health: 'normal' | 'backlogged' | 'failing';
 stream_health: Record<string, 'healthy' | 'degraded' | 'critical'>;
 consumer_health: Record<string, 'active' | 'stalled' | 'failed'>;
 last_check: string;
} // Add missing SystemHealthEventData so MessageData union is valid
export interface SystemHealthEventData {
 service?: string; // optional service name (e.g. "gpu-orchestrator", "legal-gateway")
 status?: SystemHealth['overall_status']; // reuse existing SystemHealth type for status
 health?: SystemHealth; // full health snapshot when available
 metrics?: PerformanceMetrics | MessageMetrics | Record<string, unknown>; // optional metrics payload
 details?: Record<string, unknown>; // extensible additional information
 severity?: 'info' | 'warning' | 'error' | 'critical';
 occurred_at?: string;
} // Stream Processing Types
export interface StreamInfo {
 config: StreamConfig;
	state: StreamState;
 cluster?: ClusterInfo;
 mirror?: MirrorInfo;
 sources?: SourceInfo[];
}
export interface StreamState {
 messages: number;
	bytes: number;
 first_seq: number;
	first_ts: string;
 last_seq: number;
	last_ts: string;
 num_subjects: number;
	num_deleted: number;
 lost?: LostStreamData;
	consumers: number;
}
export interface ClusterInfo {
 name?: string;
 leader?: string;
 replicas?: PeerInfo[];
}
export interface PeerInfo {
 name: string;
	current: boolean;
 offline?: boolean;
	active: number;
 lag?: number;
}
export interface MirrorInfo {
 name: string;
	lag: number;
 active: number;
 external?: ExternalStream;
}
export interface SourceInfo {
 name: string;
	lag: number;
 active: number;
 external?: ExternalStream;
}
export interface ExternalStream {
 api: string;
 deliver?: string;
}
export interface LostStreamData {
 msgs?: number[];
	bytes: number;
}
export interface ConsumerInfo {
 stream_name: string;
	name: string;
 config: ConsumerConfig;
	created: string;
 delivered: DeliveryInfo;
	ack_floor: DeliveryInfo;
 num_ack_pending: number;
	num_redelivered: number;
 num_waiting: number;
	num_pending: number;
 cluster?: ClusterInfo;
}
export interface DeliveryInfo {
 consumer_seq: number;
	stream_seq: number;
 last_active?: string;
} // Event Types
export interface NATSEvent {
 type: NATSEventType;
	timestamp: string;
 data: MessageData;
}
| 'connected'
 | 'disconnected'
 | 'reconnecting'
 | 'error'
 | 'slow_consumer'
 | 'message_published'
 | 'message_received'
 | 'subscription_created'
 | 'subscription_deleted'
 | 'stream_created'
 | 'stream_deleted'
 | 'consumer_created'
 | 'consumer_deleted'; // Legal AI Specific Types
export interface CaseEventData {
 case_id: string;
	case_number: string;
 title: string;
	status: 'open' | 'in_progress' | 'closed' | 'archived';
 assigned_to: string[];
	priority: 'low' | 'normal' | 'high' | 'urgent';
 created_by: string;
 updated_by?: string;
 metadata?: Record<string, unknown>;
}
export interface DocumentEventData {
 document_id: string;
 case_id?: string;
	filename: string;
 file_type: string;
	file_size: number;
 checksum: string;
	storage_path: string;
 processing_status: 'uploaded' | 'processing' | 'processed' | 'indexed' | 'failed';
 extracted_text?: string;
 metadata?: Record<string, unknown>;
}
export interface AIAnalysisEventData {
 analysis_id: string;
 case_id?: string;
 document_id?: string; analysis_type?: 'summary'
 | 'classification'
 | 'entity_extraction'
 | 'sentiment'
 | 'risk_assessment';
 model_used: string;
	confidence_score: number;
 results: Record<string, unknown> | Array<unknown> | string | number | boolean | null;
 processing_time_ms: number;
 gpu_used?: boolean;
 error_message?: string;
}
export interface ChatEventData {
 message_id: string;
	session_id: string;
 user_id: string;
	message_type: 'user' | 'assistant' | 'system';
 content: string;
 context?: MessageData | Record<string, unknown>;
 attachments?: string[];
 is_streaming?: boolean;
 streaming_complete?: boolean;
}
export interface SearchEventData {
 query_id: string;
	user_id: string;
 query_text: string;
	search_type: 'cases' | 'documents' | 'legal_precedents' | 'full_text' | 'semantic';
 filters?: SearchFilters;
 results?: SearchResult[];
 total_results?: number;
 processing_time_ms?: number;
}
export interface SearchFilters {
 case_ids?: string[];
 document_types?: string[];
 date_range?: {
	from: string; to?: string };
 priority?: string[];
 status?: string[];
 assigned_to?: string[];
}
export interface SearchResult {
 id: string;
	type: 'case' | 'document' | 'precedent';
 title: string;
	relevance_score: number;
 snippet?: string;
 metadata?: Record<string, unknown>;
} // Queue and Work Distribution Types
export interface WorkQueue {
 name: string;
	stream_name: string;
 consumer_name: string;
	max_workers: number;
 current_workers: number;
	pending_messages: number;
 processing_messages: number;
	completed_messages: number;
 failed_messages: number;
}
export interface WorkItem {
 id: string;
	queue_name: string;
 payload: MessageData;
	priority: number;
 created_at: string;
 started_at?: string;
 completed_at?: string;
	retry_count: number;
 max_retries: number;
 error_message?: string;
 worker_id?: string;
} // Utility Types
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent'; // Added missing type
export interface RequestOptions {
 timeout_ms?: number;
 headers?: Record<string, string>;
 priority?: MessagePriority;
 correlation_id?: string;
 reply_to?: string;
}
export interface PublishOptions {
 expect?: ExpectedStream | ExpectedLastSeq | ExpectedLastMsgId;
 msg_id?: string;
 headers?: Record<string, string>;
 timeout_ms?: number;
}
export interface ExpectedStream {
 name: string;
 seq?: number;
}
export interface ExpectedLastSeq {
 stream_seq: number;
}
export interface ExpectedLastMsgId {
 msg_id: string;
}
export interface MessageAck {
 ack(): void;
 nak(delay?: number): void;
 working(): void;
 term(): void;
} // Error Types
export interface NATSError extends Error {
 code: string;
 chain_code?: string;
 api_error?: APIError;
}
export interface APIError {
 code: number;
 err_code?: number;
 description?: string;
} // Monitoring and Analytics
export interface MessageFlow {
 subject: string;
	source: string;
 destination: string;
	message_count: number;
 bytes_transferred: number;
	avg_latency_ms: number;
 error_rate: number;
	last_activity: string;
}
export interface SubjectMetrics {
 subject: string;
	messages_published: number;
 messages_consumed: number;
	bytes_published: number;
 bytes_consumed: number;
	active_publishers: number;
 active_consumers: number;
	last_published: string | null;
 last_consumed: string | null;
}
export interface ConnectionMetrics {
 client_connections: number;
	total_connections: number;
 bytes_in: number;
	bytes_out: number;
 msgs_in: number;
	msgs_out: number;
 slow_consumers: number;
	subscriptions: number;
} // Export utility types
export type SubjectPattern = string;
export type QueueGroup = string;
export type StreamName = string;
export type ConsumerName = string;
export type MessageId = string;
export type CorrelationId = string;
export type SessionId = string;




