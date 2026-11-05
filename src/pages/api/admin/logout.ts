import type { APIRoute } from 'astro';
import { clearSession } from '../../../lib/adminAuth';

export const POST: APIRoute = async ({ cookies }) => {
  clearSession(cookies);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
