#!/usr/bin/env zx

import { $, chalk } from 'zx';
import postgres from 'postgres';

// Chat Session Persistence and Embedding Script
// Integrates with Redis cache and pgvector for legal chat analysis
console.log(chalk.cyan('💬 Chat Session Persistence & Embeddings v1.0'));

const config = {
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11435',
  embeddingModel: 'nomic-embed-text',
  batchSize: parseInt(process.env.BATCH_SIZE) || 50,
  cacheEnabled: process.env.EMBEDDING_CACHE === 'true',
  redisEnabled: process.env.REDIS_ENABLED === 'true',
};

console.log(chalk.blue('📋 Chat Persistence Configuration:'));
console.log(`   Database: ${config.databaseUrl.split('@')[1]}`);
console.log(`   Redis: ${config.redisEnabled ? 'Enabled' : 'Disabled'}`);
console.log(`   Embedding Cache: ${config.cacheEnabled ? 'Enabled' : 'Disabled'}`);
console.log(`   Batch Size: ${config.batchSize}`);

// Database connection
const sql = postgres(config.databaseUrl, {
  host: 'localhost',
  port: 5434,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: '123456',
  max: 3,
});

// Redis connection (optional)
let redis = null;
if (config.redisEnabled) {
  try {
    const { createClient } = await import('redis');
    redis = createClient({ url: config.redisUrl });
    await redis.connect();
    console.log(chalk.green('✅ Redis connection established'));
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Redis unavailable: ${error.message}`));
    config.redisEnabled = false;
  }
}

// Generate embedding with caching
async function generateEmbeddingWithCache(text, cacheKey = null) {
  try {
    // Check Redis cache first
    if (config.redisEnabled && redis && cacheKey) {
      const cached = await redis.get(`embedding:${cacheKey}`);
      if (cached) {
        console.log(chalk.gray(`📋 Using cached embedding for: ${text.slice(0, 50)}...`));
        return JSON.parse(cached);
      }
    }

    // Generate new embedding
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.embeddingModel,
        prompt: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.embedding;

    // Cache the result
    if (config.redisEnabled && redis && cacheKey && embedding) {
      await redis.setEx(`embedding:${cacheKey}`, 3600, JSON.stringify(embedding)); // 1 hour cache
      console.log(chalk.gray(`💾 Cached embedding for: ${text.slice(0, 50)}...`));
    }

    return embedding;
  } catch (error) {
    console.error(chalk.red(`❌ Error generating embedding: ${error.message}`));
    return null;
  }
}

// Process chat messages without embeddings
async function processChatEmbeddings() {
  console.log(chalk.cyan('\n💬 Processing chat messages for embeddings...'));

  try {
    // Get messages without embeddings
    const messagesWithoutEmbeddings = await sql`
      SELECT id, content, role, session_id, created_at
      FROM chat_messages
      WHERE embedding IS NULL
      ORDER BY created_at DESC
      LIMIT ${config.batchSize * 2}
    `;

    console.log(
      chalk.blue(`Found ${messagesWithoutEmbeddings.length} messages without embeddings`)
    );

    if (messagesWithoutEmbeddings.length === 0) {
      console.log(chalk.yellow('All chat messages already have embeddings'));
      return;
    }

    let processed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < messagesWithoutEmbeddings.length; i += config.batchSize) {
      const batch = messagesWithoutEmbeddings.slice(i, i + config.batchSize);
      console.log(
        chalk.cyan(
          `\nProcessing batch ${Math.floor(i / config.batchSize) + 1}/${Math.ceil(messagesWithoutEmbeddings.length / config.batchSize)}`
        )
      );

      for (const message of batch) {
        try {
          console.log(
            chalk.gray(`Processing ${message.role} message: ${message.content.slice(0, 100)}...`)
          );

          // Generate cache key based on content hash
          const cacheKey = Buffer.from(message.content).toString('base64').slice(0, 32);

          // Generate embedding
          const embedding = await generateEmbeddingWithCache(message.content, cacheKey);

          if (embedding) {
            // Update database with embedding
            await sql`
              UPDATE chat_messages 
              SET embedding = ${sql`${JSON.stringify(embedding)}::vector`}
              WHERE id = ${message.id}
            `;

            processed++;
            console.log(chalk.green(`  ✅ Added embedding to ${message.role} message`));
          } else {
            errors++;
            console.log(chalk.red(`  ❌ Failed to generate embedding for message`));
          }
        } catch (error) {
          errors++;
          console.log(chalk.red(`  ❌ Error processing message: ${error.message}`));
        }

        // Small delay to prevent overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Delay between batches
      if (i + config.batchSize < messagesWithoutEmbeddings.length) {
        console.log(chalk.gray('⏳ Waiting before next batch...'));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(chalk.cyan(`\n📊 Chat Embedding Processing Complete:`));
    console.log(chalk.green(`   ✅ Successfully processed: ${processed}`));
    console.log(chalk.red(`   ❌ Errors: ${errors}`));
  } catch (error) {
    console.error(chalk.red(`❌ Error in chat embedding processing: ${error.message}`));
  }
}

// Analyze chat session patterns
async function analyzeChatSessions() {
  console.log(chalk.cyan('\n📊 Analyzing chat session patterns...'));

  try {
    // Get session statistics
    const sessionStats = await sql`
      SELECT 
        cs.id,
        cs.title,
        cs.created_at,
        COUNT(cm.id) as message_count,
        COUNT(CASE WHEN cm.embedding IS NOT NULL THEN 1 END) as embedded_messages,
        COUNT(CASE WHEN cm.role = 'user' THEN 1 END) as user_messages,
        COUNT(CASE WHEN cm.role = 'assistant' THEN 1 END) as assistant_messages
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cs.id = cm.session_id
      GROUP BY cs.id, cs.title, cs.created_at
      ORDER BY cs.created_at DESC
      LIMIT 20
    `;

    console.log(chalk.blue(`\n📈 Session Analysis (${sessionStats.length} recent sessions):`));

    for (const session of sessionStats) {
      const embeddingPercent =
        session.message_count > 0
          ? Math.round((session.embedded_messages / session.message_count) * 100)
          : 0;

      console.log(chalk.cyan(`\n  📁 ${session.title || 'Untitled Session'}`));
      console.log(chalk.gray(`     Session ID: ${session.id}`));
      console.log(
        chalk.gray(
          `     Messages: ${session.message_count} (${session.user_messages} user, ${session.assistant_messages} assistant)`
        )
      );
      console.log(
        chalk.gray(
          `     Embeddings: ${session.embedded_messages}/${session.message_count} (${embeddingPercent}%)`
        )
      );
      console.log(chalk.gray(`     Created: ${new Date(session.created_at).toLocaleString()}`));

      if (embeddingPercent < 100 && session.message_count > 0) {
        console.log(
          chalk.yellow(
            `     ⚠️  ${session.message_count - session.embedded_messages} messages need embeddings`
          )
        );
      } else if (session.message_count > 0) {
        console.log(chalk.green(`     ✅ All messages have embeddings`));
      }
    }

    // Overall statistics
    const overallStats = await sql`
      SELECT 
        COUNT(DISTINCT cs.id) as total_sessions,
        COUNT(cm.id) as total_messages,
        COUNT(CASE WHEN cm.embedding IS NOT NULL THEN 1 END) as embedded_messages,
        AVG(CASE WHEN cs.created_at > NOW() - INTERVAL '7 days' THEN 1.0 ELSE 0 END) as recent_activity
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cs.id = cm.session_id
    `;

    const stats = overallStats[0];
    const embeddingCoverage =
      stats.total_messages > 0
        ? Math.round((stats.embedded_messages / stats.total_messages) * 100)
        : 0;

    console.log(chalk.cyan(`\n📊 Overall Chat System Statistics:`));
    console.log(chalk.blue(`   📁 Total Sessions: ${stats.total_sessions}`));
    console.log(chalk.blue(`   💬 Total Messages: ${stats.total_messages}`));
    console.log(
      chalk.blue(`   🔢 Embedded Messages: ${stats.embedded_messages} (${embeddingCoverage}%)`)
    );
    console.log(
      chalk.blue(
        `   📈 Recent Activity: ${Math.round(stats.recent_activity * 100)}% sessions from last 7 days`
      )
    );
  } catch (error) {
    console.error(chalk.red(`❌ Error in session analysis: ${error.message}`));
  }
}

// Cache session metadata in Redis
async function cacheSessionMetadata() {
  if (!config.redisEnabled || !redis) {
    console.log(chalk.yellow('⚠️  Redis not available, skipping metadata caching'));
    return;
  }

  console.log(chalk.cyan('\n💾 Caching session metadata in Redis...'));

  try {
    // Get recent sessions with their message counts
    const recentSessions = await sql`
      SELECT 
        cs.id,
        cs.title,
        cs.metadata,
        cs.created_at,
        cs.updated_at,
        COUNT(cm.id) as message_count,
        MAX(cm.created_at) as last_message_at
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cs.id = cm.session_id
      WHERE cs.created_at > NOW() - INTERVAL '30 days'
      GROUP BY cs.id, cs.title, cs.metadata, cs.created_at, cs.updated_at
      ORDER BY cs.updated_at DESC
    `;

    console.log(chalk.blue(`Caching metadata for ${recentSessions.length} recent sessions`));

    let cached = 0;

    for (const session of recentSessions) {
      try {
        const metadata = {
          id: session.id,
          title: session.title,
          message_count: session.message_count,
          created_at: session.created_at,
          updated_at: session.updated_at,
          last_message_at: session.last_message_at,
          metadata: session.metadata || {},
          cached_at: new Date().toISOString(),
        };

        await redis.setEx(`session:${session.id}`, 1800, JSON.stringify(metadata)); // 30 minute cache
        cached++;
      } catch (error) {
        console.log(chalk.red(`❌ Error caching session ${session.id}: ${error.message}`));
      }
    }

    console.log(chalk.green(`✅ Cached metadata for ${cached} sessions`));
  } catch (error) {
    console.error(chalk.red(`❌ Error in metadata caching: ${error.message}`));
  }
}

// Main execution
async function main() {
  try {
    const startTime = Date.now();

    // Test connections
    console.log(chalk.cyan('\n🔧 Testing system connections...'));

    await fetch(`${config.ollamaUrl}/api/tags`);
    console.log(chalk.green('✅ Ollama API available'));

    await sql`SELECT 1 as test`;
    console.log(chalk.green('✅ Database connection active'));

    // Process chat embeddings
    await processChatEmbeddings();

    // Analyze sessions
    await analyzeChatSessions();

    // Cache metadata
    await cacheSessionMetadata();

    const duration = Date.now() - startTime;
    console.log(
      chalk.cyan(`\n🎯 Chat persistence processing complete in ${Math.round(duration / 1000)}s`)
    );
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error in chat processing:'), error);
    process.exit(1);
  } finally {
    await sql.end();
    if (redis) {
      await redis.disconnect();
    }
  }
}

// Error handling
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️  Shutting down chat processor...'));
  await sql.end();
  if (redis) {
    await redis.disconnect();
  }
  process.exit(130);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unhandled rejection:'), error);
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});
