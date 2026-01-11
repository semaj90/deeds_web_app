
try {
    console.log('Importing schema-postgres...');
    await import('../src/lib/server/db/schema-postgres.ts');
    console.log('✅ schema-postgres OK');
} catch (e) {
    console.error('❌ schema-postgres FAILED:', e);
}

try {
    console.log('Importing schema-evidence-crud...');
    await import('../src/lib/server/db/schema-evidence-crud.ts');
    console.log('✅ schema-evidence-crud OK');
} catch (e) {
    console.error('❌ schema-evidence-crud FAILED:', e);
}

try {
    console.log('Importing schema-chat...');
    await import('../src/lib/server/db/schema-chat.ts');
    console.log('✅ schema-chat OK');
} catch (e) {
    console.error('❌ schema-chat FAILED:', e);
}
