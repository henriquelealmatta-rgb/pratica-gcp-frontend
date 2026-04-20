# pratica-gcp-frontend

Interface estática (HTML/CSS/JS) da demo **Insight PDF**.

## Produção

Em geral o nginx da VM frontend entrega estes arquivos e encaminha `/api/*` para o backend. Não é necessário `__API_BASE__` nesse caso.

## Desenvolvimento local

1. Suba o backend (outro repositório) em `http://127.0.0.1:5000` com CORS liberado para a origem do front (ex.: `CORS_ORIGINS=*` no `.env` do backend).
2. Neste projeto, em `index.html`, descomente o bloco que define `window.__API_BASE__ = "http://127.0.0.1:5000"` (logo antes de `app.js`).
3. Sirva a pasta com um servidor estático (extensão Live Server do VS Code, `npx serve`, etc.).

O passo a passo detalhado está em `docs/pratica-gcp-cloud-shell.md` no repositório de documentação/infra do laboratório.
