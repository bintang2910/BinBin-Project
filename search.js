/* ───────────────────────────────────────────────
   Search & Categories Flow
   ─────────────────────────────────────────────── */

// API constant comes from api-config.js (loaded before this script)
let currentCategory = 'all';
let currentSearch = '';
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Read URL query parameters to pre-fill search and category tags
    const params = new URLSearchParams(window.location.search);
    const catParam = params.get('category');
    if (catParam) {
        currentCategory = catParam;
    }

    const qParam = params.get('q');
    if (qParam) {
        currentSearch = qParam;
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = qParam;
    }

    // 2. Initialize filter chips
    initChips();
    
    // 3. Initialize search input feature
    initSearchInput();

    // 4. Fetch the data right away
    fetchLobbies();
});

function initChips() {
    const chips = document.querySelectorAll('.chip');
    if (!chips.length) return;

    function applyActiveChip() {
        chips.forEach(chip => {
            chip.classList.remove('chip--active');
            if (chip.dataset.category === currentCategory) {
                chip.classList.add('chip--active');
                
                // Update title dynamically based on category
                let title = 'All Lobbies';
                if (currentCategory === 'ride') title = '🚗 Ride Sharing';
                if (currentCategory === 'food') title = '🍔 Food Order';
                if (currentCategory === 'subs') title = '🎬 Digital Subs';
                if (currentCategory === 'event') title = '🎉 Event / Bebas';
                
                const titleEl = document.getElementById('results-title');
                if (titleEl) titleEl.textContent = title;
            }
        });
    }

    // Initial setup
    applyActiveChip();

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            currentCategory = chip.dataset.category;
            applyActiveChip();

            // Update URL without reloading the page
            const newUrl = new URL(window.location);
            if (currentCategory === 'all') {
                newUrl.searchParams.delete('category');
            } else {
                newUrl.searchParams.set('category', currentCategory);
            }
            window.history.pushState({}, '', newUrl);
            
            // Re-fetch data for the new category
            fetchLobbies();
        });
    });
}

function initSearchInput() {
    const input = document.getElementById('search-input');
    if (!input) return;

    input.addEventListener('input', (e) => {
        // Clear previous timeout to debounce the fetch API call (wait until user stops typing)
        clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(() => {
            currentSearch = e.target.value.trim();
            
            // Update URL without reloading
            const newUrl = new URL(window.location);
            if (currentSearch) {
                newUrl.searchParams.set('q', currentSearch);
            } else {
                newUrl.searchParams.delete('q');
            }
            window.history.pushState({}, '', newUrl);
            
            // Fetch lobbies with the new query
            fetchLobbies();
        }, 400); // Wait 400ms after last keystroke
    });
}

/* ═══════════════════════════════════════════════════
   Load Real-time Lobbies based on Query & Category
   ═══════════════════════════════════════════════════ */

async function fetchLobbies() {
    const container = document.getElementById('search-results');
    if (!container) return;

    container.innerHTML = `
      <div id="search-loading" style="padding:40px; text-align:center; color:var(--gray-400); font-size:14px; width:100%;">
        Loading lobbies... <span class="auth-spinner" style="display:inline-block; border-color:var(--gray-400); border-top-color:transparent; margin-left:8px;"></span>
      </div>`;

    try {
        const queryParams = new URLSearchParams({ status: 'open' });
        
        if (currentCategory && currentCategory !== 'all') {
             queryParams.append('category', currentCategory);
        }
        if (currentSearch) {
             queryParams.append('q', currentSearch);
        }

        const res = await fetch(`${API}/api/lobbies?${queryParams.toString()}`, { credentials: 'include' });
        const json = await res.json();
        
        if (!res.ok) {
           throw new Error(json.error || 'Failed to fetch data');
        }

        const lobbies = json.data || [];

        container.innerHTML = ''; // Clear loading screen

        if (lobbies.length === 0) {
            container.innerHTML = `
            <div style="padding:60px 20px; text-align:center; color:var(--gray-400); font-size:14px; width:100%; border-radius:12px; background:#f9fafb;">
              <p style="font-size:36px; margin-bottom:12px;">🔍</p>
              <p style="font-weight:500; color:var(--gray-600);">No lobbies found</p>
              <p style="margin-top:4px; font-size:13px;">Try adjusting your search keywords or category filters.</p>
            </div>`;
            return;
        }

        lobbies.forEach(lobby => {
            container.appendChild(createLobbyCard(lobby));
        });

        // Small animation for progress bars
        setTimeout(() => {
            container.querySelectorAll('.progress-fill').forEach(fill => {
                fill.style.setProperty('--progress', fill.dataset.progress + '%');
            });
        }, 100);

    } catch (err) {
        console.error('Fetch Lobbies Error:', err);
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#dc2626; font-size:14px;">Error connecting to server. Please refresh.</div>`;
    }
}

