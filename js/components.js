/**
 * ServiCell Component Loader
 * Builds nav dynamically based on logged-in user role.
 * No external nav.html fetch needed.
 */

// ── Role helpers (global so other scripts can use them) ───────────────────────
function getLoggedInUser() {
    return localStorage.getItem('scUser') || sessionStorage.getItem('scUser') || '';
}

function deriveRole(username) {
    const u = (username || '').toLowerCase();
    if (u.startsWith('manager')) return 'manager';
    if (u.startsWith('cashier')) return 'cashier';
    if (u.startsWith('technician')) return 'technician';
    return 'technician';
}

/** Prefer server role from login; fall back to username prefix */
function getEffectiveRole(username) {
    const u = username || getLoggedInUser();
    const stored = (localStorage.getItem('scRole') || sessionStorage.getItem('scRole') || '').toLowerCase().trim();
    if (['manager', 'cashier', 'technician'].includes(stored)) return stored;
    return deriveRole(u);
}

/** Alias used across pages — DB role first, username prefix fallback */
function getUserRole() {
    return getEffectiveRole();
}
window.getUserRole = getUserRole;

const SC_PREF_KEYS = [
    'scTheme', 'scCompact', 'scHaptics', 'scNotif', 'scNotifSound',
    'scNotifSoundType', 'scAutoPrintReceipt', 'appVersion'
];

function escH(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
}


// ── Nav link definitions ──────────────────────────────────────────────────────
const NAV_LINKS = [
    { label: 'Dashboard',      icon: 'home',     href: 'index.html',          roles: ['technician', 'cashier', 'manager'] },
    { label: 'Current Jobs',   icon: 'wrench',   href: 'current-jobs.html',   roles: ['technician', 'cashier', 'manager'] },
    { label: 'New Job',        icon: 'plus',     href: 'new-job.html',         roles: ['technician', 'cashier', 'manager'] },
    { label: 'Special Orders', icon: 'cart',     href: 'special-orders.html', roles: ['technician', 'cashier', 'manager'] },
    { label: 'Inventory',      icon: 'package',  href: 'inventory.html',       roles: ['technician', 'cashier', 'manager'] },
    { label: 'Sales',          icon: 'dollar',   href: 'sales.html',          roles: ['cashier', 'manager'] },
    { label: 'Statistics',     icon: 'chart',    href: 'statistics.html',       roles: ['manager'] },
    { label: 'Settings',       icon: 'settings', href: 'settings.html',        roles: ['technician', 'cashier', 'manager'] },
];

// ── Auth helpers (global) ─────────────────────────────────────────────────────
function logOut() {
    const prefs = {};
    SC_PREF_KEYS.forEach(k => {
        const v = localStorage.getItem(k);
        if (v !== null) prefs[k] = v;
    });
    localStorage.clear();
    sessionStorage.clear();
    Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    window.location.href = 'index.html';
}

function toggleAccountMenu(e) {
    e.stopPropagation();
    // Close other panels first
    document.getElementById('notifPanel')?.classList.remove('open');
    document.getElementById('mobilePanel')?.classList.remove('open');
    document.getElementById('hamburger')?.classList.remove('active');
    document.getElementById('accountDropdown')?.classList.toggle('open');
}

