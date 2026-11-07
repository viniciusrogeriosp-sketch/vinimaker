// GET /api/foto?id=123&p=/caminho/foto.jpg -> manda para um link temporário (vale 4h)
import { liberarAcesso, caminhoPermitido, linkTemporario } from "../../lib/core.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  const p = u.searchParams.get("p") || "";
  const a = await liberarAcesso(req, id, { registrar: false });
  if (!a.ok) return Response.redirect(new URL(`/f/${encodeURIComponent(id)}`, req.url), 302);
  if (!(await caminhoPermitido(p))) return new Response("não encontrada", { status: 404 });
  try {
    const link = await linkTemporario(p);
    return new Response(null, { status: 302, headers: { location: link, "cache-control": "no-store" } });
  } catch (e) {
    console.error(e);
    return new Response("erro", { status: 502 });
  }
};

export const config = { path: "/api/foto" };
