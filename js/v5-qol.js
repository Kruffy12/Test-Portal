/**
 * Staff Portal V5 — shared quality-of-life layer, loaded after components.js on every page.
 *   SCQol.toast(msg, type)            themed toast for pages without their own #toast
 *   SCQol.undoToast(msg, opts)        toast with an Undo button; opts.onUndo / opts.onCommit(isUnload)
 *   SCQol.pullToRefresh(fn)           mobile pull-down gesture that awaits fn()
 *   SCQol.skeletonRows(n)             placeholder rows while a list loads
 *   SCQol.openSearch() / closeSearch  global search (Ctrl/⌘+K or "/")
 *   SCQol.startTour(force, opts) / resetTours
 *   SCQol.replayIntro()               V5 welcome intro + onboarding tour
 * Also on every page: pop-up scroll lock, themed tooltips, and no page-style selection/callouts/drags.
 */
(function (global) {
    'use strict';

    var doc = global.document;
    var IS_MAC = /Mac|iPhone|iPad/.test(global.navigator.platform || global.navigator.userAgent);

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function icon(name, size) {
        return typeof global.scIcon === 'function' ? global.scIcon(name, size || 18) : '';
    }

    function currentUser() {
        try { return localStorage.getItem('scUser') || sessionStorage.getItem('scUser') || ''; } catch (_) { return ''; }
    }

    function isLoggedIn() {
        try {
            return localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true';
        } catch (_) { return false; }
    }

    function currentPage() {
        return (global.location.pathname.split('/').pop() || 'index.html') || 'index.html';
    }

    function tap(type) {
        if (typeof global.haptic === 'function') global.haptic(type || 'light');
    }

    function isMobile() {
        return global.matchMedia('(max-width: 900px)').matches;
    }

    // ── Toast (for pages that don't ship their own) ──────────────────────────────
    var _toastTimer = null;
    function toast(msg, type) {
        var el = doc.getElementById('scQolToast');
        if (!el) {
            el = doc.createElement('div');
            el.id = 'scQolToast';
            doc.body.appendChild(el);
        }
        if (typeof global.scRenderToast === 'function') global.scRenderToast(el, msg, type);
        else { el.textContent = msg; el.className = 'toast sc-toast'; }
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
    }

    // ── Undo toast ───────────────────────────────────────────────────────────────
    var _undo = { el: null, timer: null, pending: null };

    function hideOtherToasts() {
        var shown = doc.querySelectorAll('.toast.show');
        for (var i = 0; i < shown.length; i++) shown[i].classList.remove('show');
    }

    function buildUndoEl() {
        var el = doc.createElement('div');
        el.className = 'sc-undo-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<span class="sc-undo-msg"></span>' +
            '<button type="button" class="sc-undo-btn">Undo</button>' +
            '<span class="sc-undo-bar" aria-hidden="true"></span>';
        el.querySelector('.sc-undo-btn').addEventListener('click', function () {
            var p = _undo.pending;
            if (!p) return;
            clearTimeout(_undo.timer);
            _undo.pending = null;
            el.classList.remove('show');
            tap('light');
            if (typeof p.onUndo === 'function') p.onUndo();
        });
        doc.body.appendChild(el);
        return el;
    }

    function commitUndo(isUnload) {
        var p = _undo.pending;
        if (!p) return;
        clearTimeout(_undo.timer);
        _undo.pending = null;
        if (_undo.el) _undo.el.classList.remove('show');
        if (typeof p.onCommit === 'function') p.onCommit(!!isUnload);
    }

    function undoToast(msg, opts) {
        opts = opts || {};
        commitUndo(false);
        if (!_undo.el) _undo.el = buildUndoEl();
        var el = _undo.el;
        var duration = opts.duration || 6000;
        el.querySelector('.sc-undo-msg').textContent = msg;
        el.querySelector('.sc-undo-btn').textContent = opts.actionLabel || 'Undo';
        var bar = el.querySelector('.sc-undo-bar');
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(1)';
        hideOtherToasts();
        _undo.pending = opts;
        void el.offsetWidth;
        el.classList.add('show');
        bar.style.transition = 'transform ' + duration + 'ms linear';
        bar.style.transform = 'scaleX(0)';
        _undo.timer = setTimeout(function () { commitUndo(false); }, duration);
    }

    // Anything still waiting on its undo window is committed before the page goes away
    global.addEventListener('pagehide', function () { commitUndo(true); });

    // ── Skeleton rows ────────────────────────────────────────────────────────────
    function skeletonRows(n) {
        var html = '';
        for (var i = 0; i < (n || 5); i++) {
            html += '<div class="sc-skel-row" aria-hidden="true">' +
                '<span class="sc-skel sc-skel-avatar"></span>' +
                '<span class="sc-skel-lines"><span class="sc-skel sc-skel-line" style="width:' + (58 - (i % 3) * 9) + '%"></span>' +
                '<span class="sc-skel sc-skel-line sm" style="width:' + (34 - (i % 2) * 8) + '%"></span></span>' +
                '<span class="sc-skel sc-skel-pill"></span></div>';
        }
        return '<div class="sc-skel-list" role="status" aria-label="Loading">' + html + '</div>';
    }

    // ── Modal scroll lock ────────────────────────────────────────────────────────
    // Pages open pop-ups several ways (.modal-overlay.open, inline display:flex, lightboxes, webcam
    // overlays), so any shown layer matching OVERLAY_SEL counts. Closed layers are display:none or
    // pointer-events:none on every page, which is what isShownLayer relies on.
    var OVERLAY_SEL = '.modal-overlay, [id$="Modal"], [id$="Overlay"], [id$="overlay"], #photoLightbox, ' +
        '.sc-more-sheet.open, .sc-search.open, .sc-tour-layer, .sc-intro';

    function isShownLayer(el) {
        var cs = global.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function overlayOpen() {
        var nodes = doc.querySelectorAll(OVERLAY_SEL);
        for (var i = 0; i < nodes.length; i++) if (isShownLayer(nodes[i])) return true;
        return false;
    }

    // A timer rather than requestAnimationFrame: rAF can be throttled (embedded views, low-power mode)
    // and a lock that never re-checks would leave the page frozen after a pop-up closes.
    var _locked = false, _lockTimer = 0;
    function syncScrollLock() {
        _lockTimer = 0;
        var want = overlayOpen() || doc.body.style.overflow === 'hidden';
        if (want === _locked) return;
        _locked = want;
        doc.documentElement.classList.toggle('sc-scroll-locked', want);
        if (want) hideTip();
    }
    function scheduleLockSync() {
        if (!_lockTimer) _lockTimer = setTimeout(syncScrollLock, 32);
    }

    function scrollableAncestor(el, dy) {
        for (; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
            if (el.nodeType !== 1) continue;
            var tag = el.tagName;
            if (tag === 'TEXTAREA' || (tag === 'INPUT' && el.type === 'range')) return el;
            var cs = global.getComputedStyle(el);
            var canY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
            var canX = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
            if (canX) return el;
            if (canY) {
                var atTop = el.scrollTop <= 0;
                var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                if ((dy > 0 && atTop) || (dy < 0 && atBottom)) continue;
                return el;
            }
        }
        return null;
    }

    function initScrollLock() {
        new MutationObserver(scheduleLockSync).observe(doc.body, {
            subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open']
        });
        doc.addEventListener('transitionend', scheduleLockSync, true);
        scheduleLockSync();

        // Older iOS ignores overflow:hidden on the page, so drags that would reach the page behind a
        // pop-up are cancelled here. Drags inside a scrollable panel still work.
        var lastY = 0;
        doc.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1) lastY = e.touches[0].clientY;
        }, { passive: true });
        doc.addEventListener('touchmove', function (e) {
            if (!_locked || e.touches.length !== 1 || !e.cancelable) return;
            var y = e.touches[0].clientY;
            var dy = y - lastY;
            lastY = y;
            if (!scrollableAncestor(e.target, dy)) e.preventDefault();
        }, { passive: false });
    }

    // ── App feel: no page-style selection, callouts, drags, zoom or native tooltips ─
    var SELECTABLE_SEL = 'input, textarea, [contenteditable]:not([contenteditable="false"]), .sc-selectable, .view-field-value, .view-value';

    function initAppFeel() {
        doc.addEventListener('contextmenu', function (e) {
            if (e.shiftKey) return;
            if (e.target.closest && e.target.closest(SELECTABLE_SEL)) return;
            e.preventDefault();
        });
        doc.addEventListener('dragstart', function (e) {
            var t = e.target;
            if (t && t.nodeType === 1 && (t.tagName === 'IMG' || t.tagName === 'A') && t.getAttribute('draggable') !== 'true') e.preventDefault();
        });
        // iOS ignores user-scalable=no; photo lightboxes keep pinch so staff can inspect damage
        doc.addEventListener('gesturestart', function (e) {
            if (!(e.target.closest && e.target.closest('#photoLightbox, .lightbox'))) e.preventDefault();
        });
        initTooltips();
    }

    // Native title tooltips look like a web page; show a themed one instead (mouse only)
    var _tip = { el: null, timer: null, target: null };

    function hideTip() {
        clearTimeout(_tip.timer);
        _tip.target = null;
        if (_tip.el) _tip.el.classList.remove('show');
    }

    function showTip(target) {
        var text = target.getAttribute('data-sc-tip');
        if (!text || !doc.contains(target)) return;
        if (!_tip.el) {
            _tip.el = doc.createElement('div');
            _tip.el.className = 'sc-tip';
            _tip.el.setAttribute('aria-hidden', 'true');
            doc.body.appendChild(_tip.el);
        }
        var el = _tip.el;
        el.textContent = text;
        el.classList.remove('show', 'below');
        var r = target.getBoundingClientRect();
        var w = el.offsetWidth, h = el.offsetHeight;
        var top = r.top - h - 8;
        if (top < 8) { top = r.bottom + 8; el.classList.add('below'); }
        var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), global.innerWidth - w - 8);
        el.style.top = top + 'px';
        el.style.left = left + 'px';
        void el.offsetWidth;
        el.classList.add('show');
    }

    function initTooltips() {
        doc.addEventListener('pointerover', function (e) {
            if (e.pointerType && e.pointerType !== 'mouse') return;
            var t = e.target.closest && e.target.closest('[title], [data-sc-tip]');
            if (!t || t === _tip.target) return;
            if (t.hasAttribute('title')) {
                var title = t.getAttribute('title');
                t.removeAttribute('title');
                if (!title) return;
                t.setAttribute('data-sc-tip', title);
                if (!t.hasAttribute('aria-label') && !t.textContent.trim()) t.setAttribute('aria-label', title);
            }
            hideTip();
            _tip.target = t;
            _tip.timer = setTimeout(function () { if (_tip.target === t) showTip(t); }, 450);
        });
        doc.addEventListener('pointerout', function (e) {
            if (!_tip.target) return;
            if (e.relatedTarget && _tip.target.contains(e.relatedTarget)) return;
            hideTip();
        });
        doc.addEventListener('pointerdown', hideTip, true);
        doc.addEventListener('keydown', hideTip, true);
        global.addEventListener('scroll', hideTip, { passive: true, capture: true });
    }

    // ── Pull to refresh (touch screens only) ─────────────────────────────────────
    var PTR_THRESHOLD = 72;
    var PTR_MAX = 120;

    function somethingModalOpen() {
        return _locked || overlayOpen() ||
            !!doc.querySelector('.notif-panel.open, .account-dropdown.open') ||
            doc.body.style.overflow === 'hidden';
    }

    function pullToRefresh(onRefresh) {
        if (!('ontouchstart' in global) || typeof onRefresh !== 'function') return;
        if (global._scPtrBound) { global._scPtrHandler = onRefresh; return; }
        global._scPtrBound = true;
        global._scPtrHandler = onRefresh;

        var ind = doc.createElement('div');
        ind.className = 'sc-ptr';
        ind.setAttribute('aria-hidden', 'true');
        ind.innerHTML = '<span class="sc-ptr-icon">' + icon('refresh', 18) + '</span>';
        doc.body.appendChild(ind);

        var startY = null, startX = 0, pull = 0, busy = false, armed = false;

        function reset() {
            ind.classList.remove('pulling', 'ready');
            ind.style.transform = '';
            ind.style.opacity = '';
            startY = null;
            pull = 0;
            armed = false;
        }

        doc.addEventListener('touchstart', function (e) {
            if (busy || e.touches.length !== 1) return;
            if ((global.scrollY || doc.documentElement.scrollTop) > 0) return;
            if (somethingModalOpen()) return;
            if (e.target.closest && e.target.closest('input, textarea, select, [data-no-ptr]')) return;
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
        }, { passive: true });

        doc.addEventListener('touchmove', function (e) {
            if (startY === null || busy) return;
            var dy = e.touches[0].clientY - startY;
            var dx = Math.abs(e.touches[0].clientX - startX);
            if (dy <= 0 || dx > dy || (global.scrollY || doc.documentElement.scrollTop) > 0) {
                if (pull) reset(); else startY = null;
                return;
            }
            pull = Math.min(PTR_MAX, dy * 0.5);
            ind.classList.add('pulling');
            ind.style.opacity = String(Math.min(1, pull / 40));
            ind.style.transform = 'translate(-50%,' + pull + 'px) rotate(' + (pull * 3) + 'deg)';
            var nowArmed = pull >= PTR_THRESHOLD;
            if (nowArmed !== armed) {
                armed = nowArmed;
                ind.classList.toggle('ready', armed);
                if (armed) tap('light');
            }
        }, { passive: true });

        function end() {
            if (startY === null) return;
            if (!armed) { reset(); return; }
            busy = true;
            startY = null;
            ind.classList.remove('pulling', 'ready');
            ind.classList.add('refreshing');
            ind.style.transform = 'translate(-50%,' + (PTR_THRESHOLD - 12) + 'px)';
            ind.style.opacity = '1';
            Promise.resolve()
                .then(function () { return global._scPtrHandler(); })
                .catch(function (err) { console.warn('[PTR] refresh failed', err); })
                .then(function () {
                    ind.classList.remove('refreshing');
                    ind.classList.add('done');
                    tap('success');
                    setTimeout(function () {
                        ind.classList.remove('done');
                        busy = false;
                        reset();
                    }, 260);
                });
        }

        doc.addEventListener('touchend', end, { passive: true });
        doc.addEventListener('touchcancel', function () { if (!busy) reset(); }, { passive: true });
    }

    // ── Global search ────────────────────────────────────────────────────────────
    var S = {
        el: null, input: null, list: null,
        results: [], active: 0,
        jobs: null, jobsAt: 0, jobsLoading: null,
        orders: null, ordersLoading: null
    };

    var JOB_STATUS_LABEL = {
        received: 'Received', fixing: 'Repairing', testing: 'Testing', ready: 'Ready',
        unsuccessful: 'No Fix', abandoned: 'Abandoned', resolved: 'Picked Up'
    };

    function jobStatusKey(j) {
        var s = String(j.status || '').toLowerCase();
        if (s.indexOf('abandoned') !== -1) return 'abandoned';
        if (/fixing|repairing|work/.test(s)) return 'fixing';
        if (/testing|qc|checking/.test(s)) return 'testing';
        if (/completed|ready|pickup/.test(s)) return 'ready';
        if (/unsuccessful|no fix/.test(s)) return 'unsuccessful';
        if (/resolved|handed over/.test(s)) return 'resolved';
        return 'received';
    }

    function cachedJobs() {
        try { return JSON.parse(localStorage.getItem('sc_cache_jobs') || 'null'); } catch (_) { return null; }
    }

    // Current Jobs keeps its list in a top-level `let allJobs`, which is shared by name but isn't a window property
    function pageJobs() {
        try { return typeof allJobs !== 'undefined' && Array.isArray(allJobs) && allJobs.length ? allJobs : null; } catch (_) { return null; }
    }

    function ensureJobs() {
        if (!S.jobs) S.jobs = pageJobs() || cachedJobs() || [];
        if (S.jobsLoading || Date.now() - S.jobsAt < 60000 || typeof global.apiGet !== 'function') return;
        S.jobsLoading = global.apiGet({ action: 'list' }).then(function (d) {
            S.jobs = (d && d.jobs) || S.jobs;
            S.jobsAt = Date.now();
            try { localStorage.setItem('sc_cache_jobs', JSON.stringify(S.jobs)); } catch (_) {}
            if (S.el && S.el.classList.contains('open')) renderSearch();
        }).catch(function () {}).then(function () { S.jobsLoading = null; });
    }

    function ensureOrders() {
        if (S.orders || S.ordersLoading || typeof global.apiGet !== 'function') return;
        S.ordersLoading = global.apiGet({ action: 'listorders' }).then(function (d) {
            S.orders = (d && d.orders) || [];
            if (S.el && S.el.classList.contains('open')) renderSearch();
        }).catch(function () { S.orders = []; }).then(function () { S.ordersLoading = null; });
    }

    function pageCommands() {
        var links = (global.SCV5 && global.SCV5.visibleLinks) || [];
        var cmds = links.map(function (l) {
            return { kind: 'page', icon: l.icon, title: l.label, sub: 'Go to page', href: l.href, keywords: l.label };
        });
        var role = typeof global.getUserRole === 'function' ? global.getUserRole() : 'technician';
        cmds.unshift({ kind: 'action', icon: 'plus', title: 'Log a new repair', sub: 'New Job', href: 'new-job.html', keywords: 'new job repair create intake' });
        if (role !== 'technician') {
            cmds.unshift({ kind: 'action', icon: 'dollar', title: 'Start a new sale', sub: 'Sales', href: 'sales.html#new', keywords: 'new sale checkout pos' });
        }
        cmds.push({ kind: 'action', icon: 'help', title: 'Show tips for this page', sub: 'Tutorial', run: function () { startTour(true); }, keywords: 'help tour tutorial tips guide' });
        return cmds;
    }

    function scoreText(hay, q) {
        hay = String(hay || '').toLowerCase();
        if (!hay) return 0;
        if (hay === q) return 100;
        if (hay.indexOf(q) === 0) return 60;
        if (hay.indexOf(' ' + q) !== -1) return 40;
        if (hay.indexOf(q) !== -1) return 20;
        return 0;
    }

    function searchJobs(q) {
        var digits = q.replace(/\D/g, '');
        var idQuery = q.replace(/^#/, '');
        var out = [];
        (S.jobs || []).forEach(function (j) {
            var id = String(j.id);
            var s = 0;
            if (id === idQuery) s = 200;
            else if (/^\d+$/.test(idQuery) && id.indexOf(idQuery) === 0) s = 90;
            var nameScore = scoreText(j.customerName, q);
            s = Math.max(s,
                nameScore ? nameScore + 5 : 0,
                scoreText(j.device, q),
                scoreText(j.issue, q) - 5,
                digits.length >= 3 && String(j.customerPhone || '').replace(/\D/g, '').indexOf(digits) !== -1 ? 70 : 0);
            if (s > 0) out.push({ j: j, s: s });
        });
        out.sort(function (a, b) { return b.s - a.s || Number(b.j.id) - Number(a.j.id); });
        return out.slice(0, 8).map(function (r) {
            var j = r.j, key = jobStatusKey(j);
            return {
                kind: 'job', icon: 'smartphone', id: j.id,
                title: (j.device || 'Device') + ' · #' + j.id,
                sub: (j.customerName || 'Walk-in') + (j.customerPhone ? ' · ' + j.customerPhone : ''),
                badge: JOB_STATUS_LABEL[key], badgeKey: key,
                href: 'current-jobs.html?job=' + encodeURIComponent(j.id)
            };
        });
    }

    function searchOrders(q) {
        if (!S.orders) return [];
        var digits = q.replace(/\D/g, '');
        var out = [];
        S.orders.forEach(function (o) {
            var s = Math.max(
                scoreText(o.orderNumber, q) * 2,
                scoreText(o.item, q),
                scoreText(o.customer, q),
                digits.length >= 3 && String(o.phone || '').replace(/\D/g, '').indexOf(digits) !== -1 ? 60 : 0);
            if (s > 0) out.push({ o: o, s: s });
        });
        out.sort(function (a, b) { return b.s - a.s; });
        return out.slice(0, 4).map(function (r) {
            var o = r.o;
            return {
                kind: 'order', icon: 'cart', title: (o.item || 'Special order') + ' · ' + o.orderNumber,
                sub: (o.customer || o.requestedBy || '') + (o.status ? ' · ' + o.status : ''),
                href: 'special-orders.html?order=' + encodeURIComponent(o.orderNumber)
            };
        });
    }

    function renderSearch() {
        var q = S.input.value.trim().toLowerCase();
        var groups = [];
        if (!q) {
            groups.push({ label: 'Quick actions', items: pageCommands() });
            var recent = (S.jobs || []).slice(0, 5).map(function (j) {
                var key = jobStatusKey(j);
                return {
                    kind: 'job', icon: 'smartphone', id: j.id,
                    title: (j.device || 'Device') + ' · #' + j.id,
                    sub: j.customerName || 'Walk-in',
                    badge: JOB_STATUS_LABEL[key], badgeKey: key,
                    href: 'current-jobs.html?job=' + encodeURIComponent(j.id)
                };
            });
            if (recent.length) groups.push({ label: 'Latest jobs', items: recent });
        } else {
            var jobs = searchJobs(q);
            var orders = searchOrders(q);
            var cmds = pageCommands().filter(function (c) { return scoreText(c.title + ' ' + c.keywords, q) > 0; }).slice(0, 4);
            var jobGroup = jobs.length ? { label: 'Jobs', items: jobs } : null;
            var orderGroup = orders.length ? { label: 'Special orders', items: orders } : null;
            if (/^so\b|^so-/.test(q)) { if (orderGroup) groups.push(orderGroup); if (jobGroup) groups.push(jobGroup); }
            else { if (jobGroup) groups.push(jobGroup); if (orderGroup) groups.push(orderGroup); }
            if (cmds.length) groups.push({ label: 'Go to', items: cmds });
        }

        S.results = [];
        var html = '';
        groups.forEach(function (g) {
            html += '<div class="sc-search-group" role="presentation">' + esc(g.label) + '</div>';
            g.items.forEach(function (it) {
                var idx = S.results.length;
                S.results.push(it);
                html += '<div class="sc-search-item" role="option" id="scSearchOpt' + idx + '" data-idx="' + idx + '">' +
                    '<span class="sc-search-item-icon">' + icon(it.icon, 17) + '</span>' +
                    '<span class="sc-search-item-text"><span class="sc-search-item-title">' + esc(it.title) + '</span>' +
                    (it.sub ? '<span class="sc-search-item-sub">' + esc(it.sub) + '</span>' : '') + '</span>' +
                    (it.badge ? '<span class="sc-search-badge is-' + esc(it.badgeKey) + '">' + esc(it.badge) + '</span>' : '') +
                    '<span class="sc-search-item-go">' + icon('chevronRight', 14) + '</span></div>';
            });
        });

        if (!S.results.length) {
            var loading = S.jobsLoading || S.ordersLoading;
            html = '<div class="sc-search-empty">' + (loading
                ? 'Searching…'
                : 'No matches for “' + esc(S.input.value.trim()) + '”. Try a job number, name or phone.') + '</div>';
        }
        S.list.innerHTML = html;
        S.active = 0;
        highlightSearch();
    }

    function highlightSearch() {
        var items = S.list.querySelectorAll('.sc-search-item');
        for (var i = 0; i < items.length; i++) {
            var on = i === S.active;
            items[i].classList.toggle('active', on);
            items[i].setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) {
                S.input.setAttribute('aria-activedescendant', items[i].id);
                var top = items[i].offsetTop, bottom = top + items[i].offsetHeight;
                if (top < S.list.scrollTop + 28) S.list.scrollTop = Math.max(0, top - 28);
                else if (bottom > S.list.scrollTop + S.list.clientHeight) S.list.scrollTop = bottom - S.list.clientHeight;
            }
        }
    }

    function chooseResult(it) {
        if (!it) return;
        closeSearch();
        tap('light');
        if (it.run) { setTimeout(it.run, 120); return; }
        if (it.kind === 'job' && currentPage() === 'current-jobs.html' &&
            typeof global.openViewModal === 'function' && typeof global.getJob === 'function' && global.getJob(it.id)) {
            global.openViewModal(String(it.id));
            return;
        }
        global.location.href = it.href;
    }

    function buildSearch() {
        var el = doc.createElement('div');
        el.className = 'sc-search';
        el.id = 'scSearch';
        el.innerHTML =
            '<div class="sc-search-backdrop" data-close></div>' +
            '<div class="sc-search-panel" role="dialog" aria-modal="true" aria-label="Search">' +
            '<div class="sc-search-field">' + icon('search', 18) +
            '<input type="search" class="sc-search-input" placeholder="Search jobs, customers, phone, orders…" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="scSearchList" enterkeyhint="go">' +
            '<button type="button" class="sc-search-cancel" data-close>Cancel</button>' +
            '<kbd class="sc-kbd sc-search-esc">Esc</kbd></div>' +
            '<div class="sc-search-list" id="scSearchList" role="listbox"></div>' +
            '<div class="sc-search-foot"><span><kbd class="sc-kbd">↑</kbd><kbd class="sc-kbd">↓</kbd> to move</span>' +
            '<span><kbd class="sc-kbd">Enter</kbd> to open</span>' +
            '<span><kbd class="sc-kbd">' + (IS_MAC ? '⌘' : 'Ctrl') + '</kbd><kbd class="sc-kbd">K</kbd> anywhere</span></div>' +
            '</div>';
        doc.body.appendChild(el);
        S.el = el;
        S.input = el.querySelector('.sc-search-input');
        S.list = el.querySelector('.sc-search-list');

        el.addEventListener('click', function (e) {
            if (e.target.closest('[data-close]')) closeSearch();
        });
        S.list.addEventListener('mousedown', function (e) { e.preventDefault(); });
        S.list.addEventListener('click', function (e) {
            var row = e.target.closest('.sc-search-item');
            if (row) chooseResult(S.results[Number(row.getAttribute('data-idx'))]);
        });
        S.list.addEventListener('mousemove', function (e) {
            var row = e.target.closest('.sc-search-item');
            if (!row) return;
            var idx = Number(row.getAttribute('data-idx'));
            if (idx !== S.active) { S.active = idx; highlightSearch(); }
        });
        var t = null;
        S.input.addEventListener('input', function () {
            clearTimeout(t);
            t = setTimeout(renderSearch, 60);
        });
        S.input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!S.results.length) return;
                S.active = (S.active + (e.key === 'ArrowDown' ? 1 : -1) + S.results.length) % S.results.length;
                highlightSearch();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                chooseResult(S.results[S.active]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
            }
        });
    }

    var _searchReturnFocus = null;
    function openSearch() {
        if (!isLoggedIn() || T || doc.querySelector('.sc-intro')) return;
        if (!S.el) buildSearch();
        if (S.el.classList.contains('open')) { S.input.focus(); return; }
        _searchReturnFocus = doc.activeElement;
        S.jobs = null;
        ensureJobs();
        ensureOrders();
        S.input.value = '';
        renderSearch();
        S.el.classList.add('open');
        doc.documentElement.classList.add('sc-search-lock');
        S.input.focus();
        tap('light');
    }

    function closeSearch() {
        if (!S.el || !S.el.classList.contains('open')) return;
        S.el.classList.remove('open');
        doc.documentElement.classList.remove('sc-search-lock');
        S.input.blur();
        if (_searchReturnFocus && _searchReturnFocus.focus && doc.contains(_searchReturnFocus)) {
            try { _searchReturnFocus.focus({ preventScroll: true }); } catch (_) {}
        }
    }

    function isTypingTarget(t) {
        if (!t) return false;
        var tag = (t.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    }

    doc.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
            if (!isLoggedIn()) return;
            e.preventDefault();
            if (S.el && S.el.classList.contains('open')) closeSearch(); else openSearch();
        } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target) && isLoggedIn() &&
            !doc.querySelector('.modal-overlay.open, .sc-tour-layer')) {
            e.preventDefault();
            openSearch();
        }
    });

    doc.addEventListener('click', function (e) {
        var trigger = e.target.closest && e.target.closest('[data-sc-search]');
        if (trigger) { e.preventDefault(); openSearch(); }
    });

    // ── First-run tips ───────────────────────────────────────────────────────────
    var TOUR_KEY = 'scToursSeen';

    // Each step: sel (desktop) / msel (phone, optional), title, body. Steps whose target isn't visible are skipped.
    var TOURS = {
        'index.html': [
            { sel: '[data-tour="search"]', msel: '.sc-topbar-search', title: 'Find anything fast', body: 'Search any job by number, customer name or phone — plus special orders and pages. On a keyboard, press ' + (IS_MAC ? '⌘' : 'Ctrl') + '+K from anywhere.', mbody: 'Tap here on any page to find a job by number, customer name or phone — plus special orders and pages.' },
            { sel: '#scV5HeroActions', title: 'Your shortcuts', body: 'Start a sale, log a repair, open the jobs board or count the drawer at end of day.' },
            { sel: '.stats', title: 'Tap a number', body: 'Every card opens Current Jobs already filtered to what it counts.' },
            { sel: '#recentTabs', title: 'Recent jobs, your way', body: 'Switch between the latest jobs, jobs you own, pickups, ones about to expire and stale repairs. Tap any job to open it.' },
            { sel: '[data-tour="tab-more"]', title: 'Everything else', body: 'Special orders, inventory, settings and more live under More.', mobileOnly: true }
        ],
        'current-jobs.html': [
            { sel: '#searchInput', title: 'Search this board', body: 'Type a job number, name, phone, device or technician to narrow the list instantly.' },
            { sel: '#statusFilter', title: 'Filter by status', body: 'Show only pickups, jobs in progress, ones expiring soon, stale repairs or your own jobs.' },
            { sel: '#jobsList .job-row', title: 'Open a job', body: 'Use the eye to see full details, the pencil to update status or invoice, and the bin to delete — you’ll get a few seconds to undo.' },
            { sel: '#refreshBtn', title: 'Always up to date', body: 'The board refreshes every minute. On a phone, you can also pull down from the top to refresh.' }
        ],
        'new-job.html': [
            { sel: '#njStepper', title: 'Four quick steps', body: 'Customer, device, condition, then review. Your progress is saved if you leave the page.' },
            { sel: '#customerName', title: 'Start with the customer', body: 'Name and phone are all you need here — errors show right next to the field.' }
        ],
        'sales.html': [
            { sel: '[data-tour="sales-hero"]', title: 'Start here', body: 'New Sale rings up a walk-in; Pickup collects payment for a finished repair.' },
            { sel: '[data-tour="tab-more"]', title: 'Other pages', body: 'Jobs, orders and inventory are one tap away under More.', mobileOnly: true }
        ],
        'special-orders.html': [
            { sel: '.btn-new-order', title: 'Log a request', body: 'Record a part or accessory a customer asked for, with their phone so you can call when it arrives.' },
            { sel: '#filterStatus', title: 'Open orders first', body: 'Closed orders are hidden by default. Switch to “All statuses” to see the full history.' }
        ],
        'inventory.html': [
            { sel: '#statsRow', title: 'Tap to filter', body: 'Tap Low Stock or Out of Stock to see just those items. Tap again to clear.' },
            { sel: '#searchInput', title: 'Search or scan', body: 'Type a name or SKU, or scan a barcode straight into this box.' }
        ],
        'statistics.html': [
            { sel: '.date-bar', title: 'Pick a period', body: 'Switch between today, this week, this month or a custom range. Everything below updates.' }
        ],
        'settings.html': [
            { sel: '#tipsRow', title: 'Tips any time', body: 'Replay these tips for every page whenever you like.' }
        ]
    };

    function toursSeen() {
        try { return JSON.parse(localStorage.getItem(TOUR_KEY) || '{}') || {}; } catch (_) { return {}; }
    }

    function markSeen(page) {
        var seen = toursSeen();
        seen[page] = 1;
        try { localStorage.setItem(TOUR_KEY, JSON.stringify(seen)); } catch (_) {}
    }

    function resetTours(exceptCurrent) {
        try { localStorage.removeItem(TOUR_KEY); } catch (_) {}
        if (exceptCurrent) markSeen(currentPage());
    }

    function findTarget(step) {
        var mobile = isMobile();
        if (step.mobileOnly && !mobile) return null;
        var sel = mobile && step.msel !== undefined ? step.msel : step.sel;
        if (!sel) return null;
        var nodes = doc.querySelectorAll(sel);
        for (var i = 0; i < nodes.length; i++) {
            var r = nodes[i].getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && global.getComputedStyle(nodes[i]).visibility !== 'hidden') return nodes[i];
        }
        return null;
    }

    var T = null;

    function endTour(markAll, finished) {
        if (!T) return;
        var onEnd = T.onEnd;
        if (markAll) {
            var seen = toursSeen();
            Object.keys(TOURS).forEach(function (p) { seen[p] = 1; });
            try { localStorage.setItem(TOUR_KEY, JSON.stringify(seen)); } catch (_) {}
        } else {
            markSeen(T.page);
        }
        global.removeEventListener('resize', T.onMove);
        global.removeEventListener('scroll', T.onMove, true);
        doc.removeEventListener('keydown', T.onKey, true);
        var layer = T.layer;
        layer.classList.remove('show');
        setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 220);
        T = null;
        if (typeof onEnd === 'function') onEnd(!!finished);
    }

    function nudgeTour() {
        if (!T) return;
        var card = T.layer.querySelector('.sc-tour-card');
        card.classList.remove('nudge');
        void card.offsetWidth;
        card.classList.add('nudge');
        tap('light');
    }

    function placeTour() {
        if (!T) return;
        var target = T.steps[T.i].target;
        var r = target.getBoundingClientRect();
        var pad = 6;
        var spot = T.layer.querySelector('.sc-tour-spot');
        spot.style.left = (r.left - pad) + 'px';
        spot.style.top = (r.top - pad) + 'px';
        spot.style.width = (r.width + pad * 2) + 'px';
        spot.style.height = (r.height + pad * 2) + 'px';

        var card = T.layer.querySelector('.sc-tour-card');
        var vw = global.innerWidth, vh = global.innerHeight;
        var cw = Math.min(340, vw - 24);
        card.style.width = cw + 'px';
        var ch = card.offsetHeight;
        var below = r.bottom + pad + 12;
        var above = r.top - pad - 12 - ch;
        var top = below + ch <= vh - 12 ? below : (above >= 12 ? above : Math.max(12, vh - ch - 12));
        var left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
        card.style.top = top + 'px';
        card.style.left = left + 'px';
    }

    function showStep(i) {
        if (!T) return;
        T.i = i;
        var step = T.steps[i];
        var card = T.layer.querySelector('.sc-tour-card');
        card.querySelector('.sc-tour-count').textContent = T.onboarding ? 'Welcome to V5' : (i + 1) + ' of ' + T.steps.length;
        var dots = card.querySelectorAll('.sc-tour-dots i');
        for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('on', d === i);
        card.querySelector('.sc-tour-title').textContent = step.title;
        card.querySelector('.sc-tour-body').textContent = step.body;
        card.querySelector('.sc-tour-back').style.visibility = i === 0 ? 'hidden' : 'visible';
        var next = card.querySelector('.sc-tour-next');
        next.textContent = i === T.steps.length - 1 ? (T.onboarding ? 'Finish' : 'Done') : 'Next';
        var r = step.target.getBoundingClientRect();
        if (r.top < 70 || r.bottom > global.innerHeight - 90) {
            step.target.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        card.classList.remove('in');
        void card.offsetWidth;
        placeTour();
        card.classList.add('in');
        next.focus({ preventScroll: true });
    }

    // opts.onboarding: the V5 welcome tour — can't be dismissed by a stray tap or Esc, only Skip or Finish.
    // opts.onEnd(finished) runs once the layer is gone.
    function startTour(force, opts) {
        opts = opts || {};
        var page = currentPage();
        var defs = TOURS[page];
        if (!defs || T || !isLoggedIn()) return false;
        if (!force && toursSeen()[page]) return false;
        var steps = [];
        defs.forEach(function (d) {
            var target = findTarget(d);
            if (target) steps.push({ title: d.title, body: (isMobile() && d.mbody) || d.body, target: target });
        });
        if (opts.onboarding && steps.length) {
            steps[steps.length - 1] = {
                title: steps[steps.length - 1].title,
                body: steps[steps.length - 1].body + ' The first time you open any other page, you’ll get a short tip like this.',
                target: steps[steps.length - 1].target
            };
        }
        if (!steps.length) {
            if (force && !opts.onboarding) toast('No tips for this page yet.', 'info');
            return false;
        }
        closeSearch();

        var dotsHtml = '';
        if (opts.onboarding) {
            dotsHtml = '<span class="sc-tour-dots" aria-hidden="true">';
            for (var n = 0; n < steps.length; n++) dotsHtml += '<i></i>';
            dotsHtml += '</span>';
        }

        var layer = doc.createElement('div');
        layer.className = 'sc-tour-layer' + (opts.onboarding ? ' is-onboarding' : '');
        layer.innerHTML =
            '<div class="sc-tour-block"></div>' +
            '<div class="sc-tour-spot"></div>' +
            '<div class="sc-tour-card" role="dialog" aria-modal="true" aria-labelledby="scTourTitle">' +
            '<div class="sc-tour-count"></div>' +
            '<div class="sc-tour-title" id="scTourTitle"></div>' +
            '<div class="sc-tour-body"></div>' +
            '<div class="sc-tour-actions">' +
            '<button type="button" class="sc-tour-off">' + (opts.onboarding ? 'Skip tour' : 'Turn off tips') + '</button>' +
            dotsHtml +
            '<span class="sc-tour-spacer"></span>' +
            '<button type="button" class="sc-tour-back">Back</button>' +
            '<button type="button" class="sc-tour-next">Next</button>' +
            '</div></div>';
        doc.body.appendChild(layer);

        T = { page: page, steps: steps, i: 0, layer: layer, onboarding: !!opts.onboarding, onEnd: opts.onEnd };
        T.onMove = function () { if (T) placeTour(); };
        T.onKey = function (e) {
            if (!T) return;
            if (e.key === 'Escape') { e.preventDefault(); if (T.onboarding) nudgeTour(); else endTour(false); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); layer.querySelector('.sc-tour-next').click(); }
            else if (e.key === 'ArrowLeft' && T.i > 0) { e.preventDefault(); showStep(T.i - 1); }
            else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); }
        };
        layer.querySelector('.sc-tour-next').addEventListener('click', function () {
            if (!T) return;
            if (T.i >= T.steps.length - 1) { tap('success'); endTour(false, true); }
            else { tap('light'); showStep(T.i + 1); }
        });
        layer.querySelector('.sc-tour-back').addEventListener('click', function () { if (T && T.i > 0) showStep(T.i - 1); });
        layer.querySelector('.sc-tour-off').addEventListener('click', function () {
            if (T && T.onboarding) { endTour(false, false); return; }
            endTour(true);
            toast('Tips turned off. Replay them any time from Settings.', 'info');
        });
        layer.querySelector('.sc-tour-block').addEventListener('click', function () {
            if (T && T.onboarding) nudgeTour(); else endTour(false);
        });
        global.addEventListener('resize', T.onMove, { passive: true });
        global.addEventListener('scroll', T.onMove, { passive: true, capture: true });
        doc.addEventListener('keydown', T.onKey, true);

        void layer.offsetWidth;
        setTimeout(function () {
            layer.classList.add('show');
            showStep(0);
        }, 16);
        return true;
    }

    // Runs fn once the splash, login screen, pop-ups and loading placeholders are all gone
    function whenIdle(fn) {
        var tries = 0;
        (function wait() {
            tries++;
            var splash = doc.getElementById('splash-screen');
            var splashUp = splash && !splash.classList.contains('hidden');
            var busy = !isLoggedIn() || splashUp || somethingModalOpen() || doc.querySelector('.sc-skel-list');
            if (busy) { if (tries < 450) setTimeout(wait, tries < 40 ? 400 : 1500); return; }
            setTimeout(function () {
                if (isLoggedIn() && !somethingModalOpen()) fn(); else wait();
            }, 500);
        })();
    }

    function autoStartTour() {
        if (toursSeen()[currentPage()]) return;
        whenIdle(function () { if (!toursSeen()[currentPage()]) startTour(false); });
    }

    // ── V5 welcome: animated intro, then an onboarding tour ──────────────────────
    // Stage per user in scV5Onboard: missing = never welcomed, 'tour' = intro seen but tour not finished
    // (resumes on next load), 'done'. Page tips are per device and only run once the welcome is done,
    // and the page toured during onboarding is marked seen so its tip never repeats.
    var ONBOARD_KEY = 'scV5Onboard';

    function onboardStage() {
        try { return (JSON.parse(localStorage.getItem(ONBOARD_KEY) || '{}') || {})[currentUser()] || ''; } catch (_) { return ''; }
    }

    function setOnboardStage(stage) {
        var user = currentUser();
        if (!user) return;
        var all;
        try { all = JSON.parse(localStorage.getItem(ONBOARD_KEY) || '{}') || {}; } catch (_) { all = {}; }
        all[user] = stage;
        try { localStorage.setItem(ONBOARD_KEY, JSON.stringify(all)); } catch (_) {}
    }

    function prefersReducedMotion() {
        return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function playIntro(onChoice) {
        if (doc.querySelector('.sc-intro')) return;
        closeSearch();
        var el = doc.createElement('div');
        el.className = 'sc-intro';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'scIntroTitle');
        el.innerHTML =
            '<div class="sc-intro-glow" aria-hidden="true"><span></span><span></span><span></span></div>' +
            '<div class="sc-intro-stage">' +
            '<div class="sc-intro-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
            '<div class="sc-intro-eyebrow">ServiCell Staff Portal</div>' +
            '<h1 class="sc-intro-title" id="scIntroTitle"><span class="sc-intro-v">V</span><span class="sc-intro-5">5</span></h1>' +
            '<p class="sc-intro-sub">Everything you use every day — faster, calmer and built for the counter.</p>' +
            '<div class="sc-intro-actions">' +
            '<button type="button" class="sc-intro-go">Show me around</button>' +
            '<button type="button" class="sc-intro-skip">Skip for now</button>' +
            '</div></div>';
        doc.body.appendChild(el);

        var chosen = false;
        function choose(go) {
            if (chosen) return;
            chosen = true;
            tap(go ? 'success' : 'light');
            el.classList.add('leaving');
            setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
                if (typeof onChoice === 'function') onChoice(go);
            }, prefersReducedMotion() ? 120 : 520);
        }
        var go = el.querySelector('.sc-intro-go');
        go.addEventListener('click', function () { choose(true); });
        el.querySelector('.sc-intro-skip').addEventListener('click', function () { choose(false); });
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                // Keep focus inside the intro
                var skip = el.querySelector('.sc-intro-skip');
                if (e.shiftKey && doc.activeElement === go) { e.preventDefault(); skip.focus(); }
                else if (!e.shiftKey && doc.activeElement === skip) { e.preventDefault(); go.focus(); }
            }
        });

        void el.offsetWidth;
        setTimeout(function () {
            el.classList.add('play');
            setTimeout(function () { try { go.focus({ preventScroll: true }); } catch (_) {} }, prefersReducedMotion() ? 50 : 2100);
        }, 20);
    }

    function runOnboardingTour() {
        setOnboardStage('tour');
        var started = startTour(true, {
            onboarding: true,
            onEnd: function (finished) {
                setOnboardStage('done');
                toast(finished ? 'You’re all set. Tips will pop up the first time you open each page.'
                    : 'Tour skipped. You can replay it any time from Settings.', finished ? 'success' : 'info');
            }
        });
        if (!started) setOnboardStage('done');
    }

    function startWelcome() {
        var stage = onboardStage();
        if (stage === 'done') { autoStartTour(); return; }
        whenIdle(function () {
            if (onboardStage() === 'done') { autoStartTour(); return; }
            if (onboardStage() === 'tour') { runOnboardingTour(); return; }
            playIntro(function (go) {
                if (go) runOnboardingTour();
                else { setOnboardStage('done'); autoStartTour(); }
            });
        });
    }

    // Settings → "Watch the V5 intro": plays the intro, then the welcome tour on the dashboard
    function replayIntro() {
        playIntro(function (go) {
            if (!go) return;
            setOnboardStage('tour');
            if (currentPage() === 'index.html') runOnboardingTour();
            else global.location.href = 'index.html';
        });
    }

    // ── Boot ─────────────────────────────────────────────────────────────────────
    function boot() {
        initScrollLock();
        initAppFeel();
        if (isLoggedIn()) { startWelcome(); return; }
        // Signing in on the dashboard doesn't reload the page; the shell re-renders and marks the body
        var obs = new MutationObserver(function () {
            if (!isLoggedIn() || !doc.body.classList.contains('sc-logged-in')) return;
            obs.disconnect();
            startWelcome();
        });
        obs.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
    else boot();

    global.SCQol = {
        toast: toast,
        undoToast: undoToast,
        commitUndo: commitUndo,
        skeletonRows: skeletonRows,
        pullToRefresh: pullToRefresh,
        openSearch: openSearch,
        closeSearch: closeSearch,
        startTour: startTour,
        resetTours: resetTours,
        replayIntro: replayIntro
    };
})(window);
