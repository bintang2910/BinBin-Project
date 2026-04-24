/* ───────────────────────────────────────────────
   BinBin — Dashboard (Live Database) v3
   ─────────────────────────────────────────────── */

// API constant comes from api-config.js (loaded before this script)

document.addEventListener('DOMContentLoaded', () => {

  checkAuth();
  loadCategoryCounts();

  /* ─── Explore button smooth scroll ─── */
  const exploreBtn = document.getElementById('btn-explore');
  if (exploreBtn) {
    exploreBtn.addEventListener('click', () => {
      const target = document.getElementById('categories');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ─── Notification bell click ─── */
  const notifBtn = document.getElementById('btn-notifications');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      const dot = notifBtn.querySelector('.notif-dot');
      if (dot) dot.style.display = dot.style.display === 'none' ? '' : 'none';
    });
  }

});

/* ═══════════════════════════════════════════════════
   Load Category Counts
   ═══════════════════════════════════════════════════ */

async function loadCategoryCounts() {
  try {
    const [rideRes, foodRes, subsRes, eventRes] = await Promise.all([
      fetch(`${API}/api/lobbies?category=ride&status=open`).then(r => r.json()),
      fetch(`${API}/api/lobbies?category=food&status=open`).then(r => r.json()),
      fetch(`${API}/api/lobbies?category=subs&status=open`).then(r => r.json()),
      fetch(`${API}/api/lobbies?category=event&status=open`).then(r => r.json()),
    ]);

    const rideCount = rideRes.data?.length ?? 0;
    const foodCount = foodRes.data?.length ?? 0;
    const subsCount = subsRes.data?.length ?? 0;
    const eventCount = eventRes.data?.length ?? 0;

    const rideEl = document.querySelector('#cat-ride .category-count');
    const foodEl = document.querySelector('#cat-food .category-count');
    const subsEl = document.querySelector('#cat-digital .category-count');
    const eventEl = document.getElementById('count-event');

    if (rideEl) rideEl.textContent = `${rideCount} active`;
    if (foodEl) foodEl.textContent = `${foodCount} active`;
    if (subsEl) subsEl.textContent = `${subsCount} active`;
    if (eventEl) eventEl.textContent = `${eventCount} active`;
  } catch {
    // Silently fail — keep defaults
  }
}

/* ═══════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════ */

function formatRupiah(num) {
  if (!num && num !== 0) return 'Rp 0';
  return 'Rp ' + num.toLocaleString('id-ID');
}

/* ═══════════════════════════════════════════════════
   Global Toast Notification
   ═══════════════════════════════════════════════════ */

function showToast(msg, type = 'info') {
  let ct = document.getElementById('toast-container');
  if (!ct) {
    ct = document.createElement('div');
    ct.className = 'toast-container';
    ct.id = 'toast-container';
    document.body.appendChild(ct);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  ct.appendChild(t);
  setTimeout(() => { t.classList.add('toast-exit'); setTimeout(() => t.remove(), 300); }, 4000);
}

/* ═══════════════════════════════════════════════════
   Auth Guard (Pengecek Status Login)
   ═══════════════════════════════════════════════════ */

async function checkAuth() {
  try {
    // Tanya ke backend, apakah browser ini punya sesi (tiket) login yang sah?
    const res = await fetch(`${API}/api/auth/get-session`, {
      credentials: 'include'
    });

    // Kalau responnya error (misal 401 Unauthorized) atau datanya kosong
    if (!res.ok) {
      window.location.href = 'login.html';
      return;
    }

    const data = await res.json();

    // Kalau data sesinya tidak ada, tendang kembali ke login
    if (!data.session) {
      window.location.href = 'login.html';
    }

    // Kalau sampai di baris ini, berarti aman & sudah login!
    console.log("Welcome,", data.user.name);

  } catch (err) {
    // Kalau server mati atau error jaringan, lempar ke login juga
    console.error('Auth error:', err);
    window.location.href = 'login.html';
  }
}
