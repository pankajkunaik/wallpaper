/* ════════════════════════════════════════════
   WALLPAPER HAVEN — App Logic
   Powered by Pexels API
   ════════════════════════════════════════════ */

'use strict';

/* ─── CONSTANTS ─── */
const PEXELS_BASE   = 'https://api.pexels.com/v1';
const PER_PAGE      = 30;
const HERO_INTERVAL = 6000; // ms between hero image changes
const DEBOUNCE_MS   = 450;

/* ─── STATE ─── */
const state = {
  apiKey:       '',
  page:         1,
  query:        '',
  orientation:  'all',      // 'all' | 'landscape' | 'portrait'
  category:     'curated',  // pill value
  isLoading:    false,
  hasMore:      true,
  total:        0,
  photos:       [],         // currently displayed photos
  favorites:    [],         // saved photo objects
  viewFavorites: false,
  currentPhoto: null,       // open in modal
};

/* ─── PEXELS API ─── */
async function pexelsFetch(endpoint) {
  const res = await fetch(`${PEXELS_BASE}${endpoint}`, {
    headers: { Authorization: state.apiKey },
  });
  if (!res.ok) throw new Error(`Pexels API error: ${res.status}`);
  return res.json();
}

async function fetchPhotos(reset = false) {
  if (state.isLoading) return;
  if (!state.hasMore && !reset) return;

  if (reset) {
    state.page   = 1;
    state.photos = [];
    state.hasMore = true;
    clearGrid();
    showSkeletons(true);
  } else {
    showLoadMoreSpinner(true);
  }

  state.isLoading = true;

  try {
    let data;
    const orientParam = state.orientation !== 'all'
      ? `&orientation=${state.orientation}`
      : '';

    if (state.category === 'curated' && !state.query) {
      data = await pexelsFetch(`/curated?per_page=${PER_PAGE}&page=${state.page}`);
    } else {
      const q = state.query || state.category;
      data = await pexelsFetch(
        `/search?query=${encodeURIComponent(q)}&per_page=${PER_PAGE}&page=${state.page}${orientParam}`
      );
    }

    const photos = data.photos || [];
    state.total   = data.total_results ?? state.total;
    state.hasMore = !!data.next_page;
    state.page++;

    state.photos.push(...photos);
    renderCards(photos, reset);
    updateResultsBar();

    if (photos.length === 0 && state.photos.length === 0) showEmpty(true);

  } catch (err) {
    console.error(err);
    showToast('Failed to load wallpapers. Check your API key.', 'error');
    if (reset) showSkeletons(false);
  } finally {
    state.isLoading = false;
    showSkeletons(false);
    showLoadMoreSpinner(false);
  }
}

/* ─── GRID RENDERING ─── */
function clearGrid() {
  el('masonry-grid').innerHTML = '';
  showEmpty(false);
}

function renderCards(photos, animate = false) {
  const grid = el('masonry-grid');
  photos.forEach((photo, i) => {
    const card = buildCard(photo, animate ? i : -1);
    grid.appendChild(card);
  });
}

function buildCard(photo, animIndex = -1) {
  const isPortrait  = photo.height > photo.width;
  const isFaved     = isFavorite(photo.id);
  const badgeLabel  = isPortrait ? 'MOBILE' : 'DESKTOP';
  const badgeClass  = isPortrait ? 'badge-mobile' : 'badge-desktop';

  const card = document.createElement('div');
  card.className = 'wallpaper-card';
  card.dataset.id = photo.id;
  if (animIndex >= 0) {
    card.style.animationDelay = `${Math.min(animIndex * 0.04, 0.4)}s`;
  }

  // Aspect ratio trick: use portrait height naturally, cap landscape
  const img = document.createElement('img');
  img.src     = photo.src.large;
  img.alt     = photo.alt || `Wallpaper by ${photo.photographer}`;
  img.loading = 'lazy';
  img.style.aspectRatio = `${photo.width} / ${photo.height}`;

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';
  overlay.innerHTML = `
    <div class="card-actions">
      <button class="card-btn fav-toggle-btn ${isFaved ? 'faved' : ''}" data-id="${photo.id}" title="${isFaved ? 'Remove from favorites' : 'Add to favorites'}" aria-label="Favorite">
        <svg width="15" height="15" fill="${isFaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>
      <button class="card-btn quick-dl-btn" data-url="${photo.src.original}" data-name="wallpaper-${photo.id}" title="Quick download" aria-label="Download">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </div>
    <div class="card-meta">
      <span class="card-photographer">${photo.photographer}</span>
      <span class="card-resolution">${photo.width}×${photo.height}</span>
    </div>
  `;

  const badge = document.createElement('span');
  badge.className = `card-badge ${badgeClass}`;
  badge.textContent = badgeLabel;

  card.appendChild(img);
  card.appendChild(overlay);
  card.appendChild(badge);

  // Open modal on card click (not button)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-btn')) return;
    openModal(photo);
  });

  // Fav toggle
  card.querySelector('.fav-toggle-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(photo);
    const btn = e.currentTarget;
    const nowFaved = isFavorite(photo.id);
    btn.classList.toggle('faved', nowFaved);
    btn.title = nowFaved ? 'Remove from favorites' : 'Add to favorites';
    btn.querySelector('svg').setAttribute('fill', nowFaved ? 'currentColor' : 'none');
  });

  // Quick download
  card.querySelector('.quick-dl-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    downloadPhoto(photo.src.original, `wallpaper-${photo.id}`);
  });

  return card;
}