// ── Component Loader ──────────────────────────────────────────────────────────
const ComponentLoader = {
    config: {
        footerPath: 'components/footer.html',
        minSplashTime: 3000,
    },

    state: {
        loadStartTime: Date.now(),
        splashHidden: false
    },

    async init() {
        this.state.loadStartTime = Date.now();
        this.createSplash();

        await Promise.all([
            this.loadNav(),
            this.loadFooter()
        ]);

        const elapsed = Date.now() - this.state.loadStartTime;
        const remaining = Math.max(0, this.config.minSplashTime - elapsed);
        setTimeout(() => this.hideSplash(), remaining);
    },

    createSplash() {
        // Don't create a second splash if one already exists
        if (document.getElementById('splash-screen')) return;
        const splash = document.createElement('div');
        splash.id = 'splash-screen';
        splash.className = 'splash-screen';
        splash.innerHTML = `
          <div class="splash-loader">
            <div class="rotating-grid">
              <div class="box"></div>
              <div class="box"></div>
              <div class="box"></div>
              <div class="box"></div>
            </div>
          </div>
          <div class="splash-loading-text">ServiCell Belize - Staff Portal</div>`;
        document.body.prepend(splash);
    },

    hideSplash() {
        const splash = document.getElementById('splash-screen');
        if (!splash || this.state.splashHidden) return;
        splash.classList.add('exiting');
        this.state.splashHidden = true;
        setTimeout(() => {
            splash.classList.add('hidden');
            document.body.classList.add('page-ready');
        }, 600);
    },

    async loadNav() {
        const placeholder = document.getElementById('nav-placeholder');
        if (!placeholder) return;

        const username = getLoggedInUser();
        const role = getEffectiveRole(username);
        const current = window.location.pathname.split('/').pop() || 'index.html';
        const visible = NAV_LINKS.filter(l => l.roles.includes(role));

        const linksHTML = visible.map(l => {
            const active = current === l.href ? 'active' : '';
            return `<a href="${l.href}" class="nav-btn ${active}">${l.label}</a>`;
        }).join('');

        const ROLE_ICONS = { manager: 'crown', cashier: 'cash', technician: 'wrench' };
        const roleIconName = ROLE_ICONS[role] || 'wrench';
        const roleIconSvg = typeof scIcon === 'function' ? scIcon(roleIconName, 16) : '';

        const accountHTML = username ? `
  <div class="nav-account" id="navAccount">
    <button class="account-chip" onclick="toggleAccountMenu(event)" aria-label="Account menu">
      <span class="account-avatar" title="${role}">${roleIconSvg}</span>
      <span class="account-name">${username}</span>
      <span class="account-caret">${typeof scIcon === 'function' ? scIcon('chevronDown', 10) : ''}</span>
    </button>
    <div class="account-dropdown" id="accountDropdown">
      <div class="dropdown-header">
        <span class="dropdown-username">${username}</span>
        <span class="dropdown-role-badge">${roleIconSvg} ${role}</span>
      </div>
      <div class="dropdown-divider"></div>
      <a href="settings.html" class="dropdown-item">${typeof scIcon === 'function' ? scIcon('settings', 15) : ''} Settings</a>
      <button class="dropdown-item danger" onclick="logOut()">${typeof scIcon === 'function' ? scIcon('logout', 15) : ''} Log out</button>
    </div>
  </div>` : '';

        placeholder.innerHTML = `
          <nav id="mainNav">
            <div class="nav-wrapper">
              <span class="logo-text">ServiCell</span>
              <div class="nav-links" id="navLinks">${linksHTML}</div>
              ${accountHTML}
              <div class="nav-right-group">
                <div class="nav-bell" id="navBell">
                  <button class="bell-btn" id="notif-bell-btn" onclick="toggleNotifPanel(event)" aria-label="Notifications">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <span class="notif-badge" id="notif-badge" style="display:none;">0</span>
                  </button>
                  <div class="notif-panel" id="notifPanel">
                    <div class="notif-panel-header">
                      <span class="notif-panel-title">Notifications</span>
                      <button class="notif-clear-btn" onclick="InAppNotif.clear();renderNotifPanel()">Clear all</button>
                    </div>
                    <div class="notif-list" id="notifList"></div>
                  </div>
                </div>
                <div class="hamburger" id="hamburger">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          </nav>
          <div class="mobile-menu-panel" id="mobilePanel">
            <div class="mobile-menu-links" id="mobileMenuLinks">
              ${visible.map(l => {
            const active = current === l.href ? 'active' : '';
            return `<a href="${l.href}" class="nav-btn mobile-nav-btn ${active}">
                <span class="mobile-nav-icon">${typeof scIcon === 'function' ? scIcon(l.icon, 22) : ''}</span>
                <span class="mobile-nav-label">${l.label}</span>
              </a>`;
        }).join('')}
            </div>
            ${username ? `
            <div class="mobile-menu-footer">
              <div class="mobile-user-info">
                <div class="mobile-avatar">${roleIconSvg}</div>
                <div class="mobile-user-text">
                  <span class="mobile-username">${username}</span>
                  <span class="mobile-role-badge">${role}</span>
                </div>
              </div>
              <button class="mobile-logout" onclick="logOut()">${typeof scIcon === 'function' ? scIcon('logout', 15) : ''} Log out</button>
            </div>` : ''}
          </div>`;

        this.attachNavListeners();
        if (typeof initDataIcons === 'function') initDataIcons(placeholder);

        if (username && typeof loadStaffBanner === 'function') {
            loadStaffBanner();
        }
    },

    async loadFooter() {
        try {
            const res = await fetch(this.config.footerPath);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            const placeholder = document.getElementById('footer-placeholder');
            if (placeholder) placeholder.innerHTML = html;
        } catch (e) {
            console.error('Failed to load footer:', e);
        }
    },

    attachNavListeners() {
        const hamburger = document.getElementById('hamburger');
        const mobilePanel = document.getElementById('mobilePanel');

        if (hamburger && mobilePanel) {
            hamburger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other panels
                document.getElementById('accountDropdown')?.classList.remove('open');
                document.getElementById('notifPanel')?.classList.remove('open');
                hamburger.classList.toggle('active');
                mobilePanel.classList.toggle('open');
            });

            document.addEventListener('click', (e) => {
                if (!hamburger.contains(e.target) && !mobilePanel.contains(e.target)) {
                    hamburger.classList.remove('active');
                    mobilePanel.classList.remove('open');
                }
            });

            mobilePanel.querySelectorAll('.nav-btn').forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('active');
                    mobilePanel.classList.remove('open');
                });
            });
        }

        // Close account dropdown on outside click
        document.addEventListener('click', (e) => {
            const acct = document.getElementById('navAccount');
            if (acct && !acct.contains(e.target)) {
                document.getElementById('accountDropdown')?.classList.remove('open');
            }
            // Close notif panel on outside click
            const bell = document.getElementById('navBell');
            if (bell && !bell.contains(e.target)) {
                document.getElementById('notifPanel')?.classList.remove('open');
            }
        });

        // Scroll shrink effect — throttled via rAF to avoid per-frame jank
        const nav = document.getElementById('mainNav');
        let _scrollTicking = false;
        window.addEventListener('scroll', () => {
            if (!_scrollTicking) {
                requestAnimationFrame(() => {
                    nav?.classList.toggle('scrolled', window.pageYOffset > 50);
                    _scrollTicking = false;
                });
                _scrollTicking = true;
            }
        }, { passive: true });

        // Dynamic grid columns based on item count
        const menuLinks = document.getElementById('mobileMenuLinks');
        if (menuLinks) {
            const count = menuLinks.children.length;
            menuLinks.style.gridTemplateColumns = count >= 8 ? 'repeat(4,1fr)' : 'repeat(2,1fr)';
        }
    },

    fallbackNav() {
        const placeholder = document.getElementById('nav-placeholder');
        if (!placeholder) return;
        placeholder.innerHTML = `
          <nav style="position:fixed;top:25px;left:50%;transform:translateX(-50%);background:white;padding:10px 20px;border-radius:100px;z-index:1000;">
            <div style="font-weight:800;color:#2563eb;">ServiCell Belize</div>
          </nav>`;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ComponentLoader.init());
} else {
    ComponentLoader.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof initDataIcons === 'function') initDataIcons();
    });
} else if (typeof initDataIcons === 'function') {
    initDataIcons();
}

