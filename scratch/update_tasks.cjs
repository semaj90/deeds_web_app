const fs = require('fs');
const path = '.vscode/tasks.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const diagnostic_tasks = [
    {
        label: 'truth: semantic-health check',
        type: 'shell',
        command: 'Invoke-RestMethod -Uri "http://localhost:5173/api/codeintel/semantic-health" | ConvertTo-Json',
        group: 'test'
    },
    {
        label: 'truth: orchestrator-smoke (--status)',
        type: 'shell',
        command: 'node scripts/tests/test-orchestrator-smoke.mjs --status',
        options: { cwd: '${workspaceFolder}/sveltekit-frontend' },
        group: 'test'
    },
    {
        label: 'truth: wiki-smoke',
        type: 'shell',
        command: 'node scripts/tests/test-wiki-smoke.mjs',
        options: { cwd: '${workspaceFolder}/sveltekit-frontend' },
        group: 'test'
    },
    {
        label: '🧠 CodeIntel: Post-Start Smoke',
        dependsOn: [
            'truth: semantic-health check',
            'truth: orchestrator-smoke (--status)',
            'truth: wiki-smoke'
        ],
        dependsOrder: 'sequence',
        group: 'test',
        presentation: {
            echo: true,
            reveal: 'always',
            focus: true,
            panel: 'dedicated',
            showReuseMessage: false,
            clear: true
        }
    }
];

data.tasks.push(...diagnostic_tasks);
fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
