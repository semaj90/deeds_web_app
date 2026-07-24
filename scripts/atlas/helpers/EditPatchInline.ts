import fs from 'fs';
import path from 'path';

export interface PatchHunk {
  start_line: number;
  end_line: number;
  old_text: string;
  new_text: string;
  context_before?: string;
  context_after?: string;
}

export interface ApplyPatchResult {
  success: boolean;
  file_path: string;
  hunks_applied: number;
  hunks_failed: number;
  error?: string;
  backup_path?: string;
}

export class EditPatchInline {
  private createBackup: boolean;
  private backupDir: string;

  constructor(createBackup: boolean = true, backupDir: string = './.backups') {
    this.createBackup = createBackup;
    this.backupDir = backupDir;
  }

  /**
   * Apply inline patches to a file
   * Hunks must be sorted by line number (descending) to apply safely
   */
  async applyPatches(filePath: string, hunks: PatchHunk[]): Promise<ApplyPatchResult> {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          file_path: filePath,
          hunks_applied: 0,
          hunks_failed: hunks.length,
          error: `File not found: ${filePath}`,
        };
      }

      // Read original file
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const originalLines = originalContent.split('\n');

      // Create backup
      let backupPath: string | undefined;
      if (this.createBackup) {
        backupPath = this.createBackupFile(filePath, originalContent);
      }

      // Sort hunks by line number descending to apply from bottom-up
      // This prevents line number shifts during application
      const sortedHunks = hunks.sort((a, b) => b.start_line - a.start_line);

      let appliedCount = 0;
      let failedCount = 0;
      let lines = [...originalLines];

      for (const hunk of sortedHunks) {
        try {
          // Validate hunk boundaries
          if (hunk.start_line < 0 || hunk.end_line >= lines.length) {
            console.warn(
              `[EditPatchInline] Hunk out of bounds: [${hunk.start_line}-${hunk.end_line}] vs file length ${lines.length}`
            );
            failedCount++;
            continue;
          }

          // Extract current text at hunk location
          const currentText = lines.slice(hunk.start_line, hunk.end_line + 1).join('\n');

          // Validate old_text matches (fuzzy match with context)
          if (!this.validateHunk(currentText, hunk.old_text, hunk.context_before, hunk.context_after)) {
            console.warn(
              `[EditPatchInline] Hunk validation failed at line ${hunk.start_line}: content mismatch`
            );
            failedCount++;
            continue;
          }

          // Apply patch
          const newLines = hunk.new_text.split('\n');
          lines.splice(hunk.start_line, hunk.end_line - hunk.start_line + 1, ...newLines);
          appliedCount++;
        } catch (err) {
          console.warn(`[EditPatchInline] Hunk application failed: ${err}`);
          failedCount++;
        }
      }

      // Write patched file
      const patchedContent = lines.join('\n');
      fs.writeFileSync(filePath, patchedContent, 'utf-8');

      return {
        success: failedCount === 0,
        file_path: filePath,
        hunks_applied: appliedCount,
        hunks_failed: failedCount,
        backup_path: backupPath,
      };
    } catch (err) {
      return {
        success: false,
        file_path: filePath,
        hunks_applied: 0,
        hunks_failed: hunks.length,
        error: String(err),
      };
    }
  }

  /**
   * Create a backup of the file before patching
   */
  private createBackupFile(filePath: string, content: string): string {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      const fileName = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.backup`);

      fs.writeFileSync(backupPath, content, 'utf-8');
      return backupPath;
    } catch (err) {
      console.warn(`[EditPatchInline] Backup creation failed: ${err}`);
      return '';
    }
  }

  /**
   * Validate that a hunk matches the current file content
   * Uses fuzzy matching with context lines
   */
  private validateHunk(
    currentText: string,
    expectedText: string,
    contextBefore?: string,
    contextAfter?: string
  ): boolean {
    // Exact match
    if (currentText === expectedText) {
      return true;
    }

    // Fuzzy match: ignore trailing/leading whitespace
    if (currentText.trim() === expectedText.trim()) {
      return true;
    }

    // Context-based match: if context matches, accept hunk
    if (contextBefore && contextAfter) {
      const hasContextBefore = currentText.includes(contextBefore);
      const hasContextAfter = currentText.includes(contextAfter);
      if (hasContextBefore && hasContextAfter) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a patch between two versions of file content
   * Useful for creating hunks from diffs
   */
  generatePatch(oldContent: string, newContent: string, filePath: string): PatchHunk[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const hunks: PatchHunk[] = [];

    // Simple line-based diff (not a full diff algorithm)
    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        // Lines match, skip
        i++;
        j++;
      } else {
        // Mismatch found, collect hunk
        const hunkStart = i;
        const oldTextLines: string[] = [];
        const newTextLines: string[] = [];

        // Collect differing lines
        while (i < oldLines.length && j < newLines.length && oldLines[i] !== newLines[j]) {
          oldTextLines.push(oldLines[i]);
          i++;
        }

        while (j < newLines.length && (i >= oldLines.length || newLines[j] !== oldLines[i])) {
          newTextLines.push(newLines[j]);
          j++;
        }

        // Handle trailing mismatches
        if (i < oldLines.length) {
          while (i < oldLines.length && j >= newLines.length) {
            oldTextLines.push(oldLines[i]);
            i++;
          }
        }

        if (j < newLines.length) {
          while (j < newLines.length && i >= oldLines.length) {
            newTextLines.push(newLines[j]);
            j++;
          }
        }

        hunks.push({
          start_line: hunkStart,
          end_line: hunkStart + oldTextLines.length - 1,
          old_text: oldTextLines.join('\n'),
          new_text: newTextLines.join('\n'),
          context_before: hunkStart > 0 ? oldLines[hunkStart - 1] : undefined,
          context_after: hunkStart + oldTextLines.length < oldLines.length ? oldLines[hunkStart + oldTextLines.length] : undefined,
        });
      }
    }

    return hunks;
  }

  /**
   * Revert a file to its backup
   */
  async revertFromBackup(backupPath: string, targetPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupPath)) {
        console.warn(`[EditPatchInline] Backup not found: ${backupPath}`);
        return false;
      }

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      fs.writeFileSync(targetPath, backupContent, 'utf-8');
      console.log(`[EditPatchInline] Reverted ${targetPath} from backup`);
      return true;
    } catch (err) {
      console.warn(`[EditPatchInline] Revert failed: ${err}`);
      return false;
    }
  }

  /**
   * Clean up old backup files (keep only N most recent)
   */
  async cleanupBackups(maxBackups: number = 5): Promise<number> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return 0;
      }

      const files = fs.readdirSync(this.backupDir);
      const backups = files
        .filter((f) => f.endsWith('.backup'))
        .map((f) => ({
          name: f,
          path: path.join(this.backupDir, f),
          mtime: fs.statSync(path.join(this.backupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime); // newest first

      const toDelete = backups.slice(maxBackups);
      let deleted = 0;

      for (const backup of toDelete) {
        try {
          fs.unlinkSync(backup.path);
          deleted++;
        } catch (err) {
          console.warn(`[EditPatchInline] Failed to delete backup ${backup.path}: ${err}`);
        }
      }

      return deleted;
    } catch (err) {
      console.warn(`[EditPatchInline] Cleanup failed: ${err}`);
      return 0;
    }
  }
}
