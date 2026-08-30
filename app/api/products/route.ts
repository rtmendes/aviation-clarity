import { ok, respond } from '@/lib/http';
import { listLiveProducts } from '@/lib/repositories/commerce';

export const dynamic = 'force-dynamic';

/** The public catalogue. Only products marked live are visible. */
export async function GET() {
  const result = await listLiveProducts();
  if (!result.ok) return respond(result);
  return ok({ products: result.data, count: result.data.length });
}
