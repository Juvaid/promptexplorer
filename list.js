/* ============================================================
   Nano Banana Pro — Prompt Explorer  |  Virtual scroll edition
   ============================================================ */

// ─ Virtual scroll constants ────────────────────────────────────
const CARD_H   = 120;  // px — MUST match .prompt-card height in CSS
const OVERSCAN = 6;    // extra cards rendered above + below viewport

// ─── State ───────────────────────────────────────────────────
let allPrompts   = [];
let filtered     = [];
let vsStart      = 0;
let vsEnd        = 0;
let activeId     = null;
let currentIndex = -1;
let rawViewMode  = false;


// ─── DOM refs ─────────────────────────────────────────────────
const $list      = document.getElementById('promptList');
const $vTop      = document.getElementById('vTop');
const $vBottom   = document.getElementById('vBottom');
const $detail    = document.getElementById('detailContent');
const $empty     = document.getElementById('detailEmpty');
const $search    = document.getElementById('searchInput');
const $clear     = document.getElementById('searchClear');
const $author    = document.getElementById('authorFilter');
const $sort      = document.getElementById('sortSelect');
const $hasImg    = document.getElementById('hasImagesFilter');
const $total     = document.getElementById('totalCount');
const $filtBadge = document.getElementById('filteredBadge');
const $toast     = document.getElementById('toast');

// Modal refs
const $modal     = document.getElementById('promptModal');
const $newBtn    = document.getElementById('newPromptBtn');
const $closeBtn  = document.getElementById('modalClose');
const $cancelBtn = document.getElementById('modalCancel');
const $form      = document.getElementById('newPromptForm');

// ─── CSV Parser ───────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  const n = text.length;
  let i = 0;

  function parseField() {
    if (text[i] === '"') {
      i++;
      let val = '';
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { val += '"'; i += 2; }
          else { i++; break; }
        } else { val += text[i++]; }
      }
      return val;
    } else {
      let val = '';
      while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r')
        val += text[i++];
      return val;
    }
  }

  function parseRow() {
    const fields = [];
    while (i < n) {
      fields.push(parseField());
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '\r') i++;
      if (text[i] === '\n') { i++; break; }
      if (i >= n) break;
    }
    return fields;
  }

  const headers = parseRow();
  const hIdx = {};
  headers.forEach((h, idx) => { hIdx[h.trim()] = idx; });

  while (i < n) {
    if (text[i] === '\r' || text[i] === '\n') { i++; continue; }
    const fields = parseRow();
    if (fields.length < 2) continue;
    const get = (k) => decodeHtml(fields[hIdx[k]] || '');

    let author = { name: '', link: '' };
    try { const r = fields[hIdx['author']] || ''; if (r) author = JSON.parse(r); } catch {}

    let media = [];
    try { const r = get('sourceMedia'); if (r) media = JSON.parse(r); } catch {}

    rows.push({
      id:          get('id'),
      title:       get('title'),
      description: get('description'),
      content:     get('content'),
      sourceLink:  get('sourceLink'),
      publishedAt: get('sourcePublishedAt'),
      author,
      media,
    });
  }
  return rows;
}

// ─── HTML entity decoder ─────────────────────────────────────
function decodeHtml(str) {
  if (!str || !str.includes('&')) return str;
  const el = document.createElement('textarea');
  el.innerHTML = str;
  return el.value;
}

// ─── Argument extraction ──────────────────────────────────────
function extractArguments(content) {
  const regex = /\{argument\s+name="([^"]+)"\s+default="((?:[^"\\]|\\.|"")*)"\}/g;
  const args = [];
  const seen = new Set();
  let m;
  while ((m = regex.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      args.push({ name: m[1], default: m[2].replace(/""/g, '"') });
    }
  }
  return args;
}

function expandContent(content, values) {
  return content.replace(
    /\{argument\s+name="([^"]+)"\s+default="((?:[^"\\]|\\.)*)"\}/g,
    (match, name) => {
      const val = values[name];
      if (val !== undefined && val.trim() !== '') return val;
      const m2 = match.match(/default="((?:[^"\\]|\\.)*)"/);
      return m2 ? m2[1].replace(/""/g, '"') : match;
    }
  );
}