window.ComponentLoader = ComponentLoader;

// ── Notification panel helpers ────────────────────────────────────────────────
function toggleNotifPanel(e) {
    e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const opening = !panel.classList.contains('open');
    // Close other panels
    document.getElementById('accountDropdown')?.classList.remove('open');
    document.getElementById('mobilePanel')?.classList.remove('open');
    document.getElementById('hamburger')?.classList.remove('active');
    panel.classList.toggle('open', opening);
    if (opening) {
        renderNotifPanel();
        InAppNotif.markAllRead();
    }
}

function renderNotifPanel() {
    const list = document.getElementById('notifList');
    if (!list) return;
    const notifs = InAppNotif.get();
    if (!notifs.length) {
        list.innerHTML = `<div class="notif-empty">
            ${typeof scIcon === 'function' ? scIcon('bell', 32) : ''}
            <p>No notifications yet</p>
        </div>`;
        return;
    }
    list.innerHTML = notifs.map((n, idx) => `
        <div class="notif-item ${n.read ? '' : 'unread'}">
            <div class="notif-icon">${InAppNotif.typeIcon(n.type)}</div>
            <div class="notif-content">
                <div class="notif-title">${escH(n.title)}</div>
                <div class="notif-body">${escH(n.body)}</div>
                <div class="notif-time">${InAppNotif.timeAgo(n.time)}</div>
            </div>
            <button class="notif-dismiss" onclick="InAppNotif.dismiss(${idx});renderNotifPanel();" title="Dismiss">${typeof scIcon === 'function' ? scIcon('x', 14) : '×'}</button>
        </div>`).join('');
}
window.toggleNotifPanel = toggleNotifPanel;
window.renderNotifPanel = renderNotifPanel;

// Init badge, purge old notifications, and sync from GAS on every page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
        InAppNotif.purgeOld();
        InAppNotif._updateBadge();
        InAppNotif.syncFromServer();
    }, 800));
} else {
    setTimeout(() => {
        InAppNotif.purgeOld();
        InAppNotif._updateBadge();
        InAppNotif.syncFromServer();
    }, 800);
}

// Poll every 30 seconds for new notifications — paused when tab is hidden
setInterval(() => {
    if (document.visibilityState !== 'hidden') InAppNotif.syncFromServer();
}, 30000);

