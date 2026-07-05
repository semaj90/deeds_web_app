import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const INPUT_FILE = path.join(ROOT, 'docs/reports/proto-registry-audit.json');
const OUTPUT_FILE = path.join(ROOT, 'docs/reports/grpc-service-packets.jsonl');

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`ERROR: Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const serviceMap = new Map();

  // Group methods by service
  for (const packet of data.packets) {
    const svcName = packet.service_name;
    if (!serviceMap.has(svcName)) {
      serviceMap.set(svcName, {
        packet_key: `rpc_svc_${svcName}`,
        source_ref: packet.source_ref.split('.')[0], // usually proto:ServiceName
        service_name: svcName,
        methods: [],
        qdrant_tags: new Set(),
        domain_class: 'mcp_agents'
      });
    }

    const svc = serviceMap.get(svcName);
    svc.methods.push({
      name: packet.function_symbol,
      input: packet.input_type || 'UnknownInput',
      output: packet.output_type || 'UnknownOutput'
    });

    for (const concept of (packet.concept_ids || [])) {
      svc.qdrant_tags.add(concept);
    }
  }

  const outLines = [];
  for (const svc of serviceMap.values()) {
    svc.qdrant_tags = Array.from(svc.qdrant_tags);
    outLines.push(JSON.stringify(svc));
  }

  fs.writeFileSync(OUTPUT_FILE, outLines.join('\n') + '\n');
  console.log(`Successfully wrote ${outLines.length} services to ${OUTPUT_FILE}`);
}

main();
