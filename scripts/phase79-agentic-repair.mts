import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ChatOllama } from "@langchain/ollama";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { db } from '../src/lib/server/db/client'; // Adjust path if needed
import { errorEvents, errorSuggestions, errorSuggestionStates } from '../src/lib/server/db/schema-postgres';
import { eq, desc, and } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

// --- Configuration ---
const MAX_ITERATIONS = 5;
const MAX_RETRIES = 3;
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'; // 'ollama' | 'gemini'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3-legal:latest';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

// --- Tools ---

async function toolReadFile(args: { path: string }) {
    try {
        const fullPath = path.resolve(process.cwd(), args.path);
        const content = await fs.readFile(fullPath, 'utf-8');
        return { success: true, content };
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

async function toolApplyPatch(args: { path: string; search_content: string; replace_content: string }) {
    try {
        const fullPath = path.resolve(process.cwd(), args.path);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Simple string replace for now - can be enhanced to fuzzy match
        if (!content.includes(args.search_content)) {
            return { success: false, error: "Search content not found in file." };
        }
        
        const newContent = content.replace(args.search_content, args.replace_content);
        await fs.writeFile(fullPath, newContent, 'utf-8');
        return { success: true, message: `Patched ${args.path}` };
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

async function toolVerifyFix(args: { path: string }) {
    console.log(`🔎 Verifying fix for ${args.path}...`);
    try {
        // Run svelte-check only on the specific file to save time?
        // svelte-check doesn't easily support single file, but tsc does.
        // For Svelte/Kit, running check on the whole workspace might be needed or using --filter if supported.
        // We'll try a targeted check or fallback to full check if fast enough.
        // For this prototype, we'll assume we can run a quick check.
        // Using `svelte-check` is safest for .svelte files.
        
        // Note: svelte-check can be slow.
        const cmd = `npx svelte-check --workspace ${args.path} --output machine`;
        const { stdout } = await execAsync(cmd);
        return { success: true, output: stdout, passed: true };
    } catch (e: any) {
        // svelte-check exits with non-zero if errors found
        return { success: true, output: e.stdout, passed: false };
    }
}

const TOOLS = {
    read_file: toolReadFile,
    apply_patch: toolApplyPatch,
    verify_fix: toolVerifyFix
};

// --- Agent Logic ---

export class AgenticRepair {
    private llm: any;

    constructor() {
        if (LLM_PROVIDER === 'gemini') {
            this.llm = new ChatGoogleGenerativeAI({
                modelName: GEMINI_MODEL,
                maxOutputTokens: 8192,
                temperature: 0.1, // Low temp for precise code
            });
        } else {
            this.llm = new ChatOllama({
                model: OLLAMA_MODEL,
                temperature: 0.1,
            });
        }
    }

    async repairCluster(clusterId: string, representativeError: any) {
        console.log(`
🤖 Starting Repair for Cluster: ${clusterId}`);
        console.log(`📄 Representative File: ${representativeError.filePath}`);
        console.log(`❌ Error: ${representativeError.message}`);

        const fileContext = await toolReadFile({ path: representativeError.filePath });
        if (!fileContext.success) {
            console.error("Failed to read file:", fileContext.error);
            return;
        }

        const messages: BaseMessage[] = [
            new SystemMessage(`You are an autonomous repair agent. 
Your goal is to fix TypeScript/Svelte errors.
You have access to the file system via tools.

Process:
1. Read the file to understand the context.
2. Analyze the syntax error.
3. Call apply_patch to fix it.
4. Call verify_fix to confirm.

Output JSON:
{
  "thought": "Reasoning...",
  "tool_call": { "name": "tool_name", "args": { ... } }
}
OR
{
  "thought": "Finished...",
  "final_response": "Fixed by..."
}
`),
            new HumanMessage(`
Error TS${representativeError.code}: ${representativeError.message}
File: ${representativeError.filePath}
Context Line: ${representativeError.line}

Current File Content (truncated):
${fileContext.content?.slice(0, 5000)}
...

Please fix this.
`)
        ];

        let attempts = 0;
        
        while (attempts < MAX_ITERATIONS) {
            attempts++;
            console.log(`
🔄 Step ${attempts}`);

            const response = await this.llm.invoke(messages);
            const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
            
            let parsed;
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
            } catch (e) {
                console.warn("JSON Parse Error. Raw:", content);
                messages.push(new AIMessage(content));
                messages.push(new HumanMessage("Invalid JSON. Please respond with valid JSON."));
                continue;
            }

            console.log(`🤔 Thought: ${parsed.thought}`);

            if (parsed.final_response) {
                console.log(`✅ Agent declared success: ${parsed.final_response}`);
                // Ideally verify one last time here
                return { success: true, resolution: parsed.final_response };
            }

            if (parsed.tool_call) {
                const { name, args } = parsed.tool_call;
                console.log(`🛠️ Tool: ${name}`);

                let result;
                if (name === 'verify_fix') {
                    result = await toolVerifyFix(args);
                    if (result.passed) {
                         console.log("🎉 Fix Verified!");
                         // Store solution in Qdrant (Stub)
                         // await storeSolutionInQdrant(...)
                         return { success: true, resolution: "Verified Fix" };
                    } else {
                         console.log("❌ Fix Verification Failed:", result.output.slice(0, 200));
                         result.output = "Verification Failed. Errors:\n" + result.output.slice(0, 500);
                    }
                } else if (TOOLS[name as keyof typeof TOOLS]) {
                    result = await TOOLS[name as keyof typeof TOOLS](args);
                } else {
                    result = { error: "Unknown tool" };
                }

                messages.push(new AIMessage(content));
                messages.push(new HumanMessage(`Tool Result: ${JSON.stringify(result)}`));
            }
        }

        return { success: false, error: "Max iterations reached" };
    }
}

// --- Main Runner ---

async function main() {
    const agent = new AgenticRepair();
    
    // 1. Fetch Highest Impact Cluster (Mock for now, replace with DB query)
    // const cluster = await db.query.errorClusters.findFirst({ orderBy: desc(errorClusters.count) });
    
    // Mock Data based on your summary
    const mockCluster = { id: 'ts_1005', count: 23748 };
    const mockError = {
        filePath: 'src/routes/cases/[id]/overview/+page.ts', // Adjust to a real broken file
        line: 42,
        code: '1005',
        message: "';' expected."
    };

    console.log("🚀 Starting Phase 79 Agentic Repair Loop");
    
    // In production:
    // const errors = await db.select().from(errorEvents).where(eq(errorEvents.clusterId, cluster.id)).limit(1);
    // const target = errors[0];

    await agent.repairCluster(mockCluster.id, mockError);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}