// ── Revoke check — runs every 60s ────────────────────────────────────────────
async function checkRevoked() {
    const username = getLoggedInUser();
    if (!username || !navigator.onLine) return;
    // Skip on login page — check both pathname and hash
    const path = window.location.pathname + window.location.href;
    if (path.includes('index.html') && !localStorage.getItem('isLoggedIn') && !sessionStorage.getItem('isLoggedIn')) return;
    try {
        const data = await apiGet({ action: 'checkrole', username });
        if (data.revoked) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('index.html?revoked=1');
        }
    } catch (_) {}
}
setInterval(checkRevoked, 60000);
window.addEventListener('sc-back-online', checkRevoked);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkRevoked();
});

// Also sync when coming back online or tab becomes visible
window.addEventListener('sc-back-online', () => InAppNotif.syncFromServer());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') InAppNotif.syncFromServer();
});

// ── In-App Notification Store ─────────────────────────────────────────────────
// Stores up to 50 notifications in localStorage. No server needed.
const InAppNotif = {
    MAX: 50,
    KEY: 'sc_inapp_notifs',

    get() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
        catch (_) { return []; }
    },

    add(type, title, body) {
        const list = this.get();
        list.unshift({
            id:    Date.now() + Math.random().toString(36).slice(2),
            type, title, body,
            time:  Date.now(),
            read:  false
        });
        localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, this.MAX)));
        this._updateBadge();
        this._animateBell();
        if (typeof playNotifSound === 'function') playNotifSound();
    },

    markAllRead() {
        const list = this.get().map(n => ({ ...n, read: true }));
        localStorage.setItem(this.KEY, JSON.stringify(list));
        this._updateBadge();
    },

    clear() {
        localStorage.removeItem(this.KEY);
        this._updateBadge();
    },

    // Remove notifications older than 7 days
    purgeOld() {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const list   = this.get().filter(n => n.time > cutoff);
        localStorage.setItem(this.KEY, JSON.stringify(list));
        this._updateBadge();
    },

    // Sync pending notifications from the server — makes bell cross-device
    async syncFromServer() {
        if (!navigator.onLine) return;
        if (localStorage.getItem('scNotif') === '0') return;
        const role = getUserRole();
        const username = getLoggedInUser();
        try {
            const data = await apiGet({ action: 'getpending', role, username });
            const notifs = data.notifications || [];
            if (!notifs.length) return;

            // Merge into local store — skip duplicates by server ID
            const existing = this.get();
            const existingIds = new Set(existing.map(n => n.serverId).filter(Boolean));
            // Filter by role before adding — manageronly must not reach non-managers
            const ROLE_TYPES = {
                manager:    ['received','ready','abandoned','jobstatus','specialorder','update','manageronly'],
                cashier:    ['received','ready','abandoned','specialorder','update','jobstatus'],
                technician: ['received','ready','abandoned','specialorder','update','jobstatus']
            };
            const allowed = ROLE_TYPES[role] || ROLE_TYPES.technician;
            const toAdd = notifs.filter(n => !existingIds.has(n.id) && allowed.includes(n.type));

            toAdd.forEach(n => {
                existing.unshift({
                    id:       Date.now() + Math.random().toString(36).slice(2),
                    serverId: n.id,   // track server ID to avoid re-adding
                    type:     n.type,
                    title:    n.title,
                    body:     n.body,
                    time:     n.timestamp ? new Date(n.timestamp).getTime() : Date.now(),
                    read:     false
                });
            });

            if (toAdd.length) {
                localStorage.setItem(this.KEY, JSON.stringify(existing.slice(0, this.MAX)));
                this._updateBadge();
                this._animateBell();
                // Do NOT play sound here — this is a background poll with no user gesture.
                // Sound is played only via InAppNotif.add() which is called from direct user-triggered events.
            }

            // Mark delivered for THIS user via apiPost (Supabase)
            await apiPost({
                action: 'markdelivered',
                username,
                ids: notifs.map(n => n.id).join(',')
            }).catch(() => {});
        } catch (_) {
            // Silent fail — offline or server unavailable
        }
    },

    unreadCount() {
        return this.get().filter(n => !n.read).length;
    },

    _updateBadge() {
        const badge = document.getElementById('notif-badge');
        const count = this.unreadCount();
        if (!badge) return;
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    },

    _animateBell() {
        const bell = document.getElementById('notif-bell-btn');
        if (!bell) return;
        bell.classList.remove('bell-ring');
        void bell.offsetWidth; // reflow to restart animation
        bell.classList.add('bell-ring');
    },

    timeAgo(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60)  return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    },

    typeIcon(type) {
        const icons = {
            received:     'package',
            ready:        'success',
            abandoned:    'warning',
            specialorder: 'cart',
            update:       'rocket',
            jobstatus:    'wrench',
            manageronly:  'lock',
            general:      'bell'
        };
        const name = icons[type] || 'bell';
        return typeof scIcon === 'function' ? scIcon(name, 18) : '';
    },

    dismiss(idx) {
        const list = this.get();
        list.splice(idx, 1);
        localStorage.setItem(this.KEY, JSON.stringify(list));
        this._updateBadge();
    }
};
window.InAppNotif = InAppNotif;

