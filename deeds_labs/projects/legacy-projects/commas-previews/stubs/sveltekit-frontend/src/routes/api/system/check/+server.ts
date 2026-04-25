// Preview stub for /api/system/check
import { json } from '@sveltejs/kit';
export async function GET() {
  return json({ status: 'ok' });
}
