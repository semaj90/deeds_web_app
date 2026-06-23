#!/usr/bin/env node
/**
 * Docker-Native Gemma4 Function Tool Calling
 *
 * Executes commands via Docker containers with Gemma4 orchestration:
 *   - Shell commands (bash/sh inside containers)
 *   - TypeScript/JavaScript searches (via Node)
 *   - System commands (via docker exec)
 *   - gRPC calls (protobuffers via grpcurl)
 *   - Gemma4 function tool calling for orchestration
 *
 * Usage:
 *   node docker-gemma4-function-tools.mjs --plan "analyze repo health"
 *   node docker-gemma4-function-tools.mjs --execute (run planned commands)
 *   node docker-gemma4-function-tools.mjs --opencode (OpenCode bash integration)
 */

import { execSync } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const GEMMA4_MODEL = 'gemma4-rotorquant:latest';

// Tool definitions for Gemma4
const TOOLS = [
  {
    name: 'bash_execute',
    description: 'Execute bash command in Docker container',
    parameters: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Docker container name or id' },
        command: { type: 'string', description: 'Bash command to execute' },
      },
      required: ['container', 'command'],
    },
  },
  {
    name: 'typescript_search',
    description: 'Search TypeScript files for patterns',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search' },
        path: { type: 'string', description: 'Path to search in' },
        limit: { type: 'number', description: 'Limit results' },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'system_health',
    description: 'Check Docker container system health',
    parameters: {
      type: 'object',
      properties: {
        container: { type: string', description: 'Container to check' },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Metrics: cpu, memory, disk, network',
        },
      },
    },
  },
  {
    name: 'grpc_call',
    description: 'Call gRPC service via grpcurl',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'gRPC service:port' },
        method: { type: 'string', description: 'Service.Method' },
        message: { type: 'string', description: 'JSON message body' },
      },
      required: ['service', 'method'],
    },
  },
];

// Execute Gemma4 planning with function calling
async function planWithGemma4(goal) {
  console.log(`\n🤖 Gemma4 Planning: "${goal}"`);

  const prompt = `You are a Docker/system orchestration agent. Given this goal:

"${goal}"

Plan the execution as a series of function calls. Use these tools:
${TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Respond with a JSON plan array of function calls.`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMMA4_MODEL,
        prompt,
        stream: false,
        temperature: 0.3,
      }),
    });

    const { response } = await res.json();

    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`   Raw plan: ${response.substring(0, 500)}`);
      return [];
    }

    const plan = JSON.parse(jsonMatch[0]);
    console.log(`   ✓ Generated ${plan.length} steps`);

    return plan;
  } catch (err) {
    console.error(`   Error: ${err.message}`);
    return [];
  }
}

