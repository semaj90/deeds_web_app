// Quick test script to verify the legal document system

console.log('🧪 Testing Legal Document Management System');
console.log('============================================');

// Test 3: Component Loading
console.log('\n📦 Testing Component Structure...');

const fs = require('fs');
const path = require('path');

const components = [
  'src/lib/components/editor/LegalDocumentEditor.svelte',
  'src/lib/components/ui/CommandMenu.svelte',
  'src/lib/components/ui/GoldenLayout.svelte',
  'src/lib/components/ui/ExpandGrid.svelte',
  'src/lib/components/evidence/EvidenceCard.svelte',
];

components.forEach((component) => {
  if (fs.existsSync(component)) {
    console.log(`✅ ${path.basename(component)} - Found`);
  } else {
    console.log(`❌ ${path.basename(component)} - Missing`);
  }
});

// Test 4: API Routes
console.log('\n🛣️  Testing API Routes...');

const apiRoutes = [
  'src/routes/api/documents/+server.ts',
  'src/routes/api/documents/[id]/+server.ts',
  'src/routes/api/documents/[id]/auto-save/+server.ts',
  'src/routes/api/citations/+server.ts',
  'src/routes/api/ai/ask/+server.ts',
];

apiRoutes.forEach((route) => {
  if (fs.existsSync(route)) {
    console.log(`✅ ${path.basename(path.dirname(route))} - Implemented`);
  } else {
    console.log(`❌ ${path.basename(path.dirname(route))} - Missing`);
  }
});

// Test 5: Database Schema
console.log('\n🗃️  Testing Database Schema...');

const schemaFile = 'src/lib/server/db/unified-schema.ts';
if (fs.existsSync(schemaFile)) {
  const schemaContent = fs.readFileSync(schemaFile, 'utf8');
  if (schemaContent.includes('legalDocuments')) {
    console.log('✅ Legal Documents schema - Defined');
  } else {
    console.log('❌ Legal Documents schema - Missing');
  }
} else {
  console.log('❌ Database schema file - Missing');
}

console.log('\n🎉 System Test Complete!');
console.log('========================');
console.log('✨ Visit http://localhost:5173/document-editor-demo to test the editor');
console.log('✨ Visit http://localhost:5173/modern-demo to see all components');