// ── Viewport safe areas (notched / home-indicator devices) ───────────────────
(function () {
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp && vp.content.indexOf('viewport-fit') === -1) {
        vp.content = vp.content.replace(/\s*$/, '') + ', viewport-fit=cover';
    }
})();

// ── Offline banner ────────────────────────────────────────────────────────────
(function () {
    function notifyBottomChrome() {
        window.dispatchEvent(new Event('sc-bottom-chrome-change'));
    }

    // Inject mobile repositioning style once
    const style = document.createElement('style');
    style.textContent = [
        '@media (max-width: 768px) {',
        '  #sc-offline-banner { top: auto !important; bottom: 0 !important; left: 0 !important; right: 0 !important;',
        '    transform: translateY(100%) !important; padding-bottom: calc(8px + env(safe-area-inset-bottom)) !important; }',
        '  #sc-offline-banner.sc-visible { transform: translateY(0) !important; }',
        '}'
    ].join(' ');
    document.head.appendChild(style);

    function createBanner() {
        if (document.getElementById('sc-offline-banner')) return;
        const b = document.createElement('div');
        b.id = 'sc-offline-banner';
        b.innerHTML = (typeof scIcon === 'function' ? scIcon('offline', 14) + ' ' : '') + 'You\'re offline — showing cached data. Changes will not save.';
        b.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
            'background:#b45309', 'color:#fff', 'text-align:center',
            'font-size:0.78rem', 'font-weight:700', 'padding:8px 16px',
            'font-family:var(--font-family,sans-serif)',
            'transform:translateY(-100%)', 'transition:transform 0.3s ease'
        ].join(';');
        document.body.prepend(b);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            b.style.transform = 'translateY(0)';
            b.classList.add('sc-visible');
            document.body.classList.add('sc-offline-visible');
            notifyBottomChrome();
        }));
    }

    function removeBanner() {
        const b = document.getElementById('sc-offline-banner');
        if (!b) return;
        b.style.transform = 'translateY(-100%)';
        document.body.classList.remove('sc-offline-visible');
        notifyBottomChrome();
        setTimeout(() => b.remove(), 350);
    }

    function syncBanner() {
        if (!navigator.onLine) createBanner();
        else removeBanner();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncBanner);
    } else {
        syncBanner();
    }

    window.addEventListener('offline', createBanner);
    window.addEventListener('online', () => {
        removeBanner();
        // Dispatch a custom event so pages can auto-reload data
        window.dispatchEvent(new Event('sc-back-online'));
    });
})();
window.isOffline = () => !navigator.onLine;

