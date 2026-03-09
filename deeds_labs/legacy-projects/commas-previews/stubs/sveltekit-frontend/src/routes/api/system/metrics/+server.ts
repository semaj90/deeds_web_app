// Preview stub for /api/system/metrics
import { json } from '@sveltejs/kit';
export async function GET() {
  return json({ metrics: {} });
}
