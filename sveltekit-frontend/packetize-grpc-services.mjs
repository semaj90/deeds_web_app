#!/usr/bin/env node
import fs from 'fs';

const reportPath = './docs/reports/proto-registry-audit.json';
const registry = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

function generatePackets() {
  const packets = [];
  const seen = new Set();

  for (const service of registry.services) {
    if (!service.service_name) continue; // Skip invalid entries
    
    const serviceKey = `grpc:${service.service_name}`;
    if (seen.has(serviceKey)) continue;
    seen.add(serviceKey);

    packets.push({
      packet_key: serviceKey,
      source_ref: `proto:${service.file}`,
      feature_id: `grpc_${service.service_name.toLowerCase()}`,
      feature_label: `gRPC Service: ${service.service_name}`,
      directory_path: 'proto/services',
      qdrant_tags: ['grpc', 'service', service.service_name.toLowerCase(), ...(service.package?.split('.') || [])],
      domain_class: 'mcp_agents',
      summary: `${service.service_name} service with ${service.methods?.length || 0} RPC methods`,
      rank: 0
    });

    for (const method of (service.methods || [])) {
      const methodKey = `grpc:${service.service_name}.${method}`;
      if (seen.has(methodKey)) continue;
      seen.add(methodKey);

      packets.push({
        packet_key: methodKey,
        source_ref: `proto:${service.service_name}.${method}`,
        feature_id: `grpc_method`,
        feature_label: `${service.service_name}.${method}`,
        directory_path: `proto/services/${service.service_name.toLowerCase()}`,
        qdrant_tags: ['grpc', 'method', method.toLowerCase()],
        domain_class: 'mcp_agents',
        summary: `RPC method ${method} in ${service.service_name}`,
        rank: 1
      });
    }
  }

  return packets;
}

const packets = generatePackets();
console.log(`Generated ${packets.length} gRPC service packets\n`);

// Write JSONL
const jsonl = packets.map(p => JSON.stringify(p)).join('\n');
fs.writeFileSync('./docs/reports/grpc-service-packets.jsonl', jsonl);

console.log(`✅ Wrote ${packets.length} packets to grpc-service-packets.jsonl`);
console.log(`\nSample (first 2):`);
console.log(JSON.stringify(packets.slice(0, 2), null, 2));