/* ─── HERO BACKGROUND SLIDESHOW ─── */
let heroSlideIndex = 0;
let heroPhotos     = [];

async function initHeroSlideshow() {
  try {
    const data = await pexelsFetch('/curated?per_page=9&page=1');
    heroPhotos = (data.photos || []).filter(p => p.width > p.height).slice(0, 5);
    if (heroPhotos.length === 0) return;

    // Pre-load first images
    heroPhotos.forEach((photo, i) => {
      const slide = el(`hero-slide-${i}`);
      if (slide) slide.style.backgroundImage = `url(${photo.src.large2x || photo.src.large})`;
    });

    // Activate first
    el('hero-slide-0')?.classList.add('active');

    setInterval(advanceHeroSlide, HERO_INTERVAL);
  } catch (e) {
    // silently fail, hero just shows gradient
  }
}

function advanceHeroSlide() {
  const slides = document.querySelectorAll('.hero-bg-slide');
  if (slides.length === 0) return;
  slides[heroSlideIndex % slides.length]?.classList.remove('active');
  heroSlideIndex = (heroSlideIndex + 1) % Math.min(slides.length, heroPhotos.length);
  slides[heroSlideIndex]?.classList.add('active');
}

/* ─── MODAL ─── */
function openModal(photo) {
  state.currentPhoto = photo;
  const modal = el('wallpaper-modal');

  el('modal-img').src = photo.src.large2x || photo.src.large;
  el('modal-img').alt = photo.alt || `Photo by ${photo.photographer}`;

  el('photographer-name').textContent = photo.photographer;
  el('photographer-link').href        = photo.photographer_url;
  el('photographer-avatar').textContent = photo.photographer.charAt(0).toUpperCase();

  el('meta-resolution').textContent   = `${photo.width} × ${photo.height}`;
  el('meta-orientation').textContent  = photo.width > photo.height ? '🖥️ Landscape' : '📱 Portrait';
  el('meta-id').textContent           = `#${photo.id}`;
  el('modal-alt').textContent         = photo.alt || '';
  el('pexels-link').href              = photo.url;

  // Color palette from avg_color
  renderColorPalette(photo.avg_color);

  // Download buttons
  renderDownloadButtons(photo);

  // Fav state
  updateModalFavBtn(photo.id);

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Keyboard close
  document.addEventListener('keydown', handleModalKey);
}

function closeModal() {
  el('wallpaper-modal').classList.add('hidden');
  document.body.style.overflow = '';
  state.currentPhoto = null;
  document.removeEventListener('keydown', handleModalKey);
}

function handleModalKey(e) {
  if (e.key === 'Escape') closeModal();
}

function renderColorPalette(avgColor) {
  const palette = el('color-palette');
  palette.innerHTML = '';
  if (!avgColor) return;

  // Generate a mini palette from the average color
  const shades = [
    avgColor,
    adjustColor(avgColor, 40),
    adjustColor(avgColor, -40),
    adjustColor(avgColor, 80),
    adjustColor(avgColor, -80),
  ];

  shades.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = c;
    swatch.title = c;
    swatch.addEventListener('click', () => {
      navigator.clipboard.writeText(c).then(() => showToast(`Copied ${c}`, 'info'));
    });
    palette.appendChild(swatch);
  });
}

