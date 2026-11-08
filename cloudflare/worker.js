// Galeria protegida VINIMAKER na Cloudflare (Workers grátis).
// Guarda quem abriu cada link pessoal e a autorização do Dropbox num Durable Object.
import { DurableObject } from "cloudflare:workers";

export class Loja extends DurableObject {
  async ler(k) { return (await this.ctx.storage.get(k)) ?? null; }
  async gravar(k, v) { await this.ctx.storage.put(k, v); }
}

const COOKIE = "vm_aparelho";
const EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
let E; // env da requisição atual
const loja = () => E.LOJA.get(E.LOJA.idFromName("vinimaker"));
const PASTA = () => E.DROPBOX_PASTA || "/Hípica - Beach Tênnis 7 e 8";
const MAX = () => parseInt(E.MAX_APARELHOS || "2", 10) || 2;
const CHAVE = () => "dropbox-v" + (E.CONEXAO_VERSAO || "1");

const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const html = (corpo, s = 200, h = {}) => new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VINIMAKER</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5;color:#111;background:#fff}code{background:#f2f2f2;padding:2px 6px;border-radius:4px}</style></head><body>${corpo}</body></html>`, { status: s, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...h } });
const lerCookie = (req, n) => ((req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + n + "=([^;]+)")) || [])[1] || null;
const idValido = (id) => typeof id === "string" && /^[0-9]{5,25}$/.test(id);

async function liberar(req, id, registrar) {
  if (!idValido(id)) return { ok: false, motivo: "link" };
  let ap = lerCookie(req, COOKIE), setCookie;
  if (!ap || !/^[a-f0-9-]{36}$/.test(ap)) {
    if (!registrar) return { ok: false, motivo: "repassado" };
    ap = crypto.randomUUID();
    setCookie = `${COOKIE}=${ap}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  }
  const reg = (await loja().ler("acesso:" + id)) || { aparelhos: [], criado: Date.now() };
  if (reg.aparelhos.includes(ap)) return { ok: true, setCookie };
  if (!registrar || reg.aparelhos.length >= MAX()) return { ok: false, motivo: "repassado", setCookie };
  reg.aparelhos.push(ap); reg.ultimo = Date.now();
  await loja().gravar("acesso:" + id, reg);
  return { ok: true, setCookie };
}

// ---------- Dropbox ----------
let cacheToken = { v: null, ate: 0 };
async function token() {
  if (cacheToken.v && Date.now() < cacheToken.ate) return cacheToken.v;
  const cfg = await loja().ler(CHAVE());
  if (!cfg?.refresh_token) throw new Error("dropbox-nao-conectado");
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: E.DROPBOX_APP_KEY, client_secret: E.DROPBOX_APP_SECRET }) });
  if (!r.ok) throw new Error("dropbox-token " + r.status + " " + (await r.text()));
  const d = await r.json();
  cacheToken = { v: d.access_token, ate: Date.now() + (d.expires_in - 300) * 1000 };
  return d.access_token;
}
async function dbx(host, rota, corpo) {
  const r = await fetch(`https://${host}.dropboxapi.com/2/${rota}`, { method: "POST", headers: { authorization: "Bearer " + (await token()), "content-type": "application/json" }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`dropbox ${rota} ${r.status} ${await r.text()}`);
  return r.json();
}
let cacheLista = { em: 0, itens: null };
async function listar() {
  if (cacheLista.itens && Date.now() - cacheLista.em < 45000) return cacheLista.itens;
  let d = await dbx("api", "files/list_folder", { path: PASTA(), recursive: true, limit: 2000 });
  const todos = [...d.entries];
  while (d.has_more) { d = await dbx("api", "files/list_folder/continue", { cursor: d.cursor }); todos.push(...d.entries); }
  const itens = todos.filter((e) => e[".tag"] === "file" && EXT.test(e.name)).map((e) => {
    const p = e.path_display.split("/");
    return { p: e.path_display, n: e.name, t: e.client_modified, id: e.id, d: p.length > 3 ? p[p.length - 2] : "" };
  }).sort((a, b) => (a.t < b.t ? 1 : -1));
  cacheLista = { em: Date.now(), itens };
  return itens;
}
async function achar({ p, i }) {
  const l = await listar();
  return l.find((f) => (i ? f.id === i : f.p === p)) || null;
}
const tamanho = (g) => (g ? "w640h480" : "w256h256");

// ---------- rotas ----------
async function conectar(req, u) {
  const key = E.DROPBOX_APP_KEY, secret = E.DROPBOX_APP_SECRET;
  if (!key || !secret) return html(`<h2>Falta configurar</h2><p>Coloque <code>DROPBOX_APP_KEY</code> e <code>DROPBOX_APP_SECRET</code> nas variáveis do Worker.</p>`, 500);
  const retorno = `${u.origin}/api/dropbox-retorno`;
  const ja = await loja().ler(CHAVE());
  if (u.pathname === "/api/conectar") {
    if (ja) { let n = "?"; try { n = (await listar()).length; } catch (e) { n = "erro: " + e.message; } return html(`<h2>✅ Dropbox já está conectado</h2><p>Pasta: <code>${PASTA()}</code><br>Fotos encontradas agora: <b>${n}</b></p>`); }
    const estado = crypto.randomUUID();
    const a = new URL("https://www.dropbox.com/oauth2/authorize");
    a.search = new URLSearchParams({ client_id: key, response_type: "code", token_access_type: "offline", redirect_uri: retorno, state: estado }).toString();
    return new Response(null, { status: 302, headers: { location: a.toString(), "set-cookie": `vm_estado=${estado}; Path=/api; Max-Age=900; HttpOnly; Secure; SameSite=Lax` } });
  }
  const code = u.searchParams.get("code"), estado = u.searchParams.get("state");
  if (!code || !estado || estado !== lerCookie(req, "vm_estado")) return html(`<h2>Não deu certo</h2><p>Abra <a href="/api/conectar">/api/conectar</a> e tente de novo.</p>`, 400);
  if (ja) return html(`<h2>✅ Dropbox já estava conectado</h2>`);
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: key, client_secret: secret, redirect_uri: retorno }) });
  if (!r.ok) return html(`<h2>Erro do Dropbox</h2><pre>${(await r.text()).replace(/</g, "&lt;")}</pre>`, 502);
  const d = await r.json();
  if (!d.refresh_token) return html(`<h2>Erro</h2><p>O Dropbox não mandou a autorização permanente.</p>`, 502);
  await loja().gravar(CHAVE(), { refresh_token: d.refresh_token, conta: d.account_id, em: Date.now() });
  let n = "?", erro = "";
  try { n = (await listar()).length; } catch (e) { erro = String(e.message || e); }
  return html(`<h2>✅ Dropbox conectado!</h2><p>Pasta: <code>${PASTA()}</code><br>Fotos encontradas: <b>${n}</b></p>${erro ? `<p style="color:#b00">Aviso: ${erro.replace(/</g, "&lt;")}</p>` : ""}<p>Pode fechar esta página.</p>`);
}