// ─── Filtering & Sorting ──────────────────────────────────────
let currentCat = '';
const $catTabs = document.querySelectorAll('.cat-tab');
$catTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    $catTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentCat = tab.dataset.cat;
    applyFilters();
  });
});

function applyFilters() {
  const query = $search.value.toLowerCase().trim();
  const author = $author.value;
  const hasImg = $hasImg.checked;
  const sortVal = $sort.value;

  filtered = allPrompts.filter(p => {
    const haystack = (p.title + ' ' + (p.description || '') + ' ' + p.content).toLowerCase();
    const mSearch = !query || haystack.includes(query);
    const mAuthor = !$author || !author || p.author.name === author;
    const mImg = !hasImg || (p.media && p.media.length > 0);
    
    let mCat = true;
    if (currentCat) {
      const searchTerm = currentCat === 'social' ? 'social media' : currentCat;
      mCat = haystack.includes(searchTerm);
    }

    return mSearch && mAuthor && mImg && mCat;
  });

  if (sortVal === 'random') {
    filtered = [...filtered].sort(() => Math.random() - 0.5);
  } else if (sortVal === 'title') {
    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  }
  
  updateBadge();
  render();
}


function updateBadge() {
  if (!$filtBadge) return;
  if (filtered.length < allPrompts.length) {
    $filtBadge.style.display = 'block';
    $filtBadge.textContent = `${filtered.length.toLocaleString()} results`;
  } else {
    $filtBadge.style.display = 'none';
  }
}


// ─── Category inference ───────────────────────────────────────
const CATEGORIES = [
  { test: /product|e-commerce|shopify|branding|mockup|amazon|packaging|store|merch|jewelry/i, label: 'Product',   cls: 'cat-product' },
  { test: /marketing|ad|sales|copywriting|seo|funnel|email|business|promotion|strategy|landing page/i, label: 'Marketing', cls: 'cat-marketing' },
  { test: /youtube|thumbnail|script|video|vlog|channel|cinematic|camera|lighting|shot|film/i, label: 'YouTube',   cls: 'cat-youtube' },
  { test: /social|instagram|tiktok|facebook|post|tweet|influencer|profile|avatar|feed|engagement/i, label: 'Social',    cls: 'cat-social' },
  { test: /creative|art|story|writing|concept|illustration|design|abstract|surreal|sketch|painting/i, label: 'Creative',  cls: 'cat-creative' },
];

function inferCategory(p) {
  const text = (p.title + ' ' + p.description + ' ' + p.content).toLowerCase();
  for (const cat of CATEGORIES) { if (cat.test.test(text)) return cat; }
  return { label: 'Prompt', cls: 'cat-default' };
}


// ─── Card builder (cloning-based for performance) ──────────────────────────
let cardTemplate = null;
function createCardTemplate() {
  const card = document.createElement('div');
  card.className = 'prompt-card';
  card.innerHTML = `
    <div class="card-left">
      <div class="card-top-row">
        <span class="cat-chip"></span>
        <span class="card-date"></span>
      </div>
      <div class="card-title"></div>
      <div class="card-desc"></div>
      <div class="card-meta">
        <span class="card-author"></span>
        <span class="cbadge" style="display:none"></span>
      </div>
    </div>
    <div class="card-img" aria-hidden="true"></div>`;
  return card;
}

