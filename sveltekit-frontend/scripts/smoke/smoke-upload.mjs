import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root
dotenv.config({ path: join(__dirname, '../../../.env') });

async function runSmokeTest() {
  console.log("🔍 Starting Upload Smoke Test...");

  const s3Endpoint = process.env.SEAWEED_S3_ENDPOINT || "http://localhost:8333";
  const bucket = process.env.SEAWEED_S3_BUCKET || "deeds-dev";
  const dbUrl = process.env.DATABASE_URL;

  console.log(`   S3 Endpoint: ${s3Endpoint}`);
  console.log(`   S3 Bucket:   ${bucket}`);
  console.log(`   Database:    ${dbUrl?.split('@')[1] || "undefined"}`);

  // 1. Check SeaweedFS Reachability
  const s3 = new S3Client({
    region: process.env.SEAWEED_S3_REGION || "us-east-1",
    endpoint: s3Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.SEAWEED_ACCESS_KEY || "admin",
      secretAccessKey: process.env.SEAWEED_SECRET_KEY || "admin"
    }
  });

  try {
    await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    console.log("✅ G-UP1: SeaweedFS S3 endpoint reachable and bucket exists");
  } catch (err) {
    console.error("❌ G-UP1: SeaweedFS S3 unreachable:", err.message);
    process.exit(1);
  }

  // 2. Check Database Connectivity and Table
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const res = await pool.query("SELECT count(*) FROM uploaded_files");
    console.log(`✅ G-UP2: Database reachable, uploaded_files has ${res.rows[0].count} rows`);
  } catch (err) {
    console.error("❌ G-UP2: Database error:", err.message);
    process.exit(1);
  }

  // 3. Perform Test Upload
  const testKey = `smoke-test-${Date.now()}.txt`;
  const testContent = "Hello from Upload Smoke Test " + new Date().toISOString();

  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: "text/plain"
    }));
    console.log(`✅ G-UP3: Test file uploaded to SeaweedFS: ${testKey}`);
  } catch (err) {
    console.error("❌ G-UP3: Upload failed:", err.message);
    process.exit(1);
  }

  // 4. Insert Metadata Row
  let testId;
  try {
    const res = await pool.query(
      "INSERT INTO uploaded_files (original_name, object_key, bucket, size_bytes, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      ["smoke-test.txt", testKey, bucket, testContent.length, "smoke-test"]
    );
    testId = res.rows[0].id;
    console.log(`✅ G-UP4: Metadata row inserted in Postgres, ID: ${testId}`);
  } catch (err) {
    console.error("❌ G-UP4: Database insert failed:", err.message);
    // Cleanup S3
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    process.exit(1);
  }

  // 5. Cleanup
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    await pool.query("DELETE FROM uploaded_files WHERE id = $1", [testId]);
    console.log("✅ G-UP5: Cleanup successful (S3 object + DB row deleted)");
  } catch (err) {
    console.warn("⚠️ G-UP5: Cleanup partially failed:", err.message);
  }

  console.log("\n✨ Upload Smoke Test Passed: 5/5 layers verified.");
  await pool.end();
}

runSmokeTest().catch(err => {
  console.error("💥 Smoke test crashed:", err);
  process.exit(1);
});
