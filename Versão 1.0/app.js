/**
 * ============================================================
 *  MENU DIGITAL – AÇOUGUE OURO VERDE
 *  app.js — Sistema de Slides + Fetch CSV
 *
 *  Estrutura do CSV:
 *  A: Categoria | B: Nome do Corte | C: Preço Base
 *  D: Desconto  | E: Preço Final   | F: Promoção?
 *  G: Visível na TV?
 * ============================================================
 */

// ─── URL DA PLANILHA ─────────────────────────────────────────
const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEq8oeTNFgdAnWZIGOrmoU8QO7WqlMAyvXLPS5rToesYvZdNaoJAgj3pyVcNpPHo8Sk4ty_IukrWt9/pub?gid=232780593&single=true&output=csv';

// ─── FOTOS JSON ───────────────────────────────────────────────
const FOTOS_JSON_URL = 'fotos.json';
// ─────────────────────────────────────────────────────────────

const INTERVALO_MINUTOS  = 5;
const NOME_LOJA          = 'Açougue Ouro Verde';
const SLIDE_DURATION_MS  = 12000;   // 12 s por tela
const SLIDE_FADE_MS      = 800;     // 0.8 s de fade

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let dadosGlobais        = null;   // último payload carregado
let temPromocoes        = false;
let carregouUmaVez      = false;  // controla lógica de primeira vs. cargas seguintes

// Sistema de slides
let slideEls            = [];     // NodeList → Array de .slide
let currentSlideIdx     = 0;
let slideTimer          = null;
let isTransitioning     = false;
let pendingData         = {};     // { idx: dados } — aguarda slide sair

/* ── FOTOS (V3) ── */
let FOTOS_MAP    = {};
let FOTO_FALLBACK = 'logo.png';

/* ============================================================
   RELÓGIO
   ============================================================ */
function atualizarRelogio() {
  const el = document.getElementById('relogio');
  if (!el) return;
  const n = new Date();
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

/* ============================================================
   FOTOS — V3  (lê de fotos.json)
   ============================================================ */
async function carregarFotos() {
  try {
    const resp = await fetch(FOTOS_JSON_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('fotos.json not found');
    const dados = await resp.json();
    FOTOS_MAP     = dados.itens    || {};
    FOTO_FALLBACK = dados.fallback || 'logo.png';
    console.info('[Fotos] Loaded:', Object.keys(FOTOS_MAP).length, 'photos');
  } catch (e) {
    console.warn('[Fotos] Using fallback:', e.message);
    FOTOS_MAP = {};
  }
}

function getFoto(nomeCorte) {
  const entrada = FOTOS_MAP[nomeCorte];
  if (!entrada || !entrada.foto) return FOTO_FALLBACK;
  return entrada.foto;
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
      ph.className = 'foto-placeholder';
      ph.textContent = nomeCorte.substring(0,2).toUpperCase();
      this.parentNode?.insertBefore(ph, this);
    } else {
      this.src = FOTO_FALLBACK;
    }
  };
  return img;
}

/* ============================================================
   PARSER CSV
   ============================================================ */
function splitCSVLinha(linha) {
  const resultado = [];
  let celula = '';
  let emAspas = false;
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
    const promocao    = (p[5] || 'NAO').replace(/"/g, '').trim().toUpperCase();
    const visivel     = (p[6] || 'SIM').replace(/"/g, '').trim().toUpperCase();

    if (!nome || !['bovinos','suínos','suinos','aves'].includes(categoria.toLowerCase())) continue;

    itens.push({ categoria, nome, preco_base, desconto, preco_final, promocao, visivel });
  }
  return itens;
}

/* ============================================================
   RENDER — SLIDE 0: VISÃO GERAL
   ============================================================ */
function renderizarColuna(elId, itens) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.add('atualizando');

  setTimeout(() => {
    el.innerHTML = '';
    if (!itens.length) {
      el.innerHTML = '<li class="item-loading">Sem itens nesta categoria.</li>';
      el.classList.remove('atualizando');
      return;
    }

    const grupos = {};
    itens.forEach(item => {
      if (!grupos[item.categoria]) grupos[item.categoria] = [];
      grupos[item.categoria].push(item);
    });

    Object.entries(grupos).forEach(([cat, lista]) => {
      if (Object.keys(grupos).length > 1) {
        const sep = document.createElement('li');
        sep.className   = 'item-secao';
        sep.textContent = cat.toUpperCase();
        el.appendChild(sep);
      }

      lista.forEach(item => {
        const ehPromo = item.promocao === 'SIM' && item.desconto > 0;
        const li = document.createElement('li');
        li.className = 'item-row' + (ehPromo ? ' em-promo' : '');

        const precoDeHTML = ehPromo
          ? `<span class="item-preco-de">${fmt(item.preco_base)}</span>`
          : '';

        li.innerHTML = `
          <span class="item-nome">${item.nome}</span>
          ${precoDeHTML}
          <span class="item-dots"></span>
          <span class="item-preco">${fmt(item.preco_final)}</span>
          <span class="item-unidade">/kg</span>
        `;
        el.appendChild(li);
      });
    });

    el.classList.remove('atualizando');
  }, 300);
}

