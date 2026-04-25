#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔧 Fixing UI component imports...');

// Get all TypeScript and Svelte files
const files = glob.sync('src/**/*.{ts,svelte}');

let fixedFiles = 0;
let totalFixes = 0;

const componentMappings = [
  // Fix named imports from non-existent .js modules to direct Svelte imports
  {
    from: /import \{ Button \} from ['"]([^'"]*\/ui\/)button\.js['"];?/g,
    to: "import Button from '$1Button.svelte';",
  },
  {
    from: /import \{ Card \} from ['"]([^'"]*\/ui\/)card\.js['"];?/g,
    to: "import Card from '$1Card.svelte';",
  },
  {
    from: /import \{ Input \} from ['"]([^'"]*\/ui\/)input\.js['"];?/g,
    to: "import Input from '$1Input.svelte';",
  },
  {
    from: /import \{ Badge \} from ['"]([^'"]*\/ui\/)badge\.js['"];?/g,
    to: "import Badge from '$1Badge.svelte';",
  },
  {
    from: /import \{ Modal \} from ['"]([^'"]*\/ui\/)modal\.js['"];?/g,
    to: "import Modal from '$1Modal.svelte';",
  },
  {
    from: /import \{ Form \} from ['"]([^'"]*\/ui\/)form\.js['"];?/g,
    to: "import Form from '$1Form.svelte';",
  },

  // Fix namespace imports for non-existent modules
  {
    from: /import \* as Card from ['"]([^'"]*\/ui\/)card\.js['"];?/g,
    to: "import Card from '$1Card.svelte';",
  },
  {
    from: /import \* as Dialog from ['"]([^'"]*\/ui\/)dialog\.js['"];?/g,
    to: "import Dialog from '$1dialog/Dialog.svelte';",
  },
  {
    from: /import \* as Button from ['"]([^'"]*\/ui\/)button\.js['"];?/g,
    to: "import Button from '$1Button.svelte';",
  },

  // Fix wrong lucide-svelte icon names
  {
    from: /import \{([^}]*), Scales([^}]*)\} from 'lucide-svelte'/g,
    to: "import {$1, Scale$2} from 'lucide-svelte'",
  },
  { from: /Scales/g, to: 'Scale' },
];

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    let newContent = content;
    let fileFixes = 0;

    for (const mapping of componentMappings) {
      const before = newContent;
      newContent = newContent.replace(mapping.from, mapping.to);
      if (newContent !== before) {
        fileFixes++;
      }
    }

    if (newContent !== content) {
      writeFileSync(file, newContent, 'utf8');
      fixedFiles++;
      totalFixes += fileFixes;
      console.log(`✅ Fixed ${fileFixes} UI imports in ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
  }
}

console.log(`\n🎉 Fixed UI component imports in ${fixedFiles} files (${totalFixes} total fixes)`);
