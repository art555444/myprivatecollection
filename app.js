/* MYprivateCOLLECTION — App logic v3 */
(function () {
  'use strict';

  const PW        = '555';
  const PER_PAGE  = 24;
  const FALLBACK  = 'icon.png'; // placeholder when thumb unavailable

  // Fine-grained GitHub PAT, NUR "Issues: Read and write" auf dieses eine Repo
  // (kein Code-/Datei-Zugriff, keine anderen Repos) — bewusst eingeschränkter
  // Scope, siehe adaptive-skipping-teacup.md. Vor Nutzung ersetzen.
  const GITHUB_REPO       = 'art555444/myprivatecollection';
  const FLAG_LABEL        = 'loeschanfrage';
  const FLAG_STORAGE_KEY  = 'mpc_flagged_ids';

  /* ── State ── */
  const s = {
    mode:    'grid',
    query:   '',
    page:    1,
    list:    [],
    sort:    'asc',
    flagged: new Set(),
  };

  let ordered = [...videos]; // videos in the currently active sort order

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
    E.sortAscBtn    = $('sortAscBtn');
    E.sortDescBtn   = $('sortDescBtn');
    E.sortRandomBtn = $('sortRandomBtn');
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
    // Flagging
    E.flagBar          = $('flagBar');
    E.flagBarCount     = $('flagBarCount');
    E.flagBarDiscard   = $('flagBarDiscard');
    E.flagBarSend      = $('flagBarSend');
    E.flagBackdrop     = $('flagBackdrop');
    E.flagConfirmSheet = $('flagConfirmSheet');
    E.flagConfirmTitle = $('flagConfirmTitle');
    E.flagConfirmSend  = $('flagConfirmSend');
    E.flagConfirmCancel= $('flagConfirmCancel');
    E.flagToast        = $('flagToast');

    s.flagged = loadFlaggedIds();

    /* Events */
    E.lockForm.addEventListener('submit', handleUnlock);
    E.brandBtn.addEventListener('click',  lock);
    E.gridBtn.addEventListener('click',   () => setMode('grid'));
    E.swipeBtn.addEventListener('click',  () => setMode('swipe'));
    E.searchInput.addEventListener('input', onSearch);
    E.clearBtn.addEventListener('click',  clearSearch);
    E.sortAscBtn.addEventListener('click',    () => setSort('asc'));
    E.sortDescBtn.addEventListener('click',   () => setSort('desc'));
    E.sortRandomBtn.addEventListener('click', () => setSort('random'));
    E.swipeClose.addEventListener('click', () => setMode('grid'));

    /* Sheet */
    E.backdrop.addEventListener('click',   closeSheet);
    E.sheetCancel.addEventListener('click', closeSheet);
    E.sheetCopy.addEventListener('click',  handleCopy);
    document.addEventListener('keydown',   onKey);

    /* Flagging */
    E.cardGrid.addEventListener('click', onFlagClick);
    E.swipeTrack.addEventListener('click', onFlagClick);
    E.flagBarSend.addEventListener('click', openFlagConfirm);
    E.flagBarDiscard.addEventListener('click', clearAllFlags);
    E.flagBackdrop.addEventListener('click', closeFlagConfirm);
    E.flagConfirmCancel.addEventListener('click', closeFlagConfirm);
    E.flagConfirmSend.addEventListener('click', submitFlagRequest);

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
    applyFilter();
    E.countChip.textContent = videos.length + ' Videos';
    renderGrid();
    updateFlagBar();
  }

  function lock() {
    E.lockOverlay.style.display = '';
    E.app.hidden = true;
    E.lockInput.value = '';
    E.lockError.textContent = '';
    E.lockError.classList.remove('on');
    s.query = ''; s.page = 1; s.list = [];
    closeSheet();
    closeFlagConfirm();
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
    updateFlagBar();
  }

  function exitSwipe() {
    document.body.style.overflow = '';
    E.swipeTrack.innerHTML = '';
  }

  /* ══════════════════════════════════════
     SORTING
     ══════════════════════════════════════ */
  function idNum(v) {
    return parseInt(String(v.id || '').replace(/\D/g, ''), 10) || 0;
  }

  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function setSort(sort) {
    s.sort = sort;
    ordered = sort === 'desc'   ? [...videos].sort((a,b) => idNum(b) - idNum(a))
            : sort === 'random' ? shuffled(videos)
            :                     [...videos].sort((a,b) => idNum(a) - idNum(b));

    [E.sortAscBtn, E.sortDescBtn, E.sortRandomBtn].forEach(btn => {
      const active = btn.dataset.sort === sort;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    applyFilter();
    renderGrid();
  }

  /* ══════════════════════════════════════
     SEARCH
     ══════════════════════════════════════ */
  function applyFilter() {
    const ql = s.query.toLowerCase();
    s.list = s.query
      ? ordered.filter(v =>
          (v.title||'').toLowerCase().includes(ql) ||
          (v.description||'').toLowerCase().includes(ql) ||
          (v.channel||'').toLowerCase().includes(ql))
      : [...ordered];
    s.page = 1;
  }

  function onSearch() {
    const q = E.searchInput.value.trim();
    s.query = q;
    E.clearBtn.hidden = !q;
    applyFilter();
    E.gridStatus.textContent = q
      ? s.list.length + ' Ergebnis' + (s.list.length !== 1 ? 'se' : '') + ' für „' + q + '"'
      : '';
    renderGrid();
  }

  function clearSearch() {
    E.searchInput.value = '';
    s.query = '';
    applyFilter();
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
    const url     = esc(v.url || '#');
    const thumb   = thumbURL(v);
    const delay   = Math.min(i * 22, 220);
    const id      = esc(v.id || '');
    const flagged = isFlagged(v.id);
    const imgTag = thumb
      ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('no-img');this.remove();" />`
      : '';
    return `
<div class="video-card" style="animation-delay:${delay}ms">
  <a class="card-link" href="${url}" target="_blank" rel="noopener"
     aria-label="${esc(v.title || 'Video öffnen')}">
    <div class="card-thumb${!thumb ? ' no-img' : ''}">${imgTag}
      <span class="card-channel">${esc(v.channel || '—')}</span>
      <span class="card-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </span>
    </div>
    <div class="card-body"><h3 class="card-title">${esc(v.title || 'Ohne Titel')}</h3></div>
  </a>
  ${flagBtnHTML('card-flag', id, flagged)}
</div>`;
  }

  function flagBtnHTML(cls, id, flagged) {
    return `<button class="${cls}${flagged ? ' is-flagged' : ''}" data-flag-id="${id}"
        aria-label="${flagged ? 'Markierung entfernen' : 'Zur Löschung markieren'}" aria-pressed="${flagged}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  </button>`;
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
    const url     = esc(v.url || '#');
    const thumb   = thumbURL(v);
    const bg      = thumb ? esc(thumb) : '';
    const bgStyle = bg ? ` style="background-image:url('${bg}')"` : '';
    const id      = esc(v.id || '');
    const flagged = isFlagged(v.id);
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
    <div class="slide-actions">
      <a class="slide-open" href="${url}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        <span>Video öffnen</span>
      </a>
      ${flagBtnHTML('slide-flag-btn', id, flagged)}
    </div>
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
      if (E.flagConfirmSheet.classList.contains('on')) { closeFlagConfirm(); return; }
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

  /* ══════════════════════════════════════
     FLAGGING ("Zur Löschung markieren")
     ══════════════════════════════════════ */
  function loadFlaggedIds() {
    try {
      const raw = localStorage.getItem(FLAG_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveFlaggedIds() {
    try {
      localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify([...s.flagged]));
    } catch (e) { /* localStorage nicht verfügbar — Flags bleiben nur für diese Sitzung */ }
  }

  function isFlagged(id) {
    return s.flagged.has(id);
  }

  function onFlagClick(e) {
    const btn = e.target.closest('.card-flag, .slide-flag-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFlag(btn.dataset.flagId);
  }

  function toggleFlag(id) {
    if (!id) return;
    const wasFlagged = s.flagged.has(id);
    if (wasFlagged) { s.flagged.delete(id); } else { s.flagged.add(id); }
    saveFlaggedIds();
    const nowFlagged = !wasFlagged;
    document.querySelectorAll(`[data-flag-id="${CSS.escape(id)}"]`).forEach(el => {
      el.classList.toggle('is-flagged', nowFlagged);
      el.setAttribute('aria-pressed', String(nowFlagged));
      el.setAttribute('aria-label', nowFlagged ? 'Markierung entfernen' : 'Zur Löschung markieren');
    });
    updateFlagBar();
  }

  function clearAllFlags() {
    s.flagged.clear();
    saveFlaggedIds();
    document.querySelectorAll('.card-flag.is-flagged, .slide-flag-btn.is-flagged').forEach(el => {
      el.classList.remove('is-flagged');
      el.setAttribute('aria-pressed', 'false');
      el.setAttribute('aria-label', 'Zur Löschung markieren');
    });
    updateFlagBar();
  }

  function updateFlagBar() {
    const n = s.flagged.size;
    E.flagBarCount.textContent = n + ' markiert';
    E.flagBar.classList.toggle('on', n > 0);
    E.flagBar.classList.toggle('is-swipe', s.mode === 'swipe');
    document.body.classList.toggle('flag-bar-active', n > 0);
  }

  function flaggedItems() {
    return videos.filter(v => s.flagged.has(v.id));
  }

  function openFlagConfirm() {
    const items = flaggedItems();
    if (!items.length) return;
    E.flagConfirmTitle.textContent =
      items.length + ' Video' + (items.length !== 1 ? 's' : '') + ' zur Löschung melden?';

    E.flagBar.classList.remove('on'); // avoid overlapping the sheet while it's open

    E.flagConfirmSheet.hidden = false;
    E.flagConfirmSheet.removeAttribute('aria-hidden');
    E.flagBackdrop.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      E.flagBackdrop.classList.add('on');
      E.flagConfirmSheet.classList.add('on');
    });
    document.body.style.overflow = 'hidden';
  }

  function closeFlagConfirm() {
    E.flagBackdrop.classList.remove('on');
    E.flagConfirmSheet.classList.remove('on');
    updateFlagBar(); // restore the bar (still-flagged items) as the sheet slides away
    setTimeout(() => {
      E.flagConfirmSheet.hidden = true;
      E.flagConfirmSheet.setAttribute('aria-hidden', 'true');
      E.flagBackdrop.setAttribute('aria-hidden', 'true');
      if (s.mode !== 'swipe') document.body.style.overflow = '';
    }, 320);
  }

  function submitFlagRequest() {
    const items = flaggedItems();
    if (!items.length) { closeFlagConfirm(); return; }

    const lines = items.map(v => `- [${v.id}] ${v.title || 'Ohne Titel'} — ${v.url}`).join('\n');
    const body  = 'Folgende Videos wurden über die Website zur Löschung markiert:\n\n' + lines;
    const title = `Löschanfrage: ${items.length} Video${items.length !== 1 ? 's' : ''}`;

    const params = new URLSearchParams({ title, body, labels: FLAG_LABEL });
    window.open(`https://github.com/${GITHUB_REPO}/issues/new?${params}`, '_blank', 'noopener');

    clearAllFlags();
    closeFlagConfirm();
    showFlagToast('GitHub-Issue wird geöffnet — bitte dort absenden', false);
  }

  let _flagToastTimer;
  function showFlagToast(msg, isError) {
    E.flagToast.textContent = msg;
    E.flagToast.classList.toggle('is-error', !!isError);
    E.flagToast.classList.add('on');
    clearTimeout(_flagToastTimer);
    _flagToastTimer = setTimeout(() => E.flagToast.classList.remove('on'), 3200);
  }

  /* ── HTML escape ── */
  function esc(str) {
    return String(str||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