// ── App update notice (service worker — all pages, PC + mobile) ─────────────
(function () {
    if (!('serviceWorker' in navigator)) return;

    const SW_PATH = '/Staff-Portal/sw.js';
    const SW_SCOPE = '/Staff-Portal/';
    let registrationRef = null;
    let pendingWorker = null;
    const UPDATE_DISMISS_MS = 14000;

    function ensureNoticeStyles() {
        if (document.getElementById('staff-banner-css')) return;
        const link = document.createElement('link');
        link.id = 'staff-banner-css';
        link.rel = 'stylesheet';
        link.href = 'css/staff-banner.css';
        document.head.appendChild(link);
    }

    function syncNoticeStack() {
        const updateEl = document.getElementById('sc-app-update-card');
        let above = 0;
        if (updateEl && updateEl.classList.contains('is-visible')) {
            above = Math.ceil(updateEl.getBoundingClientRect().height) + 10;
        }
        document.documentElement.style.setProperty('--sc-notice-stack-above-broadcast', above + 'px');
    }
    window.scSyncNoticeStack = syncNoticeStack;

    function clearUpdateDismissTimer(card) {
        if (!card) return;
        if (card._dismissTimer) {
            clearTimeout(card._dismissTimer);
            card._dismissTimer = null;
        }
        const fill = card.querySelector('.sc-update-timer-fill');
        if (fill && card._onTimerEnd) {
            fill.removeEventListener('animationend', card._onTimerEnd);
            card._onTimerEnd = null;
        }
    }

    function dismissUpdateNotice() {
        const card = document.getElementById('sc-app-update-card');
        if (!card || !card.classList.contains('is-visible')) return;
        clearUpdateDismissTimer(card);
        card.classList.remove('is-visible', 'is-paused');
        syncNoticeStack();
        window.dispatchEvent(new Event('sc-bottom-chrome-change'));
        const onSettled = (e) => {
            if (e.propertyName && e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
            syncNoticeStack();
            card.removeEventListener('transitionend', onSettled);
        };
        card.addEventListener('transitionend', onSettled);
    }

    function restartUpdateDismissTimer(card) {
        clearUpdateDismissTimer(card);
        card.style.setProperty('--sc-update-dismiss-ms', (UPDATE_DISMISS_MS / 1000) + 's');
        const fill = card.querySelector('.sc-update-timer-fill');
        if (!fill) return;
        fill.style.animation = 'none';
        void fill.offsetWidth;
        fill.style.animation = '';
        card._onTimerEnd = () => dismissUpdateNotice();
        fill.addEventListener('animationend', card._onTimerEnd);
        card._dismissTimer = setTimeout(() => dismissUpdateNotice(), UPDATE_DISMISS_MS + 120);
    }

    function showUpdateNotice(worker) {
        if (worker) pendingWorker = worker;
        ensureNoticeStyles();

        let card = document.getElementById('sc-app-update-card');
        if (!card) {
            card = document.createElement('div');
            card.id = 'sc-app-update-card';
            card.className = 'scb-info';
            card.setAttribute('role', 'status');
            card.setAttribute('aria-live', 'polite');
            card.innerHTML = ''
                + '<div class="scb-card-inner">'
                + '<span class="scb-sheet-handle" aria-hidden="true"></span>'
                + '<span class="scb-accent" aria-hidden="true"></span>'
                + '<div class="scb-content">'
                + '<div class="scb-label">App update</div>'
                + '<div class="scb-title">Update ready</div>'
                + '<div class="scb-message">Tap Reload when you are ready. This hides automatically — the update stays available until you reload.</div>'
                + '<button type="button" class="scb-reload-btn">Reload</button>'
                + '</div></div>'
                + '<div class="sc-update-timer" aria-hidden="true"><span class="sc-update-timer-fill"></span></div>';
            card.querySelector('.scb-reload-btn').addEventListener('click', () => {
                clearUpdateDismissTimer(card);
                if (pendingWorker && pendingWorker.state === 'installed') {
                    pendingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
                window.location.reload();
            });
            document.body.appendChild(card);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                card.classList.add('is-visible');
                restartUpdateDismissTimer(card);
                syncNoticeStack();
            }));
        } else {
            card.classList.add('is-visible');
            card.classList.remove('is-paused');
            restartUpdateDismissTimer(card);
            syncNoticeStack();
        }
    }

    function watchInstallingWorker(reg, worker) {
        if (!worker) return;
        const onState = () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateNotice(worker);
            }
        };
        worker.addEventListener('statechange', onState);
        onState();
    }

    function bindRegistration(reg) {
        registrationRef = reg;
        if (reg.waiting) showUpdateNotice(reg.waiting);
        if (reg.installing) watchInstallingWorker(reg, reg.installing);
        reg.addEventListener('updatefound', () => watchInstallingWorker(reg, reg.installing));
    }

    async function registerServiceWorker() {
        try {
            const reg = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
            console.log('[SW] Registered, scope:', reg.scope);
            bindRegistration(reg);
            await reg.update();
        } catch (err) {
            console.warn('[SW] Registration failed:', err);
        }
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!navigator.serviceWorker.controller) return;
        const card = document.getElementById('sc-app-update-card');
        if (!card || !card.classList.contains('is-visible')) {
            showUpdateNotice(null);
        }
    });

    let lastSwUpdateCheck = 0;
    document.addEventListener('visibilitychange', () => {
        const card = document.getElementById('sc-app-update-card');
        if (card && card.classList.contains('is-visible')) {
            card.classList.toggle('is-paused', document.visibilityState !== 'visible');
        }
        if (document.visibilityState !== 'visible' || !registrationRef) return;
        const now = Date.now();
        if (now - lastSwUpdateCheck < 45000) return;
        lastSwUpdateCheck = now;
        registrationRef.update().catch(() => {});
    });

    let noticeStackRaf = 0;
    function scheduleNoticeStack() {
        if (noticeStackRaf) return;
        noticeStackRaf = requestAnimationFrame(() => {
            noticeStackRaf = 0;
            syncNoticeStack();
        });
    }
    window.addEventListener('resize', scheduleNoticeStack, { passive: true });
    window.addEventListener('sc-bottom-chrome-change', scheduleNoticeStack);

    if (document.readyState === 'complete') {
        registerServiceWorker();
    } else {
        window.addEventListener('load', registerServiceWorker);
    }

    window.__scShowUpdateNotice = showUpdateNotice;
    window.__scDismissUpdateNotice = dismissUpdateNotice;
})();

