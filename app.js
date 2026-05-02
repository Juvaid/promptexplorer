/**
 * Feed View Logic
 * Pinterest-style grid for Juvaid Prompt Lib
 */

let allPrompts = [];
let filtered = [];
let page = 1;
const perPage = 20;
let isLoading = false;


const $grid = document.getElementById('gridContainer');
const $loader = document.getElementById('loader');
const $searchInput = document.getElementById('searchInput');
const $sortSelect = document.getElementById('sortSelect');
const $overlay = document.getElementById('detailOverlay');
const $detailImage = document.getElementById('detailImageArea');
const $detailTitle = document.getElementById('detailTitle');
const $detailMeta = document.getElementById('detailMeta');
const $detailContent = document.getElementById('detailContent');
const $copyBtn = document.getElementById('copyBtn');


// Init with polling for data.js
function init() {
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    if (window.PROMPT_DATA) {
      clearInterval(poll);
      // Shuffle initially for variety on every refresh
      allPrompts = [...window.PROMPT_DATA].sort(() => Math.random() - 0.5);
      filtered = [...allPrompts];
      renderFeed();
    } else if (attempts > 50) {

      clearInterval(poll);
      $loader.textContent = "Data not found. Please run build.js or use List View.";
    }
  }, 100);
}


$sortSelect.addEventListener('change', () => {
  sortPrompts();
  renderFeed();
});

function showSkeletons() {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const skel = document.createElement('div');
    skel.className = 'skeleton-card js-skeleton';
    // Random height between 250 and 450
    const h = Math.floor(Math.random() * 200) + 250;
    skel.innerHTML = `
      <div class="skeleton-img" style="height:${h}px">
        <div class="skeleton-shimmer"></div>
        <div class="skeleton-overlay"></div>
      </div>
    `;
    $grid.appendChild(skel);
  }
}

function hideSkeletons() {
  const skels = document.querySelectorAll('.js-skeleton');
  skels.forEach(s => s.remove());
}

let $cols = [];
function setupColumns() {
  $grid.innerHTML = '';
  $cols = [];
  let numCols = 4;
  if (window.innerWidth <= 600) numCols = 1;
  else if (window.innerWidth <= 900) numCols = 2;
  else if (window.innerWidth <= 1400) numCols = 3;

  for (let i = 0; i < numCols; i++) {
    const col = document.createElement('div');
    col.className = 'grid-col';
    $grid.appendChild(col);
    $cols.push(col);
  }
}

function renderFeed(append = false) {
  if (isLoading) return;
  isLoading = true;

  if (!append) {
    setupColumns();
    page = 1;
  }

  const start = (page - 1) * perPage;
  const end = start + perPage;
  const chunk = filtered.slice(start, end);

  if (chunk.length === 0 && page === 1) {
    $grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:100px; color:var(--text-faint);">No prompts found matching your search.</div>';
    $loader.style.display = 'none';
    isLoading = false;
    return;
  }

  if (append) $loader.textContent = "Loading more...";

  let index = 0;
  function renderBatch() {
    const batchSize = 20; // Increase for speed
    const limit = Math.min(index + batchSize, chunk.length);
    
    for (; index < limit; index++) {
      const p = chunk[index];
      const card = document.createElement('div');
      card.className = 'feed-card';
      const thumb = p.media && p.media.length > 0 ? p.media[0] : '';
      
      card.innerHTML = `
        ${thumb ? `<img src="${thumb}" alt="${escHtml(p.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%231a1a1a%22/%3E%3C/svg%3E';">` : '<div style="height:200px;display:flex;align-items:center;justify-content:center;font-size:2rem;opacity:0.2">🍌</div>'}
        <div class="feed-overlay">
          <h3 class="feed-card-title">${escHtml(p.title)}</h3>
          <div class="author-badge">👤 ${escHtml(p.author.name || 'Anonymous')}</div>
        </div>
      `;
      
      card.addEventListener('click', () => openDetail(p));
      
      // Use round-robin distribution for speed and stability
      const colIndex = index % $cols.length;
      $cols[colIndex].appendChild(card);
    }


    if (index < chunk.length) {
      requestAnimationFrame(renderBatch);
    } else {
      if (end >= filtered.length) {
        $loader.style.display = 'none';
      } else {
        $loader.style.display = 'block';
        $loader.textContent = "Scroll for more...";
      }
      isLoading = false;
    }
  }

  requestAnimationFrame(renderBatch);
}





// Search, Sort & Category
function applyFilters() {

  const query = $searchInput.value.toLowerCase().trim();
  const cat = document.querySelector('.cat-tab.active').dataset.cat;
  
  filtered = allPrompts.filter(p => {
    const mSearch = !query || 
      p.title.toLowerCase().includes(query) || 
      (p.description && p.description.toLowerCase().includes(query)) ||
      p.content.toLowerCase().includes(query);
    
    // Categorization logic (Acts like a secondary search)
    let mCat = true;
    if (cat) {
      const haystack = (p.title + ' ' + (p.description || '') + ' ' + p.content).toLowerCase();
      const searchTerm = cat === 'social' ? 'social media' : cat;
      mCat = haystack.includes(searchTerm);
    }



    return mSearch && mCat;
  });


  sortPrompts();
  renderFeed();
}

$searchInput.addEventListener('input', debounce(applyFilters, 300));
$sortSelect.addEventListener('change', applyFilters);

document.getElementById('categoryFilter').addEventListener('click', (e) => {
  if (e.target.classList.contains('cat-tab')) {
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    applyFilters();
  }
});