function adjustColor(hex, amount) {
  try {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}

function renderDownloadButtons(photo) {
  const grid = el('download-grid');
  const sizes = [
    { label: 'Original',  key: 'original',  badge: `${photo.width}×${photo.height}` },
    { label: 'Large 2x',  key: 'large2x',   badge: '~5K' },
    { label: 'Large',     key: 'large',      badge: '~1920px' },
    { label: 'Medium',    key: 'medium',     badge: '~1280px' },
    { label: 'Small',     key: 'small',      badge: '~640px' },
  ];

  grid.innerHTML = '';
  sizes.forEach(({ label, key, badge }) => {
    const url = photo.src[key];
    if (!url) return;

    const btn = document.createElement('button');
    btn.className = 'download-btn';
    btn.innerHTML = `
      <span>${label}</span>
      <span class="download-btn-badge">${badge}</span>
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;
    btn.addEventListener('click', () => downloadPhoto(url, `wallpaper-${photo.id}-${key}`));
    grid.appendChild(btn);
  });
}

function updateModalFavBtn(photoId) {
  const btn = el('modal-fav-btn');
  const faved = isFavorite(photoId);
  btn.classList.toggle('active', faved);
  btn.title = faved ? 'Remove from favorites' : 'Add to favorites';
  btn.querySelector('svg').setAttribute('fill', faved ? 'currentColor' : 'none');
}

/* ─── DOWNLOAD ─── */
function downloadPhoto(url, filename) {
  showToast('Starting download…', 'info');
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `${filename}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      showToast('Download started! ✓', 'success');
    })
    .catch(() => {
      // Fallback: open in new tab
      window.open(url, '_blank');
      showToast('Opened in new tab', 'info');
    });
}

/* ─── FAVORITES ─── */
function loadFavorites() {
  try {
    state.favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
  } catch { state.favorites = []; }
  updateFavCount();
}

function saveFavorites() {
  localStorage.setItem('wh_favorites', JSON.stringify(state.favorites));
  updateFavCount();
}

function isFavorite(id) {
  return state.favorites.some(p => p.id === id);
}

function toggleFavorite(photo) {
  if (isFavorite(photo.id)) {
    state.favorites = state.favorites.filter(p => p.id !== photo.id);
    showToast('Removed from favorites', 'info');
  } else {
    state.favorites.unshift(photo);
    showToast('Added to favorites ♥', 'success');
  }
  saveFavorites();

  // Sync modal fav btn if open
  if (state.currentPhoto?.id === photo.id) {
    updateModalFavBtn(photo.id);
  }

  // If in favorites view, refresh
  if (state.viewFavorites) renderFavoritesView();
}

function updateFavCount() {
  const count = state.favorites.length;
  el('fav-count').textContent = count;
  el('fav-count').style.display = count > 0 ? 'flex' : 'none';
}

function renderFavoritesView() {
  clearGrid();
  state.viewFavorites = true;
  document.getElementById('results-label').textContent = '♥ My Favorites';
  el('results-count').textContent = `${state.favorites.length} saved`;
  document.querySelector('.gallery-container').classList.add('favorites-mode');

  if (state.favorites.length === 0) {
    showEmpty(true);
    el('empty-state').querySelector('.empty-icon').textContent = '💔';
    el('empty-state').querySelector('h3').textContent = 'No favorites yet';
    el('empty-state').querySelector('p').textContent = 'Click the heart icon on any wallpaper to save it here';
    return;
  }

  renderCards(state.favorites, true);
}

function exitFavoritesView() {
  state.viewFavorites = false;
  document.querySelector('.gallery-container').classList.remove('favorites-mode');
  fetchPhotos(true);
}

/* ─── SEARCH ─── */
let searchDebounceTimer = null;

function handleSearch(query) {
  query = query.trim();
  if (query === state.query && !state.viewFavorites) return;

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    state.query = query;
    state.viewFavorites = false;
    document.querySelector('.gallery-container').classList.remove('favorites-mode');

    if (query) {
      state.category = '';
      deactivateAllCatPills();
      el('results-label').textContent = `"${query}"`;
      el('nav-search-clear').classList.remove('hidden');
    } else {
      state.category = 'curated';
      activateCatPill('curated');
      el('nav-search-clear').classList.add('hidden');
    }

    fetchPhotos(true);
    scrollToGallery();
  }, DEBOUNCE_MS);
}

