document.addEventListener('DOMContentLoaded', () => {
  fetchNotifications();

  document.getElementById('btn-read-all')?.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API}/api/notifications/read-all`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (e) {
      console.error(e);
    }
  });
});

async function fetchNotifications() {
  const container = document.getElementById('notif-list');
  if (!container) return;

  try {
    const res = await fetch(`${API}/api/notifications`, { credentials: 'include' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch');

    const notifs = json.data || [];
    container.innerHTML = '';

    if (notifs.length === 0) {
      container.innerHTML = `
        <div style="padding:60px 20px; text-align:center;">
          <div style="font-size:40px; margin-bottom:12px;">📭</div>
          <h3 style="font-size:16px; color:var(--gray-900); margin-bottom:4px;">No notifications yet</h3>
          <p style="font-size:13px; color:var(--gray-500);">When you get updates about your lobbies, they'll appear here.</p>
        </div>
      `;
      return;
    }

    notifs.forEach(notif => {
      // Choose icon based on type
      let iconSvg = '';
      if (notif.type === 'lobby_join') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;
      } else if (notif.type === 'lobby_status') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      }

      // Format date
      const date = new Date(notif.createdAt);
      const now = new Date();
      let timeStr = '';
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffMins < 1) timeStr = 'Just now';
      else if (diffMins < 60) timeStr = `${diffMins}m ago`;
      else if (diffHrs < 24) timeStr = `${diffHrs}h ago`;
      else if (diffDays < 7) timeStr = `${diffDays}d ago`;
      else timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const card = document.createElement('a');
      card.className = `notif-card ${notif.isRead ? '' : 'unread'}`;
      card.href = notif.link ? notif.link : '#';
      
      card.innerHTML = `
        <div class="notif-icon">${iconSvg}</div>
        <div class="notif-content">
          <div class="notif-title">${notif.title}</div>
          <div class="notif-msg">${notif.message}</div>
          <div class="notif-time">${timeStr}</div>
        </div>
      `;

      card.addEventListener('click', async (e) => {
        if (!notif.isRead) {
          e.preventDefault(); // wait for read API
          try {
            await fetch(`${API}/api/notifications/${notif.id}/read`, {
              method: 'POST',
              credentials: 'include'
            });
            if (card.href && card.href !== window.location.href + '#') {
              window.location.href = card.href;
            } else {
              card.classList.remove('unread');
            }
          } catch(err) {
            console.error(err);
            if (card.href && card.href !== window.location.href + '#') window.location.href = card.href;
          }
        }
      });

      container.appendChild(card);
    });

  } catch(e) {
    console.error(e);
    container.innerHTML = `<div style="padding:40px; text-align:center; color:#dc2626;">Error loading notifications</div>`;
  }
}
