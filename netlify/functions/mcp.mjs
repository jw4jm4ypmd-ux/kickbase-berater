import { timingSafeEqual } from "node:crypto";
import { handleRpc } from "../../lib/mcp.mjs";

export const config = { path: "/mcp" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function authorized(req) {
  const secret = process.env.MCP_SECRET;
  if (!secret) return false; // ohne Geheimschlüssel bleibt der Server zu
  const url = new URL(req.url);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const given = url.searchParams.get("key") || bearer || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  if (!authorized(req)) return json({ error: "Nicht autorisiert" }, 401);
  if (req.method !== "POST") return new Response("Nur POST", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Ungültiges JSON" } }, 400);
  }

  if (Array.isArray(body)) {
    const results = (await Promise.all(body.map(handleRpc))).filter(Boolean);
    return results.length ? json(results) : new Response(null, { status: 202 });
  }
  const result = await handleRpc(body);
  return result ? json(result) : new Response(null, { status: 202 });
};