function sortPrompts() {
  const val = $sortSelect.value;
  if (val === 'newest') filtered.sort((a,b) => b.id - a.id);
  else if (val === 'title') filtered.sort((a,b) => a.title.localeCompare(b.title));
  else if (val === 'random') {
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
  }
}

// Infinite scroll using IntersectionObserver (Better Tracking)
const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !isLoading && page * perPage < filtered.length) {
    page++;
    renderFeed(true);
  }
}, { rootMargin: '800px' }); // Load early

observer.observe($loader);

let currentPromptIndex = -1;

function openDetail(p) {
  currentPromptIndex = filtered.findIndex(item => item.id === p.id);
  $detailTitle.textContent = p.title;

  $detailMeta.innerHTML = `<span class="author-chip">👤 ${escHtml(p.author.name)}</span> <span class="meta-tag">#${p.id}</span>`;
  
  const thumb = p.media && p.media.length > 0 ? p.media[0] : '';
  $detailImage.innerHTML = thumb 
    ? `<div class="feed-detail-left-bg" style="background-image:url('${thumb}')"></div><img src="${thumb}" alt="" />` 
    : '<div style="font-size:5rem; opacity:0.1">🍌</div>';

  
  // 3. Prompt content (expandable if long)
  const isLong = p.content.length > 500;
  $detailContent.innerHTML = `
    <div class="prompt-box ${isLong ? 'collapsed' : ''}" id="promptBox">${escHtml(p.content)}</div>
    ${isLong ? '<button class="expand-btn" id="expandBtn">↓ Show Full Prompt</button>' : ''}
  `;
  
  if (isLong) {
    const box = document.getElementById('promptBox');
    const btn = document.getElementById('expandBtn');
    btn.onclick = () => {
      box.classList.toggle('collapsed');
      btn.textContent = box.classList.contains('collapsed') ? '↓ Show Full Prompt' : '↑ Collapse Prompt';
    };
  }

  
  $overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  $copyBtn.onclick = () => {
    navigator.clipboard.writeText(p.content);
    const originalText = $copyBtn.textContent;
    $copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { $copyBtn.textContent = originalText; }, 2000);
  };
}

document.getElementById('closeDetail').addEventListener('click', closeModal);


$overlay.addEventListener('click', (e) => {
  if (e.target === $overlay) {
    closeModal();
  }
});

function closeModal() {
  $overlay.style.display = 'none';
  document.body.style.overflow = '';
  currentPromptIndex = -1;
}

// Keyboard Navigation
window.addEventListener('keydown', (e) => {
  if ($overlay.style.display !== 'flex') return;

  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowRight') navigate(1);
  if (e.key === 'ArrowLeft') navigate(-1);
});

function navigate(dir) {
  if (currentPromptIndex === -1) return;
  const newIndex = currentPromptIndex + dir;
  if (newIndex >= 0 && newIndex < filtered.length) {
    openDetail(filtered[newIndex]);
  }
}


// Helpers
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Submission Modal Logic
const $promptModal = document.getElementById('promptModal');
const $newPromptBtn = document.getElementById('newPromptBtn');
const $modalClose = document.getElementById('modalClose');
const $modalCancel = document.getElementById('modalCancel');
const $newPromptForm = document.getElementById('newPromptForm');
const $toast = document.getElementById('toast');

function openPromptModal() {
  if (!$promptModal) return;
  $promptModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePromptModal() {
  if (!$promptModal) return;
  $promptModal.style.display = 'none';
  if ($overlay.style.display !== 'flex') document.body.style.overflow = '';
  $newPromptForm.reset();
}

if ($newPromptBtn) $newPromptBtn.addEventListener('click', openPromptModal);
if ($modalClose) $modalClose.addEventListener('click', closePromptModal);
if ($modalCancel) $modalCancel.addEventListener('click', closePromptModal);

if ($promptModal) {
  $promptModal.addEventListener('click', (e) => {
    if (e.target === $promptModal) closePromptModal();
  });
}

function showToast(msg) {
  if (!$toast) return;
  $toast.textContent = msg;
  $toast.classList.add('show');
  setTimeout(() => $toast.classList.remove('show'), 3000);
}

if ($newPromptForm) {
  $newPromptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $newPromptForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const title = document.getElementById('formTitle').value.trim();
    const desc = document.getElementById('formDesc').value.trim();
    const content = document.getElementById('formContent').value.trim();
    const authorName = document.getElementById('formAuthor').value.trim() || 'Community Member';
    const authorLink = document.getElementById('formAuthorLink').value.trim();
    const mediaStr = document.getElementById('formMedia').value.trim();

    const csvRow = `${Date.now()},"Community","${title.replace(/"/g, '""')}","${desc.replace(/"/g, '""')}","${content.replace(/"/g, '""')}","${authorName.replace(/"/g, '""')}","${authorLink.replace(/"/g, '""')}","${mediaStr.replace(/"/g, '""')}","${new Date().toISOString()}"`;

    const webhookUrl = "https://discord.com/api/webhooks/1499944698985578747/8JcyfYIABw0NEF45kBsJK2kGZJjpGJdhWBiZM4qVxFfabZEvnhbmpUFanL-OsGCcaP3F";
    
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: "🚀 **New Prompt Submission!**\n```csv\n" + csvRow + "\n```",
          embeds: [{
            title: title,
            description: desc + "\n\n**Content:**\n" + content,
            color: 16766464,
            author: { name: authorName, url: authorLink }
          }]
        })
      });
      closePromptModal();
      showToast('✓ Submission successful!');
    } catch (err) {
      alert('Failed to send. Please try again.');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

init();

