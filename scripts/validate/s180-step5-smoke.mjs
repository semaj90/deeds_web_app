import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.env.S180_REPO_ROOT ?? process.cwd();
const appRoot = process.env.S180_APP_ROOT ?? path.join(repoRoot, "sveltekit-frontend");
const qdrantUrl = process.env.QDRANT_URL ?? "http://127.0.0.1:6333";
const collection = process.env.QDRANT_COLLECTION ?? "codebase_chunks_768";
const mcpBaseUrl = process.env.MCP_BASE_URL ?? "http://127.0.0.1:8788";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 8000);

const expectedV2Fields = [
  "packet_key",
  "workspace_id",
  "source_ref",
  "source_revision",
  "feature_id",
  "symbol_id",
  "content_hash",
  "tree_node_id",
];

const report = {
  generated_at: new Date().toISOString(),
  mode: "READ_ONLY_SMOKE",
  collection,
  statuses: {},
  evidence: {},
  blockers: [],
  reconciliation: {
    sample_size: 0,
    reconcilable: [],
    ambiguous: [],
    missing_postgres_row: [],
    missing_qdrant_point: [],
    stale_revision: [],
    conflicting_identity: [],
  },
};

const allowedStatuses = new Set([
  "PASS",
  "PARTIAL_PROVEN",
  "FAIL",
  "NOT_PROVEN",
  "BLOCKED",
  "NOT_APPLICABLE",
]);

function setStatus(name, value, evidence) {
  if (!allowedStatuses.has(value)) throw new Error(`Invalid status ${value}`);
  report.statuses[name] = value;
  if (evidence !== undefined) report.evidence[name] = evidence;
}

function redact(value) {
  return String(value ?? "")
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/gi, "$1<REDACTED>@")
    .replace(/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=<REDACTED>");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const error = new Error(`${options.method ?? "GET"} ${url} -> HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function proveMcpRegistration() {
  const attempts = [
    {
      name: "GET /mcp/tools/list",
      run: () => fetchJson(`${mcpBaseUrl}/mcp/tools/list`),
    },
    {
      name: "GET /tools/list",
      run: () => fetchJson(`${mcpBaseUrl}/tools/list`),
    },
    {
      name: "JSON-RPC tools/list",
      run: () =>
        fetchJson(`${mcpBaseUrl}/mcp`, {
          method: "POST",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "s180-smoke",
            method: "tools/list",
            params: {},
          }),
        }),
    },
  ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      const body = await attempt.run();
      const serialized = JSON.stringify(body);
      const found =
        serialized.includes("atlas/prepare-patch-context") ||
        serialized.includes("atlas:prepare_patch_context") ||
        serialized.includes("prepare_patch_context") ||
        serialized.includes("prepare-patch-context");

      if (found) {
        setStatus("S180_2_MCP_REGISTRATION", "PASS", {
          endpoint: attempt.name,
          tool_name_match: true,
        });
        return true;
      }
      failures.push({ endpoint: attempt.name, result: "reachable_but_tool_not_found" });
    } catch (error) {
      failures.push({
        endpoint: attempt.name,
        error: redact(error?.message ?? error),
      });
    }
  }

  setStatus("S180_2_MCP_REGISTRATION", "NOT_PROVEN", failures);
  report.blockers.push("MCP registration for prepare-patch-context was not proven.");
  return false;
}

