# Página de fotos protegida — passo a passo (uns 15 minutos)

**Como funciona:** quem manda FOTOS no direct recebe um link pessoal
(`vinimaker-fotos.netlify.app/f/NÚMERO`). Esse link abre em no máximo 2 navegadores
(o do Instagram e o do celular). Se for repassado, quem recebe vê "Esse link é pessoal.
Mande FOTOS no direct da @vinimakeraudiovisual". O endereço do Dropbox nunca aparece.
As fotos que você sobe no Dropbox durante o evento aparecem sozinhas na página.

Tudo no plano grátis. O Claude te guia em cada tela.

---

## 1. GitHub (onde o código fica guardado)
1. Abra **claude.ai/connect-github** e conecte sua conta do GitHub.
2. No GitHub, crie um repositório novo chamado **vinimaker-fotos** (pode ser Privado), sem marcar nada mais.
3. Avise o Claude. Ele coloca o código lá.

## 2. Dropbox (autorizar o site a ler a pasta)
1. Abra **dropbox.com/developers/apps** e clique em **Create app** (Criar app).
2. Escolha **Scoped access** e depois **Full Dropbox**.
3. Nome: **vinimaker-fotos-site** (se já existir, acrescente um número). Clique em **Create app**.
4. Aba **Permissions** (Permissões): marque **files.metadata.read** e **files.content.read**. Clique em **Submit** (Enviar) lá embaixo.
5. Aba **Settings** (Configurações), campo **Redirect URIs**: cole
   `https://vinimaker-fotos.netlify.app/api/dropbox-retorno` e clique em **Add**.
6. Na mesma aba, deixe aberto: vamos copiar o **App key** e o **App secret** no passo 3.

## 3. Netlify (publicar a página)
1. No Netlify: **Add new project** (Adicionar projeto) → **Import an existing project** (Importar) → **GitHub** → escolha **vinimaker-fotos**.
2. Nome do projeto: **vinimaker-fotos**.
3. Em **Environment variables** (Variáveis de ambiente), adicione:
   - `DROPBOX_APP_KEY` = o App key do Dropbox
   - `DROPBOX_APP_SECRET` = o App secret do Dropbox
   - (só se a pasta do evento não for "Fotos Beach Tênis") `DROPBOX_PASTA` = caminho da pasta, ex.: `/Fotos Beach Tênis/Hípica`
4. Clique em **Deploy** (Publicar). Isso **não mexe** na página 3D (vinimaker.netlify.app); é um site separado.

## 4. Ligar o Dropbox na página
1. Abra **vinimaker-fotos.netlify.app/api/conectar** e clique em **Permitir** no Dropbox.
2. Deve aparecer "✅ Dropbox conectado! Fotos encontradas: N". Confira se o número bate com a pasta.

## 5. ManyChat (trocar o link do botão)
1. Automação → abra a automação FOTOS → no botão **Fotos do Torneio**, troque o endereço por
   `https://vinimaker-fotos.netlify.app/f/` + o campo **Contact Id** (o Claude mostra onde fica na tela).
2. Salve / **Ativar**.
3. Ajuste o texto: troque "Toque no botão abaixo para ver e baixar as suas" por
   "Esse link é só seu, não funciona se repassado. Toque no botão abaixo para ver e baixar as suas fotos."

## 6. Testar
1. De outra conta, mande FOTOS e abra o link: as fotos aparecem.
2. Mande o mesmo link para um terceiro celular: deve aparecer "Esse link é pessoal".

## 7. Fechar o link antigo do Dropbox
No Dropbox, pasta do evento → **Compartilhar** → configurações do link → **Excluir link**.
Assim quem pegou o link antigo perde o acesso. A página nova continua funcionando (ela não usa esse link).

---

**Limites:** quem recebe o link pode tirar print ou baixar uma foto e repassar a imagem. E alguém muito
"técnico" poderia trocar o número do link na mão. Para fechar até isso, dá para ligar a conferência
pelo ManyChat (plano Pro, variável `MANYCHAT_API_KEY`), o código já está pronto para isso.
