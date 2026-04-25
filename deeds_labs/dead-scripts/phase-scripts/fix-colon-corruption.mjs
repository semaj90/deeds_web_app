import fs from 'fs';
import path from 'path';

// Recursive function to find all .ts and .svelte files
function findSourceFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.svelte-kit') {
                findSourceFiles(filePath, fileList);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.svelte')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

const rootDir = path.resolve(process.cwd(), 'src');
const filesToFix = findSourceFiles(rootDir);

console.log(`Found ${filesToFix.length} source files to scan.`);

const replacements = [
    {
        // Fix: caseId: body.caseId: content.content: title.title
        // To: caseId: body.caseId, content: body.content, title: body.title
        regex: /caseId:\s*body\.caseId:\s*content\.content:\s*title\.title/g,
        replace: "caseId: body.caseId, content: body.content, title: body.title"
    },
    {
        // Fix: createdBy: locals.user.id: createdAt Date()
        // To: createdBy: locals.user.id, createdAt: new Date()
        regex: /createdBy:\s*locals\.user\.id:\s*createdAt\s*Date\(\)/g,
        replace: "createdBy: locals.user.id, createdAt: new Date()"
    },
    {
        // Fix: ok: false: message.message
        // To: ok: false, message: (e as Error).message
        regex: /ok:\s*false:\s*message\.message/g,
        replace: "ok: false, message: (e as Error).message"
    },
    {
        // Fix: ok: resp.ok: status.status
        // To: ok: resp.ok, status: resp.status
        regex: /ok:\s*resp\.ok:\s*status\.status/g,
        replace: "ok: resp.ok, status: resp.status"
    },
    {
        // Fix: ok: resp.ok: modelCount.models?.length
        // To: ok: resp.ok, modelCount: data.models?.length
        regex: /ok:\s*resp\.ok:\s*modelCount\.models\?\.length/g,
        replace: "ok: resp.ok, modelCount: data.models?.length"
    },
    {
        // Fix: caseId: body.caseId: name.name: aliases.alias ? [body.alias] : []
        // To: caseId: body.caseId, name: body.name, aliases: body.alias ? [body.alias] : []
        regex: /caseId:\s*body\.caseId:\s*name\.name:\s*aliases\.alias/g,
        replace: "caseId: body.caseId, name: body.name, aliases: body.alias"
    },
    {
        // Fix: status: res.status: error.slice(0, 2000)
        // To: status: res.status, error: error.slice(0, 2000)
        regex: /status:\s*res\.status:\s*error\.slice/g,
        replace: "status: res.status, error: error.slice"
    },
    {
        // Fix: appliedByUserId: locals.user.id: new Date().toISOString()
        // To: appliedByUserId: locals.user.id
        // (Assuming the extra date is a duplicate or garbage)
        regex: /appliedByUserId:\s*locals\.user\.id:\s*new\s*Date\(\)\.toISOString\(\)/g,
        replace: "appliedByUserId: locals.user.id"
    },
    {
        // Fix: version: result.version: message.message: validationScore.validationScore: rollback.rollback
        // To: version: result.version, message: result.message, validationScore: result.validationScore, rollback: result.rollback
        regex: /version:\s*result\.version:\s*message\.message:\s*validationScore\.validationScore:\s*rollback\.rollback/g,
        replace: "version: result.version, message: result.message, validationScore: result.validationScore, rollback: result.rollback"
    },
    {
        // Fix: action: result.action: confidence.confidence: fixApplied.fixApplied: experienceId.experienceId: error.error
        // To: action: result.action, confidence: result.confidence, fixApplied: result.fixApplied, experienceId: result.experienceId, error: result.error
        regex: /action:\s*result\.action:\s*confidence\.confidence:\s*fixApplied\.fixApplied:\s*experienceId\.experienceId:\s*error\.error/g,
        replace: "action: result.action, confidence: result.confidence, fixApplied: result.fixApplied, experienceId: result.experienceId, error: result.error"
    },
    {
        // Fix: $state<Type: null> -> $state<Type | null>
        regex: /\$state<([^>]+):\s*null>/g,
        replace: "$state<$1 | null>"
    },
    {
        // Fix: string: undefined -> string | undefined (in types)
        regex: /:\s*undefined/g,
        replace: " | undefined"
    },
    {
        // Fix: string: null -> string | null (in types)
        regex: /(string|number|boolean|Float32Array|Promise<[^>]+>):\s*null/g,
        replace: "$1 | null"
    },
    {
        // Fix: progress: 20 }; -> progress: 20 });
        regex: /progress:\s*(\d+)\s*};/g,
        replace: "progress: $1 });"
    },
    {
        // Fix: message, progress }; -> message, progress });
        regex: /message,\s*progress\s*};/g,
        replace: "message, progress });"
    },
    {
        // Fix: constructor(config, Partial<LegalAIPipelineConfig> = {} {
        regex: /constructor\(config,\s*Partial<([^>]+)>\s*=\s*{}\s*{/g,
        replace: "constructor(config: Partial<$1> = {}) {"
    },
    {
        // Fix: console.error('Pipeline error: ', e)} } } -> console.error('Pipeline error: ', e); }); }
        regex: /console\.error\('Pipeline error: ',\s*e\)\s*}\s*}\s*}/g,
        replace: "console.error('Pipeline error: ', e); }); }"
    }
];

let totalFixed = 0;

filesToFix.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        let originalContent = content;
        let fixed = false;

        replacements.forEach(({ regex, replace }) => {
            if (regex.test(content)) {
                content = content.replace(regex, replace);
                fixed = true;
            }
        });

        if (fixed) {
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`Fixed: ${filePath}`);
            totalFixed++;
        }
    }
});

console.log(`\nTotal files fixed: ${totalFixed}`);
