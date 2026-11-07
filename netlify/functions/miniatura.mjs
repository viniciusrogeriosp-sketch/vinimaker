// GET /api/miniatura?id=123&p=/caminho/foto.jpg -> imagem pequena
import { liberarAcesso, caminhoPermitido, miniatura } from "../../lib/core.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  const p = u.searchParams.get("p") || "";
  const a = await liberarAcesso(req, id, { registrar: false });
  if (!a.ok) return new Response("bloqueado", { status: 403 });
  if (!(await caminhoPermitido(p))) return new Response("não encontrada", { status: 404 });
  try {
    const img = await miniatura(p);
    return new Response(img, {
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" },
    });
  } catch (e) {
    console.error(e);
    return new Response("erro", { status: 502 });
  }
};

export const config = { path: "/api/miniatura" };
