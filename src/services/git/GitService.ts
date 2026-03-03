import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Git operations for incremental indexing
 */
export class GitService {
  /**
   * Check if a directory is a git repository
   */
  isGitRepo(dirPath: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: dirPath,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current HEAD commit hash
   */
  getHead(dirPath: string): string {
    const result = execSync('git rev-parse HEAD', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  }

  /**
   * Get files changed between two commits.
   * Returns relative paths of added, modified, or deleted files.
   */
  getChangedFiles(
    dirPath: string,
    oldCommit: string,
    newCommit: string
  ): { added: string[]; modified: string[]; deleted: string[] } {
    const result = execSync(
      `git diff --name-status ${oldCommit} ${newCommit}`,
      {
        cwd: dirPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const line of result.trim().split('\n')) {
      if (!line) continue;
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t');

      if (!file) continue;

      switch (status.charAt(0)) {
        case 'A':
          added.push(file);
          break;
        case 'M':
          modified.push(file);
          break;
        case 'D':
          deleted.push(file);
          break;
        case 'R':
          // Renamed: old\tnew
          deleted.push(file);
          if (fileParts.length > 1) {
            added.push(fileParts[1]);
          }
          break;
      }
    }

    return { added, modified, deleted };
  }

  /**
   * Get the repository root directory
   */
  getRepoRoot(dirPath: string): string {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  }
}
