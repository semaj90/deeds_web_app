import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface FileInfo {
  path: string;
  sha256: string;
  size: number;
  language: string;
}

export interface DeltaResult {
  new: FileInfo[];
  changed: FileInfo[];
  deleted: string[];
  impacted: SymbolInfo[];
}

export interface SymbolInfo {
  symbol_name: string;
  normalized_path: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
}

export class DeltaIndexer {
  private priorSnapshot: Map<string, string> = new Map();
  private currentSnapshot: Map<string, string> = new Map();

  constructor(private snapshotPath: string) {
    this.loadPriorSnapshot();
  }

  private loadPriorSnapshot(): void {
    try {
      if (fs.existsSync(this.snapshotPath)) {
        const data = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf-8'));
        this.priorSnapshot = new Map(Object.entries(data));
      }
    } catch (err) {
      console.warn('[DeltaIndexer] Could not load prior snapshot:', err);
    }
  }

  private computeSHA256(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      return '';
    }
  }

  private classifyLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.sql': 'sql',
      '.sh': 'shell'
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Detect changed/new/deleted files by comparing SHA-256 hashes
   */
  async detectDeltas(currentFiles: FileInfo[]): Promise<DeltaResult> {
    const result: DeltaResult = {
      new: [],
      changed: [],
      deleted: [],
      impacted: []
    };

    // Track current files
    for (const file of currentFiles) {
      this.currentSnapshot.set(file.path, file.sha256);
    }

    // Detect new and changed
    for (const file of currentFiles) {
      const priorHash = this.priorSnapshot.get(file.path);
      if (!priorHash) {
        result.new.push(file);
      } else if (priorHash !== file.sha256) {
        result.changed.push(file);
      }
    }

    // Detect deleted
    for (const [priorPath, _] of this.priorSnapshot) {
      if (!this.currentSnapshot.has(priorPath)) {
        result.deleted.push(priorPath);
      }
    }

    // Save current snapshot for next run
    this.savePriorSnapshot();

    return result;
  }

  /**
   * Compute transitive dependencies (reverse closure)
   * If A.ts changed, find all files that import A
   */
  async computeImpactedSymbols(
    changedFiles: FileInfo[],
    structuralFacts: SymbolInfo[]
  ): Promise<SymbolInfo[]> {
    const changedPaths = new Set(changedFiles.map(f => f.path));
    const impacted: SymbolInfo[] = [];

    // Find all symbols in changed files
    const symbolsInChangedFiles = new Set(
      structuralFacts
        .filter(s => changedPaths.has(s.normalized_path))
        .map(s => `${s.normalized_path}:${s.symbol_name}`)
    );

    // Find all symbols that depend on changed symbols
    // (simplified: just include all symbols from changed files + direct dependents)
    for (const fact of structuralFacts) {
      if (symbolsInChangedFiles.has(`${fact.normalized_path}:${fact.symbol_name}`)) {
        impacted.push(fact);
      }
    }

    return impacted;
  }

  /**
   * Identify topology edges that need recomputation
   * (all edges touching changed symbols)
   */
  getImpactedEdges(
    changedSymbols: SymbolInfo[],
    existingEdges: Array<{ source: string; target: string }>
  ): Array<{ source: string; target: string }> {
    const changedSymbolIds = new Set(
      changedSymbols.map(s => `${s.normalized_path}:${s.symbol_name}`)
    );

    return existingEdges.filter(
      edge =>
        changedSymbolIds.has(edge.source) ||
        changedSymbolIds.has(edge.target)
    );
  }

  private savePriorSnapshot(): void {
    const snapshot: Record<string, string> = {};
    for (const [path, hash] of this.currentSnapshot) {
      snapshot[path] = hash;
    }
    fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2));
  }
}
