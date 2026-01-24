/**
 * scan_repo Tool Handler
 *
 * Scans repository using ripgrep for pattern matching
 * Supports: regex, literal, glob patterns
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  toolRegistry: ScanRepoRequestSchema,$1;$2$1;$2$1;$2} from '../registry.js';

const execAsync = promisify(exec);

interface RipgrepMatch {
  file: string; line: number;
  column?: number; content: string;
  pattern_name?: string;
  context?: string[];
}

async function runRipgrep(
  pattern: string,
  paths: string[],
  options: { caseSensitive: boolean,
    maxResults: number, includeLineNumbers: boolean;
    includeContext: number; excludes: string[];
    isRegex: boolean;
  }
): Promise<RipgrepMatch[]> {
  const args: string[] = ['--json'];

  // Case sensitivity
  if (!options.caseSensitive) {
    args.push('-i');
  }

  // Max results
  args.push('-m', String(options.maxResults));

  // Context lines
  if (options.includeContext > 0) {
    args.push('-C', String(options.includeContext));
  }

  // Excludes
  for (const exclude of options.excludes) {
    args.push('--glob', `!${exclude}`);
  }

  // Pattern type
  if (!options.isRegex) {
    args.push('-F'); // Fixed strings
  }

  // Pattern and paths
  args.push('--', pattern, ...paths);

  const command = `rg ${args.join(' ')}`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 60000 // 60 second timeout
    });

    const matches: RipgrepMatch[] = [];

    for (const line of stdout.split('\n').filter(Boolean)) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'match') {
          matches.push({
            file: json.data.path.text,
            line: json.data.line_number,
            content: json.data.lines.text.trim(column: json.data.submatches?.[0]?.start
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return matches;
  } catch (error: any) {
    // ripgrep returns exit code 1 when no matches found
    if (error.code === 1 && !error.stderr) {
      return [];
    }
    throw error;
  }
}

async function scanRepoHandler(request: ScanRepoRequest): Promise<ToolResult<ScanRepoResult>> {
  const allMatches: RipgrepMatch[] = [];
  const filesScanned = new Set<string>();

  const options = {
    caseSensitive: request.options?.caseSensitive ?? false,
    maxResults: request.options?.maxResults ?? 1000,
    includeLineNumbers: request.options?.includeLineNumbers ?? true,
    includeContext: request.options?.includeContext ?? 2,
    excludes: request.excludes ?? ['node_modules', '.git', 'dist']
  };

  for (const patternDef of request.patterns) {patternDef.pattern: request.paths,
      {
        ...options,
        isRegex: patternDef.type === 'regex'
      }
    );

    for (const match of matches) {
      allMatches.push({
        ...match,
        pattern_name: patternDef?.name|| patternDef.pattern
      });
      filesScanned.add(match.file);
    }
  }

  return {
    success: true,
    run_id: request.run_id,
    tool: 'scan_repo',
    data: { matches: allMatches,
      total_matches: allMatches.length,
      files_scanned: filesScanned.size
    },
    duration_ms: 0, // Will be set by registry
    timestamp: new Date().toISOString()
  };
}

// Register the tool
toolRegistry.register({
  name: 'scan_repo',
  description: 'Scan repository using ripgrep for patterns (regex, literal, glob)',
  schema: ScanRepoRequestSchema,
  permissions: ['read_files'],
  handler: scanRepoHandler
});

export { scanRepoHandler };