function renderizarOfertas(ofertas) {
  const el = document.getElementById('lista-ofertas');
  if (!el) return;
  el.classList.add('atualizando');

  setTimeout(() => {
    el.innerHTML = '';

    if (!ofertas.length) {
      el.innerHTML = '<li class="oferta-vazio">Sem ofertas especiais hoje.<br>Consulte nossos atendentes!</li>';
      el.classList.remove('atualizando');
      return;
    }

    ofertas.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'oferta-item';
      li.style.animationDelay = `${idx * 80}ms`;

      const pct = item.preco_base > 0
        ? Math.round((item.desconto / item.preco_base) * 100)
        : 0;
      const badgePct = pct > 0
        ? `<span class="oferta-badge-pct">-${pct}%</span>`
        : '';
      const precoDeHTML = item.desconto > 0
        ? `<span class="oferta-preco-de">${fmt(item.preco_base)}</span>`
        : '';

      li.innerHTML = `
        <div class="oferta-top-row">
          <span class="oferta-categoria">${item.categoria}</span>
          ${badgePct}
        </div>
        <span class="oferta-nome">${item.nome}</span>
        <div class="oferta-preco-row">
          ${precoDeHTML}
          <span class="oferta-preco-por">${fmt(item.preco_final)}</span>
          <span class="oferta-preco-kg">/kg</span>
        </div>
      `;
      el.appendChild(li);
    });

    el.classList.remove('atualizando');
  }, 300);
}

/* ============================================================
   RENDER — SLIDE 1: BOVINOS SPOTLIGHT
   ============================================================ */
function renderizarSpotlightBovinos(bovinos) {
  const grid = document.getElementById('sp-grid-bovinos');
  if (!grid) return;
  grid.innerHTML = '';

  if (!bovinos.length) {
    grid.innerHTML = '<div class="sp-empty">Sem itens disponíveis.</div>';
    return;
  }

  bovinos.forEach(item => {
    const ehPromo = item.promocao === 'SIM' && item.desconto > 0;
    const pct = (ehPromo && item.preco_base > 0)
      ? Math.round((item.desconto / item.preco_base) * 100)
      : 0;

    const card = document.createElement('div');
    card.className = 'sp-card';

    const promoBadge  = ehPromo
      ? `<span class="sp-card-promo-badge">PROMOÇÃO${pct > 0 ? ' -' + pct + '%' : ''}</span>`
      : '';
    const precoDeHTML = ehPromo
      ? `<span class="sp-card-preco-de">${fmt(item.preco_base)}</span>`
      : '';

    card.innerHTML = `
      ${promoBadge}
      <span class="sp-card-nome">${item.nome}</span>
      ${precoDeHTML}
      <span class="sp-card-preco">${fmt(item.preco_final)}</span>
      <span class="sp-card-kg">/kg</span>
    `;
    grid.appendChild(card);
  });

  ajustarGrid(grid, bovinos.length);
}

/* ============================================================
   RENDER — SLIDE 2: SUÍNOS & AVES SPLIT
   ============================================================ */
function renderizarSpotlightHalf(gridId, itens) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';

  if (!itens.length) {
    grid.innerHTML = '<div class="sp-empty">Sem itens disponíveis.</div>';
    return;
  }

  itens.forEach(item => {
    const ehPromo = item.promocao === 'SIM' && item.desconto > 0;
    const pct = (ehPromo && item.preco_base > 0)
      ? Math.round((item.desconto / item.preco_base) * 100)
      : 0;

    const card = document.createElement('div');
    card.className = 'sp-card';

    const promoBadge  = ehPromo
      ? `<span class="sp-card-promo-badge">${pct > 0 ? '-' + pct + '%' : 'PROMO'}</span>`
      : '';
    const precoDeHTML = ehPromo
      ? `<span class="sp-card-preco-de">${fmt(item.preco_base)}</span>`
      : '';

    card.innerHTML = `
      ${promoBadge}
      <span class="sp-card-nome">${item.nome}</span>
      ${precoDeHTML}
      <span class="sp-card-preco">${fmt(item.preco_final)}</span>
      <span class="sp-card-kg">/kg</span>
    `;
    grid.appendChild(card);
  });

  ajustarGrid(grid, itens.length, true);
}

/* ============================================================
   RENDER — SLIDE 3: OFERTA DO DIA DESTAQUE TOTAL
   ============================================================ */