/** Dev / QA — always on window (calls live handler when components.js is current). */
window.scTestUpdateNotice = function () {
    if (typeof window.__scShowUpdateNotice === 'function') {
        window.__scShowUpdateNotice(null);
        return;
    }
    console.warn('[Portal] Update preview needs a hard refresh to load the latest js/components.js (Ctrl+Shift+R).');
};
window.scDismissUpdateNotice = function () {
    if (typeof window.__scDismissUpdateNotice === 'function') {
        window.__scDismissUpdateNotice();
    }
};

// ── sendNotification — role-aware in-app bell ────────────────────────────────
// type: 'received'|'ready'|'abandoned'|'jobstatus'|'specialorder'|'update'
const NOTIF_ROLES = {
    received:     ['technician', 'cashier', 'manager'],
    ready:        ['technician', 'cashier', 'manager'],
    abandoned:    ['technician', 'cashier', 'manager'],
    jobstatus:    ['technician', 'cashier', 'manager'],
    specialorder: ['technician', 'cashier', 'manager'],
    update:       ['technician', 'cashier', 'manager'],
    manageronly:  ['manager']
};

function sendNotification(type, title, body) {
    if (localStorage.getItem('scNotif') === '0') return;
    const role    = getUserRole();
    const allowed = NOTIF_ROLES[type] || ['technician', 'cashier', 'manager'];
    if (!allowed.includes(role)) return;
    InAppNotif.add(type, title, body);
}
window.sendNotification = sendNotification;

// ── Haptic feedback ───────────────────────────────────────────────────────────
// Android-only — iOS blocks the Vibration API entirely
// Patterns: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning'
const IS_ANDROID = /android/i.test(navigator.userAgent);

function haptic(type = 'light') {
    if (!IS_ANDROID) return;
    if (!navigator.vibrate) return;
    if (localStorage.getItem('scHaptics') === '0') return;
    const patterns = {
        light:   [10],
        medium:  [20],
        heavy:   [40],
        success: [10, 50, 10],
        error:   [50, 30, 50],
        warning: [30, 20, 30]
    };
    navigator.vibrate(patterns[type] || patterns.light);
}
window.haptic = haptic;
window.IS_ANDROID = IS_ANDROID;

// Global light tap feedback on all buttons, links, and interactive elements
if (IS_ANDROID) {
    document.addEventListener('pointerdown', e => {
        const el = e.target.closest('button, a, select, .order-card, .job-row, .nav-btn, .card-btn, .theme-card, .toggle, .status-pill label, .edit-pill label, .job-type-pill label');
        if (el) haptic('light');
    }, { passive: true });
}

