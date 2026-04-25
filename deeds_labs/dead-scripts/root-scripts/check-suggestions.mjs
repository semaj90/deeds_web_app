import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function checkSuggestions() {
  const suggestions = await sql`
    SELECT id, route_path, summary, risk_level, patch, created_at
    FROM error_suggestions
    ORDER BY created_at DESC;
  `;

  console.log('🔍 Generated Suggestions:');
  if (suggestions.length === 0) {
    console.log('   No suggestions found.');
  } else {
    suggestions.forEach((s, i) => {
      console.log(`\nSuggestion #${i + 1}:`);
      console.log(`   ID: ${s.id}`);
      console.log(`   Route: ${s.route_path}`);
      console.log(`   Risk: ${s.risk_level}`);
      console.log(`   Summary: ${s.summary}`);
      console.log(`   Patch Length: ${s.patch?.length || 0} chars`);
      if (s.patch && s.patch.length > 0) {
        console.log(`   Patch Preview:\n${s.patch.substring(0, 300)}${s.patch.length > 300 ? '...' : ''}`);
      }
      console.log(`   Created: ${s.created_at}`);
    });
  }
  await sql.end();
}

checkSuggestions();