/* ═══════════════════════════════════════════════════
   Helpers (Re-used from Home page)
   ═══════════════════════════════════════════════════ */

function createLobbyCard(lobby) {
  const card = document.createElement('article');
  card.className = 'lobby-card';
  card.id = `lobby-${lobby.id}`;
  card.style.cursor = 'pointer';

  const badges = {
    ride: { icon: '🚗', label: 'Ride', css: 'ride' },
    food: { icon: '🍔', label: 'Food', css: 'food' },
    subs: { icon: '🎬', label: 'Digital', css: 'digital' },
    event: { icon: '🎉', label: 'Event', css: 'event' },
  };
  const badge = badges[lobby.category] || badges.ride;

  const detailPages = {
    ride: 'ride-detail',
    food: 'food-detail',
    subs: 'subs-detail',
    event: 'event-detail',
  };
  const detailHref = `${detailPages[lobby.category] || 'ride-detail'}?id=${lobby.id}`;

  const progress = Math.round((lobby.currentSlots / lobby.maxSlots) * 100);
  const dynamicPrice = Math.ceil(lobby.totalPrice / lobby.currentSlots);
  const price = formatRupiah(dynamicPrice);
  const suffix = lobby.category === 'subs' ? '/mo' : '';

  let metaText = '';
  const meta = lobby.metadata;
  if (lobby.category === 'ride' && meta?.pickupLocation) {
    metaText = `${meta.pickupLocation} → ${meta.dropoffLocation || '...'}`;
  } else if (lobby.category === 'food' && meta?.restaurantName) {
    metaText = meta.restaurantName;
  } else if (lobby.category === 'subs' && meta?.serviceName) {
    metaText = `${meta.serviceName} · ${meta.duration || ''}`;
  } else if (lobby.category === 'event' && meta?.eventName) {
    metaText = `${meta.location || 'TBD'} · ${meta.eventDate || ''}`;
  }

  // Distribution badge for food
  let distBadgeHtml = '';
  if (lobby.category === 'food' && lobby.distributionMethod) {
    distBadgeHtml = lobby.distributionMethod === 'pickup'
      ? '<span class="dist-badge dist-badge--pickup">📍 Pickup</span>'
      : '<span class="dist-badge dist-badge--delivery">🚚 Delivery</span>';
  }

  card.innerHTML = `
    <div class="lobby-card__badge lobby-card__badge--${badge.css}">${badge.icon} ${badge.label}</div>
    ${distBadgeHtml}
    <h3 class="lobby-card__title">${lobby.title}</h3>
    <p class="lobby-card__meta">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:relative; top:2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${metaText || lobby.title}
    </p>
    <div class="lobby-card__capacity">
      <div class="capacity-info">
        <span class="capacity-label">Capacity</span>
        <span class="capacity-value">${lobby.currentSlots} / ${lobby.maxSlots} Joined</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="--progress:0%;" data-progress="${progress}"></div>
      </div>
    </div>
    <div class="lobby-card__price">
      <span class="price-label">Per person</span>
      <span class="price-value">${price}${suffix}</span>
    </div>
    <a href="${detailHref}" class="btn-join" style="display:block; text-align:center;">Join & Pay Admin Fee</a>
  `;

  // Make entire card clickable
  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-join')) return; // Let btn-join handle itself
    window.location.href = detailHref;
  });

  return card;
}

function formatRupiah(num) {
  if (!num && num !== 0) return 'Rp 0';
  return 'Rp ' + num.toLocaleString('id-ID');
}
