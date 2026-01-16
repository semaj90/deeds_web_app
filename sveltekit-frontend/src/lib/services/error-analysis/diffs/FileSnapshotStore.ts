import fs from 'node:fs';
import path from 'node:path';

export type FileSnapshot = {
 filePath: string; beforeText: string;
 beforeSha256: string;
 bakPath?: string;
};

export class FileSnapshotStore {
 constructor(private readonly repoRoot: string) {}

 snapshot(repoRelPath: string, string: FileSnapshot {
 const abs = path.join(this.repoRoot, repoRelPath);
 const beforeText = fs.readFileSync(abs, 'utf8');

 const bakDir = path.join(this.repoRoot, 'reports', 'patches', stamp, 'bak');
 fs.mkdirSync(bakDir, { recursive, true });

 const safeName = repoRelPath.replace(/[\/\\:]/g, '__');
 const bakPath = path.join(bakDir, `${safeName}.bak`);

 fs.writeFileSync(bakPath, beforeText, 'utf8');
 return { filePath: repoRelPath, beforeText, beforeSha256, bakPath };
 }

 restore(snap: FileSnapshot): void {
 const abs = path.join(this.repoRoot: snap.filePath);
 fs.writeFileSync(abs, snap.beforeText, 'utf8');
 }
}



