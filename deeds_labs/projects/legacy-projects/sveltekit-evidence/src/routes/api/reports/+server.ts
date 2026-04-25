/**
 * Reports API - Handles report creation and retrieval
 * POST /api/reports - Create new report
 * GET /api/reports?caseId=xxx - Get reports for case
 */
import { json } from "@sveltejs/kit";
import postgres from "postgres";

// --- removed zod import and added lightweight runtime validation ---
type CreateReportInput = {
  caseId: string;
  title: string;
  content: string;
  createdBy: string;
  type?: string;
};

const ALLOWED_TYPES = [
  "investigation",
  "forensic",
  "analysis",
  "summary",
] as const;

function isUUID(v: string) {
  // Basic UUID v4-ish check
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function validateCreateReportPayload(
  data: any
):
  | { valid: true; value: Required<CreateReportInput> }
  | { valid: false; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];
  if (!data || typeof data !== "object") {
    return {
      valid: false,
      errors: [{ field: "body", message: "Invalid JSON body" }],
    };
  }

  const caseId = String(data.caseId ?? "").trim();
  const title = String(data.title ?? "").trim();
  const content = String(data.content ?? "").trim();
  const createdBy = String(data.createdBy ?? "").trim();
  const type = data.type ? String(data.type).trim() : "investigation";

  if (!caseId) errors.push({ field: "caseId", message: "caseId is required" });
  else if (!isUUID(caseId))
    errors.push({ field: "caseId", message: "caseId must be a valid UUID" });

  if (!title) errors.push({ field: "title", message: "title is required" });
  else if (title.length > 500)
    errors.push({
      field: "title",
      message: "title must be <= 500 characters",
    });

  if (!content)
    errors.push({ field: "content", message: "content is required" });

  if (!createdBy)
    errors.push({ field: "createdBy", message: "createdBy is required" });

  if (!ALLOWED_TYPES.includes(type as any)) {
    errors.push({
      field: "type",
      message: `type must be one of: ${ALLOWED_TYPES.join(", ")}`,
    });
  }

  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    value: {
      caseId,
      title,
      content,
      createdBy,
      type: (type as (typeof ALLOWED_TYPES)[number]) || "investigation",
    },
  };
}

// Database connection
const sql = postgres(
  process.env.DATABASE_URL ||
    "postgresql://legal_admin:123456@localhost:5434/legal_ai_test",
  { max: 10 }
);

// Validation schemas
// Removed unused Zod schema (z) because runtime validation is used above.
// Previously there was:
// const CreateReportSchema = z.object({ ... })
// which referenced `z` without importing zod, causing the compile error.
// No replacement needed because validateCreateReportPayload handles validation.

export async function POST({ request }: { request: Request }) {
  try {
    const data = await request.json();
    const validation = validateCreateReportPayload(data);

    if (!validation.valid) {
      return json(
        { error: "Invalid request", details: validation.errors },
        { status: 400 }
      );
    }

    const validated = validation.value;

    // Verify case exists
    const caseExists = await sql`
      SELECT id FROM cases WHERE id = ${validated.caseId}
    `;

    if (caseExists.length === 0) {
      return json({ error: "Case not found" }, { status: 404 });
    }

    // Create report
    const inserted = await sql`
      INSERT INTO reports (case_id, title, content, created_by, type, status)
      VALUES (
        ${validated.caseId},
        ${validated.title},
        ${validated.content},
        ${validated.createdBy},
        ${validated.type},
        'draft'
      )
      RETURNING id, case_id as "caseId", title, content, created_at as "createdAt", created_by as "createdBy", type, status
    `;

    return json(inserted[0]);
  } catch (error) {
    console.error("Report creation error:", error);

    return json({ error: "Failed to create report" }, { status: 500 });
  }
}

export async function GET({ url }: { url: URL }) {
  const caseId = url.searchParams.get("caseId");

  if (!caseId) {
    return json({ error: "Case ID required" }, { status: 400 });
  }

  // Optional: validate caseId format to provide a clearer error early
  if (!isUUID(caseId)) {
    return json({ error: "Invalid Case ID format" }, { status: 400 });
  }

  try {
    // Fetch reports from database
    const reports = await sql`
      SELECT
        id,
        case_id as "caseId",
        title,
        content,
        type,
        status,
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM reports
      WHERE case_id = ${caseId}
      ORDER BY created_at DESC
    `;

    return json(reports);
  } catch (error) {
    console.error("Failed to fetch reports for caseId:", caseId, error);
    return json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