async function rotas(req, u) {
  const q = u.searchParams, id = q.get("id") || "";
  switch (u.pathname) {
    case "/api/conectar": case "/api/dropbox-retorno": return conectar(req, u);
    case "/api/fotos": {
      const a = await liberar(req, id, true);
      const h = a.setCookie ? { "set-cookie": a.setCookie } : {};
      if (!a.ok) return json({ ok: false, motivo: a.motivo }, 403, h);
      const l = await listar();
      return json({ ok: true, fotos: l.map((f) => ({ p: f.p, n: f.n, d: f.d, i: f.id })) }, 200, h);
    }
    case "/api/miniaturas": { // até 25 miniaturas numa chamada só
      const a = await liberar(req, id, false);
      if (!a.ok) return json({ ok: false }, 403);
      const l = await listar();
      const pedidos = (q.get("f") || "").split(",").filter(Boolean).slice(0, 25).map((i) => l.find((f) => f.id === i)).filter(Boolean);
      const out = {};
      if (pedidos.length) {
        const d = await dbx("content", "files/get_thumbnail_batch", { entries: pedidos.map((f) => ({ path: f.id, format: "jpeg", size: tamanho(false), mode: "fitone_bestfit" })) });
        d.entries.forEach((e, k) => { out[pedidos[k].id] = e[".tag"] === "success" ? e.thumbnail : null; });
      }
      return json({ ok: true, m: out }, 200, { "cache-control": "private, max-age=86400" });
    }
    case "/api/miniatura": {
      const a = await liberar(req, id, false);
      if (!a.ok) return new Response("bloqueado", { status: 403 });
      const f = await achar({ p: q.get("p"), i: q.get("i") });
      if (!f) return new Response("não encontrada", { status: 404 });
      const grande = q.get("g") === "1";
      const arg = JSON.stringify({ resource: { ".tag": "path", path: f.id }, format: "jpeg", size: tamanho(grande), mode: "fitone_bestfit" });
      const r = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", { method: "POST", headers: { authorization: "Bearer " + (await token()), "Dropbox-API-Arg": arg } });
      if (r.ok) return new Response(r.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=604800" } });
      const t = await dbx("api", "files/get_temporary_link", { path: f.id });
      return Response.redirect(t.link, 302);
    }
    case "/api/foto": {
      const a = await liberar(req, id, false);
      if (!a.ok) return Response.redirect(new URL(`/f/${encodeURIComponent(id)}`, u), 302);
      const f = await achar({ p: q.get("p"), i: q.get("i") });
      if (!f) return new Response("não encontrada", { status: 404 });
      const t = await dbx("api", "files/get_temporary_link", { path: f.id });
      return new Response(null, { status: 302, headers: { location: t.link, "cache-control": "no-store" } });
    }
  }
  return null;
}

export default {
  async fetch(req, env) {
    E = env;
    const u = new URL(req.url);
    if (u.pathname.startsWith("/api/")) {
      try { return (await rotas(req, u)) || new Response("não encontrado", { status: 404 }); }
      catch (e) { console.error(e); return u.pathname === "/api/fotos" ? json({ ok: false, motivo: "erro" }, 500) : new Response("erro: " + String(e.message || e).slice(0, 300), { status: 502 }); }
    }
    if (u.pathname.startsWith("/f/")) {
      const r = await env.ASSETS.fetch(new URL("/fotos.html", u));
      const h = new Headers(r.headers); h.set("Referrer-Policy", "no-referrer"); h.set("X-Robots-Tag", "noindex");
      return new Response(r.body, { status: 200, headers: h });
    }
    return env.ASSETS.fetch(req);
  },
};
