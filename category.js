/* ───────────────────────────────────────────────
   Category Focused View
   ─────────────────────────────────────────────── */

// API constant comes from api-config.js (loaded before this script)
let currentCategory = 'ride';

document.addEventListener('DOMContentLoaded', () => {
    // Robust URL parsing (npx serve strips .html and may lose query params)
    const params = new URLSearchParams(window.location.search);
    let catParam = params.get('type');
    if (!catParam) {
        const m = window.location.href.match(/[?&]type=([a-z]+)/i);
        if (m) catParam = m[1];
    }
    
    if (catParam) {
        currentCategory = catParam;
    }

    /* Set title */
    let title = 'All Lobbies';
    if (currentCategory === 'ride') title = '🚗 Ride Sharing';
    if (currentCategory === 'food') title = '🍔 Food Order';
    if (currentCategory === 'subs') title = '🎬 Digital Subs';
    if (currentCategory === 'event') title = '🎉 Event / Bebas';
    
    document.getElementById('category-title').textContent = title;

    // 2. Fetch the data right away
    fetchLobbies();
});

/* ═══════════════════════════════════════════════════
   Load Real-time Lobbies based on specific Category
   ═══════════════════════════════════════════════════ */

async function fetchLobbies() {
    const container = document.getElementById('category-results');
    if (!container) return;

    try {
        const queryParams = new URLSearchParams({ status: 'open' });
        queryParams.append('category', currentCategory);

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
              <p style="font-size:36px; margin-bottom:12px;">🫗</p>
              <p style="font-weight:500; color:var(--gray-600);">No active lobbies</p>
              <p style="margin-top:4px; font-size:13px;">There are no open lobbies for this category right now.</p>
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
  const price = formatRupiah(lobby.pricePerPerson);
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

  card.innerHTML = `
    <div class="lobby-card__badge lobby-card__badge--${badge.css}">${badge.icon} ${badge.label}</div>
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
      <span class="price-label">Your share</span>
      <span class="price-value">${price}${suffix}</span>
    </div>
    <a href="${detailHref}" class="btn-join" style="display:block; text-align:center;">Join & Pay Admin Fee</a>
  `;
  return card;
}

function formatRupiah(num) {
  if (!num && num !== 0) return 'Rp 0';
  return 'Rp ' + num.toLocaleString('id-ID');
}