// Execute tool call
async function executeTool(tool) {
  console.log(`\n   [${tool.name}]`);

  try {
    if (tool.name === 'bash_execute') {
      const { container, command } = tool.parameters;
      console.log(`     Container: ${container}`);
      console.log(`     Command: ${command}`);

      const result = execSync(`docker exec ${container} bash -c "${command}"`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      console.log(`     ✓ Output: ${result.substring(0, 200)}`);
      return { status: 'success', output: result };
    }

    if (tool.name === 'typescript_search') {
      const { pattern, path, limit = 10 } = tool.parameters;
      console.log(`     Pattern: ${pattern}`);
      console.log(`     Path: ${path}`);

      try {
        const result = execSync(`rg "${pattern}" ${path} --type ts --max-count ${limit}`, {
          encoding: 'utf-8',
        });

        console.log(`     ✓ Found ${result.split('\n').length - 1} matches`);
        return { status: 'success', matches: result.split('\n').slice(0, 5) };
      } catch (e) {
        console.log(`     ✓ No matches`);
        return { status: 'success', matches: [] };
      }
    }

    if (tool.name === 'system_health') {
      const { container, metrics = ['cpu', 'memory'] } = tool.parameters;
      console.log(`     Container: ${container}`);
      console.log(`     Metrics: ${metrics.join(', ')}`);

      try {
        const stats = execSync(`docker stats ${container} --no-stream --format "{{json .}}"`, {
          encoding: 'utf-8',
        });

        const data = JSON.parse(stats);
        console.log(`     ✓ CPU: ${data.CPUPerc}, Memory: ${data.MemUsage}`);
        return { status: 'success', stats: data };
      } catch (e) {
        console.log(`     ⚠️  Container not running or stats unavailable`);
        return { status: 'error', message: e.message };
      }
    }

    if (tool.name === 'grpc_call') {
      const { service, method, message } = tool.parameters;
      console.log(`     Service: ${service}`);
      console.log(`     Method: ${method}`);

      try {
        const cmd = `grpcurl ${message ? `-d '${message}'` : ''} ${service} ${method}`;
        const result = execSync(cmd, { encoding: 'utf-8' });

        console.log(`     ✓ Response: ${result.substring(0, 100)}`);
        return { status: 'success', response: result };
      } catch (e) {
        console.log(`     ⚠️  gRPC call failed: ${e.message}`);
        return { status: 'error', message: e.message };
      }
    }

    return { status: 'unknown', tool: tool.name };
  } catch (err) {
    console.error(`     ✗ Error: ${err.message}`);
    return { status: 'error', message: err.message };
  }
}

// Execute plan
async function executePlan(plan) {
  console.log(`\n▶️  Executing ${plan.length} steps...`);

  const results = [];

  for (const tool of plan) {
    const result = await executeTool(tool);
    results.push({ tool: tool.name, ...result });
  }

  return results;
}

// OpenCode bash integration (Gemma4 orchestrates bash commands)
async function opencodeMode() {
  console.log(`\n🔗 OpenCode Bash Integration Mode`);
  console.log(`   Gemma4 can orchestrate bash commands via function tools`);
  console.log(`   Supported containers: postgres, redis, qdrant, neo4j, ollama\n`);

  const examples = [
    'Check Postgres schema: SELECT * FROM information_schema.tables',
    'Health check: docker exec postgres pg_isready',
    'List Redis keys: docker exec redis redis-cli KEYS "*"',
    'Query Qdrant: curl http://localhost:6333/collections',
    'Run Neo4j: docker exec neo4j bin/cypher-shell',
  ];

  console.log('Example queries Gemma4 can execute:');
  examples.forEach((ex, i) => console.log(`  ${i + 1}. ${ex}`));

  // Interactive loop (simulated)
  const query = 'Analyze codebase topology and suggest next optimizations';
  console.log(`\n📝 Query: "${query}"`);

  const plan = await planWithGemma4(query);

  if (plan.length > 0) {
    const results = await executePlan(plan);

    // Log results
    fs.writeFileSync('opencode-execution-log.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      query,
      plan_length: plan.length,
      execution_results: results,
    }, null, 2));

    console.log(`\n✅ Execution complete. Log: opencode-execution-log.json`);
  }
}

// Main execution
async function main() {
  const planMode = process.argv.includes('--plan');
  const executeMode = process.argv.includes('--execute');
  const opencodeMode_ = process.argv.includes('--opencode');
  const goalArg = process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--plan') || 'analyze repo topology health';

  console.log(`\n🚀 Docker-Native Gemma4 Function Tools`);
  console.log(`   Gemma4 orchestrates bash/TypeScript/gRPC via function calling\n`);

  if (opencodeMode_) {
    await opencodeMode();
  } else if (planMode) {
    const plan = await planWithGemma4(goalArg);

    if (plan.length > 0) {
      console.log(`\n📋 Generated Plan:`);
      plan.forEach((tool, i) => {
        console.log(`  ${i + 1}. ${tool.name}`);
        if (tool.parameters) {
          Object.entries(tool.parameters).forEach(([key, val]) => {
            console.log(`     ${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`);
          });
        }
      });

      // Save plan
      fs.writeFileSync('gemma4-execution-plan.json', JSON.stringify(plan, null, 2));
      console.log(`\n✅ Plan saved: gemma4-execution-plan.json`);
      console.log(`   Run with: --execute`);
    }
  } else if (executeMode) {
    const planFile = 'gemma4-execution-plan.json';
    if (!fs.existsSync(planFile)) {
      console.error(`Plan file not found: ${planFile}`);
      process.exit(1);
    }

    const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
    const results = await executePlan(plan);

    fs.writeFileSync('gemma4-execution-results.json', JSON.stringify(results, null, 2));
    console.log(`\n✅ Execution complete. Results: gemma4-execution-results.json`);
  } else {
    console.log('Usage:');
    console.log('  node docker-gemma4-function-tools.mjs --plan "goal"   (generate execution plan)');
    console.log('  node docker-gemma4-function-tools.mjs --execute        (execute saved plan)');
    console.log('  node docker-gemma4-function-tools.mjs --opencode       (OpenCode bash integration)\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
