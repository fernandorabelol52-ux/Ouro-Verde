/**
 * ============================================================
 *  MENU DIGITAL – AÇOUGUE OURO VERDE
 *  app.js — Slides dinâmicos com divisão automática por página
 *
 *  Lógica de paginação por categoria:
 *   ≤ ITENS_POR_COLUNA      → 1 slide, 1 coluna + foto
 *   ≤ ITENS_POR_COLUNA * 2  → 1 slide, 2 colunas
 *   > ITENS_POR_COLUNA * 2  → múltiplos slides de 2 colunas cada
 *
 *  Estrutura do CSV:
 *  A: Categoria | B: Nome | C: Preço Base | D: Desconto
 *  E: Preço Final | F: Promoção? | G: Visível na TV?
 * ============================================================ */

// ─── URL DA PLANILHA ─────────────────────────────────────────
const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEq8oeTNFgdAnWZIGOrmoU8QO7WqlMAyvXLPS5rToesYvZdNaoJAgj3pyVcNpPHo8Sk4ty_IukrWt9/pub?gid=1408167426&single=true&output=csv';

const FOTOS_JSON_URL     = 'fotos.json';
const INTERVALO_MINUTOS  = 5;
const NOME_LOJA          = 'Açougue Ouro Verde';

// Flag opcional: definir window.MODO_SEM_PROMO = true no HTML antes deste script
// para desativar o slide de promoções (exibe apenas os 7 slides de categoria)
const MODO_SEM_PROMO = !!window.MODO_SEM_PROMO;
const SLIDE_DURATION_MS  = 12000;
const SLIDE_FADE_MS      = 800;

// Máximo de itens visíveis por coluna
// TV 1080px − header 68 − footer 44 − cat-hdr 46 = ~922px úteis
// Cada sp-card com font 18px: padding 7×2 + borda 1 + linha ≈ 43px → ~21 itens
// Usamos 20 para folga segura
const ITENS_POR_COLUNA = 20;

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let dadosGlobais   = null;
let temPromocoes   = false;
let carregouUmaVez = false;

// Sistema de slides — dinâmico
let slideEls         = [];       // elementos .slide no DOM
let slideRotacao     = [];       // lista ordenada de ids de slide a mostrar
let currentSlideId   = null;     // id do slide ativo (string, ex: 'slide-bovinos-0')
let slideTimer       = null;
let isTransitioning  = false;
let pendingRender    = null;     // função a chamar após transição do slide ativo

// Fotos
let FOTOS_MAP      = {};
let FOTO_FALLBACK  = 'logo.png';
let CATEGORIAS_MAP = {};

/* ============================================================
   CONFIG DAS CATEGORIAS (ordem de exibição + cores do header)
   ============================================================ */
const CATEGORIAS_CONFIG = [
  { key: 'bovinos',   label: 'BOVINOS',   sub: 'PREÇO POR KG',       cor: '',        keys: ['bovinos'] },
  { key: 'suinos',    label: 'SUÍNOS',    sub: 'PREÇO POR KG',       cor: '',        keys: ['suínos','suinos'] },
  { key: 'aves',      label: 'AVES',      sub: 'PREÇO POR KG',       cor: 'verde',   keys: ['aves'] },
  { key: 'miudos',    label: 'MIÚDOS',    sub: 'PREÇO POR KG',       cor: 'marrom',  keys: ['miúdos','miudos'] },
  { key: 'frios',     label: 'FRIOS',     sub: 'PREÇO POR KG',       cor: 'laranja', keys: ['frios'] },
  { key: 'linguicas', label: 'LINGUIÇAS', sub: 'PREÇO POR KG',       cor: 'roxo',    keys: ['linguiças','linguicas'] },
  { key: 'espetos',   label: 'ESPETOS',   sub: 'PREÇO POR UNIDADE',  cor: 'amarelo', keys: ['espetos'] },
];

/* ============================================================
   RELÓGIO
   ============================================================ */
