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
    const preco_final = parseFloat((p[4] || '0').replace(/[R$\s]/g, '').replace(',', '.')) || preco_base;
    const promocao    = (p[5] || 'NÃO').replace(/"/g, '').trim().toUpperCase();
    const visivel     = (p[6] || 'SIM').replace(/"/g, '').trim().toUpperCase();
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
        // Layout de 2 colunas
        slideEl.innerHTML = `
          <div class="s2-layout">
            <div class="s2-half">
              <div class="cat-hdr ${cfg.cor}">
                <span class="cat-tit">${titulo}</span>
                <span class="cat-sub">${cfg.sub}</span>
              </div>
              <div class="s2-content">
                <div class="s2-fotos" id="fotos-${slideId}-a"></div>
                <div id="grid-${slideId}-a" class="sp-grid-v3"></div>
              </div>
            </div>
            <div class="s2-divider"></div>
            <div class="s2-half">
              <div class="cat-hdr ${cfg.cor}">
                <span class="cat-tit">${titulo}</span>
                <span class="cat-sub">${cfg.sub}</span>
              </div>
              <div class="s2-content">
                <div class="s2-fotos" id="fotos-${slideId}-b"></div>
                <div id="grid-${slideId}-b" class="sp-grid-v3"></div>
              </div>
            </div>
          </div>`;

        preencherGrid(slideEl.querySelector(`#grid-${slideId}-a`), colunaA);
        preencherGrid(slideEl.querySelector(`#grid-${slideId}-b`), colunaB);
        injetarFotosColuna(slideEl.querySelector(`#fotos-${slideId}-a`), cfg.key, colunaA.map(i => i.nome), 2);
        injetarFotosColuna(slideEl.querySelector(`#fotos-${slideId}-b`), cfg.key, colunaB.map(i => i.nome), 2);

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

  // ── Slide de Oferta do Dia (só aparece se houver promoções) ─
  if (temPromocoes) {
    const slideOferta = document.createElement('div');
    slideOferta.className = 'slide';
    slideOferta.id        = 'slide-oferta';
    slideOferta.innerHTML = `
      <div class="s3-layout">
        <div class="s3-foto-wrap" id="s3-foto-wrap">
          <div class="s3-foto-overlay"></div>
        </div>
        <div class="s3-info">
          <div class="s3-label">OFERTA ESPECIAL DO DIA</div>
          <div class="s3-dots" id="s3-dots"></div>
          <div class="s3-categoria" id="s3-categoria"></div>
          <div class="s3-nome" id="s3-nome"></div>
          <div class="s3-linha"></div>
          <div class="s3-preco-de" id="s3-preco-de"></div>
          <div class="of-badge">
            <span class="of-rs">R$</span>
            <span class="of-reais" id="s3-reais">—</span>
            <span class="of-cents" id="s3-cents"></span>
            <span class="of-kg">/kg</span>
          </div>
          <div class="s3-validade">Oferta válida somente hoje</div>
        </div>
      </div>`;
    wrapper.appendChild(slideOferta);
    slideEls.push(slideOferta);
    slideRotacao.push('slide-oferta');
  }

  // ── Renderizar ofertas na lista oculta (carrossel) ──────────
  renderizarOfertas(dados.promocoes);

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
   CARROSSEL DE OFERTA DO DIA
   ============================================================ */
function renderizarOfertas(ofertas) {
  const el = document.getElementById('lista-ofertas');
  if (!el) return;
  el.innerHTML = '';
  if (!ofertas.length) return;

  ofertas.forEach((item, i) => {
    const pct = item.preco_base > 0 ? Math.round((item.desconto / item.preco_base) * 100) : 0;
    const li  = document.createElement('li');
    li.className = 'oferta-item';
    li.innerHTML = `
      <div class="oferta-top-row">
        <span class="oferta-categoria">${item.categoria}</span>
        ${pct > 0 ? `<span class="oferta-badge-pct">-${pct}%</span>` : ''}
      </div>
      <span class="oferta-nome">${item.nome}</span>
      <div class="oferta-preco-row">
        ${item.desconto > 0 ? `<span class="oferta-preco-de">${fmt(item.preco_base)}</span>` : ''}
        <span class="oferta-preco-por">${fmt(item.preco_final)}</span>
        <span class="oferta-preco-kg">/kg</span>
      </div>`;
    el.appendChild(li);
  });

  iniciarCarrosselOfertas();
}

let v3OfertaIdx   = 0;
let v3OfertaTimer = null;

function iniciarCarrosselOfertas() {
  clearInterval(v3OfertaTimer);
  const itens = document.querySelectorAll('#lista-ofertas .oferta-item');
  if (!itens.length) return;

  v3OfertaIdx = 0;
  aplicarOferta(itens, 0, false);

  if (itens.length > 1) {
    v3OfertaTimer = setInterval(() => {
      v3OfertaIdx = (v3OfertaIdx + 1) % itens.length;
      aplicarOferta(itens, v3OfertaIdx, true);
    }, 4000);
  }
}

function aplicarOferta(itens, idx, comFade) {
  const item    = itens[idx];
  const nome    = item.querySelector('.oferta-nome')?.textContent?.trim() || '';
  const precoFn = item.querySelector('.oferta-preco-por')?.textContent?.trim() || '';
  const precoDe = item.querySelector('.oferta-preco-de')?.textContent?.trim() || '';
  const cat     = item.querySelector('.oferta-categoria')?.textContent?.trim() || '';

  const infoEl  = document.querySelector('.s3-info');
  const fotoEl  = document.getElementById('s3-foto-wrap');
  const dotsEl  = document.getElementById('s3-dots');
  const catEl   = document.getElementById('s3-categoria');
  const nomeEl  = document.getElementById('s3-nome');
  const deEl    = document.getElementById('s3-preco-de');
  const reaisEl = document.getElementById('s3-reais');
  const centsEl = document.getElementById('s3-cents');

  if (!infoEl) return;

  const aplicar = () => {
    if (catEl)  catEl.textContent  = cat;
    if (nomeEl) nomeEl.textContent = nome;
    if (deEl) {
      deEl.textContent   = precoDe ? 'De: ' + precoDe : '';
      deEl.style.display = precoDe ? '' : 'none';
    }
    const limpo = precoFn.replace('R$', '').trim();
    const m = limpo.match(/^(\d+)[,.](\d{2})/);
    if (reaisEl) reaisEl.textContent = m ? m[1] : '—';
    if (centsEl) centsEl.textContent = m ? ',' + m[2] : '';

    if (dotsEl) {
      if (itens.length <= 1) { dotsEl.style.display = 'none'; }
      else {
        dotsEl.style.display = 'flex';
        dotsEl.innerHTML = '';
        Array.from(itens).forEach((_, i) => {
          const dot = document.createElement('span');
          dot.className = 's3-dot' + (i === idx ? ' ativa' : '');
          dotsEl.appendChild(dot);
        });
      }
    }

    if (fotoEl) {
      Array.from(fotoEl.children).forEach(c => { if (!c.classList.contains('s3-foto-overlay')) c.remove(); });
      const img = criarImgComFallback(nome, 'oferta-img');
      fotoEl.insertBefore(img, fotoEl.firstChild);
    }
  };

  if (!comFade) {
    aplicar();
    return;
  }

  if (infoEl) { infoEl.style.transition = 'opacity 0.4s, transform 0.4s'; infoEl.style.opacity = '0'; infoEl.style.transform = 'translateX(20px)'; }
  if (fotoEl) { fotoEl.style.transition = 'opacity 0.4s'; fotoEl.style.opacity = '0'; }

  setTimeout(() => {
    aplicar();
    if (infoEl) { infoEl.style.opacity = '1'; infoEl.style.transform = 'translateX(0)'; }
    if (fotoEl) { fotoEl.style.opacity = '1'; }
  }, 420);
}

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

    const visiveis = itens.filter(i => i.visivel !== 'NÃO');

    const dados = {};
    CATEGORIAS_CONFIG.forEach(cfg => {
      dados[cfg.key] = visiveis.filter(i =>
        cfg.keys.some(k => i.categoria.toLowerCase() === k)
      );
    });
    dados.promocoes = visiveis.filter(i => i.promocao === 'SIM' && i.desconto > 0);

    dadosGlobais = dados;
    const promoAntes = temPromocoes;
    temPromocoes = dados.promocoes.length > 0;

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
