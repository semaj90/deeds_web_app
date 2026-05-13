import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * TurboVecClient
 * 
 * TypeScript wrapper for the TurboVec ANN sidecar.
 * Uses a Python bridge to communicate with the RTX-accelerated TurboVec index.
 */
export class TurboVecClient {
  private static VENV_PYTHON = resolve(process.cwd(), '.venv_turbovec', 'Scripts', 'python.exe');
  private static BRIDGE_SCRIPT = resolve(process.cwd(), 'scripts', 'turbovec_search_bridge.py');
  
  /**
   * Search the TurboVec index for the nearest neighbors of a query vector.
   */
  static async search(params: {
    vector: number[];
    topK?: number;
    indexPath?: string;
  }): Promise<Array<{ id: string; score: number }>> {
    const topK = params.topK ?? 10;
    const indexPath = params.indexPath ?? '.cache/turbovec/evidence_text.tvim';
    
    return new Promise((resolve, reject) => {
      const args = [
        this.BRIDGE_SCRIPT,
        '--index', indexPath,
        '--top_k', topK.toString(),
        '--vector', JSON.stringify(params.vector)
      ];
      
      const py = spawn(this.VENV_PYTHON, args);
      
      let stdout = '';
      let stderr = '';
      
      py.stdout.on('data', (data) => { stdout += data.toString(); });
      py.stderr.on('data', (data) => { stderr += data.toString(); });
      
      py.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`TurboVec search failed (code ${code}): ${stderr}`));
          return;
        }
        
        try {
          const results = JSON.parse(stdout);
          resolve(results);
        } catch (err) {
          reject(new Error(`Failed to parse TurboVec results: ${err.message}\nOutput: ${stdout}`));
        }
      });
    });
  }

  /**
   * Helper to map uint64 back to UUID if needed, 
   * or just return the uint64 as a string.
   */
  static uint64ToId(val: string | number): string {
    return val.toString();
  }
}
