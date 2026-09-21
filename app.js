/* ═══════════════════════════════════════════════════════════════
   MYprivateCOLLECTION — App-Logik
   Liest das globale `videos`-Array aus script_cleaned.js (wird von den
   Python-Scripts gepflegt) und baut daraus die Oberfläche.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // ── Konstanten ────────────────────────────────────────────────
  const PW = '555';
  const FAV_KEY = 'mpc_favorites';
  const FALLBACK = 'images/no-thumbnail.jpg';
  const CHANNELS = {
    pornhub: 'Pornhub', xhamster: 'xHamster', xnxx: 'XNXX', xvideos: 'XVideos',
    redtube: 'RedTube', youtube: 'YouTube', brazzers: 'Brazzers',
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reducedMQ.matches;

  // ── Elemente ──────────────────────────────────────────────────
  const E = {};
  [
    'lock', 'lockSub', 'dots', 'keypad', 'keyDel',
    'app', 'nav', 'navBg', 'navTitle', 'lockBtn',
    'page', 'large', 'largeIn', 'largeTitle', 'subtitle', 'grid',
    'empty', 'emptyIcon', 'emptyTitle', 'emptyText',
    'dock', 'dockMain', 'tabs', 'luckyBtn', 'searchBtn', 'dockSearch', 'q', 'clearBtn', 'closeSearch',
    'peek', 'peekScrim', 'peekCard', 'peekMenu', 'peekTitle', 'peekDesc', 'peekOpen', 'peekFav', 'peekFavLabel', 'peekCopy', 'peekShare',
    'lucky', 'luckyScrim', 'luckySheet', 'luckyGrab', 'luckyStage', 'luckyImg', 'luckyChan', 'luckyTitle', 'luckyOpen', 'luckyAgain', 'luckyClose',
    'toast', 'toastText', 'safeProbe', 'hapticLabel',
  ].forEach((id) => { E[id] = $(id); });

  // ── Zustand ───────────────────────────────────────────────────
  const S = {
    tab: 'all',
    q: '',
    list: [],
    favs: loadFavs(),
    scroll: { all: 0, fav: 0 },
    introDelay: 0,
    built: false,
    locked: true,
  };
  let items = [];
  const byId = new Map();

  // ═════════════════════════════════════════════════════════════
  //  Federphysik → CSS linear()
  //  Apple-Parameter: damping (Überschwingen) und response (Tempo)
  // ═════════════════════════════════════════════════════════════
  function makeSpring(damping, response) {
    const w = (2 * Math.PI) / response;
    const f = damping < 1
      ? (t) => {
          const wd = w * Math.sqrt(1 - damping * damping);
          return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + (damping * w / wd) * Math.sin(wd * t));
        }
      : (t) => 1 - Math.exp(-w * t) * (1 + w * t);
    let T = 3;
    for (let t = 3; t > 0; t -= 0.01) {
      if (Math.abs(1 - f(t)) > 0.002) { T = t + 0.01; break; }
    }
    const N = 44;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(i === N ? 1 : f((T * i) / N));
    return { ease: `linear(${pts.map((v) => v.toFixed(4)).join(', ')})`, ms: Math.round(T * 1000) };
  }

  const SP = { ease: 'cubic-bezier(.23, 1, .32, 1)', ms: 460 };
  const BOUNCE = { ease: 'cubic-bezier(.34, 1.42, .64, 1)', ms: 560 };

  function initSprings() {
    if (reduced()) return;
    try {
      if (!(window.CSS && CSS.supports('transition-timing-function', 'linear(0, 1)'))) return;
      const smooth = makeSpring(1, 0.36);
      const bouncy = makeSpring(0.74, 0.42);
      Object.assign(SP, smooth);
      Object.assign(BOUNCE, bouncy);
      const root = document.documentElement.style;
      root.setProperty('--spring', smooth.ease);
      root.setProperty('--spring-d', smooth.ms + 'ms');
      root.setProperty('--bounce', bouncy.ease);
      root.setProperty('--bounce-d', bouncy.ms + 'ms');
    } catch (_) { /* Fallback-Kurven aus dem CSS bleiben aktiv */ }
  }

  // ═════════════════════════════════════════════════════════════
  //  Haptik (Android: vibrate, iOS-Safari: Schalter-Trick)
  // ═════════════════════════════════════════════════════════════
  const PATTERNS = { tap: 8, soft: 4, medium: 16, success: [12, 50, 22], error: [35, 60, 35, 60, 35] };
  function haptic(kind) {
    try {
      const p = PATTERNS[kind] || 8;
      if (navigator.vibrate) { navigator.vibrate(p); return; }
      if (kind !== 'soft') E.hapticLabel.click();
    } catch (_) { /* ohne Haptik weiter */ }
  }

  // ═════════════════════════════════════════════════════════════
  //  Daten
  // ═════════════════════════════════════════════════════════════
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
  const chanName = (c) => {
    const k = String(c || '').trim();
    if (!k || k.toLowerCase() === 'auto') return '';
    return CHANNELS[k.toLowerCase()] || k;
  };

  function prepareItems() {
    const raw = typeof videos !== 'undefined' && Array.isArray(videos) ? videos : [];
    items = raw
      .map((v) => {
        const m = String(v.id || '').match(/(\d+)$/);
        return {
          id: String(v.id),
          n: m ? +m[1] : 0,
          title: v.title || 'Ohne Titel',
          desc: v.description && v.description !== v.title ? v.description : '',
          chan: chanName(v.channel),
          url: safeUrl(v.url),
          thumb: v.thumbnail || FALLBACK,
          key: norm(`${v.title} ${v.description} ${v.channel}`),
          el: null,
        };
      })
      .filter((it) => it.url)
      .sort((a, b) => b.n - a.n); // neueste zuerst
    items.forEach((it) => byId.set(it.id, it));
  }

  function loadFavs() {
    try {
      const a = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
    } catch (_) { return new Set(); }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...S.favs])); } catch (_) { /* nur diese Sitzung */ }
  }

  // ═════════════════════════════════════════════════════════════
  //  Sperrbildschirm
  // ═════════════════════════════════════════════════════════════
  let entry = '';
  let lockBusy = false;
  const dotEls = [...E.dots.children];

  function updateDots() {
    dotEls.forEach((d, i) => d.classList.toggle('on', i < entry.length));
    E.keyDel.classList.toggle('show', entry.length > 0);
  }

  function pressDigit(d) {
    if (lockBusy || entry.length >= PW.length) return;
    entry += d;
    updateDots();
    haptic('soft');
    if (entry.length === PW.length) setTimeout(checkEntry, 130);
  }
  function pressDelete() {
    if (lockBusy || !entry) return;
    entry = entry.slice(0, -1);
    updateDots();
    haptic('soft');
  }

  function checkEntry() {
    if (entry === PW) return unlock();
    lockBusy = true;
    haptic('error');
    E.lock.classList.add('bad');
    E.lockSub.textContent = 'Falscher Code';
    if (!reduced()) {
      E.dots.classList.remove('shake');
      void E.dots.offsetWidth;
      E.dots.classList.add('shake');
    }
    setTimeout(() => {
      entry = '';
      updateDots();
      E.dots.classList.remove('shake');
      E.lock.classList.remove('bad');
      E.lockSub.textContent = 'Code eingeben';
      lockBusy = false;
    }, 620);
  }

  function unlock() {
    lockBusy = true;
    E.lock.classList.add('open');
    E.lockSub.textContent = 'Entsperrt';
    haptic('success');
    setTimeout(() => {
      if (!S.built) build();
      E.app.hidden = false;
      E.app.inert = false;
      S.introDelay = reduced() ? 0 : 320;
      apply({ reveal: true });
      document.body.classList.remove('is-locked');
      E.lock.classList.add('leaving');
      requestAnimationFrame(() => requestAnimationFrame(() => E.app.classList.add('on')));
      onScroll();
      setTimeout(() => {
        E.lock.hidden = true;
        E.app.classList.add('settled');
        S.locked = false;
        lockBusy = false;
      }, reduced() ? 250 : 800);
    }, reduced() ? 60 : 340);
  }

  function relock() {
    if (S.locked) return;
    closePeek(true);
    closeLucky(true);
    exitSearch();
    S.locked = true;
    lockBusy = true;
    entry = '';
    updateDots();
    E.lockSub.textContent = 'Code eingeben';
    E.lock.classList.remove('open', 'bad');
    E.lock.hidden = false;
    void E.lock.offsetWidth;
    document.body.classList.add('is-locked');
    E.lock.classList.remove('leaving');
    E.app.inert = true;
    haptic('tap');
    setTimeout(() => {
      E.app.classList.remove('on', 'settled');
      lockBusy = false;
    }, 560);
  }

  function initLock() {
    E.keypad.addEventListener('pointerdown', (e) => {
      const key = e.target.closest('.key');
      if (!key) return;
      key.classList.add('down');
      if (key === E.keyDel) pressDelete(); else if (key.dataset.k) pressDigit(key.dataset.k);
    });
    const up = (e) => {
      const key = e.target.closest && e.target.closest('.key');
      if (key) key.classList.remove('down');
    };
    E.keypad.addEventListener('pointerup', up);
    E.keypad.addEventListener('pointercancel', up);
    E.keypad.addEventListener('pointerleave', () => E.keypad.querySelectorAll('.down').forEach((k) => k.classList.remove('down')));
    // Tastatur-Bedienung am Button (Enter/Leertaste liefert click mit detail 0)
    E.keypad.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      const key = e.target.closest('.key');
      if (!key) return;
      if (key === E.keyDel) pressDelete(); else if (key.dataset.k) pressDigit(key.dataset.k);
    });
    E.keypad.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (!S.locked || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { pressDigit(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { pressDelete(); e.preventDefault(); }
    });
    E.lockBtn.addEventListener('click', relock);
  }

  // ═════════════════════════════════════════════════════════════
  //  Raster aufbauen
  // ═════════════════════════════════════════════════════════════
  function cardHTML(it) {
    const fav = S.favs.has(it.id);
    return `<article class="card pre" data-id="${esc(it.id)}">
  <a class="card-link" href="${esc(it.url)}" target="_blank" rel="noopener" draggable="false" aria-label="${esc(it.title)} (öffnet in neuem Tab)">
    <div class="card-face">
      <img class="card-img" src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async" draggable="false">
      <div class="card-glare"></div>
      <div class="card-meta">${it.chan ? `<span class="chan">${esc(it.chan)}</span>` : ''}<h3 class="ttl">${esc(it.title)}</h3></div>
    </div>
  </a>
  <button type="button" class="fav${fav ? ' on' : ''}" aria-pressed="${fav}" aria-label="${fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}"><span class="fav-dot"><svg class="ic ic-off"><use href="#i-heart"/></svg><svg class="ic ic-on"><use href="#i-heart-fill"/></svg></span></button>
</article>`;
  }

  function build() {
    E.grid.addEventListener('load', (e) => { if (e.target.classList && e.target.classList.contains('card-img')) e.target.classList.add('loaded'); }, true);
    E.grid.addEventListener('error', (e) => {
      const img = e.target;
      if (!img.classList || !img.classList.contains('card-img')) return;
      if (img.dataset.fb) { img.classList.add('loaded'); return; }
      img.dataset.fb = '1';
      img.classList.add('fallback');
      img.src = FALLBACK;
    }, true);

    E.grid.innerHTML = items.map(cardHTML).join('');
    [...E.grid.children].forEach((el, i) => { items[i].el = el; });
    E.grid.querySelectorAll('.card-img').forEach((img) => { if (img.complete && img.naturalWidth) img.classList.add('loaded'); });
    S.built = true;
  }

  // Reveal: Karten erscheinen gestaffelt, sobald sie ins Bild kommen
  const io = new IntersectionObserver((entries) => {
    const vis = entries.filter((e) => e.isIntersecting && e.target.classList.contains('pre')).map((e) => e.target);
    if (!vis.length) return;
    vis.sort((a, b) => {
      const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    const base = S.introDelay;
    S.introDelay = 0;
    vis.forEach((el, i) => {
      io.unobserve(el);
      el.classList.remove('pre');
      const delay = base + Math.min(i, 9) * 42;
      if (reduced()) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay, fill: 'backwards' });
      } else {
        el.animate(
          [{ opacity: 0, transform: 'translateY(24px) scale(.95)' }, { opacity: 1, transform: 'none' }],
          { duration: SP.ms, delay, easing: SP.ease, fill: 'backwards' }
        );
      }
    });
  }, { rootMargin: '0px 0px 40px 0px' });

  function markPre(el) {
    el.classList.add('pre');
    io.unobserve(el);
    io.observe(el);
  }

  function swapText(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    if (!reduced() && !S.locked) {
      el.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: SP.ease });
    }
  }

  // Filter + Sortierung anwenden
  function apply({ reveal = false } = {}) {
    if (!S.built) return;
    const terms = norm(S.q).split(/\s+/).filter(Boolean);
    const list = [];
    for (const it of items) {
      const show = (S.tab === 'all' || S.favs.has(it.id)) && terms.every((t) => it.key.includes(t));
      if (show) {
        list.push(it);
        if (it.el.hidden) { it.el.hidden = false; markPre(it.el); } else if (reveal) markPre(it.el);
      } else if (!it.el.hidden) {
        it.el.hidden = true;
      }
    }
    S.list = list;

    // Mosaik: jede fünfte Kachel breit (gilt nur auf dem Handy, siehe CSS)
    const n = list.length;
    list.forEach((it, i) => {
      const wide = i % 5 === 0 || (i === n - 1 && (i % 5 === 1 || i % 5 === 3));
      it.el.classList.toggle('wide', wide);
    });

    renderHead();
  }

  function renderHead() {
    const n = S.list.length;
    const q = S.q.trim();
    const title = q ? 'Suche' : S.tab === 'fav' ? 'Favoriten' : 'Sammlung';
    let sub;
    if (q) sub = `${n} ${n === 1 ? 'Treffer' : 'Treffer'}${S.tab === 'fav' ? ' in Favoriten' : ''} für „${q}“`;
    else if (S.tab === 'fav') sub = n ? `${n} ${n === 1 ? 'Favorit' : 'Favoriten'}` : 'Noch nichts markiert';
    else sub = `${n} ${n === 1 ? 'Video' : 'Videos'}`;

    swapText(E.largeTitle, title);
    E.navTitle.textContent = title;
    swapText(E.subtitle, sub);

    const empty = n === 0;
    E.empty.hidden = !empty;
    if (empty) {
      let icon = 'search'; let t = 'Keine Treffer'; let msg = '';
      if (q) msg = `Zu „${q}“ passt nichts${S.tab === 'fav' ? ' in deinen Favoriten' : ''}. Prüfe die Schreibweise.`;
      else if (S.tab === 'fav') { icon = 'heart-break'; t = 'Noch keine Favoriten'; msg = 'Tippe auf das Herz einer Kachel oder halte sie gedrückt.'; }
      else { icon = 'film'; t = 'Noch keine Videos'; msg = 'Füge Links in links.txt ein und starte add_links.py.'; }
      E.emptyIcon.firstElementChild.setAttribute('href', `#i-${icon}`);
      E.emptyTitle.textContent = t;
      E.emptyText.textContent = msg;
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  Kopfzeile: großer Titel klappt beim Scrollen ein
  // ═════════════════════════════════════════════════════════════
  let scrollTick = false;
  function onScroll() {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(updateNav);
  }
  function updateNav() {
    scrollTick = false;
    const y = window.scrollY;
    const lh = E.large.offsetHeight || 90;
    const t = clamp(y / (lh * 0.8), 0, 1);
    const over = y < 0 ? Math.min(-y / 320, 0.16) : 0;
    E.largeIn.style.opacity = String(1 - t);
    E.largeIn.style.transform = over
      ? `scale(${1 + over})`
      : `translateY(${(-t * 8).toFixed(2)}px) scale(${(1 - t * 0.05).toFixed(4)})`;
    E.navTitle.style.opacity = String(clamp((t - 0.55) / 0.45, 0, 1));
    E.navBg.style.opacity = String(clamp((y - (lh - 50)) / 36, 0, 1));
  }

  // ═════════════════════════════════════════════════════════════
  //  Toast
  // ═════════════════════════════════════════════════════════════
  let toastTimer = 0;
  function toast(text) {
    E.toastText.textContent = text;
    E.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => E.toast.classList.remove('show'), 1900);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (__) { return false; }
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  Favoriten
  // ═════════════════════════════════════════════════════════════
  function syncFav(id) {
    const it = byId.get(id);
    if (!it || !it.el) return;
    const on = S.favs.has(id);
    const btn = it.el.querySelector('.fav');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
  }

  function burst(btn) {
    if (reduced()) return;
    btn.classList.remove('pop');
    void btn.offsetWidth;
    btn.classList.add('pop');
    const dot = btn.querySelector('.fav-dot');
    const count = 8;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      dot.appendChild(s);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = 21 + Math.random() * 10;
      const anim = s.animate(
        [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(0)`, opacity: 0 }],
        { duration: 480, easing: 'cubic-bezier(.23, 1, .32, 1)' }
      );
      anim.onfinish = () => s.remove();
    }
  }

  function toggleFav(id) {
    const it = byId.get(id);
    if (!it) return;
    const on = !S.favs.has(id);
    if (on) S.favs.add(id); else S.favs.delete(id);
    saveFavs();
    syncFav(id);
    haptic(on ? 'medium' : 'tap');
    if (on) burst(it.el.querySelector('.fav'));

    if (!on && S.tab === 'fav') {
      // Kachel verschwindet aus der Favoriten-Ansicht: erst ausblenden, dann neu filtern
      const done = () => { apply(); };
      if (reduced()) return done();
      const a = it.el.animate(
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }],
        { duration: 200, easing: 'ease-out', fill: 'forwards' }
      );
      a.onfinish = () => { done(); a.cancel(); };
    } else if (S.tab === 'fav') {
      apply();
    }
    return on;
  }

  // ═════════════════════════════════════════════════════════════
  //  Karten-Interaktion: Druck, Neigung, langes Drücken
  // ═════════════════════════════════════════════════════════════
  let press = null;
  let suppressUntil = 0;
  let hovered = null;

  const faceOf = (card) => card.querySelector('.card-face');
  function setGlare(card, x, y, r) {
    card.style.setProperty('--gx', ((x / r.width) * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', ((y / r.height) * 100).toFixed(1) + '%');
  }
  const setScale = (card, v) => faceOf(card).style.setProperty('--s', v);
  const clearFace = (card) => {
    const f = faceOf(card);
    f.style.removeProperty('--s'); f.style.removeProperty('--rx'); f.style.removeProperty('--ry');
  };

  function endPress() {
    if (!press) return;
    const { card } = press;
    clearTimeout(press.arm);
    clearTimeout(press.timer);
    card.classList.remove('pressing', 'arming', 'lit');
    if (hovered === card) setScale(card, '1.035'); else clearFace(card);
    if (press.fired) suppressUntil = Date.now() + 500;
    press = null;
  }

  function resetTilt(card) {
    card.classList.remove('tilting', 'lit');
    clearFace(card);
  }

  function hoverTilt(e) {
    if (reduced() || peekState) return;
    const card = e.target.closest ? e.target.closest('.card') : null;
    if (card !== hovered) {
      if (hovered && hovered !== (press && press.card)) resetTilt(hovered);
      hovered = card;
    }
    if (!card || (press && press.card === card)) return;
    const r = card.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add('tilting', 'lit');
    const f = faceOf(card);
    f.style.setProperty('--ry', (nx * 12).toFixed(2) + 'deg');
    f.style.setProperty('--rx', (-ny * 12).toFixed(2) + 'deg');
    f.style.setProperty('--s', '1.035');
    setGlare(card, e.clientX - r.left, e.clientY - r.top, r);
  }

  function initGrid() {
    const grid = E.grid;

    grid.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const card = e.target.closest('.card');
      if (!card || e.target.closest('.fav')) return;
      endPress();
      const r = card.getBoundingClientRect();
      setGlare(card, e.clientX - r.left, e.clientY - r.top, r);
      card.classList.remove('tilting');
      card.classList.add('pressing', 'lit');
      setScale(card, '.97');
      press = { card, x: e.clientX, y: e.clientY, fired: false, arm: 0, timer: 0 };
      if (e.pointerType !== 'mouse') {
        press.arm = setTimeout(() => { card.classList.add('arming'); setScale(card, '.935'); }, 180);
        press.timer = setTimeout(() => {
          if (!press) return;
          press.fired = true;
          const c = press.card;
          c.classList.remove('arming', 'pressing', 'lit');
          clearFace(c);
          openPeek(c);
          haptic('medium');
        }, 440);
      }
    });

    grid.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { hoverTilt(e); return; }
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) endPress();
    });
    grid.addEventListener('pointerup', endPress);
    grid.addEventListener('pointercancel', endPress);
    grid.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (hovered) { resetTilt(hovered); hovered = null; }
    });
    window.addEventListener('blur', endPress);

    grid.addEventListener('click', (e) => {
      if (Date.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); return; }
      const fav = e.target.closest('.fav');
      if (fav) { e.preventDefault(); toggleFav(fav.closest('.card').dataset.id); }
    }, true);

    grid.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      if (peekState) return;
      endPress();
      openPeek(card);
      haptic('medium');
    });
    grid.addEventListener('dragstart', (e) => e.preventDefault());
  }

  // ═════════════════════════════════════════════════════════════
  //  Kontextmenü (langes Drücken / Rechtsklick)
  // ═════════════════════════════════════════════════════════════
  let peekState = null;
  let peekTimer = 0;
  const safe = { t: 0, b: 0 };
  function measureSafe() {
    const cs = getComputedStyle(E.safeProbe);
    safe.t = parseFloat(cs.paddingTop) || 0;
    safe.b = parseFloat(cs.paddingBottom) || 0;
  }

  function paintPeekFav() {
    const on = peekState && S.favs.has(peekState.it.id);
    E.peekFavLabel.textContent = on ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
    E.peekFav.classList.toggle('on', !!on);
    E.peekFav.querySelector('use').setAttribute('href', on ? '#i-heart-fill' : '#i-heart');
  }

  function openPeek(card) {
    if (peekState || !card) return;
    const it = byId.get(card.dataset.id);
    if (!it) return;
    measureSafe();
    clearTimeout(peekTimer);
    peekState = { card, it, opener: document.activeElement };

    const rect = card.getBoundingClientRect();
    E.peekTitle.textContent = it.title;
    E.peekDesc.textContent = it.desc;
    E.peekOpen.href = it.url;
    E.peekShare.hidden = !navigator.share;
    paintPeekFav();

    const pc = E.peekCard.style;
    pc.transition = 'none';
    pc.transform = 'none';
    pc.left = rect.left + 'px'; pc.top = rect.top + 'px';
    pc.width = rect.width + 'px'; pc.height = rect.height + 'px';
    E.peekCard.innerHTML = faceOf(card).outerHTML;
    card.classList.add('lifted');

    E.peek.hidden = false;
    document.body.classList.add('no-scroll');

    // Menü messen, dann platzieren
    E.peekMenu.style.visibility = 'hidden';
    const vw = window.innerWidth; const vh = window.innerHeight;
    const menuW = E.peekMenu.offsetWidth; const menuH = E.peekMenu.offsetHeight;
    const gap = 12; const mT = safe.t + 12; const mB = safe.b + 12;
    const s = Math.min(1.06, (vw - 24) / rect.width);
    const w2 = rect.width * s; const h2 = rect.height * s;
    const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
    const top2 = cy - h2 / 2; const left2 = cx - w2 / 2;
    let dy = 0;
    if (top2 + h2 + gap + menuH > vh - mB) dy = vh - mB - (top2 + h2 + gap + menuH);
    if (top2 + dy < mT) dy = mT - top2;
    const dx = clamp(left2, 12, vw - w2 - 12) - left2;

    const cardLeft = left2 + dx; const cardRight = cardLeft + w2;
    let menuLeft;
    if (rect.width > vw * 0.7) menuLeft = (vw - menuW) / 2;
    else if (cx > vw / 2) menuLeft = cardRight - menuW;
    else menuLeft = cardLeft;
    menuLeft = clamp(menuLeft, 12, vw - menuW - 12);
    const menuTop = top2 + dy + h2 + gap;

    E.peekMenu.style.left = menuLeft + 'px';
    E.peekMenu.style.top = menuTop + 'px';
    E.peekMenu.style.transformOrigin = `${menuLeft + menuW / 2 < vw / 2 ? 'left' : 'right'} top`;
    E.peekMenu.style.visibility = '';

    void E.peekCard.offsetWidth;
    E.peekCard.style.transition = '';
    requestAnimationFrame(() => {
      E.peek.classList.add('open');
      E.peekCard.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
      E.peekOpen.focus({ preventScroll: true });
    });
  }

  function closePeek(instant) {
    if (!peekState) return;
    const { card, opener } = peekState;
    peekState = null;
    E.peek.classList.remove('open');
    E.peekCard.style.transform = 'none';
    const finish = () => {
      E.peek.hidden = true;
      E.peekCard.innerHTML = '';
      E.peekCard.style.cssText = '';
      card.classList.remove('lifted');
      document.body.classList.remove('no-scroll');
    };
    clearTimeout(peekTimer);
    if (instant || reduced()) finish(); else peekTimer = setTimeout(finish, 320);
    try { if (opener && opener.focus && !S.locked) opener.focus({ preventScroll: true }); } catch (_) { /* egal */ }
  }

  function initPeek() {
    E.peekScrim.addEventListener('click', () => closePeek());
    E.peek.addEventListener('contextmenu', (e) => e.preventDefault());
    E.peekOpen.addEventListener('click', () => setTimeout(() => closePeek(), 60));
    E.peekFav.addEventListener('click', () => {
      if (!peekState) return;
      const id = peekState.it.id;
      closePeek();
      toggleFav(id);
    });
    E.peekCopy.addEventListener('click', async () => {
      if (!peekState) return;
      const url = peekState.it.url;
      closePeek();
      const ok = await copyText(url);
      haptic('tap');
      toast(ok ? 'Link kopiert' : 'Kopieren nicht möglich');
    });
    E.peekShare.addEventListener('click', async () => {
      if (!peekState) return;
      const { it } = peekState;
      closePeek();
      try { await navigator.share({ title: it.title, url: it.url }); } catch (_) { /* abgebrochen */ }
    });
    window.addEventListener('resize', () => closePeek(true));
  }

  // ═════════════════════════════════════════════════════════════
  //  Zufall
  // ═════════════════════════════════════════════════════════════
  let luckyTimers = [];
  let luckyCurrent = null;
  let luckyLast = null;
  let luckyIsOpen = false;

  const luckyClear = () => { luckyTimers.forEach(clearTimeout); luckyTimers = []; };

  function luckyShow(it) {
    luckyCurrent = it;
    E.luckyImg.src = it.thumb;
    E.luckyChan.textContent = it.chan || ' ';
    E.luckyTitle.textContent = it.title;
    E.luckyOpen.href = it.url;
  }

  function luckyRoll() {
    luckyClear();
    const pool = S.list.length ? S.list : items;
    if (!pool.length) return;
    let target = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) while (target === luckyLast) target = pool[Math.floor(Math.random() * pool.length)];
    luckyLast = target;

    E.lucky.classList.remove('landed');
    const land = () => {
      luckyShow(target);
      E.lucky.classList.remove('spinning');
      void E.lucky.offsetWidth;
      E.lucky.classList.add('landed');
      haptic('success');
    };

    if (reduced() || pool.length < 2) { land(); return; }

    E.lucky.classList.add('spinning');
    const steps = Math.min(15, pool.length + 8);
    const seq = [];
    for (let i = 0; i < steps - 1; i++) {
      let p = pool[Math.floor(Math.random() * pool.length)];
      if (p === seq[i - 1] || p === target) p = pool[(pool.indexOf(p) + 1) % pool.length];
      seq.push(p);
    }
    seq.push(target);
    seq.forEach((it) => { const im = new Image(); im.src = it.thumb; });

    let t = 0;
    seq.forEach((it, i) => {
      const last = i === seq.length - 1;
      luckyTimers.push(setTimeout(() => {
        if (last) { land(); return; }
        luckyShow(it);
        haptic('soft');
      }, t));
      const p = i / (seq.length - 1);
      t += 46 + Math.pow(p, 2.3) * 300;
    });
  }

  function openLucky() {
    const pool = S.list.length ? S.list : items;
    if (!pool.length) { toast('Nichts zum Auswürfeln'); return; }
    if (luckyIsOpen) return;
    luckyIsOpen = true;
    haptic('tap');
    E.lucky.hidden = false;
    E.luckySheet.style.transform = '';
    E.lucky.style.removeProperty('--scrim');
    document.body.classList.add('no-scroll');
    luckyRoll();
    requestAnimationFrame(() => requestAnimationFrame(() => E.lucky.classList.add('open')));
    E.luckyClose.focus({ preventScroll: true });
  }

  function closeLucky(instant) {
    if (!luckyIsOpen) return;
    luckyIsOpen = false;
    luckyClear();
    E.lucky.classList.remove('open', 'spinning');
    E.luckySheet.style.transform = '';
    E.lucky.style.removeProperty('--scrim');
    const done = () => { E.lucky.hidden = true; E.lucky.classList.remove('landed'); document.body.classList.remove('no-scroll'); if (!S.locked) E.luckyBtn.focus({ preventScroll: true }); };
    if (instant || reduced()) done(); else setTimeout(() => { if (!luckyIsOpen) done(); }, 460);
  }

  function initLucky() {
    E.luckyImg.addEventListener('error', () => { if (!E.luckyImg.dataset.fb) { E.luckyImg.dataset.fb = '1'; E.luckyImg.src = FALLBACK; } });
    E.luckyImg.addEventListener('load', () => { delete E.luckyImg.dataset.fb; });
    E.luckyBtn.addEventListener('click', openLucky);
    E.luckyAgain.addEventListener('click', () => { haptic('tap'); luckyRoll(); });
    E.luckyClose.addEventListener('click', () => closeLucky());
    E.luckyScrim.addEventListener('click', () => closeLucky());
    E.luckyOpen.addEventListener('click', (e) => {
      if (E.lucky.classList.contains('spinning')) { e.preventDefault(); return; }
      setTimeout(() => closeLucky(), 80);
    });

    // Bottom-Sheet: 1:1 mit dem Finger, Gummiband nach oben, Impuls entscheidet
    const sheet = E.luckySheet;
    let drag = null;
    const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));
    E.luckyGrab.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { y0: e.clientY, dy: 0, last: e.clientY, t: e.timeStamp, v: 0 };
      E.luckyGrab.setPointerCapture(e.pointerId);
      sheet.classList.add('dragging');
    });
    E.luckyGrab.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.dy = e.clientY - drag.y0;
      const dt = e.timeStamp - drag.t;
      if (dt > 0) drag.v = ((e.clientY - drag.last) / dt) * 1000;
      drag.last = e.clientY; drag.t = e.timeStamp;
      const y = drag.dy > 0 ? drag.dy : -rubber(-drag.dy, 240);
      sheet.style.transform = `translateY(${y}px)`;
      E.lucky.style.setProperty('--scrim', String(clamp(1 - drag.dy / (sheet.offsetHeight * 1.2), 0, 1)));
    });
    const release = () => {
      if (!drag) return;
      const { dy, v } = drag;
      drag = null;
      sheet.classList.remove('dragging');
      const projected = dy + ((v / 1000) * 0.998) / (1 - 0.998); // Apples Momentum-Projektion
      if (projected > sheet.offsetHeight * 0.5) closeLucky();
      else { sheet.style.transform = ''; E.lucky.style.removeProperty('--scrim'); }
    };
    E.luckyGrab.addEventListener('pointerup', release);
    E.luckyGrab.addEventListener('pointercancel', release);
  }

  // ═════════════════════════════════════════════════════════════
  //  Dock: Tabs + Suche
  // ═════════════════════════════════════════════════════════════
  function setTab(tab) {
    if (tab === S.tab) { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return; }
    haptic('tap');
    S.scroll[S.tab] = window.scrollY;
    S.tab = tab;
    E.tabs.style.setProperty('--i', tab === 'fav' ? '1' : '0');
    E.tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    apply({ reveal: true });
    window.scrollTo(0, S.scroll[tab] || 0);
    onScroll();
  }

  let applyRaf = 0;
  function scheduleApply() {
    cancelAnimationFrame(applyRaf);
    applyRaf = requestAnimationFrame(() => {
      apply();
      window.scrollTo(0, 0);
      onScroll();
    });
  }

  function openSearch() {
    E.dock.classList.add('searching');
    E.q.focus({ preventScroll: true });
    haptic('tap');
  }
  function exitSearch() {
    if (!E.dock.classList.contains('searching') && !S.q) return;
    E.q.value = '';
    E.q.blur();
    E.clearBtn.hidden = true;
    E.dock.classList.remove('searching', 'kb');
    E.dock.style.setProperty('--kb', '0px');
    if (S.q) { S.q = ''; apply(); onScroll(); }
  }

  function initDock() {
    E.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (b) setTab(b.dataset.tab);
    });
    E.searchBtn.addEventListener('click', openSearch);
    E.closeSearch.addEventListener('click', () => { haptic('tap'); exitSearch(); });
    E.clearBtn.addEventListener('click', () => {
      E.q.value = '';
      E.clearBtn.hidden = true;
      S.q = '';
      scheduleApply();
      E.q.focus({ preventScroll: true });
    });
    E.q.addEventListener('input', () => {
      S.q = E.q.value;
      E.clearBtn.hidden = !E.q.value;
      scheduleApply();
    });
    E.dockSearch.addEventListener('submit', (e) => { e.preventDefault(); E.q.blur(); });

    // Dock über die Bildschirmtastatur heben (iOS lässt fixe Elemente darunter)
    const vv = window.visualViewport;
    const kbSync = () => {
      let kb = 0;
      if (vv && E.dock.classList.contains('searching') && document.activeElement === E.q) {
        kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      }
      E.dock.style.setProperty('--kb', kb + 'px');
      E.dock.classList.toggle('kb', kb > 40);
    };
    if (vv) { vv.addEventListener('resize', kbSync); vv.addEventListener('scroll', kbSync); }
    E.q.addEventListener('focus', kbSync);
    E.q.addEventListener('blur', () => setTimeout(kbSync, 60));
  }

  // ═════════════════════════════════════════════════════════════
  //  Start
  // ═════════════════════════════════════════════════════════════
  function init() {
    prepareItems();
    initSprings();
    measureSafe();
    initLock();
    initGrid();
    initPeek();
    initLucky();
    initDock();

    E.navTitle.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { measureSafe(); onScroll(); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (peekState) closePeek();
      else if (luckyIsOpen) closeLucky();
      else if (E.dock.classList.contains('searching')) exitSearch();
    });
    updateDots();
  }

  init();
})();