function scrollToGallery() {
  el('filter-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── FILTER & CATEGORY ─── */
function setOrientation(device) {
  state.orientation = device;
  // If currently in favorites view, apply filter there
  if (state.viewFavorites) {
    renderFavoritesView();
    return;
  }
  fetchPhotos(true);
}

function setCategory(cat) {
  state.query    = '';
  state.category = cat;
  state.viewFavorites = false;
  document.querySelector('.gallery-container').classList.remove('favorites-mode');

  // Clear search inputs
  el('hero-search-input').value = '';
  el('nav-search-input').value  = '';
  el('nav-search-clear').classList.add('hidden');

  fetchPhotos(true);
  scrollToGallery();
}

/* ─── RESULTS BAR ─── */
function updateResultsBar() {
  if (state.viewFavorites) return;

  const q = state.query;
  if (q) {
    el('results-label').textContent = `Results for "${q}"`;
    el('results-count').textContent = state.total > 0 ? `${state.total.toLocaleString()} found` : '';
  } else {
    const activePill = document.querySelector('.cat-pill.active');
    el('results-label').textContent = activePill ? activePill.textContent.trim() : 'Wallpapers';
    el('results-count').textContent = state.total > 0 ? `${state.total.toLocaleString()} photos` : '';
  }
}

/* ─── TOAST NOTIFICATIONS ─── */
const TOAST_ICONS = { success: '✓', error: '✕', info: '✦' };

function showToast(message, type = 'info', duration = 3000) {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || '✦'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ─── SKELETON & EMPTY STATES ─── */
function showSkeletons(show) {
  el('skeleton-grid').style.display = show ? '' : 'none';
}

function showEmpty(show) {
  el('empty-state').classList.toggle('hidden', !show);
}

function showLoadMoreSpinner(show) {
  el('load-more-spinner').classList.toggle('hidden', !show);
}

/* ─── INFINITE SCROLL ─── */
function setupIntersectionObserver() {
  const sentinel = el('load-more-sentinel');
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !state.isLoading && state.hasMore && !state.viewFavorites) {
        fetchPhotos(false);
      }
    },
    { rootMargin: '300px' }
  );
  observer.observe(sentinel);
}

/* ─── CAT PILLS HELPERS ─── */
function deactivateAllCatPills() {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
}

function activateCatPill(cat) {
  deactivateAllCatPills();
  const target = document.querySelector(`.cat-pill[data-cat="${cat}"]`);
  if (target) target.classList.add('active');
}

/* ─── API KEY MANAGEMENT ─── */
function loadApiKey() {
  return localStorage.getItem('pexels_api_key') || '';
}

function saveApiKey(key) {
  localStorage.setItem('pexels_api_key', key);
  state.apiKey = key;
}

async function validateApiKey(key) {
  try {
    const res = await fetch(`${PEXELS_BASE}/curated?per_page=1`, {
      headers: { Authorization: key },
    });
    return res.ok;
  } catch { return false; }
}

/* ─── HEADER SCROLL EFFECT ─── */
function setupScrollEffects() {
  const header   = el('site-header');
  const backTop  = el('back-to-top');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;

    // Header shadow
    header.classList.toggle('scrolled', scrollY > 50);

    // Back to top
    backTop.classList.toggle('hidden', scrollY < 400);

    lastScroll = scrollY;
  }, { passive: true });

  backTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ─── UTILITY ─── */
function el(id) { return document.getElementById(id); }

/* ════════════════════════════════════════════
   BOOT — Initialize everything
   ════════════════════════════════════════════ */
async function boot() {
  const savedKey = loadApiKey();

  if (savedKey) {
    // Skip modal, go straight to app
    state.apiKey = savedKey;
    startApp();
  } else {
    // Show API key modal
    el('api-key-modal').classList.remove('hidden');
    el('api-key-input').focus();
  }
}

async function startApp() {
  loadFavorites();

  // Show app
  el('api-key-modal').classList.add('hidden');
  el('app').classList.remove('hidden');

  // Init UI
  setupScrollEffects();
  setupIntersectionObserver();
  bindEvents();

  // Start loading content
  showSkeletons(true);
  await Promise.all([
    initHeroSlideshow(),
    fetchPhotos(true),
  ]);
}

