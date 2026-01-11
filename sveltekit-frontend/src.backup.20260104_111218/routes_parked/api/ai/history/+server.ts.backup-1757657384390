import { aiHistory } from "$lib/db/schema/aiHistory";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from './$types';


export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { prompt, response, embedding } = await request.json();
    const userId = locals.user?.id || "anonymous";
    await db.insert(aiHistory).values({ prompt, response, embedding, userId });
    return json({ success: true });
  } catch (error: any) {
    return json({ error: "Failed to save AI history" }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const userId = locals.user?.id || "anonymous";
    const history = await db
      .select()
      .from(aiHistory)
      .where(eq(aiHistory.userId, userId));
    return json({ history });
  } catch (error: any) {
    return json({ error: "Failed to fetch AI history" }, { status: 500 });
  }
};
