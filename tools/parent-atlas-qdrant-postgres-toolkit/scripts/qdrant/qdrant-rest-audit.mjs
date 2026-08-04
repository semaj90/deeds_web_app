import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = process.env.QDRANT_URL ?? "http://127.0.0.1:6333";
const collection = process.env.QDRANT_COLLECTION ?? "codebase_chunks_768";
const timeoutMs = Number(process.env.QDRANT_TIMEOUT_MS ?? 8000);
const output =
  process.env.QDRANT_AUDIT_OUTPUT ??
  path.resolve("docs/reports/qdrant-rest-audit.json");

async function request(pathname, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; }
    catch { body = text; }

    if (!response.ok) {
      throw new Error(
        `${init.method ?? "GET"} ${pathname} returned HTTP ${response.status}: ` +
        `${String(text).slice(0, 500)}`,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const expectedIdentityFields = [
  "packet_key",
  "workspace_id",
  "workspace_revision",
  "source_ref",
  "source_revision",
  "representation_id",
  "representation_revision",
  "content_hash",
];

async function main() {
  const ready = await request("/readyz").catch((error) => ({
    error: String(error),
  }));

  const collectionInfo = await request(
    `/collections/${encodeURIComponent(collection)}`,
  );

  const scroll = await request(
    `/collections/${encodeURIComponent(collection)}/points/scroll`,
    {
      method: "POST",
      body: JSON.stringify({
        limit: 10,
        with_payload: true,
        with_vector: false,
      }),
    },
  );

  const points = scroll?.result?.points ?? [];
  const schemaFields = Object.keys(collectionInfo?.result?.payload_schema ?? {});
  const sampleFields = [
    ...new Set(
      points.flatMap((point) => Object.keys(point.payload ?? {})),
    ),
  ].sort();

  const observedFields = [...new Set([...schemaFields, ...sampleFields])].sort();

  const report = {
    generated_at: new Date().toISOString(),
    mode: "READ_ONLY",
    base_url: baseUrl,
    collection,
    readiness: ready,
    collection_status: collectionInfo?.result?.status ?? null,
    points_count: collectionInfo?.result?.points_count ?? null,
    indexed_vectors_count:
      collectionInfo?.result?.indexed_vectors_count ?? null,
    vector_config: collectionInfo?.result?.config?.params?.vectors ?? null,
    sparse_vector_config:
      collectionInfo?.result?.config?.params?.sparse_vectors ?? null,
    payload_schema: collectionInfo?.result?.payload_schema ?? {},
    sample_point_count: points.length,
    sample_points: points.map((point) => ({
      id: point.id,
      payload: point.payload ?? {},
    })),
    expected_identity_fields: expectedIdentityFields,
    observed_fields: observedFields,
    present_identity_fields: expectedIdentityFields.filter((field) =>
      observedFields.includes(field),
    ),
    missing_or_unproven_identity_fields: expectedIdentityFields.filter(
      (field) => !observedFields.includes(field),
    ),
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${output}`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
