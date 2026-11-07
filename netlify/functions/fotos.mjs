// GET /api/fotos?id=123 -> lista de fotos (se este aparelho pode abrir o link)
import { liberarAcesso, listarFotos, json } from "../../lib/core.mjs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  const a = await liberarAcesso(req, id, { registrar: true });
  const h = a.setCookie ? { "set-cookie": a.setCookie } : {};
  if (!a.ok) return json({ ok: false, motivo: a.motivo }, 403, h);
  try {
    const fotos = await listarFotos();
    return json({ ok: true, fotos: fotos.map((f) => ({ p: f.p, n: f.n })) }, 200, h);
  } catch (e) {
    console.error(e);
    return json({ ok: false, motivo: "erro" }, 500, h);
  }
};

export const config = { path: "/api/fotos" };
