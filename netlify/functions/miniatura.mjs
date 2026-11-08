// GET /api/miniatura?id=123&p=/caminho/foto.jpg -> imagem pequena
import { liberarAcesso, caminhoPermitido, miniatura, linkTemporario } from "../../lib/core.mjs";

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
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=604800, immutable" },
    });
  } catch (e) {
    console.error("miniatura falhou", p, String(e && e.message || e));
    // Se a miniatura falhar, mostra a foto original (link temporário do Dropbox).
    try {
      const link = await linkTemporario(p);
      return new Response(null, { status: 302, headers: { location: link, "cache-control": "no-store" } });
    } catch (e2) {
      console.error("link temporario falhou", p, String(e2 && e2.message || e2));
      return new Response("erro: " + String(e2 && e2.message || e2).slice(0, 300), { status: 502 });
    }
  }
};

export const config = { path: "/api/miniatura" };
