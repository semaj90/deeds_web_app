import { getTemplate, getAllTemplates } from './src/lib/data/report-templates.js';

console.log('\n📋 Testing Report Templates\n');

const templates = getAllTemplates();
console.log(`Total templates: ${templates.length}\n`);

templates.forEach(t => {
  console.log(`✅ ${t.name} (${t.type})`);
  console.log(`   ${t.description}`);
  console.log(`   Time: ${t.estimatedTime}\n`);
});

const chargingMemo = getTemplate('charging_memo');
if (chargingMemo) {
  console.log('\n📄 Charging Memo Template Preview:');
  console.log(`Title: ${chargingMemo.defaultTitle}`);
  console.log(`Content length: ${chargingMemo.contentTemplate.length} characters`);
} else {
  console.log('❌ Failed to load charging_memo template');
}
