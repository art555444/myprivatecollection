/* MYprivateCOLLECTION — App logic v3 */
(function () {
  'use strict';

  const PW        = '555';
  const PER_PAGE  = 24;
  const FALLBACK  = 'icon.png'; // placeholder when thumb unavailable

  /* ── State ── */
  const s = {
    mode:   'grid',
    query:  '',
    page:   1,
    list:   [],
  };

  /* ── DOM refs ── */
  const E = {};
  const $ = id => document.getElementById(id);

  /* ══════════════════════════════════════
     INIT
     ══════════════════════════════════════ */
  function init() {
    E.lockOverlay   = $('lockOverlay');
    E.lockCard      = $('lockCard');
    E.lockForm      = $('lockForm');
    E.lockInput     = $('lockInput');
    E.lockError     = $('lockError');
    E.app           = $('app');
    E.brandBtn      = $('brandBtn');
    E.gridBtn       = $('gridBtn');
    E.swipeBtn      = $('swipeBtn');
    E.countChip     = $('countChip');
    E.gridView      = $('gridView');
    E.swipeView     = $('swipeView');
    E.searchInput   = $('searchInput');
    E.clearBtn      = $('clearBtn');
    E.gridStatus    = $('gridStatus');
    E.cardGrid      = $('cardGrid');
    E.pageNav       = $('pageNav');
    E.swipeTrack    = $('swipeTrack');
    E.swipeCounter  = $('swipeCounter');
    E.swipeClose    = $('swipeClose');
    E.swipeHint     = $('swipeHint');
    // Action sheet
    E.backdrop      = $('sheetBackdrop');
    E.sheet         = $('actionSheet');
    E.sheetTitle    = $('sheetTitle');
    E.sheetOpen     = $('sheetOpen');
    E.sheetCopy     = $('sheetCopy');
    E.sheetFirefox  = $('sheetFirefox');
    E.sheetCancel   = $('sheetCancel');
    E.copyToast     = $('copyToast');

    /* Events */
    E.lockForm.addEventListener('submit', handleUnlock);
    E.brandBtn.addEventListener('click',  lock);
    E.gridBtn.addEventListener('click',   () => setMode('grid'));
    E.swipeBtn.addEventListener('click',  () => setMode('swipe'));
    E.searchInput.addEventListener('input', onSearch);
    E.clearBtn.addEventListener('click',  clearSearch);
    E.swipeClose.addEventListener('click', () => setMode('grid'));

    /* Sheet */
    E.backdrop.addEventListener('click',   closeSheet);
    E.sheetCancel.addEventListener('click', closeSheet);
    E.sheetCopy.addEventListener('click',  handleCopy);
    document.addEventListener('keydown',   onKey);

    E.lockInput.focus();
  }

  /* ══════════════════════════════════════
     LOCK / UNLOCK
     ══════════════════════════════════════ */
  function handleUnlock(e) {
    e.preventDefault();
    if (E.lockInput.value === PW) {
      unlock();
    } else {
      E.lockInput.value = '';
      E.lockError.textContent = 'Falsches Passwort. Bitte erneut versuchen.';
      E.lockError.classList.add('on');
      E.lockCard.classList.remove('shake');
      void E.lockCard.offsetWidth;
      E.lockCard.classList.add('shake');
      E.lockInput.focus();
    }
  }

  function unlock() {
    E.lockOverlay.style.display = 'none';
    E.app.hidden = false;
    E.app.removeAttribute('aria-hidden');
    s.list = [...videos];
    E.countChip.textContent = videos.length + ' Videos';
    renderGrid();
  }

  function lock() {
    E.lockOverlay.style.display = '';
    E.app.hidden = true;
    E.lockInput.value = '';
    E.lockError.textContent = '';
    E.lockError.classList.remove('on');
    s.query = ''; s.page = 1; s.list = [];
    closeSheet();
    if (s.mode === 'swipe') exitSwipe();
    E.lockInput.focus();
  }

  /* ══════════════════════════════════════
     MODE SWITCHING
     ══════════════════════════════════════ */
  function setMode(mode) {
    s.mode = mode;
    const isGrid = mode === 'grid';
    E.gridBtn.classList.toggle('active', isGrid);
    E.gridBtn.setAttribute('aria-pressed', String(isGrid));
    E.swipeBtn.classList.toggle('active', !isGrid);
    E.swipeBtn.setAttribute('aria-pressed', String(!isGrid));
    E.gridView.hidden = !isGrid;
    E.gridView.setAttribute('aria-hidden', String(!isGrid));
    E.swipeView.hidden = isGrid;
    E.swipeView.setAttribute('aria-hidden', String(isGrid));
    if (isGrid) { exitSwipe(); } else { document.body.style.overflow = 'hidden'; renderSwipe(); }
  }

  function exitSwipe() {
    document.body.style.overflow = '';
    E.swipeTrack.innerHTML = '';
  }

  /* ══════════════════════════════════════
     SEARCH
     ══════════════════════════════════════ */
  function onSearch() {
    const q = E.searchInput.value.trim();
    s.query = q;
    E.clearBtn.hidden = !q;
    const ql = q.toLowerCase();
    s.list = q
      ? videos.filter(v =>
          (v.title||'').toLowerCase().includes(ql) ||
          (v.description||'').toLowerCase().includes(ql) ||
          (v.channel||'').toLowerCase().includes(ql))
      : [...videos];
    s.page = 1;
    E.gridStatus.textContent = q
      ? s.list.length + ' Ergebnis' + (s.list.length !== 1 ? 'se' : '') + ' für „' + q + '"'
      : '';
    renderGrid();
  }

  function clearSearch() {
    E.searchInput.value = '';
    s.query = ''; s.list = [...videos]; s.page = 1;
    E.clearBtn.hidden = true;
    E.gridStatus.textContent = '';
    renderGrid();
    E.searchInput.focus();
  }

  /* ══════════════════════════════════════
     GRID RENDERING
     ══════════════════════════════════════ */
  function renderGrid() {
    const total      = s.list.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (s.page > totalPages) s.page = totalPages;
    const slice = s.list.slice((s.page-1)*PER_PAGE, s.page*PER_PAGE);

    if (total === 0) {
      E.cardGrid.innerHTML = '<div class="empty-state"><strong>Keine Videos gefunden</strong>Andere Suchbegriffe versuchen</div>';
      E.pageNav.innerHTML = '';
      return;
    }

    E.cardGrid.innerHTML = slice.map((v, i) => cardHTML(v, i)).join('');
    renderPagination(totalPages);
  }

  const NO_THUMB = 'images/no-thumbnail.jpg';

  function thumbURL(v) {
    const t = v.thumbnail || '';
    return (t && t !== NO_THUMB) ? t : null;
  }

  function cardHTML(v, i) {
    const url   = esc(v.url || '#');
    const thumb = thumbURL(v);
    const delay = Math.min(i * 22, 220);
    const imgTag = thumb
      ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('no-img');this.remove();" />`
      : '';
    return `
<a class="video-card" href="${url}" target="_blank" rel="noopener noreferrer"
   aria-label="${esc(v.title || 'Video öffnen')}" style="animation-delay:${delay}ms">
  <div class="card-thumb${!thumb ? ' no-img' : ''}">${imgTag}
    <span class="card-channel">${esc(v.channel || '—')}</span>
    <span class="card-play" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </span>
  </div>
  <div class="card-body"><h3 class="card-title">${esc(v.title || 'Ohne Titel')}</h3></div>
</a>`;
  }

  /* ── Pagination ── */
  function renderPagination(totalPages) {
    if (totalPages <= 1) { E.pageNav.innerHTML = ''; return; }
    const pages = pageRange(s.page, totalPages);
    let html = `<button class="page-btn" data-p="${s.page-1}" ${s.page===1?'disabled':''} aria-label="Zurück">←</button>`;
    let prev = null;
    for (const p of pages) {
      if (prev !== null && p-prev > 1) html += `<span class="page-dots" aria-hidden="true">…</span>`;
      html += `<button class="page-btn${p===s.page?' active':''}" data-p="${p}" ${p===s.page?'aria-current="page"':''}>${p}</button>`;
      prev = p;
    }
    html += `<button class="page-btn" data-p="${s.page+1}" ${s.page===totalPages?'disabled':''} aria-label="Weiter">→</button>`;
    E.pageNav.innerHTML = html;
    E.pageNav.onclick = e => {
      const btn = e.target.closest('[data-p]');
      if (!btn || btn.disabled) return;
      const p = parseInt(btn.dataset.p, 10);
      if (p < 1 || p > totalPages) return;
      s.page = p; renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  function pageRange(cur, total) {
    const set = new Set([1, total]);
    for (let i = Math.max(2,cur-2); i <= Math.min(total-1,cur+2); i++) set.add(i);
    return [...set].sort((a,b) => a-b);
  }

  /* ══════════════════════════════════════
     SWIPE / TIKTOK MODE
     ══════════════════════════════════════ */
  function renderSwipe() {
    const list = s.list.length ? s.list : videos;
    E.swipeTrack.innerHTML = list.map((v,i) => slideHTML(v,i)).join('');
    updateCounter(0, list.length);

    const obs = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) updateCounter(+entry.target.dataset.idx, list.length);
      }
    }, { root: E.swipeTrack, threshold: 0.6 });

    E.swipeTrack.querySelectorAll('.swipe-slide').forEach(el => obs.observe(el));
  }

  function slideHTML(v, i) {
    const url   = esc(v.url || '#');
    const thumb = thumbURL(v);
    const bg    = thumb ? esc(thumb) : '';
    const bgStyle = bg ? ` style="background-image:url('${bg}')"` : '';
    const imgTag  = thumb
      ? `<img src="${esc(thumb)}" alt="${esc(v.title||'')}" loading="${i<3?'eager':'lazy'}" referrerpolicy="no-referrer" onerror="this.style.display='none';" />`
      : '';
    return `
<article class="swipe-slide" data-idx="${i}" data-title="${esc(v.title||'')}" aria-label="${esc(v.title||'Video')}">
  <div class="slide-bg"${bgStyle}></div>
  <div class="slide-media">${imgTag}</div>
  <div class="slide-info">
    <span class="slide-channel">${esc(v.channel||'Unknown')}</span>
    <h2 class="slide-title">${esc(v.title||'Ohne Titel')}</h2>
    <a class="slide-open" href="${url}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      Video öffnen
    </a>
  </div>
</article>`;
  }

  function updateCounter(idx, total) {
    E.swipeCounter.textContent = (idx+1) + ' / ' + total;
  }

  /* ══════════════════════════════════════
     ACTION SHEET (Privacy-Open)
     ══════════════════════════════════════ */
  let _sheetURL = '';

  function openSheet(url, title) {
    _sheetURL = url;
    E.sheetTitle.textContent = title || 'Video öffnen';
    E.sheetOpen.href        = url;
    E.sheetFirefox.href     = 'firefox://open-url?url=' + encodeURIComponent(url) + '&isPrivate=true';

    E.sheet.hidden = false;
    E.sheet.removeAttribute('aria-hidden');
    E.backdrop.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      E.backdrop.classList.add('on');
      E.sheet.classList.add('on');
    });
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    E.backdrop.classList.remove('on');
    E.sheet.classList.remove('on');
    setTimeout(() => {
      E.sheet.hidden = true;
      E.sheet.setAttribute('aria-hidden', 'true');
      E.backdrop.setAttribute('aria-hidden', 'true');
      if (s.mode !== 'swipe') document.body.style.overflow = '';
    }, 320);
  }

  function handleCopy() {
    if (!_sheetURL) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(_sheetURL).then(showCopyToast);
    } else {
      /* Fallback for older browsers */
      const ta = document.createElement('textarea');
      ta.value = _sheetURL;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      ta.remove();
      showCopyToast();
    }
    closeSheet();
  }

  let _toastTimer;
  function showCopyToast() {
    E.copyToast.classList.add('on');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => E.copyToast.classList.remove('on'), 3200);
  }

  /* ── Keyboard ── */
  function onKey(e) {
    if (e.key === 'Escape') {
      if (E.sheet.classList.contains('on')) { closeSheet(); return; }
      if (s.mode === 'swipe') setMode('grid');
      return;
    }
    if (s.mode !== 'swipe' || E.sheet.classList.contains('on')) return;
    const h = E.swipeTrack.clientHeight;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault(); E.swipeTrack.scrollBy({ top:  h, behavior: 'smooth' });
    }
    if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  {
      e.preventDefault(); E.swipeTrack.scrollBy({ top: -h, behavior: 'smooth' });
    }
  }

  /* ── HTML escape ── */
  function esc(str) {
    return String(str||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
