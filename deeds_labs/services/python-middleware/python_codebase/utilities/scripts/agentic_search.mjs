#!/usr/bin/env node
/**
 * Phase 45 – Agentic Search + Gemma3 RAG bootstrap
 *
 * This script wires LangChain.js with Ollama's `embeddinggemma:latest` model
 * and a handful of utility tools to retrieve documentation snippets,
 * summarize context, and push recommendations into Neo4j.
 *
 * Prerequisites:
 *  - Node.js 18+
 *  - npm install langchain neo4j-driver dotenv chalk
 *  - An Ollama server with embeddinggemma available (see .env additions)
 *
 * Usage:
 *    node scripts/agentic_search.mjs TS2322
 */

import 'dotenv/config.js';
import chalk from 'chalk';
import neo4j from 'neo4j-driver';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { OllamaFunctionsLLM } from 'langchain/llms/ollama';
import { buildTools } from './agentic_tools.mjs';

const REQUIRED_ENV = ['OLLAMA_URL', 'NEO4J_URI', 'NEO4J_USER'];

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  const hasNeo4jPassword =
    process.env.NEO4J_PASS || process.env.NEO4J_PASSWORD;
  if (missing.length) {
    console.error(
      chalk.red(
        `Missing environment variables: ${missing.join(
          ', ',
        )}. Update your .env before running the agent.`,
      ),
    );
    process.exit(1);
  }
  if (!hasNeo4jPassword) {
    console.error(
      chalk.red(
        'Missing Neo4j password. Set NEO4J_PASS or NEO4J_PASSWORD in your .env.',
      ),
    );
    process.exit(1);
  }
}

async function runAgent(errorCode) {
  assertEnv();

  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(
      process.env.NEO4J_USER,
      process.env.NEO4J_PASS || process.env.NEO4J_PASSWORD,
    ),
  );

  const session = driver.session();
  let related = [];
  try {
    const result = await session.run(
      `
        MATCH (e:Error {code:$code})-[:SIMILAR_TO]->(e2:Error)
        RETURN e2.code AS code, e2.message AS message
        ORDER BY e2.score DESC
        LIMIT 5
      `,
      { code: errorCode },
    );
    related = result.records.map((record) => ({
      code: record.get('code'),
      message: record.get('message'),
    }));
  } catch (err) {
    console.warn(
      chalk.yellow(
        `Neo4j lookup failed (continuing with empty context): ${err.message}`,
      ),
    );
  } finally {
    await session.close();
  }

  const llm = new OllamaFunctionsLLM({
    baseUrl: process.env.OLLAMA_URL,
    model: process.env.AGENTIC_MODEL || 'gemma3-legal:latest',
    temperature: Number(process.env.AGENTIC_TEMPERATURE || 0.3),
  });

  const tools = await buildTools();
  const agent = await initializeAgentExecutorWithOptions(tools, llm, {
    agentType: 'openai-functions',
    verbose: Boolean(process.env.AGENTIC_DEBUG === 'true'),
  });

  const context = `TypeScriptError: ${errorCode}
RelatedErrors: ${JSON.stringify(related, null, 2)}
PreferredOutput: concise fix explanation + snippet`;

  console.log(chalk.cyan('🧠 Running Agentic Search...\n'));
  const response = await agent.call({ input: context });
  console.log(chalk.green('Agent suggestion:\n'));
  console.log(response.output);

  // Optional: persist recommendation back into Neo4j
  if (process.env.AGENTIC_PERSIST !== 'false') {
    const writeSession = driver.session();
    try {
      await writeSession.run(
        `
          MERGE (f:Fix {error:$code})
          SET f.recommendation = $rec,
              f.updatedAt = datetime()
        `,
        { code: errorCode, rec: response.output },
      );
      console.log(
        chalk.green('✅ Recommendation stored in Neo4j (Fix node updated).'),
      );
    } catch (err) {
      console.warn(chalk.yellow(`Neo4j write failed: ${err.message}`));
    } finally {
      await writeSession.close();
    }
  }

  await driver.close();
}

const [errorCode] = process.argv.slice(2);
if (!errorCode) {
  console.error(
    chalk.red('Usage: node scripts/agentic_search.mjs <TSErrorCode>'),
  );
  process.exit(1);
}

runAgent(errorCode)
  .then(() => {
    console.log(chalk.cyan('\nAgent execution complete.'));
    process.exit(0);
  })
  .catch((err) => {
    console.error(chalk.red(`Agent run failed: ${err.stack || err}`));
    process.exit(1);
  });
