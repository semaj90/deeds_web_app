import chokidar from 'chokidar';
import { exec } from 'child_process';
import path from 'path';

const vaultPath = path.resolve('./scratch/obsidian_vault');
console.log(`Starting Obsidian Vault Watcher on: ${vaultPath}`);

const watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

let syncTimeout = null;

function triggerSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    
    // Debounce syncing to avoid spamming the indexer when multiple files change
    syncTimeout = setTimeout(() => {
        console.log('Triggering indexer due to vault changes...');
        
        exec('npm run index:codebase:fast', { cwd: './sveltekit-frontend' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Sync error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Sync stderr: ${stderr}`);
            }
            console.log(`Sync success:\n${stdout}`);
        });
        
    }, 5000);
}

watcher
    .on('add', path => {
        console.log(`File ${path} has been added`);
        triggerSync();
    })
    .on('change', path => {
        console.log(`File ${path} has been changed`);
        triggerSync();
    })
    .on('unlink', path => {
        console.log(`File ${path} has been removed`);
        triggerSync();
    });