async function inspectQdrant() {
  try {
    const info = await fetchJson(
      `${qdrantUrl}/collections/${encodeURIComponent(collection)}`,
    );
    const payloadSchema = info?.result?.payload_schema ?? {};
    const currentFields = Object.keys(payloadSchema);

    const scroll = await fetchJson(
      `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`,
      {
        method: "POST",
        body: JSON.stringify({
          limit: 5,
          with_payload: true,
          with_vector: false,
        }),
      },
    );

    const points = scroll?.result?.points ?? [];
    const samplePayloads = points.map((point) => ({
      id: point.id,
      payload: point.payload ?? {},
    }));

    const observedFields = new Set(currentFields);
    for (const point of samplePayloads) {
      for (const field of Object.keys(point.payload)) observedFields.add(field);
    }

    const missingFields = expectedV2Fields.filter((field) => !observedFields.has(field));
    const presentFields = expectedV2Fields.filter((field) => observedFields.has(field));

    setStatus("S180_3_QDRANT_INVENTORY", "PASS", {
      collection_status: info?.result?.status,
      points_count: info?.result?.points_count,
      indexed_vectors_count: info?.result?.indexed_vectors_count,
      payload_schema: payloadSchema,
      sample_payloads: samplePayloads,
    });

    if (missingFields.length === 0) {
      setStatus("S180_4_PAYLOAD_V2_CONTRACT_COVERAGE", "PASS", {
        expected_fields: expectedV2Fields,
        present_fields: presentFields,
        missing_fields: [],
      });
    } else {
      setStatus("S180_4_PAYLOAD_V2_CONTRACT_COVERAGE", "PARTIAL_PROVEN", {
        expected_fields: expectedV2Fields,
        present_fields: presentFields,
        missing_fields: missingFields,
      });
      report.blockers.push(
        `Qdrant payload-v2 coverage is incomplete: ${missingFields.join(", ")}`,
      );
    }

    return {
      info,
      payloadSchema,
      samplePayloads,
      missingFields,
    };
  } catch (error) {
    setStatus("S180_3_QDRANT_INVENTORY", "FAIL", {
      error: redact(error?.stack ?? error),
    });
    setStatus("S180_4_PAYLOAD_V2_CONTRACT_COVERAGE", "BLOCKED");
    report.blockers.push("Qdrant collection inventory failed.");
    return null;
  }
}

async function loadPgClient() {
  try {
    const mod = await import("pg");
    return mod.Client;
  } catch (error) {
    setStatus("POSTGRES_CLIENT_AVAILABLE", "BLOCKED", {
      error: redact(error?.message ?? error),
      remediation: "Run from sveltekit-frontend where the existing pg dependency is installed.",
    });
    report.blockers.push("Node package 'pg' was not available.");
    return null;
  }
}

function qdrantFilterForPacketKey(packetKey) {
  return {
    must: [
      {
        key: "packet_key",
        match: { value: packetKey },
      },
    ],
  };
}