function buildCard(p) {
  if (!cardTemplate) cardTemplate = createCardTemplate();
  const card = cardTemplate.cloneNode(true);
  const cat  = inferCategory(p);
  const date = p.publishedAt
    ? new Date(p.publishedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';
  const thumb = p.media[0] || null;

  card.dataset.id = p.id;
  if (p.id === activeId) card.classList.add('active');

  const chip = card.querySelector('.cat-chip');
  chip.className = `cat-chip ${cat.cls}`;
  chip.textContent = cat.label;

  card.querySelector('.card-date').textContent = date;
  card.querySelector('.card-title').textContent = p.title;
  card.querySelector('.card-desc').textContent = p.description;
  card.querySelector('.card-author').textContent = p.author.name || '—';

  const badge = card.querySelector('.cbadge');
  if (p.media.length > 1) {
    badge.style.display = 'inline-block';
    badge.textContent = `🖼 ${p.media.length}`;
  } else {
    badge.style.display = 'none';
  }

  if (thumb) {
    card.querySelector('.card-img').style.backgroundImage = `url('${thumb}')`;
  }

  card.addEventListener('click', () => openPrompt(p));
  return card;
}

// ─── Virtual scroll (Incremental) ──────────────────────────────────
let renderedNodes = new Map(); // index -> node

function renderVirtual() {
  if (!filtered.length || !$vTop || !$vBottom) return;
  const scrollTop = $list.scrollTop;
  const viewH     = $list.clientHeight || 500;

  const newStart = Math.max(0, Math.floor(scrollTop / CARD_H) - OVERSCAN);
  const newEnd   = Math.min(filtered.length - 1,
                    Math.ceil((scrollTop + viewH) / CARD_H) + OVERSCAN);

  if (newStart === vsStart && newEnd === vsEnd && renderedNodes.size > 0) return;

  // 1. Identify which indices are currently rendered but shouldn't be
  for (const [idx, node] of renderedNodes.entries()) {
    if (idx < newStart || idx > newEnd) {
      node.remove();
      renderedNodes.delete(idx);
    }
  }

  // 2. Identify which indices need to be added
  for (let i = newStart; i <= newEnd; i++) {
    if (!renderedNodes.has(i)) {
      const card = buildCard(filtered[i]);
      // Find the right insertion point
      let inserted = false;
      const sortedIdx = Array.from(renderedNodes.keys()).sort((a,b) => a-b);
      for (const existingIdx of sortedIdx) {
        if (existingIdx > i) {
          $list.insertBefore(card, renderedNodes.get(existingIdx));
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        $list.insertBefore(card, $vBottom);
      }
      renderedNodes.set(i, card);
    }
  }

  vsStart = newStart;
  vsEnd   = newEnd;

  $vTop.style.height    = vsStart * CARD_H + 'px';
  $vBottom.style.height = Math.max(0, (filtered.length - vsEnd - 1)) * CARD_H + 'px';
}


function render() {
  vsStart = 0; vsEnd = 0;
  $list.scrollTop = 0;
  renderedNodes.clear();

  // Clear everything between spacers
  const toRemove = [];
  let node = $vTop ? $vTop.nextSibling : null;
  while (node && node !== $vBottom) { toRemove.push(node); node = node.nextSibling; }
  toRemove.forEach(el => el.remove());

  if (!$vTop || !$vBottom) return;

  if (filtered.length === 0) {
    $vTop.style.height = $vBottom.style.height = '0px';
    const msg = document.createElement('div');
    msg.className = 'no-results';
    msg.innerHTML = '<h3>No prompts found</h3><p>Try a different search or clear filters.</p>';
    $list.insertBefore(msg, $vBottom);
    return;
  }

  $vBottom.style.height = filtered.length * CARD_H + 'px';
  $vTop.style.height    = '0px';
  renderVirtual();
}


$list.addEventListener('scroll', renderVirtual, { passive: true });
window.addEventListener('resize', renderVirtual, { passive: true });

// ─── Prompt detail ────────────────────────────────────────────


// ─── Prompt detail ────────────────────────────────────────────
function openPrompt(p) {
  activeId = p.id;
  rawViewMode = false;

  // Update currentIndex if not already set by navigateTo
  const idx = filtered.findIndex(x => x.id === p.id);
  if (idx !== -1) currentIndex = idx;

  document.querySelectorAll('.prompt-card').forEach(c => {
    c.classList.toggle('active', c.dataset.id === p.id);
  });

  $empty.style.display = 'none';
  $detail.style.display = 'block';
  renderDetail(p);

  // Performance-first mobile behavior: scroll to detail
  if (window.innerWidth <= 1024) {
    $detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderDetail(p) {
  const args = extractArguments(p.content);
  const argValues = {};
  args.forEach(a => { argValues[a.name] = a.default; });

  const date = p.publishedAt ? new Date(p.publishedAt).toLocaleString('en', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : '';

  let imagesHtml = '';
  if (p.media.length > 0) {
    imagesHtml = `
      <div class="hero-images">
        ${p.media.map(url => `<img class="img-hero" src="${escAttr(url)}" alt="Prompt reference image" loading="lazy" onerror="this.style.display='none'" />`).join('')}
      </div>`;
  }

  let argsHtml = '';
  if (args.length > 0) {
    argsHtml = `
      <div class="args-section">
        <div class="section-label">Customize Prompt</div>
        <div class="args-grid">
          ${args.map(a => `
            <div class="arg-item">
              <label class="arg-label">
                <span class="arg-name-pill">${escHtml(a.name)}</span>
              </label>
              <textarea class="arg-input" rows="2" data-arg="${escAttr(a.name)}" placeholder="${escAttr(a.default)}">${escHtml(a.default)}</textarea>
            </div>`).join('')}
        </div>
      </div>`;
  }

  $detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-id-row">
        <span class="detail-id">#${p.id}</span>
        ${p.sourceLink ? `<a class="detail-source-link" href="${escAttr(p.sourceLink)}" target="_blank" rel="noopener">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M8 1h3m0 0v3m0-3L5.5 6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Source
        </a>` : ''}
        ${date ? `<span class="meta-tag">${date}</span>` : ''}
        <button class="mobile-close" id="mobileClose">✕ Close</button>
      </div>

      <div class="detail-meta">
        ${p.author.name ? `<a class="author-chip" href="${escAttr(p.author.link || '#')}" target="_blank" rel="noopener">👤 ${escHtml(p.author.name)}</a>` : ''}
        ${args.length ? `<span class="meta-tag">⚙ ${args.length} arguments</span>` : ''}
      </div>
    </div>


    ${imagesHtml}
    ${argsHtml}

    <div class="prompt-section">
      <div class="prompt-toolbar">
        <div class="section-label" style="margin:0">Expanded Prompt</div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="reset-btn" id="resetBtn">↺ Reset</button>
        </div>
      </div>
      <div class="prompt-output" id="promptOutput"></div>
      <div style="margin-top:8px;text-align:right">
        <button class="raw-toggle" id="rawToggle">Show raw (with template tokens)</button>
      </div>
    </div>

    <div class="detail-actions">
      <button class="copy-btn" id="copyBtn">
        <svg width="15" height="15" viewBox="0 0 13 13" fill="none" style="margin-right: 6px;"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 9H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Copy Prompt
      </button>
    </div>

  `;

  renderOutput(p, argValues);


  const btnClose = document.getElementById('mobileClose');

  if (btnClose) btnClose.addEventListener('click', () => {
    $detail.style.display = 'none';
    $empty.style.display = 'flex';
    activeId = null;
    document.querySelectorAll('.prompt-card').forEach(c => c.classList.remove('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });




  $detail.querySelectorAll('.img-hero').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.src));
  });

  $detail.querySelectorAll('.arg-input').forEach(inp => {
    inp.addEventListener('input', () => {
      argValues[inp.dataset.arg] = inp.value;
      renderOutput(p, argValues);
    });
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    args.forEach(a => { argValues[a.name] = a.default; });
    $detail.querySelectorAll('.arg-input').forEach(inp => {
      inp.value = argValues[inp.dataset.arg] || '';
    });
    renderOutput(p, argValues);
    showToast('Arguments reset to defaults');
  });

  document.getElementById('copyBtn').addEventListener('click', () => {
    const text = rawViewMode ? p.content : expandContent(p.content, argValues);
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.classList.add('copied');
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 9H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Copy Prompt`;
      }, 2000);
      showToast('Prompt copied to clipboard!');
    });
  });

  document.getElementById('rawToggle').addEventListener('click', () => {
    rawViewMode = !rawViewMode;
    renderOutput(p, argValues);
    document.getElementById('rawToggle').textContent = rawViewMode
      ? 'Show expanded (with values)' : 'Show raw (with template tokens)';
  });
}