function atualizarRelogio() {
  const el = document.getElementById('relogio');
  if (!el) return;
  const n    = new Date();
  const hh   = String(n.getHours()).padStart(2, '0');
  const mm   = String(n.getMinutes()).padStart(2, '0');
  const dias  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  el.textContent = `${dias[n.getDay()]}, ${n.getDate()} ${meses[n.getMonth()]} • ${hh}:${mm}`;
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

/* ============================================================
   HELPERS
   ============================================================ */
function fmt(valor) {
  const n = parseFloat(String(valor).replace(',', '.'));
  if (isNaN(n) || n === 0) return '—';
  return 'R$ ' + n.toFixed(2).replace('.', ',');
}

function setStatus(estado, texto) {
  const badge = document.getElementById('status-badge');
  const txtEl = document.getElementById('status-text');
  if (!badge) return;
  badge.classList.remove('ok', 'err');
  if (estado === 'ok')  badge.classList.add('ok');
  if (estado === 'err') badge.classList.add('err');
  if (txtEl) txtEl.textContent = texto;
}

function getUnidade(categoria) {
  return (categoria || '').toLowerCase() === 'espetos' ? '/un' : '/kg';
}

/* ============================================================
   FOTOS
   ============================================================ */
async function carregarFotos() {
  try {
    const resp = await fetch(FOTOS_JSON_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('fotos.json not found');
    const dados = await resp.json();
    FOTOS_MAP     = dados.itens    || {};
    FOTO_FALLBACK = dados.fallback || 'logo.png';
    CATEGORIAS_MAP = {};
    for (const [k, v] of Object.entries(dados.categorias || {})) {
      const kNorm = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      CATEGORIAS_MAP[kNorm] = v;
    }
    console.info('[Fotos] Carregadas:', Object.keys(FOTOS_MAP).length);
  } catch (e) {
    console.warn('[Fotos] Fallback:', e.message);
    FOTOS_MAP = {};
  }
}

function getFoto(nomeCorte) {
  const entrada = FOTOS_MAP[nomeCorte];
  if (!entrada || !entrada.foto) return FOTO_FALLBACK;
  return entrada.foto;
}

function getFotoCategoria(categoria) {
  const k = (categoria || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const entrada = CATEGORIAS_MAP[k];
  if (!entrada || !entrada.foto) return null;
  return { foto: entrada.foto, position: entrada.position || '50% 50%' };
}

function criarImgComFallback(nomeCorte, cssClass) {
  const src = getFoto(nomeCorte);
  const alt = FOTOS_MAP[nomeCorte]?.alt || nomeCorte;
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  if (cssClass) img.className = cssClass;
  img.onerror = function() {
    if (this.src.endsWith(FOTO_FALLBACK)) {
      this.style.display = 'none';
      const ph = document.createElement('div');
      ph.className   = 'foto-placeholder';
      ph.textContent = nomeCorte.substring(0, 2).toUpperCase();
      this.parentNode?.insertBefore(ph, this);
    } else {
      this.src = FOTO_FALLBACK;
    }
  };
  return img;
}

function injetarFotosColuna(colEl, categoriaKey, nomes, maxItens = 2) {
  if (!colEl) return;
  const cat = getFotoCategoria(categoriaKey);
  colEl.innerHTML = '';

  if (cat) {
    const wrap = document.createElement('div');
    wrap.className = 'foto-cell';
    const img = criarImgComFallback(categoriaKey, 'foto-corte');
    img.src = cat.foto;
    img.style.objectPosition = cat.position;
    wrap.appendChild(img);
    colEl.appendChild(wrap);
    return;
  }

  const nomesValidos = (nomes || []).filter(Boolean).slice(0, maxItens);

  if (!nomesValidos.length) {
    // Sem itens: mostra logo cobrindo toda a coluna
    const wrap = document.createElement('div');
    wrap.className = 'foto-cell';
    const img = document.createElement('img');
    img.src = FOTO_FALLBACK;
    img.className = 'foto-corte';
    img.alt = 'Açougue Ouro Verde';
    img.style.objectFit = 'contain';
    img.style.padding = '12px';
    wrap.appendChild(img);
    colEl.appendChild(wrap);
    return;
  }

  nomesValidos.forEach(nome => {
    const wrap = document.createElement('div');
    wrap.className = 'foto-cell';
    wrap.appendChild(criarImgComFallback(nome, 'foto-corte'));
    colEl.appendChild(wrap);
  });
}

/* ============================================================
   PARSER CSV
   ============================================================ */
function splitCSVLinha(linha) {
  const resultado = [];
  let celula = '', emAspas = false;
  for (const ch of linha) {
    if (ch === '"') { emAspas = !emAspas; continue; }
    if (ch === ',' && !emAspas) { resultado.push(celula.trim()); celula = ''; }
    else celula += ch;
  }
  resultado.push(celula.trim());
  return resultado;
}

function parsearCSV(csv) {
  const linhas = csv.trim().split('\n');
  let linhaInicio = 1;
  for (let i = 0; i < Math.min(5, linhas.length); i++) {
    const l = linhas[i].toLowerCase();
    if (l.includes('categoria') || l.includes('nome do corte')) {
      linhaInicio = i + 1;
      break;
    }
  }

  const itens = [];
  for (let i = linhaInicio; i < linhas.length; i++) {
    const p = splitCSVLinha(linhas[i]);
    if (p.length < 2) continue;
    const categoria   = (p[0] || '').replace(/"/g, '').trim();
    const nome        = (p[1] || '').replace(/"/g, '').trim();
    const preco_base  = parseFloat((p[2] || '0').replace(/[R$\s]/g, '').replace(',', '.')) || 0;
    const desconto    = parseFloat((p[3] || '0').replace(/[R$\s]/g, '').replace(',', '.')) || 0;
    const promocao    = (p[5] || 'NAO').replace(/"/g, '').trim().toUpperCase()
                          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos: NÃO → NAO
    // Preço final: calcula automaticamente se for promoção (não depende da coluna E)
    const preco_final = (promocao === 'SIM' && desconto > 0)
      ? Math.round((preco_base - desconto) * 100) / 100
      : parseFloat((p[4] || '0').replace(/[R$\s]/g, '').replace(',', '.')) || preco_base;
    // Visível: aceita NAO, NÃO, Não, não (remove acento antes de comparar)
    const visivelRaw  = (p[6] || 'SIM').replace(/"/g, '').trim().toUpperCase()
                          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const visivel     = visivelRaw;
    if (!nome) continue;
    itens.push({ categoria, nome, preco_base, desconto, preco_final, promocao, visivel });
  }
  return itens;
}

/* ============================================================
   LÓGICA DE PAGINAÇÃO
   Recebe array de itens e retorna array de "páginas"
   Cada página = array de até ITENS_POR_COLUNA * 2 itens
   ============================================================ */
function paginarItens(itens) {
  const MAX_POR_PAGINA = ITENS_POR_COLUNA * 2;
  const paginas = [];
  for (let i = 0; i < itens.length; i += MAX_POR_PAGINA) {
    paginas.push(itens.slice(i, i + MAX_POR_PAGINA));
  }
  return paginas.length ? paginas : [[]];
}

/* ============================================================
   CONSTRUÇÃO DINÂMICA DOS SLIDES NO DOM
   Apaga o wrapper e reconstrói tudo baseado nos dados atuais
   ============================================================ */
function construirSlides(dados) {
  const wrapper = document.getElementById('slides-wrapper');
  wrapper.innerHTML = '';
  slideEls     = [];
  slideRotacao = [];

  let idx = 0;

  // ── Categorias regulares ──────────────────────────────────
  CATEGORIAS_CONFIG.forEach(cfg => {
    const itens  = dados[cfg.key] || [];
    const paginas = paginarItens(itens);

    paginas.forEach((paginaItens, pNum) => {
      const slideId = `slide-${cfg.key}-${pNum}`;
      const totalPaginas = paginas.length;

      // Título com indicador de página se houver mais de uma
      const titulo = totalPaginas > 1
        ? `${cfg.label} <span class="cat-pag">(${pNum + 1}/${totalPaginas})</span>`
        : cfg.label;

      const usaDuasColunas = paginaItens.length > ITENS_POR_COLUNA;
      const metade = usaDuasColunas ? Math.ceil(paginaItens.length / 2) : paginaItens.length;
      const colunaA = paginaItens.slice(0, metade);
      const colunaB = usaDuasColunas ? paginaItens.slice(metade) : [];

      const slideEl = document.createElement('div');
      slideEl.className = 'slide';
      slideEl.id        = slideId;

      if (usaDuasColunas) {
        // Layout de 2 colunas — foto esquerda, header único, duas listas direita
        slideEl.innerHTML = `
          <div class="s-duplo-layout">
            <div class="cat-hdr ${cfg.cor}">
              <span class="cat-tit">${titulo}</span>
              <span class="cat-sub">${cfg.sub}</span>
            </div>
            <div class="s-duplo-corpo">
              <div class="s-duplo-foto" id="fotos-${slideId}"></div>
              <div class="s2-divider"></div>
              <div class="s-duplo-col">
                <div id="grid-${slideId}-a" class="sp-grid-v3"></div>
              </div>
              <div class="s2-divider"></div>
              <div class="s-duplo-col">
                <div id="grid-${slideId}-b" class="sp-grid-v3"></div>
              </div>
            </div>
          </div>`;

        preencherGrid(slideEl.querySelector(`#grid-${slideId}-a`), colunaA);
        preencherGrid(slideEl.querySelector(`#grid-${slideId}-b`), colunaB);
        injetarFotosColuna(slideEl.querySelector(`#fotos-${slideId}`), cfg.key, paginaItens.map(i => i.nome), 3);

      } else {
        // Layout de 1 coluna
        slideEl.innerHTML = `
          <div class="s1-layout">
            <div class="s1-fotos" id="fotos-${slideId}"></div>
            <div class="s1-tabela">
              <div class="cat-hdr ${cfg.cor}">
                <span class="cat-tit">${titulo}</span>
                <span class="cat-sub">${cfg.sub}</span>
              </div>
              <div id="grid-${slideId}" class="sp-grid-v3"></div>
            </div>
          </div>`;

        preencherGrid(slideEl.querySelector(`#grid-${slideId}`), paginaItens);
        injetarFotosColuna(slideEl.querySelector(`#fotos-${slideId}`), cfg.key, paginaItens.map(i => i.nome), 3);
      }

      wrapper.appendChild(slideEl);
      slideEls.push(slideEl);
      slideRotacao.push(slideId);
      idx++;
    });
  });

  // ── Slides de Oferta do Dia (sem foto — 2 promoções por tela) ─
  if (temPromocoes) {
    const PROMOS_POR_SLIDE = 2;
    const promocoes = dados.promocoes;
    const totalPags = Math.ceil(promocoes.length / PROMOS_POR_SLIDE);

    for (let p = 0; p < totalPags; p++) {
      const lote     = promocoes.slice(p * PROMOS_POR_SLIDE, (p + 1) * PROMOS_POR_SLIDE);
      const slideId  = totalPags > 1 ? `slide-oferta-${p}` : 'slide-oferta';
      const slideEl  = document.createElement('div');
      slideEl.className = 'slide';
      slideEl.id        = slideId;

      const cardsHTML = lote.map(item => {
        const unidade  = getUnidade(item.categoria);
        const pct      = item.preco_base > 0
          ? Math.round((item.desconto / item.preco_base) * 100) : 0;
        const pctBadge = pct > 0 ? `<span class="ofv2-pct">-${pct}%</span>` : '';
        return `
          <div class="ofv2-card">
            <div class="ofv2-topo">
              <span class="ofv2-categoria">${item.categoria.toUpperCase()}</span>
              ${pctBadge}
            </div>
            <div class="ofv2-nome">${item.nome}</div>
            <div class="ofv2-preco-linha">
              ${item.desconto > 0 ? `<span class="ofv2-de">${fmt(item.preco_base)}</span>` : ''}
              <span class="ofv2-por">${fmt(item.preco_final)}</span>
              <span class="ofv2-un">${unidade}</span>
            </div>
            <div class="ofv2-validade">Oferta válida somente hoje</div>
          </div>`;
      }).join('');

      const paginaLabel = totalPags > 1
        ? `<span class="ofv2-pag">${p + 1} / ${totalPags}</span>` : '';

      slideEl.innerHTML = `
        <div class="ofv2-layout">
          <div class="ofv2-header">
            <span class="ofv2-titulo">🏷️ OFERTAS DO DIA</span>
            ${paginaLabel}
          </div>
          <div class="ofv2-grid ofv2-grid-${lote.length}">
            ${cardsHTML}
          </div>
        </div>`;

      wrapper.appendChild(slideEl);
      slideEls.push(slideEl);
      slideRotacao.push(slideId);
    }
  }

  // lista-ofertas mantida apenas para compatibilidade (carrossel antigo removido)
  const listaOfertas = document.getElementById('lista-ofertas');
  if (listaOfertas) listaOfertas.innerHTML = '';

  // ── Ativar primeiro slide ───────────────────────────────────
  if (slideEls.length) {
    // Se o slide atual ainda existe na nova lista, mantém; senão vai ao primeiro
    const mantemAtual = currentSlideId && slideRotacao.includes(currentSlideId);
    if (!mantemAtual) {
      currentSlideId = slideRotacao[0];
    }
    slideEls.forEach(el => el.classList.toggle('active', el.id === currentSlideId));
  }
}

/* ============================================================
   PREENCHE UM GRID COM ITENS
   ============================================================ */
function preencherGrid(gridOrId, itens) {
  const grid = (typeof gridOrId === 'string') ? document.getElementById(gridOrId) : gridOrId;
  if (!grid) return;
  grid.innerHTML = '';

  if (!itens.length) {
    grid.innerHTML = '<div class="sp-empty">Sem itens disponíveis.</div>';
    return;
  }

  itens.forEach(item => {
    const ehPromo = item.promocao === 'SIM' && item.desconto > 0;
    const pct = (ehPromo && item.preco_base > 0)
      ? Math.round((item.desconto / item.preco_base) * 100) : 0;
    const unidade     = getUnidade(item.categoria);
    const promoBadge  = ehPromo ? `<span class="sp-card-promo-badge">${pct > 0 ? '-'+pct+'%' : 'PROMO'}</span>` : '';
    const precoDeHTML = ehPromo ? `<span class="sp-card-preco-de">${fmt(item.preco_base)}</span>` : '';
    const card = document.createElement('div');
    card.className = 'sp-card';
    card.innerHTML = `
      ${promoBadge}
      <span class="sp-card-nome">${item.nome}</span>
      ${precoDeHTML}
      <span class="sp-card-preco">${fmt(item.preco_final)}</span>
      <span class="sp-card-kg">${unidade}</span>`;
    grid.appendChild(card);
  });
}

/* ============================================================
   CARROSSEL DE OFERTA — removido (v2: slides diretos sem foto)
   ============================================================ */

/* ============================================================
   SISTEMA DE SLIDES — baseado em IDs string
   ============================================================ */
function getSlideElById(id) {
  return slideEls.find(el => el.id === id) || null;
}

function atualizarDots() {
  const posAtual = slideRotacao.indexOf(currentSlideId);
  document.querySelectorAll('.slide-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === posAtual);
  });
}

function renderDots() {
  const container = document.getElementById('slide-dots');
  if (!container) return;
  container.innerHTML = '';
  slideRotacao.forEach((slideId, pos) => {
    const btn = document.createElement('button');
    btn.className = 'slide-dot' + (slideId === currentSlideId ? ' active' : '');
    btn.title     = `Tela ${pos + 1}`;
    btn.setAttribute('aria-label', `Ir para tela ${pos + 1}`);
    btn.addEventListener('click', () => goToSlide(slideId));
    container.appendChild(btn);
  });
}

function goToSlide(targetId) {
  if (isTransitioning || targetId === currentSlideId) return;
  if (!slideRotacao.includes(targetId)) return;

  clearInterval(slideTimer);
  isTransitioning = true;

  const prevEl = getSlideElById(currentSlideId);
  const nextEl = getSlideElById(targetId);
  if (!prevEl || !nextEl) { isTransitioning = false; return; }

  const prevId = currentSlideId;
  nextEl.style.zIndex = '2';
  prevEl.style.zIndex = '1';
  nextEl.classList.add('active');
  requestAnimationFrame(() => prevEl.classList.remove('active'));

  currentSlideId = targetId;
  atualizarDots();

  setTimeout(() => {
    prevEl.style.zIndex = '';
    nextEl.style.zIndex = '';
    if (pendingRender) { pendingRender(); pendingRender = null; }
    isTransitioning = false;
    slideTimer = setInterval(avancarSlide, SLIDE_DURATION_MS);
  }, SLIDE_FADE_MS + 60);
}

function avancarSlide() {
  const posAtual = slideRotacao.indexOf(currentSlideId);
  if (posAtual === -1) { goToSlide(slideRotacao[0]); return; }
  const proxPos = (posAtual + 1) % slideRotacao.length;
  goToSlide(slideRotacao[proxPos]);
}

/* ============================================================
   FETCH DE DADOS + REBUILD SLIDES
   ============================================================ */
async function carregarDados() {
  await carregarFotos();
  setStatus('loading', 'Sincronizando…');
  try {
    const url  = SHEET_CSV_URL + '&t=' + Date.now();
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const csv   = await resp.text();
    const itens = parsearCSV(csv);
    if (!itens.length) throw new Error('Nenhum item válido no CSV');

    const visiveis = itens.filter(i => i.visivel !== 'NAO');

    const dados = {};
    CATEGORIAS_CONFIG.forEach(cfg => {
      dados[cfg.key] = visiveis.filter(i =>
        cfg.keys.some(k => i.categoria.toLowerCase() === k)
      );
    });
    dados.promocoes = visiveis.filter(i => i.promocao === 'SIM' && i.desconto > 0);

    dadosGlobais = dados;
    const promoAntes = temPromocoes;
    temPromocoes = !MODO_SEM_PROMO && dados.promocoes.length > 0;

    // Rebuild completo: reconstrói o DOM de slides e rerenderiza
    const rebuild = () => {
      clearInterval(slideTimer);
      construirSlides(dados);
      renderDots();
      slideTimer = setInterval(avancarSlide, SLIDE_DURATION_MS);
      carregouUmaVez = true;
    };

    if (!carregouUmaVez) {
      rebuild();
    } else {
      // Se está transitando, agenda para após; caso contrário, rebuilda agora
      if (isTransitioning) {
        pendingRender = rebuild;
      } else {
        rebuild();
      }
    }

    setStatus('ok', 'Sincronizado');
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const el   = document.getElementById('ultima-atualizacao');
    if (el) el.textContent = `Última atualização: ${hora}`;

  } catch (e) {
    console.error('[Menu Digital] Erro:', e);
    setStatus('err', 'Erro de conexão');
  }
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
carregarDados();
setInterval(carregarDados, INTERVALO_MINUTOS * 60 * 1000);
document.title = NOME_LOJA + ' – Cardápio Digital';

console.info(
  `%c🥩 ${NOME_LOJA} – Menu Digital v3 DINÂMICO`,
  'font-size:16px;font-weight:bold;color:#e83030;'
);
