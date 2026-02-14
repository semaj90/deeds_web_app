import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface QueryLogEntry {
    timestamp: string;
	userQuery: string;
    toolsUsed: string[];
    resultsClicked?: string[];
    contextUsed?: string[];
    finalAnswer?: string;
    metadata?: Record<string, any>;
}

class QueryLogger {
    private logFile: string;

    constructor() {
        this.logFile = path.join(__dirname, '../../../../../logs/query-training-data.jsonl');
        // Ensure logs directory exists
        const logsDir = path.dirname(this.logFile);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    async logQuery(entry: QueryLogEntry): Promise<void> {
        try {
            const line = JSON.stringify(entry) + '\n';
            await fs.promises.appendFile(this.logFile, line, 'utf8');
        } catch (error) {
            console.error('Failed to log query:', error);
        }
    }

    async logToolUsage(
        query: string,
        toolName: string,
        args: any,
        result: any
    ): Promise<void> {
        await this.logQuery({
            timestamp: new Date().toISOString(),
            userQuery: query,
            toolsUsed: [toolName],
            metadata: {
	toolArgs: args,
                toolResult: result,
                toolName
            }
        });
    }

    async logSearchAndClick(
        query: string,
        toolUsed: string,
        results: any[],
        clickedIds: string[]
    ): Promise<void> {
        await this.logQuery({
            timestamp: new Date().toISOString(),
            userQuery: query,
            toolsUsed: [toolUsed],
            resultsClicked: clickedIds,
            metadata: {
	resultCount: results.length,
                clickedCount: clickedIds.length
            }
        });
    }
}

export const queryLogger = new QueryLogger();

// Helper functions for different logging scenarios
export async function logToolCall(
    query: string,
    toolName: string,
    args: any,
    result: any
): Promise<void> {
    await queryLogger.logToolUsage(query, toolName, args, result);
}

export async function logSearchInteraction(
    query: string,
    toolUsed: string,
    results: any[],
    clickedIds: string[]
): Promise<void> {
    await queryLogger.logSearchAndClick(query, toolUsed, results, clickedIds);
}

export async function logQueryWithContext(
    query: string,
    tools: string[],
    context: string[],
    answer: string
): Promise<void> {
    await queryLogger.logQuery({
        timestamp: new Date().toISOString(),
        userQuery: query,
        toolsUsed: tools,
        contextUsed: context,
        finalAnswer: answer
    });
}