async function sampleCanonicalPackets(Client) {
  const client = new Client({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5434),
    database: process.env.PGDATABASE ?? "legal_ai_db",
    user: process.env.PGUSER ?? "legal_admin",
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
    query_timeout: 8000,
    application_name: "s180-step5-smoke",
  });

  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");

    const columnsResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'atlas_packets'
    `);
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));

    const requested = [
      "packet_key",
      "workspace_id",
      "source_ref",
      "source_revision",
      "feature_id",
      "symbol_id",
      "content_hash",
      "tree_node_id",
      "representation_id",
      "representation_revision",
      "schema_version",
    ];
    const selected = requested.filter((column) => columns.has(column));

    if (!selected.includes("packet_key")) {
      throw new Error("public.atlas_packets does not expose packet_key");
    }

    const sql = `
      SELECT ${selected.map((name) => `"${name}"`).join(", ")}
      FROM public.atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST, packet_key
      LIMIT 10
    `;
    const result = await client.query(sql);
    await client.query("ROLLBACK");

    setStatus("POSTGRES_CANONICAL_PACKET_SAMPLE", "PASS", {
      selected_columns: selected,
      row_count: result.rowCount,
    });
    return result.rows;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    setStatus("POSTGRES_CANONICAL_PACKET_SAMPLE", "FAIL", {
      error: redact(error?.stack ?? error),
    });
    report.blockers.push("Canonical PostgreSQL packet sample failed.");
    return [];
  } finally {
    try { await client.end(); } catch {}
  }
}

function comparePacket(postgres, qdrantPoint) {
  const payload = qdrantPoint.payload ?? {};
  const conflicts = [];

  for (const key of [
    "workspace_id",
    "source_ref",
    "source_revision",
    "feature_id",
    "symbol_id",
    "content_hash",
    "tree_node_id",
  ]) {
    if (
      postgres[key] !== undefined &&
      postgres[key] !== null &&
      payload[key] !== undefined &&
      payload[key] !== null &&
      String(postgres[key]) !== String(payload[key])
    ) {
      conflicts.push({
        field: key,
        postgres: postgres[key],
        qdrant: payload[key],
      });
    }
  }

  const stale =
    postgres.source_revision != null &&
    payload.source_revision != null &&
    Number(payload.source_revision) < Number(postgres.source_revision);

  return { conflicts, stale };
}

async function reconcileTen(packets) {
  if (!packets.length) {
    setStatus("S180_5_DRY_RUN_RECONCILIATION", "BLOCKED");
    return;
  }

  report.reconciliation.sample_size = packets.length;

  for (const packet of packets) {
    try {
      const body = await fetchJson(
        `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`,
        {
          method: "POST",
          body: JSON.stringify({
            limit: 3,
            with_payload: true,
            with_vector: false,
            filter: qdrantFilterForPacketKey(packet.packet_key),
          }),
        },
      );
      const matches = body?.result?.points ?? [];

      if (matches.length === 0) {
        report.reconciliation.missing_qdrant_point.push({
          packet_key: packet.packet_key,
        });
        continue;
      }
      if (matches.length > 1) {
        report.reconciliation.ambiguous.push({
          packet_key: packet.packet_key,
          qdrant_point_ids: matches.map((point) => point.id),
        });
        continue;
      }

      const point = matches[0];
      const comparison = comparePacket(packet, point);

      if (comparison.stale) {
        report.reconciliation.stale_revision.push({
          packet_key: packet.packet_key,
          postgres_source_revision: packet.source_revision,
          qdrant_source_revision: point.payload?.source_revision,
          qdrant_point_id: point.id,
        });
      }

      if (comparison.conflicts.length) {
        report.reconciliation.conflicting_identity.push({
          packet_key: packet.packet_key,
          qdrant_point_id: point.id,
          conflicts: comparison.conflicts,
        });
      }

      if (!comparison.stale && comparison.conflicts.length === 0) {
        report.reconciliation.reconcilable.push({
          packet_key: packet.packet_key,
          qdrant_point_id: point.id,
        });
      }
    } catch (error) {
      report.reconciliation.ambiguous.push({
        packet_key: packet.packet_key,
        error: redact(error?.message ?? error),
      });
    }
  }

  const reconciled = report.reconciliation.reconcilable.length;
  const total = report.reconciliation.sample_size;
  const blockers =
    report.reconciliation.ambiguous.length +
    report.reconciliation.missing_qdrant_point.length +
    report.reconciliation.stale_revision.length +
    report.reconciliation.conflicting_identity.length;

  if (total > 0 && reconciled === total && blockers === 0) {
    setStatus("S180_5_DRY_RUN_RECONCILIATION", "PASS", {
      reconciled,
      total,
    });
  } else if (reconciled > 0) {
    setStatus("S180_5_DRY_RUN_RECONCILIATION", "PARTIAL_PROVEN", {
      reconciled,
      total,
      blockers,
    });
  } else {
    setStatus("S180_5_DRY_RUN_RECONCILIATION", "BLOCKED", {
      reconciled,
      total,
      blockers,
    });
  }
}

async function writeReports() {
  const outputDir = path.join(repoRoot, "docs", "reports");
  await fs.mkdir(outputDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(outputDir, `session-180-step5-smoke-${date}.json`);
  const mdPath = path.join(outputDir, `session-180-step5-smoke-${date}.md`);

  const lines = [
    "# Session 180 Step 5 Smoke Validation",
    "",
    `Generated: \`${report.generated_at}\``,
    "",
    "Mode: **read-only**",
    "",
    "## Status",
    "",
    "| Gate | Status |",
    "|---|---|",
    ...Object.entries(report.statuses).map(
      ([name, status]) => `| \`${name}\` | **${status}** |`,
    ),
    "",
    "## Readiness",
    "",
    `- S180-5 readiness: **${report.statuses.S180_5_READINESS ?? "NOT_PROVEN"}**`,
    `- Phase 5A readiness: **${report.statuses.PHASE_5A_READINESS ?? "BLOCKED"}**`,
    "",
    "## Blockers",
    "",
    ...(report.blockers.length
      ? report.blockers.map((item) => `- ${item}`)
      : ["- None found by this bounded smoke test."]),
    "",
    "## Reconciliation summary",
    "",
    "```json",
    JSON.stringify(report.reconciliation, null, 2),
    "```",
    "",
    "## Safety",
    "",
    "- PostgreSQL transaction is `READ ONLY`.",
    "- Qdrant calls use collection metadata and point scrolling only.",
    "- No payload updates, upserts, deletes, migrations, or backfills are performed.",
  ];

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(mdPath, lines.join("\n"), "utf8");

  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);
}