/* ─── EVENT BINDING ─── */
function bindEvents() {

  /* ── API KEY MODAL ── */
  el('api-key-submit').addEventListener('click', async () => {
    const key  = el('api-key-input').value.trim();
    const errEl = el('api-key-error');
    if (!key) { errEl.classList.remove('hidden'); return; }

    el('api-key-submit').textContent = 'Validating…';
    el('api-key-submit').disabled    = true;

    const valid = await validateApiKey(key);
    if (valid) {
      saveApiKey(key);
      errEl.classList.add('hidden');
      startApp();
    } else {
      errEl.classList.remove('hidden');
      el('api-key-submit').innerHTML = '<span>Launch App</span><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      el('api-key-submit').disabled  = false;
    }
  });

  el('api-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('api-key-submit').click();
  });

  /* ── SETTINGS (change key) ── */
  el('settings-btn').addEventListener('click', () => {
    el('app').classList.add('hidden');
    el('api-key-modal').classList.remove('hidden');
    el('api-key-input').value = state.apiKey;
    el('api-key-input').focus();
  });

  /* ── HERO SEARCH ── */
  el('hero-search-btn').addEventListener('click', () => {
    const q = el('hero-search-input').value;
    el('nav-search-input').value = q;
    handleSearch(q);
  });

  el('hero-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('hero-search-btn').click();
  });

  el('hero-search-input').addEventListener('input', (e) => {
    // Sync nav search
    el('nav-search-input').value = e.target.value;
  });

  /* ── HERO TAGS ── */
  document.querySelectorAll('.hero-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const q = tag.dataset.q;
      el('hero-search-input').value = q;
      el('nav-search-input').value  = q;
      handleSearch(q);
    });
  });

  /* ── NAV SEARCH ── */
  el('nav-search-input').addEventListener('input', (e) => {
    const val = e.target.value;
    el('hero-search-input').value = val;
    handleSearch(val);
  });

  el('nav-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch(e.target.value);
  });

  el('nav-search-clear').addEventListener('click', () => {
    el('nav-search-input').value  = '';
    el('hero-search-input').value = '';
    el('nav-search-clear').classList.add('hidden');
    handleSearch('');
  });

  /* ── DEVICE TABS ── */
  document.querySelectorAll('.device-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.device-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setOrientation(tab.dataset.device);
    });
  });

  /* ── CATEGORY PILLS ── */
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activateCatPill(pill.dataset.cat);
      setCategory(pill.dataset.cat);
    });
  });

  /* ── FAVORITES VIEW ── */
  el('favorites-view-btn').addEventListener('click', () => {
    if (state.viewFavorites) {
      exitFavoritesView();
    } else {
      renderFavoritesView();
    }
  });

  el('fav-btn').addEventListener('click', () => {
    if (state.viewFavorites) {
      exitFavoritesView();
    } else {
      renderFavoritesView();
      scrollToGallery();
    }
  });

  /* ── LOGO HOME ── */
  el('logo-home').addEventListener('click', (e) => {
    e.preventDefault();
    state.query    = '';
    state.category = 'curated';
    state.viewFavorites = false;
    document.querySelector('.gallery-container').classList.remove('favorites-mode');
    el('nav-search-input').value  = '';
    el('hero-search-input').value = '';
    el('nav-search-clear').classList.add('hidden');
    activateCatPill('curated');
    document.querySelectorAll('.device-tab').forEach(t => t.classList.remove('active'));
    el('tab-all').classList.add('active');
    state.orientation = 'all';
    fetchPhotos(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── MODAL ── */
  el('modal-close').addEventListener('click', closeModal);
  el('modal-backdrop').addEventListener('click', closeModal);

  el('modal-fav-btn').addEventListener('click', () => {
    if (!state.currentPhoto) return;
    toggleFavorite(state.currentPhoto);
    updateModalFavBtn(state.currentPhoto.id);
    // Also update card in grid
    const card = document.querySelector(`.wallpaper-card[data-id="${state.currentPhoto.id}"]`);
    if (card) {
      const btn = card.querySelector('.fav-toggle-btn');
      if (btn) {
        const faved = isFavorite(state.currentPhoto.id);
        btn.classList.toggle('faved', faved);
        btn.querySelector('svg').setAttribute('fill', faved ? 'currentColor' : 'none');
      }
    }
  });

  /* ── COPY LINK ── */
  el('copy-link-btn').addEventListener('click', () => {
    if (!state.currentPhoto) return;
    const url = state.currentPhoto.url;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Link copied to clipboard!', 'success'))
      .catch(() => showToast('Could not copy link', 'error'));
  });

  /* ── EMPTY RESET ── */
  el('empty-reset-btn').addEventListener('click', () => {
    state.query    = '';
    state.category = 'curated';
    state.viewFavorites = false;
    document.querySelector('.gallery-container').classList.remove('favorites-mode');
    el('nav-search-input').value  = '';
    el('hero-search-input').value = '';
    activateCatPill('curated');
    fetchPhotos(true);
  });

  /* ── KEYBOARD SHORTCUTS ── */
  document.addEventListener('keydown', (e) => {
    // Press '/' to focus search
    if (e.key === '/' && !e.target.matches('input, textarea')) {
      e.preventDefault();
      el('nav-search-input').focus();
    }
  });
}

/* ─── KICK OFF ─── */
document.addEventListener('DOMContentLoaded', boot);
