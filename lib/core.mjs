// Núcleo da galeria protegida VINIMAKER.
// Guarda quem abriu cada link pessoal (Netlify Blobs) e fala com o Dropbox.
import { getStore } from "@netlify/blobs";

const env = (k, d = "") => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);

export const PASTA = () => env("DROPBOX_PASTA", "/Hípica - Beach Tênnis 7 e 8");
export const MAX_APARELHOS = () => parseInt(env("MAX_APARELHOS", "2"), 10) || 2;
const VERSAO = () => env("CONEXAO_VERSAO", "1");
const COOKIE = "vm_aparelho";

export const lojaConfig = () => getStore({ name: "config", consistency: "strong" });
export const lojaAcessos = () => getStore({ name: "acessos", consistency: "strong" });

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function html(corpo, status = 200, headers = {}) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VINIMAKER</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5;color:#111;background:#fff}a.b{display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600}code{background:#f2f2f2;padding:2px 6px;border-radius:4px}</style></head><body>${corpo}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } },
  );
}

function lerCookie(req, nome) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + nome + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

// O id vem do ManyChat ({{contact id}}): só números, comprimento razoável.
export function idValido(id) {
  return typeof id === "string" && /^[0-9]{5,25}$/.test(id);
}

// Confere opcionalmente no ManyChat (só funciona com plano Pro + chave de API).
async function existeNoManyChat(id) {
  const chave = env("MANYCHAT_API_KEY");
  if (!chave) return true;
  try {
    const r = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${id}`, {
      headers: { authorization: `Bearer ${chave}` },
    });
    if (!r.ok) return false;
    const d = await r.json();
    return d?.status === "success";
  } catch {
    return false;
  }
}

// Decide se este aparelho pode abrir o link pessoal `id`.
// Devolve { ok, setCookie? , motivo? }
export async function liberarAcesso(req, id, { registrar = true } = {}) {
  if (!idValido(id)) return { ok: false, motivo: "link" };
  let aparelho = lerCookie(req, COOKIE);
  let setCookie;
  if (!aparelho || !/^[a-f0-9-]{36}$/.test(aparelho)) {
    if (!registrar) return { ok: false, motivo: "repassado" };
    aparelho = crypto.randomUUID();
    setCookie = `${COOKIE}=${aparelho}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  }
  const loja = lojaAcessos();
  const reg = (await loja.get(id, { type: "json" })) || { aparelhos: [], criado: Date.now() };
  if (reg.aparelhos.includes(aparelho)) return { ok: true, setCookie };
  if (!registrar) return { ok: false, motivo: "repassado" };
  if (reg.aparelhos.length >= MAX_APARELHOS()) return { ok: false, motivo: "repassado", setCookie };
  if (reg.aparelhos.length === 0 && !(await existeNoManyChat(id))) return { ok: false, motivo: "link" };
  reg.aparelhos.push(aparelho);
  reg.ultimo = Date.now();
  await loja.setJSON(id, reg);
  return { ok: true, setCookie };
}

// ---------- Dropbox ----------
const chaveToken = () => `dropbox-v${VERSAO()}`;

export async function dropboxConectado() {
  return !!(await lojaConfig().get(chaveToken(), { type: "json" }));
}

export async function salvarRefresh(refresh_token, conta) {
  await lojaConfig().setJSON(chaveToken(), { refresh_token, conta, em: Date.now() });
}

let cacheToken = { valor: null, expira: 0 };
async function tokenDropbox() {
  if (cacheToken.valor && Date.now() < cacheToken.expira) return cacheToken.valor;
  const cfg = await lojaConfig().get(chaveToken(), { type: "json" });
  if (!cfg?.refresh_token) throw new Error("dropbox-nao-conectado");
  const corpo = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cfg.refresh_token,
    client_id: env("DROPBOX_APP_KEY"),
    client_secret: env("DROPBOX_APP_SECRET"),
  });
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: corpo });
  if (!r.ok) throw new Error("dropbox-token " + r.status + " " + (await r.text()));
  const d = await r.json();
  cacheToken = { valor: d.access_token, expira: Date.now() + (d.expires_in - 300) * 1000 };
  return d.access_token;
}

// Cabeçalho Dropbox-API-Arg precisa ser ASCII (a pasta tem "ê").
const argAscii = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

async function rpc(rota, corpo) {
  const t = await tokenDropbox();
  const r = await fetch("https://api.dropboxapi.com/2/" + rota, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`dropbox ${rota} ${r.status} ${await r.text()}`);
  return r.json();
}

const EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

let cacheLista = { em: 0, itens: null };
export async function listarFotos() {
  if (cacheLista.itens && Date.now() - cacheLista.em < 45000) return cacheLista.itens;
  let d = await rpc("files/list_folder", { path: PASTA(), recursive: true, limit: 2000 });
  const todos = [...d.entries];
  while (d.has_more) {
    d = await rpc("files/list_folder/continue", { cursor: d.cursor });
    todos.push(...d.entries);
  }
  const itens = todos
    .filter((e) => e[".tag"] === "file" && EXT.test(e.name))
    .map((e) => { const partes = e.path_display.split("/"); const dia = partes.length > 3 ? partes[partes.length - 2] : ""; return { p: e.path_display, n: e.name, t: e.client_modified, id: e.id, d: dia }; })
    .sort((a, b) => (a.t < b.t ? 1 : -1));
  cacheLista = { em: Date.now(), itens };
  return itens;
}

// Só aceita caminhos que estão dentro da pasta do evento.
export async function caminhoPermitido(p) {
  if (typeof p !== "string") return false;
  const lista = await listarFotos();
  return lista.some((f) => f.p === p);
}

export async function miniatura(p) {
  const t = await tokenDropbox();
  const r = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
    method: "POST",
    headers: {
      authorization: `Bearer ${t}`,
      "Dropbox-API-Arg": argAscii({ resource: { ".tag": "path", path: p }, format: "jpeg", size: "w640h480", mode: "fitone_bestfit" }),
    },
  });
  if (!r.ok) throw new Error("thumb " + r.status + " " + (await r.text()));
  return new Uint8Array(await r.arrayBuffer());
}

export async function linkTemporario(p) {
  const d = await rpc("files/get_temporary_link", { path: p });
  return d.link;
}

export { env };