// ── Notification Sound Engine ─────────────────────────────────────────────────
// Pure Web Audio API — no sound files needed.
// Sound options: 'chime' | 'ping' | 'pop' | 'double' | 'marimba'
(function () {
    let _ctx = null;

    function getCtx() {
        if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (_ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    }

    // Unlock audio on iOS — call this on any user gesture (e.g. login tap)
    function unlockAudio() {
        try {
            const ctx = getCtx();
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
        } catch (_) {}
    }

    function playTone(freq, type, startTime, duration, gainVal, ctx, gainNode) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(gainNode);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    const SOUNDS = {
        chime: (ctx) => {
            const g = ctx.createGain();
            g.connect(ctx.destination);
            g.gain.setValueAtTime(0.25, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            playTone(880,  'sine', ctx.currentTime,       0.6, 0.25, ctx, g);
            playTone(1320, 'sine', ctx.currentTime + 0.12, 0.5, 0.2,  ctx, g);
        },
        ping: (ctx) => {
            const g = ctx.createGain();
            g.connect(ctx.destination);
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            playTone(1480, 'sine', ctx.currentTime, 0.25, 0.3, ctx, g);
        },
        pop: (ctx) => {
            const g = ctx.createGain();
            g.connect(ctx.destination);
            g.gain.setValueAtTime(0.25, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            playTone(440, 'sine', ctx.currentTime, 0.08, 0.25, ctx, g);
            playTone(880, 'sine', ctx.currentTime + 0.04, 0.14, 0.15, ctx, g);
        },
        double: (ctx) => {
            const g = ctx.createGain();
            g.connect(ctx.destination);
            [0, 0.15].forEach(offset => {
                const o = ctx.createOscillator();
                o.type = 'sine';
                o.frequency.setValueAtTime(1100, ctx.currentTime + offset);
                const gn = ctx.createGain();
                gn.gain.setValueAtTime(0.25, ctx.currentTime + offset);
                gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.12);
                o.connect(gn);
                gn.connect(ctx.destination);
                o.start(ctx.currentTime + offset);
                o.stop(ctx.currentTime + offset + 0.12);
            });
        },
        marimba: (ctx) => {
            [0, 0.13, 0.26].forEach((offset, i) => {
                const freqs = [880, 740, 587];
                const o = ctx.createOscillator();
                o.type = 'triangle';
                o.frequency.setValueAtTime(freqs[i], ctx.currentTime + offset);
                const gn = ctx.createGain();
                gn.gain.setValueAtTime(0.28, ctx.currentTime + offset);
                gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
                o.connect(gn);
                gn.connect(ctx.destination);
                o.start(ctx.currentTime + offset);
                o.stop(ctx.currentTime + offset + 0.3);
            });
        }
    };

    function playNotifSound() {
        if (localStorage.getItem('scNotifSound') !== '1') return;
        const sound = localStorage.getItem('scNotifSoundType') || 'chime';
        try {
            const ctx = getCtx();
            const fn  = SOUNDS[sound] || SOUNDS.chime;
            fn(ctx);
        } catch (e) {
            console.warn('Sound failed:', e);
        }
    }

    window.unlockAudio    = unlockAudio;
    window.playNotifSound = playNotifSound;
    window.NOTIF_SOUNDS   = Object.keys(SOUNDS);
})();

// ── Session Timeout ───────────────────────────────────────────────────────────
// Auto-logout after 8 hours of inactivity (one full shift).
// Resets on any user interaction. Only applies to sessionStorage sessions
// (localStorage "remember me" sessions are intentionally persistent).
(function () {
    const TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
    const WARN_MS = 5 * 60 * 1000;
    let _warnTimer = null;
    let _logoutTimer = null;
    let _warnShown = false;

    function showSessionWarning() {
        if (_warnShown) return;
        _warnShown = true;
        let toast = document.getElementById('sc-session-warn');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sc-session-warn';
            toast.style.cssText = [
                'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
                'z-index:99998', 'max-width:min(92vw,420px)', 'padding:14px 20px',
                'border-radius:14px', 'background:#1e293b', 'color:#fff',
                'font-family:var(--font-family,sans-serif)', 'font-size:0.88rem', 'font-weight:600',
                'box-shadow:0 16px 40px rgba(0,0,0,0.35)', 'border:1px solid rgba(255,255,255,0.12)',
                'pointer-events:none', 'text-align:center', 'line-height:1.45'
            ].join(';');
            document.body.appendChild(toast);
        }
        toast.textContent = 'Your session will expire in 5 minutes due to inactivity.';
        toast.style.display = 'block';
    }

    function resetTimer() {
        clearTimeout(_warnTimer);
        clearTimeout(_logoutTimer);
        _warnShown = false;
        const warnEl = document.getElementById('sc-session-warn');
        if (warnEl) warnEl.style.display = 'none';

        const inSession = sessionStorage.getItem('isLoggedIn') === 'true';
        if (!inSession) return;

        _warnTimer = setTimeout(showSessionWarning, TIMEOUT_MS - WARN_MS);
        _logoutTimer = setTimeout(function () {
            if (sessionStorage.getItem('isLoggedIn') === 'true') {
                if (typeof logOut === 'function') logOut();
                else window.location.href = 'index.html?timeout=1';
            }
        }, TIMEOUT_MS);
    }

    ['click', 'keydown', 'touchstart', 'scroll'].forEach(function(evt) {
        document.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer();
})();

// ── Universal scroll lock guard ───────────────────────────────────────────────
// Prevents the page from getting permanently stuck in a non-scrollable state.
// Runs every 2 seconds and on visibility change — clears overflow lock if no
// modal or lightbox is actually open.
(function () {
    function releaseScrollIfSafe() {
        const anyOpen = document.querySelector(
            '.modal-overlay.open, #photoLightbox.open, [id$="Modal"].open'
        );
        if (!anyOpen) {
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
        }
    }
    setInterval(releaseScrollIfSafe, 2000);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') releaseScrollIfSafe();
    });
    // Also release on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') releaseScrollIfSafe();
    });
})();

// ── Service Policy Modal ──────────────────────────────────────────────────────
function openPolicyModal() {
    const m = document.getElementById('policyModal');
    if (!m) return;
    // Lazy-load iframe on first open
    const iframe = document.getElementById('policyIframe');
    if (iframe && iframe.src === 'about:blank') {
        iframe.src = 'https://servicellbze.github.io/ServiCell/policy.html';
    }
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    m.onclick = function(e) { if (e.target === m) closePolicyModal(); };
}
function closePolicyModal() {
    const m = document.getElementById('policyModal');
    if (!m) return;
    m.style.display = 'none';
    document.body.style.overflow = '';
}
window.openPolicyModal  = openPolicyModal;
window.closePolicyModal = closePolicyModal;
