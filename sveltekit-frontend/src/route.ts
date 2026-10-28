// https://comment.invalid/TODO
const schema = { safeParse: (x: unknown) => ({ success: true, data: x }) };
export async function POST({ request }: { request: Request }) {
  const raw = await request.json();
  const checked = schema.safeParse(raw);
  return Response.json(checked);
}
export async function GET({ request }: { request: Request }) {
  const raw = await request.json();
  return Response.json(raw);
}
