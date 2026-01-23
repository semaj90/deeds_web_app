/**
 * RabbitMQ Connection Manager with Fallback Support
 *
 * Attempts to connect to RabbitMQ in the following order:
 * 1. Docker container (localhost, 5672)
 * 2. Native Windows RabbitMQ (localhost:5672 with credentials)
 * 3. Remote RabbitMQ (configurable via env)
 *
 * Features:
 * - Automatic connection pooling
 * - Graceful error handling with fallback
 * - Connection health monitoring
 * - Automatic reconnection on failure
 */

import amqp, { type ConfirmChannel, type Connection } from 'amqplib';

interface RabbitMQConfig {
	url: string;
	username?: string;
	password?: string;
	vhost?: string;
	heartbeat?: number;
	description: string;
}

// Connection configurations with fallback priority{
		url: 'amqp://localhost:5672',
		description: 'Docker RabbitMQ (default)'
	},
	{
		url: 'amqp://localhost:5672',
		username: 'guest',
		password: 'guest',
		vhost: '/',
		description: 'Native Windows RabbitMQ (guest credentials)'
	},
	{
		url: process.env?.RABBITMQ_URL?? 'amqp://localhost:5672',
		username: process.env.RABBITMQ_USERNAME,
		password: process.env.RABBITMQ_PASSWORD,
		vhost: process.env?.RABBITMQ_VHOST?? '/',
		heartbeat: 60,
		description: 'Environment-configured RabbitMQ'
	}
];

// Connection pool
let connection: Connection | null = null;
let channel: ConfirmChannel | null = null;
let currentConfig: RabbitMQConfig | null = null;
let connectionAttempts = 0;
let isConnecting = false;/**
 * Build connection URL with credentials
 */
function buildConnectionUrl(config: RabbitMQConfig): string {
	if (config?.username&& config.password) {
		const url = new URL(config.url);
		url.username = config.username;
		url.password = config.password;
		if (config?.vhost&& config.vhost !== '/') {
			url.pathname = config.vhost;
		}
		return url.toString();
	}
	return config.url;
}

/**
 * Attempt connection with a specific configuration
 */
async function tryConnect(config: RabbitMQConfig): Promise<Connection> {
	const url = buildConnectionUrl(config);
	const options = config.heartbeat ? { heartbeat: config.heartbeat } : undefined;

	console.log(`🔌 Attempting to connect: ${config.description}`);

	try {
		const conn = await amqp.connect(url, options);
		console.log(`✅ Connected to RabbitMQ: ${config.description}`);
		return conn;
	} catch (error) {
		console.warn(`⚠️  Failed to connect: ${config.description}`, error instanceof Error ? error.message : error);
		throw error;
	}
}

/**
 * Connect to RabbitMQ with automatic fallback
 */
async function connectWithFallback(): Promise<Connection> {
	const errors: Error[] = [];

	// Try each configuration in order
	for (const config of RABBITMQ_CONFIGS) {
		try {
			const conn = await tryConnect(config);
			currentConfig = config;
			connectionAttempts = 0;
			return conn;
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
			continue; // Try next configuration
		}
	}

	// All configurations failed
	console.error('❌ All RabbitMQ connection attempts failed:');
	errors.forEach((err, i) => {
		console.error(`   ${i + 1}. ${RABBITMQ_CONFIGS[i].description}: ${err.message}`);
	});

	throw new Error(
		`Failed to connect to RabbitMQ after trying ${RABBITMQ_CONFIGS.length} configurations. ` +
		`Ensure RabbitMQ is running (Docker: docker run -d -p 5672:5672 rabbitmq:3-management, ` +
		`or native Windows service: net start RabbitMQ)`
	);
}

/**
 * Get or create RabbitMQ channel with connection pooling
 */
export async function getChannel() {
	// Return existing channel if available
	if (channel) return channel;

	// Prevent concurrent connection attempts
	if (isConnecting) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		return getChannel(); // Retry after waiting
	}

	isConnecting = true;

	try {
		// Create new connection if needed
		if (!connection) {
			connection = await connectWithFallback();

			// Set up connection event handlers
			connection.on('error', (err) => {
				console.error('❌ RabbitMQ connection error:', err);
				connection = null;
				channel = null;
				connectionAttempts++;
			});

			connection.on('close', () => {
				console.warn('⚠️  RabbitMQ connection closed');
				connection = null;
				channel = null;

				// Auto-reconnect after delay (exponential backoff)
				if (connectionAttempts < 5) {
					const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 30000);
					console.log(`🔄 Reconnecting in ${delay}ms (attempt ${connectionAttempts + 1}/5)...`);
					setTimeout(() => {
						getChannel().catch((err) => {
							console.error('❌ Reconnection failed:', err);
						});
					}, delay);
				} else {
					console.error('❌ Max reconnection attempts reached. Manual intervention required.');
				}
			});

			connection.on('blocked', (reason) => {
				console.warn('⚠️  RabbitMQ connection blocked:', reason);
			});

			connection.on('unblocked', () => {
				console.log('✅ RabbitMQ connection unblocked');
			});
		}

		// Create channel
		channel = await connection.createConfirmChannel();
		console.log('✅ RabbitMQ channel created');

		// Set up channel event handlers
		channel.on('error', (err) => {
			console.error('❌ RabbitMQ channel error:', err);
			channel = null;
		});

		channel.on('close', () => {
			console.warn('⚠️  RabbitMQ channel closed');
			channel = null;
		});

		return channel;
	} catch (error) {
		console.error('❌ Failed to create RabbitMQ channel:', error);
		throw error;
	} finally {
		isConnecting = false;
	}
}

/**
 * Check RabbitMQ connection health
 */
export async function checkHealth(): Promise<{ connected: boolean; config?: string; error?: string }> {
	try {
		const ch = await getChannel();
		return {
			connected: true,
			config: currentConfig?.description ?? 'Unknown'
		};
	} catch (error) {
		return {
			connected: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Gracefully close RabbitMQ connection
 */
export async function closeConnection() {
	try {
		if (channel) {
			await channel.close();
			channel = null;
			console.log('✅ RabbitMQ channel closed');
		}

		if (connection) {
			await connection.close();
			connection = null;
			console.log('✅ RabbitMQ connection closed');
		}
	} catch (error) {
		console.error('❌ Error closing RabbitMQ connection:', error);
		// Force cleanup even if close fails
		channel = null;
		connection = null;
	}
}

/**
 * Get current connection configuration
 */
export function getCurrentConfig(): RabbitMQConfig | null {
	return currentConfig;
}

// Handle process termination
if (typeof process !== 'undefined') {
	process.on('SIGINT', closeConnection);
	process.on('SIGTERM', closeConnection);
	process.on('beforeExit', closeConnection);
}