function renderOutput(p, values) {
  const out = document.getElementById('promptOutput');
  if (!out) return;
  if (rawViewMode) {
    out.innerHTML = escHtml(p.content).replace(
      /\{argument\s+name="([^"]+)"\s+default="[^"]*"\}/g,
      (match) => `<mark>${match}</mark>`
    );
  } else {
    out.textContent = expandContent(p.content, values);
  }
}

// ─── Lightbox ─────────────────────────────────────────────────
let $lightbox, $lightboxImg;
function ensureLightbox() {
  if ($lightbox) return;
  $lightbox = document.createElement('div');
  $lightbox.className = 'lightbox';
  $lightbox.innerHTML = `<button class="lightbox-close">✕</button><img src="" alt="Preview" />`;
  document.body.appendChild($lightbox);
  $lightboxImg = $lightbox.querySelector('img');
  $lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  $lightbox.addEventListener('click', e => { if (e.target === $lightbox) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
}
function openLightbox(src) { ensureLightbox(); $lightboxImg.src = src; $lightbox.classList.add('open'); }
function closeLightbox() { $lightbox?.classList.remove('open'); }

// ─── Toast ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2500);
}

// ─── Utilities ────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) { return escHtml(str); }

// ─── Data loading ─────────────────────────────────────────────
function loadData() {
  // Path A: data.js pre-built
  let attempts = 0;
  const tryPrebuilt = setInterval(() => {
    attempts++;
    if (window.PROMPT_DATA && window.PROMPT_DATA.length > 0) {
      clearInterval(tryPrebuilt);
      ingestData(window.PROMPT_DATA);
      return;
    }
    if (attempts > 40) clearInterval(tryPrebuilt);
  }, 100);

  // Path B: FileReader fallback
  const fileInput = document.getElementById('csvFileInput');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('loader').innerHTML = `
      <div class="loader-spinner"></div>
      <p style="color:var(--text-muted);font-size:.85rem">Parsing ${file.name}…</p>
      <p style="font-size:0.72rem;color:var(--text-faint);margin-top:4px">${(file.size/1024/1024).toFixed(1)} MB — please wait</p>`;

    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { ingestData(parseCSV(ev.target.result)); }
        catch (err) {
          document.getElementById('loader').innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--text-muted)">
              <div style="font-size:1.5rem;margin-bottom:8px">⚠</div>
              <strong>Parse error</strong><br>
              <span style="font-size:.8rem">${err.message}</span>
            </div>`;
        }
      };
      reader.onerror = () => {
        document.getElementById('loader').innerHTML =
          '<div style="text-align:center;padding:20px;color:var(--text-muted)">Could not read file.</div>';
      };
      reader.readAsText(file, 'utf-8');
    }, 50);
  });
}

function ingestData(data) {
  const $loader = document.getElementById('loader');
  if ($loader) $loader.style.display = 'none';

  let customPrompts = [];
  try {
    const saved = localStorage.getItem('nbp_custom_prompts');
    if (saved) customPrompts = JSON.parse(saved);
  } catch (e) {
    console.error('Could not load custom prompts', e);
  }

  // Shuffle all prompts initially for discovery
  allPrompts = [...customPrompts, ...data].sort(() => Math.random() - 0.5);

  if ($total) $total.textContent = allPrompts.length.toLocaleString('en');


  const authorSet = new Set();
  allPrompts.forEach(p => { if (p.author && p.author.name) authorSet.add(p.author.name); });
  if ($author) {
    [...authorSet].sort().forEach(a => {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      $author.appendChild(opt);
    });
  }

  filtered = [...allPrompts];
  render();
  showToast(`✓ Loaded ${allPrompts.length.toLocaleString()} prompts`);
}

// ─── Event listeners ──────────────────────────────────────────


// ─── Event listeners ──────────────────────────────────────────
let searchTimer;
$search.addEventListener('input', () => {
  $clear.classList.toggle('visible', $search.value.length > 0);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 250);
});
$clear.addEventListener('click', () => {
  $search.value = '';
  $clear.classList.remove('visible');
  applyFilters();
  $search.focus();
});
if ($author) $author.addEventListener('change', applyFilters);
if ($sort) $sort.addEventListener('change', applyFilters);
if ($hasImg) $hasImg.addEventListener('change', applyFilters);

// ─── Modal & Form Logic ──────────────────────────────────────
function openModal() {
  $modal.style.display = 'flex';
  document.getElementById('formTitle').focus();
}

function closeModal() {
  $modal.style.display = 'none';
  $form.reset();
}

$newBtn.addEventListener('click', openModal);
$closeBtn.addEventListener('click', closeModal);
$cancelBtn.addEventListener('click', closeModal);

$modal.addEventListener('click', (e) => {
  if (e.target === $modal) closeModal();
});

$form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = $form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Sending...';
  submitBtn.disabled = true;

  const title = document.getElementById('formTitle').value.trim();
  const desc = document.getElementById('formDesc').value.trim();
  const content = document.getElementById('formContent').value.trim();
  const authorName = document.getElementById('formAuthor').value.trim() || 'Community Member';
  const authorLink = document.getElementById('formAuthorLink').value.trim();
  const mediaStr = document.getElementById('formMedia').value.trim();
  
  let media = [];
  if (mediaStr) {
    media = mediaStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  
  // Format as CSV for Juvaid to easily copy
  // Columns: id,category,title,description,content,author,sourceLink,sourceMedia,sourcePublishedAt
  const authorJson = JSON.stringify({ name: authorName, link: authorLink }).replace(/"/g, '""');
  const mediaJson = media.length ? JSON.stringify(media).replace(/"/g, '""') : '[]';
  const cleanStr = (s) => `"${s.replace(/"/g, '""')}"`;
  
  const csvRow = `${Date.now()},"Community",${cleanStr(title)},${cleanStr(desc)},${cleanStr(content)},"${authorJson}","", "${mediaJson}","${new Date().toISOString()}"`;

  // --- DISCORD WEBHOOK URL ---
  // Sends prompts directly to the Juvaid Discord Server
  const webhookUrl = "https://discord.com/api/webhooks/1499944698985578747/8JcyfYIABw0NEF45kBsJK2kGZJjpGJdhWBiZM4qVxFfabZEvnhbmpUFanL-OsGCcaP3F";
  
  // Only add URL if it looks like a valid http link to prevent Discord 400 errors
  const isValidUrl = (url) => {
    try { return Boolean(new URL(url)); }
    catch(e){ return false; }
  };

  const payload = {
    content: "🚀 **New Prompt Submission!**\n\nCopy this exact row and paste it at the bottom of your `nano-banana-pro-prompts.csv` file:\n```csv\n" + csvRow + "\n```",
    embeds: [{
      title: title || "Untitled Prompt",
      description: desc ? desc + "\n\n**Prompt Template:**\n```json\n" + content + "\n```" : "**Prompt Template:**\n```json\n" + content + "\n```",
      color: 16766464, // Yellow Banana color
      author: {
        name: authorName
      }
    }]
  };
  
  if (authorLink && isValidUrl(authorLink)) {
    payload.embeds[0].author.url = authorLink;
  }
  
  if (media.length > 0 && isValidUrl(media[0])) {
    payload.embeds[0].image = { url: media[0] };
  }

  try {
    if (webhookUrl === "REPLACE_ME_WITH_DISCORD_WEBHOOK_URL") {
      console.warn("Discord Webhook URL not set! Simulating submission for testing.");
      // Simulate network request for dev
      await new Promise(r => setTimeout(r, 800));
    } else {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Network response was not ok');
    }
    
    closeModal();
    showToast('✓ Prompt submitted for review!');
  } catch (err) {
    console.error('Webhook Error:', err);
    alert('Failed to submit prompt. Please try again later.');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

function showToast(msg) {
  if (!$toast) return;
  $toast.textContent = msg;
  $toast.classList.add('show');
  setTimeout(() => { $toast.classList.remove('show'); }, 3000);
}

// ─── Boot ─────────────────────────────────────────────────────
loadData();

// Global Keyboard Navigation
window.addEventListener('keydown', (e) => {
  if (activeId === null) return;
  
  if (e.key === 'Escape') {
    activeId = null;
    $detail.style.display = 'none';
    $empty.style.display = 'flex';
    document.querySelectorAll('.prompt-card').forEach(c => c.classList.remove('active'));
    return;
  }

  const currentIndex = filtered.findIndex(p => p.id === activeId);
  if (currentIndex === -1) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = filtered[currentIndex + 1];
    if (next) openPrompt(next);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = filtered[currentIndex - 1];
    if (prev) openPrompt(prev);
  }
});
loadData();
