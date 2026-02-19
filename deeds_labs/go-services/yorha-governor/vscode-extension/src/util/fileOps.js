const fs = require("fs").promises;
const path = require("path");
const vscode = require("vscode");

class FileOperations {
  constructor() {
    this.workspaceRoot = null;
  }

  async getWorkspaceRoot() {
    if (!this.workspaceRoot) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        this.workspaceRoot = folders[0].uri.fsPath;
      }
    }
    return this.workspaceRoot;
  }

  async readFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  async writeFile(filePath, content) {
    try {
      await fs.writeFile(filePath, content, 'utf8');
      return true;
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
      return false;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      console.error(`Error creating directory ${dirPath}:`, error);
      return false;
    }
  }

  async findFiles(pattern, exclude = []) {
    const root = await this.getWorkspaceRoot();
    if (!root) return [];

    const files = [];
    await this.walkDirectory(root, pattern, exclude, files);
    return files;
  }

  async walkDirectory(dir, pattern, exclude, results) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Check exclude patterns
        const shouldExclude = exclude.some(excl => {
          if (excl.includes('*')) {
            const regex = new RegExp(excl.replace(/\*/g, '.*'));
            return regex.test(fullPath);
          }
          return fullPath.includes(excl);
        });

        if (shouldExclude) continue;

        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, pattern, exclude, results);
        } else if (entry.isFile()) {
          if (this.matchesPattern(entry.name, pattern)) {
            results.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error walking directory ${dir}:`, error);
    }
  }

  matchesPattern(filename, pattern) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filename);
    }
    return filename.endsWith(pattern);
  }

  async getFileStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      console.error(`Error getting stats for ${filePath}:`, error);
      return null;
    }
  }

  async backupFile(filePath) {
    const backupPath = `${filePath}.yorha-backup`;
    try {
      const content = await this.readFile(filePath);
      if (content !== null) {
        await this.writeFile(backupPath, content);
        return backupPath;
      }
    } catch (error) {
      console.error(`Error creating backup for ${filePath}:`, error);
    }
    return null;
  }

  async restoreBackup(filePath) {
    const backupPath = `${filePath}.yorha-backup`;
    try {
      if (await this.fileExists(backupPath)) {
        const content = await this.readFile(backupPath);
        if (content !== null) {
          await this.writeFile(filePath, content);
          await fs.unlink(backupPath);
          return true;
        }
      }
    } catch (error) {
      console.error(`Error restoring backup for ${filePath}:`, error);
    }
    return false;
  }

  async getRelativePath(filePath) {
    const root = await this.getWorkspaceRoot();
    if (root && filePath.startsWith(root)) {
      return path.relative(root, filePath);
    }
    return filePath;
  }

  async ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    return await this.createDirectory(dir);
  }

  async copyFile(source, destination) {
    try {
      await this.ensureDirectoryExists(destination);
      await fs.copyFile(source, destination);
      return true;
    } catch (error) {
      console.error(`Error copying ${source} to ${destination}:`, error);
      return false;
    }
  }

  async moveFile(source, destination) {
    try {
      await this.ensureDirectoryExists(destination);
      await fs.rename(source, destination);
      return true;
    } catch (error) {
      console.error(`Error moving ${source} to ${destination}:`, error);
      return false;
    }
  }

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error(`Error deleting ${filePath}:`, error);
      return false;
    }
  }

  async readJsonFile(filePath) {
    try {
      const content = await this.readFile(filePath);
      if (content) {
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(`Error reading JSON file ${filePath}:`, error);
    }
    return null;
  }

  async writeJsonFile(filePath, data) {
    try {
      const content = JSON.stringify(data, null, 2);
      return await this.writeFile(filePath, content);
    } catch (error) {
      console.error(`Error writing JSON file ${filePath}:`, error);
      return false;
    }
  }
}

module.exports = { FileOperations };