function renderizarSpotlightOfertas(promocoes) {
  const grid = document.getElementById('sp-grid-ofertas');
  if (!grid) return;
  grid.innerHTML = '';

  if (!promocoes.length) return;

  // Máximo 6 itens para não sobrecarregar a tela
  const exibir = promocoes.slice(0, 6);

  exibir.forEach(item => {
    const pct = item.preco_base > 0
      ? Math.round((item.desconto / item.preco_base) * 100)
      : 0;

    const card = document.createElement('div');
    card.className = 'sp-oferta-card';

    const precoDeHTML = item.desconto > 0
      ? `<span class="sp-oferta-preco-de">${fmt(item.preco_base)}</span>`
      : '';
    const pctBadge = pct > 0
      ? `<span class="sp-oferta-pct-badge">-${pct}%</span>`
      : '';

    card.innerHTML = `
      ${pctBadge}
      <span class="sp-oferta-categoria">${item.categoria}</span>
      <span class="sp-oferta-nome">${item.nome}</span>
      ${precoDeHTML}
      <div class="sp-oferta-preco-row">
        <span class="sp-oferta-preco-por">${fmt(item.preco_final)}</span>
        <span class="sp-oferta-preco-kg">/kg</span>
      </div>
    `;
    grid.appendChild(card);
  });

  // Apenas colunas — linhas ficam auto (cards se redimensionam pelo conteúdo e align-content:center)
  const n    = exibir.length;
  const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows    = '';
}

/* ============================================================
   HELPER — AJUSTE DINÂMICO DE GRID
   ============================================================ */
function ajustarGrid(grid, nItens, modoHalf = false) {
  let nCols;
  if (modoHalf) {
    // Metade da tela (~960px): máximo 2 colunas
    nCols = nItens <= 2 ? 1 : 2;
  } else {
    nCols = nItens <= 4 ? 2 : nItens <= 9 ? 3 : 4;
  }
  const nRows = Math.ceil(nItens / nCols);
  grid.style.gridTemplateColumns = `repeat(${nCols}, 1fr)`;
  grid.style.gridTemplateRows    = `repeat(${nRows}, 1fr)`;
}

/* ============================================================
   RENDER — SLIDE 4: OFERTAS DO DIA
   ============================================================ */
function renderizarSlide4(promocoes) {
  const grid = document.getElementById('slide4-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (!promocoes.length) {
    grid.innerHTML = '<div class="slide4-vazio">Sem ofertas especiais hoje.<br>Consulte nossos atendentes!</div>';
    return;
  }

  promocoes.forEach(item => {
    const pct = item.preco_base > 0
      ? Math.round((item.desconto / item.preco_base) * 100)
      : 0;

    const card = document.createElement('div');
    card.className = 'slide4-card';
    card.innerHTML = `
      <div class="slide4-card-top">
        <span class="slide4-categoria">${item.categoria}</span>
        ${pct > 0 ? `<span class="slide4-badge-pct">-${pct}%</span>` : ''}
      </div>
      <div class="slide4-nome">${item.nome}</div>
      <div class="slide4-preco-de">${fmt(item.preco_base)}</div>
      <div>
        <span class="slide4-preco-final">${fmt(item.preco_final)}</span>
        <span class="slide4-preco-kg">/kg</span>
      </div>
    `;
    grid.appendChild(card);
  });

  // Ajusta colunas pelo número de promos
  const n    = promocoes.length;
  const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

/* ============================================================
   RENDERIZAÇÃO UNIFICADA POR SLIDE INDEX
   ============================================================ */
function renderSlide(idx, dados) {
  switch (idx) {
    case 0:
      renderizarColuna('lista-bovinos', dados.bovinos);
      renderizarColuna('lista-suinos',  dados.suinosAves);
      renderizarOfertas(dados.promocoes);
      break;
    case 1:
      renderizarSpotlightBovinos(dados.bovinos);
      break;
    case 2:
      renderizarSpotlightHalf('sp-grid-suinos', dados.suinos);
      renderizarSpotlightHalf('sp-grid-aves',   dados.aves);
      break;
    case 3:
      renderizarSlide4(dados.promocoes);
      break;
  }
}

/* ============================================================
   SISTEMA DE SLIDES
   ============================================================ */

/** Retorna a lista ordenada de índices de slides a rotacionar */
function getSlideList() {
  return temPromocoes ? [0, 1, 2] : [0, 1];
}

/** Atualiza a aparência dos dots no rodapé */
function atualizarDots() {
  const dots = document.querySelectorAll('.slide-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentSlideIdx);
  });
}

