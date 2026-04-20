const $ = (id) => document.getElementById(id);

/** Base da API sem barra final. Produção (nginx): vazio. Dev com front separado: ex. http://127.0.0.1:5000 */
function apiUrl(path) {
  const raw = typeof window !== "undefined" && window.__API_BASE__;
  const base = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

const pdfSelect = $("pdfSelect");
const promptEl = $("prompt");
const btnAnalyze = $("btnAnalyze");
const btnReload = $("btnReload");
const healthPill = $("healthPill");
const healthText = $("healthText");
const modelChip = $("modelChip");
const emptyState = $("emptyState");
const resultLoading = $("resultLoading");
const resultEl = $("result");
const errorBox = $("errorBox");
const stageTitle = $("stageTitle");

const views = {
  home: $("view-home"),
  analyze: $("view-analyze"),
  arch: $("view-arch"),
};

const navLinks = Array.from(document.querySelectorAll(".rail-nav .nav-item"));

const HASH_MAP = {
  "": "home",
  inicio: "home",
  analise: "analyze",
  arquitetura: "arch",
};

const DEFAULT_TITLE = {
  home: "Início",
  analyze: "Análise de documentos",
  arch: "Arquitetura",
};

const DEFAULT_PROMPT =
  "Você é um assistente acadêmico. Leia o PDF e responda em português do Brasil. " +
  "Entregue: (1) um resumo em 5 tópicos, (2) 3 insights acionáveis, " +
  "(3) possíveis riscos ou limitações do conteúdo. Seja objetivo.";

function normalizeHash() {
  const raw = (location.hash || "#inicio").replace(/^#/, "").trim().toLowerCase();
  return HASH_MAP[raw] != null ? raw : "inicio";
}

function viewKeyFromHash() {
  const key = normalizeHash();
  return HASH_MAP[key] || "home";
}

function setStageTitleForView(view) {
  const link = navLinks.find((a) => a.dataset.view === view);
  const label = link?.dataset.title || DEFAULT_TITLE[view] || DEFAULT_TITLE.home;
  stageTitle.textContent = label;
}

function showView(view) {
  const v = view in views ? view : "home";
  Object.entries(views).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle("is-active", key === v);
  });
  navLinks.forEach((a) => a.classList.toggle("is-active", a.dataset.view === v));
  setStageTitleForView(v);
}

function setHealth(state, text) {
  healthPill.dataset.state = state;
  healthText.textContent = text;
}

