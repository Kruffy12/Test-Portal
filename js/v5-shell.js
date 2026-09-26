/**
 * Staff Portal V5 — chrome only. Keeps the IDs the rest of the app already uses:
 * #navAccount #accountDropdown #navBell #notif-bell-btn #notif-badge #notifPanel
 */
(function (global) {
    'use strict';

    var PAGE_TITLES = {
        'index.html': 'Home',
        'current-jobs.html': 'Jobs',
        'new-job.html': 'New Job',
        'sales.html': 'Sales',
        'inventory.html': 'Inventory',
        'special-orders.html': 'Special Orders',
        'statistics.html': 'Statistics',
        'settings.html': 'Settings'
    };

    function icon(name, size) {
        return typeof global.scIcon === 'function' ? global.scIcon(name, size || 22) : '';
    }

    function currentPage() {
        var file = (global.location.pathname.split('/').pop() || '').split('?')[0];
        return file || 'index.html';
    }

    function isActive(href, current) {
        if (href === 'index.html') return current === 'index.html' || current === '';
        return current === href;
    }

    function tabsForRole(role) {
        var third = role === 'technician'
            ? { href: 'new-job.html', label: 'New', ic: 'plus', tour: 'tab-new' }
            : { href: 'sales.html', label: 'Sales', ic: 'dollar', tour: 'tab-sales' };
        return [
            { href: 'index.html', label: 'Home', ic: 'home', tour: 'tab-home' },
            { href: 'current-jobs.html', label: 'Jobs', ic: 'wrench', tour: 'tab-jobs' },
            third
        ];
    }

    function syncChromeVars() {
        var tab = global.document.getElementById('scTabbar');
        var mobile = global.window.matchMedia('(max-width: 900px)').matches;
        var loggedIn = global.document.body.classList.contains('sc-logged-in');
        var tabH = (mobile && loggedIn && tab) ? (tab.offsetHeight || 0) : 0;
        global.document.documentElement.style.setProperty('--sc-v5-tabbar-offset', tabH + 'px');
        try { global.window.dispatchEvent(new Event('sc-bottom-chrome-change')); } catch (_) {}
        if (typeof global.scSyncNoticeStack === 'function') global.scSyncNoticeStack();
    }

    function openMore(open) {
        var sheet = global.document.getElementById('scMoreSheet');
        var back = global.document.getElementById('scMoreBackdrop');
        var btn = global.document.getElementById('scTabMore');
        if (!sheet || !back) return;
        sheet.classList.toggle('open', open);
        back.classList.toggle('open', open);
        global.document.body.classList.toggle('sc-more-open', open);
        if (btn) {
            btn.classList.toggle('active', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        syncChromeVars();
    }

    function bindOnce(el, key, type, fn) {
        if (!el || el[key]) return;
        el[key] = true;
        el.addEventListener(type, fn);
    }

    function initShellListeners() {
        var toggle = global.document.getElementById('scSidebarToggle');
        bindOnce(toggle, '_scV5Bound', 'click', function () {
            var collapsed = global.document.body.classList.toggle('sc-sidebar-collapsed');
            try { localStorage.setItem('scSidebarCollapsed', collapsed ? '1' : '0'); } catch (_) {}
            toggle.innerHTML = icon(collapsed ? 'chevronRight' : 'chevronLeft', 18) +
                '<span class="sc-sidebar-link-label">' + (collapsed ? 'Expand' : 'Collapse') + '</span>';
            syncChromeVars();
        });

        var moreBtn = global.document.getElementById('scTabMore');
        bindOnce(moreBtn, '_scV5Bound', 'click', function (e) {
            e.preventDefault();
            var sheet = global.document.getElementById('scMoreSheet');
            openMore(!(sheet && sheet.classList.contains('open')));
        });

        var back = global.document.getElementById('scMoreBackdrop');
        bindOnce(back, '_scV5Bound', 'click', function () { openMore(false); });

        var sheet = global.document.getElementById('scMoreSheet');
        if (sheet && !sheet._scV5Links) {
            sheet._scV5Links = true;
            sheet.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('.sc-more-link')) openMore(false);
            });
        }

        if (!global.document._scV5Esc) {
            global.document._scV5Esc = true;
            global.document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') openMore(false);
            });
        }

        if (!global.window._scV5Resize) {
            global.window._scV5Resize = true;
            global.window.addEventListener('resize', syncChromeVars, { passive: true });
        }

        syncChromeVars();
    }

    function renderShell(placeholder, opts) {
        opts = opts || {};
        var username = opts.username || '';
        var role = opts.role || 'technician';
        var current = opts.current || currentPage();
        var visible = opts.visible || [];
        var loggedIn = !!username;

        global.document.body.classList.add('sc-v5');
        global.document.body.classList.toggle('sc-logged-in', loggedIn);
        global.document.body.classList.toggle('sc-logged-out', !loggedIn);
        try {
            if (localStorage.getItem('scSidebarCollapsed') === '1') {
                global.document.body.classList.add('sc-sidebar-collapsed');
            } else {
                global.document.body.classList.remove('sc-sidebar-collapsed');
            }
        } catch (_) {}

        var ROLE_ICONS = { manager: 'crown', cashier: 'cash', technician: 'wrench' };
        var roleIconSvg = icon(ROLE_ICONS[role] || 'wrench', 16);
        var collapsed = global.document.body.classList.contains('sc-sidebar-collapsed');
        var tabHrefs = {};
        var tabs = tabsForRole(role);
        tabs.forEach(function (t) { tabHrefs[t.href] = true; });

        var sidebarLinks = visible.map(function (l) {
            var active = isActive(l.href, current) ? ' active' : '';
            return '<a href="' + l.href + '" class="sc-sidebar-link' + active + '" title="' + l.label + '" data-tour="nav-' + l.href + '">' +
                icon(l.icon, 22) +
                '<span class="sc-sidebar-link-label">' + l.label + '</span></a>';
        }).join('');

        var tabHtml = tabs.map(function (t) {
            var active = isActive(t.href, current) ? ' active' : '';
            return '<a href="' + t.href + '" class="sc-tab' + active + '" data-tour="' + t.tour + '">' +
                icon(t.ic, 22) + '<span class="sc-tab-label">' + t.label + '</span></a>';
        }).join('');

        tabHtml += '<button type="button" class="sc-tab" id="scTabMore" data-tour="tab-more" aria-expanded="false">' +
            icon('list', 22) + '<span class="sc-tab-label">More</span></button>';

        var moreItems = visible.filter(function (l) { return !tabHrefs[l.href]; }).map(function (l) {
            return '<a href="' + l.href + '" class="sc-more-link">' + icon(l.icon, 20) + '<span>' + l.label + '</span></a>';
        }).join('');

        var accountHTML = username ? (
            '<div class="nav-account" id="navAccount">' +
            '<button class="account-chip" onclick="toggleAccountMenu(event)" aria-label="Account menu">' +
            '<span class="account-avatar" title="' + role + '">' + roleIconSvg + '</span>' +
            '<span class="account-name">' + username + '</span>' +
            '<span class="account-caret">' + icon('chevronDown', 10) + '</span>' +
            '</button>' +
            '<div class="account-dropdown" id="accountDropdown">' +
            '<div class="dropdown-header">' +
            '<span class="dropdown-username">' + username + '</span>' +
            '<span class="dropdown-role-badge">' + roleIconSvg + ' ' + role + '</span>' +
            '</div>' +
            '<div class="dropdown-divider"></div>' +
            '<a href="settings.html" class="dropdown-item">' + icon('settings', 15) + ' Settings</a>' +
            '<button class="dropdown-item danger" onclick="logOut()">' + icon('logout', 15) + ' Log out</button>' +
            '</div></div>'
        ) : '';

        var bellHTML = username ? (
            '<div class="nav-bell" id="navBell">' +
            '<button class="bell-btn" id="notif-bell-btn" onclick="toggleNotifPanel(event)" aria-label="Notifications">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            '<span class="notif-badge" id="notif-badge" style="display:none;">0</span></button>' +
            '<div class="notif-panel" id="notifPanel">' +
            '<div class="notif-panel-header">' +
            '<span class="notif-panel-title">Notifications</span>' +
            '<button class="notif-clear-btn" onclick="InAppNotif.clear();renderNotifPanel()">Clear all</button>' +
            '</div><div class="notif-list" id="notifList"></div></div></div>'
        ) : '';

        placeholder.innerHTML =
            '<aside class="sc-sidebar" id="mainNav" aria-label="Main navigation">' +
            '<div class="sc-sidebar-brand"><div class="sc-sidebar-logo">SC</div>' +
            '<span class="sc-sidebar-title">ServiCell</span></div>' +
            '<nav class="sc-sidebar-nav">' + sidebarLinks + '</nav>' +
            '<div class="sc-sidebar-foot">' +
            '<div class="sc-sidebar-desktop-tools">' + bellHTML + accountHTML + '</div>' +
            '<button type="button" class="sc-sidebar-toggle" id="scSidebarToggle" aria-label="Collapse sidebar">' +
            icon(collapsed ? 'chevronRight' : 'chevronLeft', 18) +
            '<span class="sc-sidebar-link-label">' + (collapsed ? 'Expand' : 'Collapse') + '</span></button>' +
            '</div></aside>' +

            '<header class="sc-topbar" id="scTopbar">' +
            '<div class="sc-topbar-title">' + (PAGE_TITLES[current] || 'Staff Portal') + '</div>' +
            '<div class="sc-topbar-actions" id="scTopbarActions"></div></header>' +

            '<nav class="sc-tabbar" id="scTabbar" aria-label="Primary">' + tabHtml + '</nav>' +

            '<div class="sc-more-backdrop" id="scMoreBackdrop"></div>' +
            '<div class="sc-more-sheet" id="scMoreSheet" role="dialog" aria-label="More menu">' +
            '<div class="sc-more-handle"></div>' +
            '<div class="sc-more-head">More</div>' +
            '<div class="sc-more-sub">Shortcuts for your role</div>' +
            '<div class="sc-more-grid">' + moreItems + '</div></div>';

        placeChrome(loggedIn);
        initShellListeners();
        if (typeof global.InAppNotif !== 'undefined' && global.InAppNotif._updateBadge) {
            global.InAppNotif._updateBadge();
        }
    }

    function placeChrome(loggedIn) {
        var desktopTools = global.document.querySelector('.sc-sidebar-desktop-tools');
        var topActions = global.document.getElementById('scTopbarActions');
        var bell = global.document.getElementById('navBell');
        var account = global.document.getElementById('navAccount');
        if (!loggedIn || !bell || !account || !desktopTools || !topActions) return;

        function move() {
            var mobile = global.window.matchMedia('(max-width: 900px)').matches;
            if (mobile) {
                topActions.appendChild(bell);
                topActions.appendChild(account);
            } else {
                desktopTools.appendChild(bell);
                desktopTools.appendChild(account);
            }
        }

        move();
        if (!global.window._scV5Place) {
            global.window._scV5Place = true;
            global.window.addEventListener('resize', function () {
                var b = global.document.getElementById('navBell');
                var a = global.document.getElementById('navAccount');
                if (b && a) move();
            }, { passive: true });
        }
    }

    global.SCV5 = {
        renderShell: renderShell,
        openMore: openMore,
        syncChromeVars: syncChromeVars,
        tabsForRole: tabsForRole
    };
})(typeof window !== 'undefined' ? window : this);