async function main() {
  const mcpRegistered = await proveMcpRegistration();
  const qdrant = await inspectQdrant();
  const Client = await loadPgClient();

  let packets = [];
  if (Client && qdrant) {
    packets = await sampleCanonicalPackets(Client);
    await reconcileTen(packets);
  } else {
    setStatus("S180_5_DRY_RUN_RECONCILIATION", "BLOCKED");
  }

  const prereqsPass =
    report.statuses.S180_2_MCP_REGISTRATION === "PASS" &&
    report.statuses.S180_3_QDRANT_INVENTORY === "PASS" &&
    ["PASS", "PARTIAL_PROVEN"].includes(
      report.statuses.S180_4_PAYLOAD_V2_CONTRACT_COVERAGE,
    ) &&
    report.statuses.POSTGRES_CANONICAL_PACKET_SAMPLE === "PASS";

  if (
    prereqsPass &&
    ["PASS", "PARTIAL_PROVEN"].includes(
      report.statuses.S180_5_DRY_RUN_RECONCILIATION,
    )
  ) {
    setStatus("S180_5_READINESS", "PASS");
  } else {
    setStatus("S180_5_READINESS", "BLOCKED");
  }

  const payloadContractComplete =
    report.statuses.S180_4_PAYLOAD_V2_CONTRACT_COVERAGE === "PASS";
  const reconciliationPass =
    report.statuses.S180_5_DRY_RUN_RECONCILIATION === "PASS";

  if (mcpRegistered && payloadContractComplete && reconciliationPass) {
    setStatus("S180_6_BACKFILL_READINESS", "PARTIAL_PROVEN", {
      note: "Identity smoke gates passed, but rollback implementation and reviewed migration plan are still required.",
    });
  } else {
    setStatus("S180_6_BACKFILL_READINESS", "BLOCKED");
  }

  setStatus("REAL_RETRIEVAL_LANES", "NOT_PROVEN");
  setStatus("PHASE_5A_READINESS", "BLOCKED", {
    reason:
      "Real retrieval lanes remain NOT_PROVEN. This smoke test does not authorize Phase 5A or writes.",
  });
  setStatus("PRODUCTION_MUTATIONS_PERFORMED", "PASS", "None");

  await writeReports();

  for (const [name, status] of Object.entries(report.statuses)) {
    console.log(`${name.padEnd(42)} ${status}`);
  }

  process.exit(
    report.statuses.S180_5_READINESS === "PASS" ? 0 : 2,
  );
}

main().catch(async (error) => {
  report.blockers.push(redact(error?.stack ?? error));
  setStatus("S180_5_READINESS", "BLOCKED");
  setStatus("PHASE_5A_READINESS", "BLOCKED");
  await writeReports();
  console.error(redact(error?.stack ?? error));
  process.exit(1);
});
