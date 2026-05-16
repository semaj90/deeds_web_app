const fs = require('fs');
const p = 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts';
let c = fs.readFileSync(p, 'utf8');

function fixTable(tableName, colName, oldType, newType) {
  const tableRegex = new RegExp(`export const ${tableName} = pgTable\\('${tableName}', [^]*?\\);`, 'g');
  c = c.replace(tableRegex, (match) => {
    // Escape parentheses in oldType for regex
    const escapedOld = oldType.replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    const colRegex = new RegExp(`${colName}: ${escapedOld}`, 'g');
    return match.replace(colRegex, `${colName}: ${newType}`);
  });
}

// Re-fixes for incorrect assumptions
fixTable('llmOutputs', 'userId', "uuid('user_id')", "integer('user_id')");

// New fixes
fixTable('libraryDocuments', 'uploadedBy', "uuid('uploaded_by')", "integer('uploaded_by')");
fixTable('libraryDocuments', 'effectiveDate', "timestamp('effective_date', { withTimezone: true })", "date('effective_date')");
fixTable('libraryDocumentVersions', 'sourceDate', "timestamp('source_date', { withTimezone: true })", "date('source_date')");
fixTable('documents', 'title', "varchar('title', { length: 255 })", "text('title')");
fixTable('documentChunks', 'documentId', "uuid('document_id')", "text('document_id')");
fixTable('citations', 'documentId', "uuid('document_id')", "text('document_id')");
fixTable('chatEmbeddings', 'id', "uuid('id')", "integer('id')");
fixTable('personsOfInterest', 'createdBy', "text('created_by')", "integer('created_by')");
fixTable('routeMetadata', 'path', "text('path')", "varchar('path', { length: 255 })");
fixTable('llmOutputChunks', 'role', "text('role')", "varchar('role', { length: 30 })");

fs.writeFileSync(p, c);
console.log('Successfully applied final drift fixes.');
