import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('.tmp/mega-audit', { recursive: true });

try {
  console.log("Running audit-imports.txt...");
  const out1 = execSync(`rg -n -S "from ['\\"]\\$lib|from ['\\"]\\.\\.?/|import .* from" src scripts docs`);
  writeFileSync('.tmp/audit-imports.txt', out1);
} catch (e) {
  if (e.stdout) writeFileSync('.tmp/audit-imports.txt', e.stdout);
}

try {
  console.log("Running audit-service-refs.txt...");
  const out2 = execSync(`rg -n -S "db\\.|drizzle|schema|pgTable|jsonb|vector|redis|qdrant|neo4j|bifrost|mcp|trace|engram" src scripts docs`);
  writeFileSync('.tmp/audit-service-refs.txt', out2);
} catch (e) {
  if (e.stdout) writeFileSync('.tmp/audit-service-refs.txt', e.stdout);
}

try {
  console.log("Running audit-routes.txt...");
  const out3 = execSync(`rg -n -S "export const (GET|POST|PUT|PATCH|DELETE)|RequestHandler" src/routes src/lib/server`);
  writeFileSync('.tmp/audit-routes.txt', out3);
} catch (e) {
  if (e.stdout) writeFileSync('.tmp/audit-routes.txt', e.stdout);
}

console.log("rg commands completed.");