/** Reconstrói os dots conforme a lista de slides ativa */
function renderDots() {
  const container = document.getElementById('slide-dots');
  if (!container) return;
  container.innerHTML = '';

  getSlideList().forEach((slideIdx, pos) => {
    const btn = document.createElement('button');
    btn.className   = 'slide-dot' + (slideIdx === currentSlideIdx ? ' active' : '');
    btn.title       = `Tela ${pos + 1}`;
    btn.setAttribute('aria-label', `Ir para tela ${pos + 1}`);
    btn.addEventListener('click', () => goToSlide(slideIdx));
    container.appendChild(btn);
  });
}

/** Navega para o slide de índice targetIdx com cross-fade */
function goToSlide(targetIdx) {
  if (isTransitioning || targetIdx === currentSlideIdx) return;

  clearInterval(slideTimer);
  isTransitioning = true;

  const prevEl  = slideEls[currentSlideIdx];
  const nextEl  = slideEls[targetIdx];
  const prevIdx = currentSlideIdx;

  // Slide entrante fica por cima durante a transição
  nextEl.style.zIndex = '2';
  prevEl.style.zIndex = '1';

  // Adiciona active ao próximo → fade in
  nextEl.classList.add('active');

  // Remove active do atual na próxima frame → fade out simultâneo
  requestAnimationFrame(() => {
    prevEl.classList.remove('active');
  });

  currentSlideIdx = targetIdx;
  atualizarDots();

  // Após a transição: limpa z-index, aplica dados pendentes, reinicia timer
  setTimeout(() => {
    prevEl.style.zIndex = '';
    nextEl.style.zIndex = '';

    if (pendingData[prevIdx]) {
      renderSlide(prevIdx, pendingData[prevIdx]);
      delete pendingData[prevIdx];
    }

    isTransitioning = false;
    slideTimer = setInterval(avancarSlide, SLIDE_DURATION_MS);
  }, SLIDE_FADE_MS + 60);
}

/** Avança para o próximo slide na rotação */
function avancarSlide() {
  const lista     = getSlideList();
  const posAtual  = lista.indexOf(currentSlideIdx);

  if (posAtual === -1) {
    // Slide atual saiu da lista (ex: Ofertas sem promoções) → volta ao 0
    goToSlide(0);
    return;
  }

  const proxPos = (posAtual + 1) % lista.length;
  goToSlide(lista[proxPos]);
}

/** Inicializa o sistema de slides e começa a rotação */
function iniciarSlides() {
  slideEls = Array.from(document.querySelectorAll('.slide'));

  slideEls.forEach((el, idx) => el.classList.toggle('active', idx === 0));
  currentSlideIdx = 0;

  renderDots();
  slideTimer = setInterval(avancarSlide, SLIDE_DURATION_MS);
}

/* ============================================================
   FETCH DE DADOS
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

    const bovinos    = visiveis.filter(i => i.categoria.toLowerCase() === 'bovinos');
    const suinos     = visiveis.filter(i =>
      i.categoria.toLowerCase() === 'suínos' || i.categoria.toLowerCase() === 'suinos'
    );
    const aves       = visiveis.filter(i => i.categoria.toLowerCase() === 'aves');
    const suinosAves = [...suinos, ...aves];
    const promocoes  = visiveis.filter(i => i.promocao === 'SIM' && i.desconto > 0);

    const dados = { bovinos, suinos, aves, suinosAves, promocoes };
    dadosGlobais = dados;

    const promoAntes = temPromocoes;
    temPromocoes = promocoes.length > 0;

    if (!carregouUmaVez) {
      // Primeira carga: renderiza todos os slides imediatamente
      for (let i = 0; i < 4; i++) renderSlide(i, dados);
      carregouUmaVez = true;
    } else {
      // Cargas seguintes: atualiza apenas slides inativos
      // O slide ativo recebe os novos dados quando sair de cena
      for (let i = 0; i < 4; i++) {
        if (i === currentSlideIdx) {
          pendingData[i] = dados;
        } else {
          renderSlide(i, dados);
        }
      }
    }

    // Recria dots se a disponibilidade de promoções mudou
    if (promoAntes !== temPromocoes) renderDots();

    // Se estamos no Slide 3 (Ofertas) mas não há mais promoções, avança
    if (!temPromocoes && currentSlideIdx === 3) goToSlide(0);

    setStatus('ok', 'Sincronizado');

    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const el   = document.getElementById('ultima-atualizacao');
    if (el) el.textContent = `Última atualização: ${hora}`;

  } catch (e) {
    console.error('[Menu Digital] Erro ao carregar dados:', e);
    setStatus('err', 'Erro de conexão');
  }
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
iniciarSlides();
carregarDados();
setInterval(carregarDados, INTERVALO_MINUTOS * 60 * 1000);
document.title = NOME_LOJA + ' – Cardápio Digital';

console.info(
  `%c🥩 ${NOME_LOJA} – Menu Digital v3`,
  'font-size:16px;font-weight:bold;color:#e83030;'
);