async function fetchHealth() {
  try {
    const r = await fetch(apiUrl("/api/health"));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Falha no health");
    const loc = j.vertex_location || "—";
    const m = j.model || "—";
    modelChip.textContent = `${m} · ${loc}`;
    setHealth("ok", "API pronta");
    return j;
  } catch (e) {
    modelChip.textContent = "—";
    setHealth("err", "API indisponível");
    throw e;
  }
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMarkdown(md) {
  let html = escapeHtml(md);

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  const blocks = html.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
          .filter(Boolean)
          .map((t) => `<li>${t}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (lines.length === 1 && /^<h[1-3]>/m.test(lines[0])) return lines[0];
      return `<p>${lines.join("<br/>")}</p>`;
    })
    .join("");
}

function showGenerating() {
  emptyState.classList.add("hidden");
  errorBox.classList.add("hidden");
  resultEl.classList.add("hidden");
  resultLoading.classList.remove("hidden");
  resultLoading.setAttribute("aria-busy", "true");
}

function showResult(html) {
  resultLoading.classList.add("hidden");
  resultLoading.setAttribute("aria-busy", "false");
  emptyState.classList.add("hidden");
  errorBox.classList.add("hidden");
  resultEl.classList.remove("hidden");
  resultEl.innerHTML = html;
}

function showError(text) {
  resultLoading.classList.add("hidden");
  resultLoading.setAttribute("aria-busy", "false");
  emptyState.classList.add("hidden");
  resultEl.classList.add("hidden");
  errorBox.classList.remove("hidden");
  errorBox.textContent = text;
}

function resetEmpty() {
  resultLoading.classList.add("hidden");
  resultLoading.setAttribute("aria-busy", "false");
  errorBox.classList.add("hidden");
  resultEl.classList.add("hidden");
  resultEl.innerHTML = "";
  emptyState.classList.remove("hidden");
}

async function loadPdfs() {
  pdfSelect.disabled = true;
  btnAnalyze.disabled = true;
  pdfSelect.innerHTML = `<option value="">Carregando…</option>`;
  try {
    const r = await fetch(apiUrl("/api/pdfs"));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erro ao listar PDFs");
    const pdfs = j.pdfs || [];
    pdfSelect.innerHTML = "";
    if (pdfs.length === 0) {
      pdfSelect.innerHTML = `<option value="">Nenhum PDF encontrado no bucket</option>`;
      return;
    }
    pdfSelect.append(new Option("Selecione um arquivo…", ""));
    for (const name of pdfs) {
      pdfSelect.append(new Option(name, name));
    }
    btnAnalyze.disabled = false;
  } catch (e) {
    pdfSelect.innerHTML = `<option value="">Falha ao carregar lista</option>`;
    showError(String(e.message || e));
  } finally {
    pdfSelect.disabled = false;
  }
}

btnReload.addEventListener("click", () => {
  resetEmpty();
  loadPdfs();
});

btnAnalyze.addEventListener("click", async () => {
  const objectName = pdfSelect.value;
  if (!objectName) return;

  const prompt = (promptEl.value || "").trim() || DEFAULT_PROMPT;
  btnAnalyze.classList.add("loading");
  btnAnalyze.disabled = true;
  showGenerating();

  try {
    const r = await fetch(apiUrl("/api/analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_name: objectName, prompt }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j, null, 2));
    showResult(renderMarkdown(j.answer || ""));
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    btnAnalyze.classList.remove("loading");
    btnAnalyze.disabled = !pdfSelect.value;
  }
});

pdfSelect.addEventListener("change", () => {
  btnAnalyze.disabled = !pdfSelect.value;
  if (!pdfSelect.value) resetEmpty();
});

const GCP_FLOW_NS = "http://www.w3.org/2000/svg";

/** Recolhe âncoras dos cartões no sistema de coordenadas do mapa (overlay SVG). */
function gcpAnchor(mapRect, el, kind) {
  const r = el.getBoundingClientRect();
  const x = (px) => Math.round((px - mapRect.left) * 10) / 10;
  const y = (py) => Math.round((py - mapRect.top) * 10) / 10;
  switch (kind) {
    case "rm":
      return { x: x(r.right), y: y(r.top + r.height / 2) };
    case "lm":
      return { x: x(r.left), y: y(r.top + r.height / 2) };
    case "bc":
      return { x: x(r.left + r.width / 2), y: y(r.bottom) };
    case "tc":
      return { x: x(r.left + r.width / 2), y: y(r.top) };
    default:
      return { x: x(r.left + r.width / 2), y: y(r.top + r.height / 2) };
  }
}

function gcpAlong(a, b, t) {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Ponto a uma distância `dist` do `a` em direção a `b` (evita começar “dentro” do cartão). */
function gcpInsetFromA(a, b, dist) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = Math.min(Math.max(dist / len, 0), 0.45);
  return gcpAlong(a, b, t);
}

/** Ponto a uma distância `dist` de `b` em direção a `a` (encosta na borda do destino). */
function gcpInsetFromB(a, b, dist) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = Math.max(Math.min(1 - dist / len, 1), 0.55);
  return gcpAlong(a, b, t);
}

/** Rota ortogonal (só 90°): horizontal até alinhar x, depois vertical até o destino. */
function gcpOrthoHV(start, end) {
  const mid = { x: end.x, y: start.y };
  return [start, mid, end];
}

/** Rota ortogonal: vertical até alinhar y, depois horizontal até o destino. */
function gcpOrthoVH(start, end) {
  const mid = { x: start.x, y: end.y };
  return [start, mid, end];
}

function gcpPointsToD(points) {
  if (!points.length) return "";
  const [p0, ...rest] = points;
  let d = `M ${p0.x} ${p0.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}

/** Encurta o último segmento em `gap` px (deixa espaço para a seta sólida). */
function gcpShortenPolylineEnd(points, gap) {
  if (points.length < 2 || gap <= 0) return points;
  const out = points.slice();
  const a = out[out.length - 2];
  const b = out[out.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < gap + 0.5) return out;
  const t = (len - gap) / len;
  out[out.length - 1] = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return out;
}

/** Seta triangular sólida: ponta exatamente em `tip`, base recuada na direção (tip - prev). */
function gcpAppendArrow(svg, prev, tip, color, size = 13) {
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const wx = -uy;
  const wy = ux;
  const back = size * 1.55;
  const half = size * 0.55;
  const p2 = { x: tip.x - ux * back + wx * half, y: tip.y - uy * back + wy * half };
  const p3 = { x: tip.x - ux * back - wx * half, y: tip.y - uy * back - wy * half };
  const poly = document.createElementNS(GCP_FLOW_NS, "polygon");
  poly.setAttribute("points", `${tip.x},${tip.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`);
  poly.setAttribute("fill", color);
  poly.setAttribute("class", "gcp-flow-arrow");
  const edgeCol = color === "#4285f4" ? "rgba(12, 66, 138, 0.95)" : "rgba(62, 12, 108, 0.95)";
  poly.setAttribute("stroke", edgeCol);
  poly.setAttribute("stroke-width", "1.25");
  poly.setAttribute("stroke-linejoin", "round");
  svg.appendChild(poly);
}

function layoutGcpFlow() {
  const map = document.querySelector("#gcpArchBoard .gcp-map");
  const svgLines = document.getElementById("gcpFlowLines");
  const svgArrows = document.getElementById("gcpFlowArrows");
  const viewArch = document.getElementById("view-arch");
  if (!map || !svgLines || !svgArrows || !viewArch?.classList.contains("is-active")) return;

  const client = map.querySelector('[data-gcp-node="client"]');
  const ingress = map.querySelector('[data-gcp-node="ingress"]');
  const edge = map.querySelector('[data-gcp-node="edge"]');
  const app = map.querySelector('[data-gcp-node="app"]');
  const gcs = map.querySelector('[data-gcp-node="gcs"]');
  const vertex = map.querySelector('[data-gcp-node="vertex"]');
  if (!client || !ingress || !edge || !app || !gcs || !vertex) return;

  const mr = map.getBoundingClientRect();
  if (mr.width < 64 || mr.height < 48) return;

  const A = (el, k) => gcpAnchor(mr, el, k);
  const dock = 5;
  const arrowSz = 13;

  const clientR = A(client, "rm");
  const ingressL = A(ingress, "lm");
  const startClient = { x: clientR.x + 2, y: clientR.y };
  /** Entrada pela face esquerda do cartão (ponta encostada na borda, levemente para dentro). */
  const endIngress = { x: ingressL.x + dock, y: ingressL.y };
  /** Sempre V→H: último segmento horizontal da esquerda para a direita (seta aponta para a direita). */
  const ptsClientIngress = gcpOrthoVH(startClient, endIngress);

  const ingressB = A(ingress, "bc");
  const edgeT = A(edge, "tc");
  const midY = ingressB.y + (edgeT.y - ingressB.y) * 0.4;
  const ptsIngressEdge = [
    { x: ingressB.x, y: ingressB.y + 2 },
    { x: ingressB.x, y: midY },
    { x: edgeT.x, y: midY },
    /** Desce para o topo da VM de borda (tc + dock = logo abaixo da borda superior do cartão). */
    { x: edgeT.x, y: edgeT.y + dock },
  ];

  const edgeR = A(edge, "rm");
  const appL = A(app, "lm");
  const startEdge = { x: edgeR.x + 2, y: edgeR.y };
  const endApp = { x: appL.x + dock, y: appL.y };
  const ptsEdgeApp = [startEdge, endApp];

  const appB = A(app, "bc");
  const gcsT = A(gcs, "tc");
  const vtxT = A(vertex, "tc");
  /** Faixa horizontal **acima** dos dois cartões da linha de baixo (evita “ponte” roxa entre GCS e Vertex). */
  const yTopServices = Math.min(gcsT.y, vtxT.y);
  let dataCorridorY = yTopServices - 16;
  dataCorridorY = Math.max(dataCorridorY, appB.y + 14);

  const startAppData = { x: appB.x - 4, y: appB.y + 2 };
  const endGcs = { x: gcsT.x, y: gcsT.y + dock };
  const ptsAppGcs = [
    startAppData,
    { x: startAppData.x, y: dataCorridorY },
    { x: endGcs.x, y: dataCorridorY },
    endGcs,
  ];

  const startAppVtx = { x: appB.x + 4, y: appB.y + 2 };
  const endVtx = { x: vtxT.x, y: vtxT.y + dock };
  const dataCorridorVtxY = dataCorridorY - 5;
  const ptsAppVtx =
    Math.abs(endVtx.x - startAppVtx.x) < 4
      ? [startAppVtx, endVtx]
      : [
          startAppVtx,
          { x: startAppVtx.x, y: dataCorridorVtxY },
          { x: endVtx.x, y: dataCorridorVtxY },
          endVtx,
        ];

  const w = Math.ceil(mr.width);
  const h = Math.ceil(mr.height);
  const vb = `0 0 ${w} ${h}`;
  for (const el of [svgLines, svgArrows]) {
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
    el.setAttribute("viewBox", vb);
  }

  const routes = [
    {
      points: ptsClientIngress,
      cls: "gcp-path-dash gcp-flow-req",
      stroke: "#4285f4",
      arrow: "#4285f4",
    },
    {
      points: ptsIngressEdge,
      cls: "gcp-path-dash gcp-flow-req",
      stroke: "#4285f4",
      arrow: "#4285f4",
    },
    {
      points: ptsEdgeApp,
      cls: "gcp-path-dash gcp-flow-req",
      stroke: "#4285f4",
      arrow: "#4285f4",
    },
    {
      points: ptsAppGcs,
      cls: "gcp-path-dash gcp-path-dash-data gcp-flow-data",
      stroke: "#9334e6",
      arrow: "#9334e6",
    },
    {
      points: ptsAppVtx,
      cls: "gcp-path-dash gcp-path-dash-data gcp-flow-data",
      stroke: "#9334e6",
      arrow: "#9334e6",
    },
  ];

  svgLines.replaceChildren();
  svgArrows.replaceChildren();
  for (const route of routes) {
    const full = route.points;
    const tip = full[full.length - 1];
    const prevFull = full[full.length - 2];
    const lastLen = Math.hypot(tip.x - prevFull.x, tip.y - prevFull.y);
    const gapNeed = arrowSz * 1.5;
    const gap = Math.min(Math.max(gapNeed, 10), Math.max(4, lastLen - 2));
    const dashedPts = gcpShortenPolylineEnd(full, gap);
    const path = document.createElementNS(GCP_FLOW_NS, "path");
    path.setAttribute("d", gcpPointsToD(dashedPts));
    path.setAttribute("class", route.cls);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", route.stroke);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svgLines.appendChild(path);
    gcpAppendArrow(svgArrows, prevFull, tip, route.arrow, arrowSz);
  }
}

let gcpFlowResizeObserver = null;

function wireGcpArchFlowLayout() {
  const board = document.getElementById("gcpArchBoard");
  const map = board?.querySelector(".gcp-map");
  if (!board || !map) return;

  const run = () => {
    requestAnimationFrame(() => layoutGcpFlow());
  };

  window.addEventListener("resize", run);
  if (typeof ResizeObserver !== "undefined") {
    gcpFlowResizeObserver?.disconnect();
    gcpFlowResizeObserver = new ResizeObserver(run);
    gcpFlowResizeObserver.observe(map);
    gcpFlowResizeObserver.observe(board);
  }
}

function resetArchDemo() {
  const board = document.getElementById("gcpArchBoard");
  const btn = document.getElementById("archFlowPlay");
  if (!board?.classList.contains("is-playing")) return;
  board.classList.remove("is-playing");
  if (!btn) return;
  btn.setAttribute("aria-pressed", "false");
  const ico = btn.querySelector(".gcp-play-ico");
  const txt = btn.querySelector(".gcp-play-txt");
  if (ico) ico.textContent = "▶";
  if (txt) txt.textContent = "Play";
}

function wireArchPlay() {
  const board = document.getElementById("gcpArchBoard");
  const btn = document.getElementById("archFlowPlay");
  if (!board || !btn) return;

  btn.addEventListener("click", () => {
    const next = !board.classList.contains("is-playing");
    board.classList.toggle("is-playing", next);
    btn.setAttribute("aria-pressed", String(next));
    const ico = btn.querySelector(".gcp-play-ico");
    const txt = btn.querySelector(".gcp-play-txt");
    if (ico) ico.textContent = next ? "⏸" : "▶";
    if (txt) txt.textContent = next ? "Pausar" : "Play";
  });
}

function onRoute() {
  const key = viewKeyFromHash();
  if (key !== "arch") {
    resetArchDemo();
  }
  showView(key);
  if (key === "arch") {
    requestAnimationFrame(() => {
      requestAnimationFrame(layoutGcpFlow);
    });
  }
}

/** Garante troca de tela mesmo quando hashchange não dispara (ex.: alguns file:// ou WebViews). */
function wireSpaNav() {
  const roots = document.querySelectorAll(".rail-nav, .hero-actions");
  roots.forEach((root) => {
    root.addEventListener("click", (e) => {
      const a = e.target.closest("a[href^='#']");
      if (!a || !root.contains(a)) return;
      const href = a.getAttribute("href");
      if (!href || href.length < 2) return;
      const slug = href.slice(1).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(HASH_MAP, slug)) return;
      e.preventDefault();
      const canonical = `#${slug}`;
      if (location.hash.toLowerCase() !== canonical) {
        location.hash = canonical;
      }
      onRoute();
    });
  });
}

window.addEventListener("hashchange", onRoute);

(async function init() {
  if (!promptEl.value.trim()) promptEl.placeholder = DEFAULT_PROMPT.slice(0, 120) + "…";

  const h = location.hash.replace(/^#/, "").toLowerCase();
  if (!h || !(Object.prototype.hasOwnProperty.call(HASH_MAP, h))) {
    history.replaceState(null, "", `${location.pathname}${location.search}#inicio`);
  }

  wireSpaNav();
  wireArchPlay();
  wireGcpArchFlowLayout();
  onRoute();

  try {
    await fetchHealth();
    await loadPdfs();
  } catch {
    /* health já marcou erro */
  }
})();
