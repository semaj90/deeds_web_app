import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db/client.js";
import { uploadedFiles } from "$lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import { deleteFileFromSeaweed } from "$lib/server/storage/seaweed.js";
import { ENV } from "$lib/server/env.server.js";

/**
 * DELETE /api/files/[id]
 * Remove file from SeaweedFS and delete metadata from Postgres.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [row] = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.id, params.id))
      .limit(1);

    if (!row) {
      throw error(404, "File not found");
    }

    // 1. Delete from SeaweedFS
    await deleteFileFromSeaweed(row.objectKey);

    // 2. Delete from Postgres
    await db
      .delete(uploadedFiles)
      .where(eq(uploadedFiles.id, params.id));

    return json({ ok: true });
  } catch (err) {
    console.error("Delete failed:", err);
    return json({ error: (err as Error).message }, { status: 500 });
  }
};
