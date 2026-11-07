// /api/conectar -> leva para a tela do Dropbox que autoriza o site a ler a pasta
// /api/dropbox-retorno -> volta do Dropbox e guarda a autorização
import { env, html, dropboxConectado, salvarRefresh, PASTA, listarFotos } from "../../lib/core.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const base = u.origin;
  const retorno = `${base}/api/dropbox-retorno`;
  const key = env("DROPBOX_APP_KEY");
  const secret = env("DROPBOX_APP_SECRET");
  if (!key || !secret) {
    return html(`<h2>Falta configurar</h2><p>Coloque <code>DROPBOX_APP_KEY</code> e <code>DROPBOX_APP_SECRET</code> nas variáveis de ambiente do Netlify e publique de novo.</p>`, 500);
  }

  if (u.pathname === "/api/conectar") {
    if (await dropboxConectado()) {
      let n = "?";
      try { n = (await listarFotos()).length; } catch {}
      return html(`<h2>✅ Dropbox já está conectado</h2><p>Pasta: <code>${PASTA()}</code><br>Fotos encontradas agora: <b>${n}</b></p>`);
    }
    const estado = crypto.randomUUID();
    const auth = new URL("https://www.dropbox.com/oauth2/authorize");
    auth.search = new URLSearchParams({
      client_id: key, response_type: "code", token_access_type: "offline", redirect_uri: retorno, state: estado,
    }).toString();
    return new Response(null, {
      status: 302,
      headers: { location: auth.toString(), "set-cookie": `vm_estado=${estado}; Path=/api; Max-Age=900; HttpOnly; Secure; SameSite=Lax` },
    });
  }

  // retorno do Dropbox
  const code = u.searchParams.get("code");
  const estado = u.searchParams.get("state");
  const cookie = (req.headers.get("cookie") || "").match(/vm_estado=([^;]+)/)?.[1];
  if (!code || !estado || estado !== cookie) return html(`<h2>Não deu certo</h2><p>Abra <a href="/api/conectar">/api/conectar</a> e tente de novo.</p>`, 400);
  if (await dropboxConectado()) return html(`<h2>✅ Dropbox já estava conectado</h2>`);
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: key, client_secret: secret, redirect_uri: retorno }),
  });
  if (!r.ok) return html(`<h2>Erro do Dropbox</h2><pre>${(await r.text()).replace(/</g, "&lt;")}</pre>`, 502);
  const d = await r.json();
  if (!d.refresh_token) return html(`<h2>Erro</h2><p>O Dropbox não mandou a autorização permanente.</p>`, 502);
  await salvarRefresh(d.refresh_token, d.account_id);
  let n = "?", erro = "";
  try { n = (await listarFotos()).length; } catch (e) { erro = String(e.message || e); }
  return html(`<h2>✅ Dropbox conectado!</h2><p>Pasta: <code>${PASTA()}</code><br>Fotos encontradas: <b>${n}</b></p>${erro ? `<p style="color:#b00">Aviso: ${erro.replace(/</g, "&lt;")}</p>` : ""}<p>Pode fechar esta página.</p>`);
};

export const config = { path: ["/api/conectar", "/api/dropbox-retorno"] };
