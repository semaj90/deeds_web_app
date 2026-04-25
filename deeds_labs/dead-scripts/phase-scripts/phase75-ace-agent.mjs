#!/usr/bin/env node
/**
 * Phase 75: ACE (Agentic Context Engineering) Agent
 *
 * Uses the Knowledge Adapter to prompt an LLM for high-level architectural decisions.
 */

import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// Load environment
dotenv.config({ path: path.join(rootDir, '.env.phase72') });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_CHAT_MODEL || 'gemma3-legal:latest';

const ADAPTER_PATH = path.join(rootDir, 'reports/phase75/adapter-context.json');

async function main() {
    console.log(chalk.cyan.bold('🤖 Phase 75: ACE Agent (Architectural Analysis)\n'));

    if (!fs.existsSync(ADAPTER_PATH)) {
        console.error(chalk.red(`❌ Adapter context not found at ${ADAPTER_PATH}`));
        console.log(chalk.yellow('   Run: npm run phase75:adapter'));
        process.exit(1);
    }

    const context = JSON.parse(fs.readFileSync(ADAPTER_PATH, 'utf-8'));

    // Construct Prompt
    const prompt = `
You are the Lead Software Architect for this project.
I have prepared a "Context Adapter" report summarizing the current codebase status, errors, and route inventory.

**Project Status Summary:**
${context.summary}

**Critical Focus Areas (Top 5):**
${JSON.stringify(context.critical_focus_areas.slice(0, 5), null, 2)}

**Task:**
1. Analyze the critical focus areas.
2. Identify the common patterns in the errors (e.g., missing imports, deprecated syntax).
3. Propose a 3-step action plan to fix the most critical route first.
4. Provide a specific code fix example for the top issue.

Keep your response concise and actionable.
`;

    console.log(chalk.blue('📤 Sending context to LLM...'));
    console.log(chalk.gray(`   Model: ${MODEL}`));

    try {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);

        const data = await response.json();

        console.log(chalk.green('\n✅ Architect\'s Plan:\n'));
        console.log(data.response);

        // Save the plan
        const planPath = path.join(rootDir, 'reports/phase75/architect-plan.md');
        fs.writeFileSync(planPath, `# Phase 75: Architect Plan\n\n${data.response}`);
        console.log(chalk.blue(`\n📄 Plan saved to: ${planPath}`));

    } catch (error) {
        console.error(chalk.red(`❌ Failed to communicate with LLM: ${error.message}`));
        console.log(chalk.yellow('   Ensure Ollama is running and the model is pulled.'));
    }
}

main().catch(console.error);
