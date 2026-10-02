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
        // Row highlights and result lists change constantly and never open or close a layer; re-checking
        // for them forces a style and layout pass over the whole page on every key press.
        new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var t = records[i].target;
                if (t.nodeType !== 1 || !t.closest('.sc-search-list, .sc-tip')) { scheduleLockSync(); return; }
            }
        }).observe(doc.body, {
            subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open']
        });
        doc.addEventListener('transitionend', function (e) {
            if (e.target.nodeType === 1 && e.target.closest('.sc-search-list, .sc-tip')) return;
            scheduleLockSync();
        }, true);
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
            if (S.el && S.el.classList.contains('open')) renderSearch(true);
        }).catch(function () {}).then(function () { S.jobsLoading = null; });
    }

    function ensureOrders() {
        if (S.orders || S.ordersLoading || typeof global.apiGet !== 'function') return;
        S.ordersLoading = global.apiGet({ action: 'listorders' }).then(function (d) {
            S.orders = (d && d.orders) || [];
            if (S.el && S.el.classList.contains('open')) renderSearch(true);
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

    // fromData: a background refresh finished, so keep the list steady instead of jumping to the top
    function renderSearch(fromData) {
        var q = S.input.value.trim().toLowerCase();
        var keepKey = fromData === true ? resultKey(S.results[S.active]) : '';
        var keepScroll = fromData === true ? S.list.scrollTop : 0;
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
        if (fromData === true && html === S.lastHtml) return;
        S.lastHtml = html;
        S.list.innerHTML = html;
        S.active = 0;
        if (keepKey) {
            for (var k = 0; k < S.results.length; k++) {
                if (resultKey(S.results[k]) === keepKey) { S.active = k; break; }
            }
            S.list.scrollTop = keepScroll;
            highlightSearch(S.active > 0);
            return;
        }
        S.list.scrollTop = 0;
        highlightSearch(false);
    }

    // Only the old and new rows are touched, and the list scrolls just enough to keep the row in view
    // (the group label above the first row of a group stays visible too).
    function highlightSearch(keepInView) {
        var prev = S.list.querySelector('.sc-search-item.active');
        var row = S.list.querySelector('#scSearchOpt' + S.active);
        if (prev && prev !== row) {
            prev.classList.remove('active');
            prev.setAttribute('aria-selected', 'false');
        }
        if (!row) { S.input.removeAttribute('aria-activedescendant'); return; }
        row.classList.add('active');
        row.setAttribute('aria-selected', 'true');
        S.input.setAttribute('aria-activedescendant', row.id);
        if (keepInView === false) return;
        var list = S.list;
        var lr = list.getBoundingClientRect(), rr = row.getBoundingClientRect();
        var head = row.previousElementSibling && row.previousElementSibling.classList.contains('sc-search-group')
            ? row.previousElementSibling.offsetHeight : 0;
        var pad = 6;
        if (S.active === 0) list.scrollTop = 0;
        else if (rr.top - head - pad < lr.top) list.scrollTop += rr.top - head - pad - lr.top;
        else if (rr.bottom + pad > lr.bottom) list.scrollTop += rr.bottom + pad - lr.bottom;
    }

    function resultKey(it) { return it ? it.kind + ':' + (it.id || it.href || it.title) : ''; }

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
        // Scrolling (wheel or arrow keys) slides rows under a still pointer and the browser reports that as
        // mousemove; only a pointer that actually moved may take the highlight.
        var lastPt = null;
        S.list.addEventListener('mousemove', function (e) {
            var moved = !lastPt || lastPt.x !== e.clientX || lastPt.y !== e.clientY;
            lastPt = { x: e.clientX, y: e.clientY };
            if (!moved) return;
            var row = e.target.closest('.sc-search-item');
            if (!row) return;
            var idx = Number(row.getAttribute('data-idx'));
            if (idx !== S.active) { S.active = idx; highlightSearch(false); }
        });
        S.list.addEventListener('mouseleave', function () { lastPt = null; });
        S.input.addEventListener('input', function () { renderSearch(); });
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
        if (!isLoggedIn() || T || doc.querySelector('.sc-intro, .sc-tour-layer')) return;
        if (!S.el) buildSearch();
        if (S.el.classList.contains('open')) { S.input.focus(); return; }
        _searchReturnFocus = doc.activeElement;
        S.jobs = null;
        ensureJobs();
        ensureOrders();
        S.input.value = '';
        S.lastHtml = null;
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
    // tour: true marks the one or two steps the welcome tour shows; page tips (and Replay) show them all.
    var TOURS = {
        'index.html': [
            { tour: true, sel: '[data-tour="search"]', msel: '.sc-topbar-search', title: 'Find anything fast', body: 'Search any job by number, customer name or phone — plus special orders and pages. On a keyboard, press ' + (IS_MAC ? '⌘' : 'Ctrl') + '+K from anywhere.', mbody: 'Tap here on any page to find a job by number, customer name or phone — plus special orders and pages.' },
            { sel: '#scV5HeroActions', title: 'Your shortcuts', body: 'Start a sale, log a repair, open the jobs board or count the drawer at end of day.' },
            { tour: true, sel: '.stats', title: 'Tap a number', body: 'Every card opens Current Jobs already filtered to what it counts.' },
            { sel: '#recentTabs', title: 'Recent jobs, your way', body: 'Switch between the latest jobs, jobs you own, pickups, ones about to expire and stale repairs. Tap any job to open it.' },
            { sel: '[data-tour="tab-more"]', title: 'Everything else', body: 'Special orders, inventory, settings and more live under More.', mobileOnly: true }
        ],
        'current-jobs.html': [
            { badge: 'NEW', sel: '#statusFilter', title: 'Quotes (pending)', body: 'Customers who only needed a price show here until you approve or remove the quote. Approved quotes become regular jobs on the board.' },
            { sel: '#searchInput', title: 'Search this board', body: 'Type a job number, name, phone, device or technician to narrow the list instantly.' },
            { tour: true, sel: '.stats-row', title: 'Tap a number to filter', body: 'Tap Ready, Repairing or any card to show just those jobs; tap it again to see everything. The menu above has the rest — your own jobs, expiring soon and stale repairs.' },
            { tour: true, sel: '#jobsBoard', maxH: 0.34, picker: 'jobsView', title: 'Make the board yours', body: 'Pick how jobs look — you can change it any time with the buttons above the board.' },
            { tour: true, sel: '#jobsList .job-row, #jobsList .job-crow, #photoGrid .photo-card', title: 'Open a job', body: function () {
                var layout = global.SCJobsView ? global.SCJobsView.get().layout : 'list';
                if (layout === 'rows') return 'Tap a job to open it right here, with its details and buttons to edit or delete — you’ll get a few seconds to undo.';
                if (layout === 'photo') return 'Tap a photo to see the job’s full details. Switch back to Cards or Rows to edit or delete.';
                return 'Use the eye to see full details, the pencil to update status or invoice, and the bin to delete — you’ll get a few seconds to undo.';
            } },
            { sel: '.refresh-hint', title: 'Always up to date', body: 'The board refreshes every minute. On a phone, swipe down from the top to refresh right away.' }
        ],
        'new-job.html': [
            { tour: true, badge: 'NEW', sel: '#njStepper', title: 'Five quick steps', body: 'Customer, device, condition, pricing, then review. Your progress is saved if you leave the page.' },
            { badge: 'NEW', sel: '.nj-mode-bar', title: 'Quote only', body: 'Choose Quote only when the customer just needs a price. The device can stay with them until they say yes to the repair.' },
            { badge: 'NEW', sel: '.nj-panel[data-step="3"]', title: 'Pricing step', body: 'Leave Quote TBD for most intakes. Switch to Add quote for itemized or lump-sum pricing.' },
            { sel: '#customerName', title: 'Start with the customer', body: 'Name and phone are all you need here — errors show right next to the field.' }
        ],
        'sales.html': [
            { tour: true, sel: '[data-tour="sales-hero"]', title: 'Start here', body: 'New Sale rings up a walk-in; Pickup collects payment for a finished repair.' },
            { badge: 'NEW', sel: '#tab-bills', title: 'Print a tab slip', body: 'On Bills, use the print icon on any open bill for a 72mm customer slip with balance due.' },
            { sel: '[data-tour="tab-more"]', title: 'Other pages', body: 'Jobs, orders and inventory are one tap away under More.', mobileOnly: true }
        ],
        'special-orders.html': [
            { tour: true, sel: '.btn-new-order', title: 'Log a request', body: 'Record a part or accessory a customer asked for, with their phone so you can call when it arrives.' },
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
            { tour: true, sel: '#tipsRow', title: 'Tips any time', body: 'Replay the page tips — or this whole tour — whenever you like.' }
        ]
    };

    // Current Jobs layout, applied to the board live behind the spotlight
    var JOB_LAYOUTS = [
        { id: 'list', label: 'Cards', svg: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/>' },
        { id: 'rows', label: 'Rows', svg: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>' },
        { id: 'photo', label: 'Photos', svg: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' }
    ];

    function jobsViewPicker() {
        var api = global.SCJobsView;
        if (!api) return null;
        var cur = api.get();
        var el = doc.createElement('div');
        el.className = 'sc-view-pick';
        el.innerHTML =
            '<div class="sc-view-pick-seg" role="radiogroup" aria-label="Layout">' + JOB_LAYOUTS.map(function (l) {
                var on = l.id === cur.layout;
                return '<button type="button" role="radio" aria-checked="' + on + '" data-layout="' + l.id + '"' + (on ? ' class="on"' : '') + '>' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + l.svg + '</svg>' +
                    '<span>' + l.label + '</span></button>';
            }).join('') + '</div>';
        el.querySelectorAll('[data-layout]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.classList.contains('on')) return;
                el.querySelectorAll('[data-layout]').forEach(function (b) {
                    var on = b === btn;
                    b.classList.toggle('on', on);
                    b.setAttribute('aria-checked', on ? 'true' : 'false');
                });
                tap('light');
                api.setLayout(btn.getAttribute('data-layout'));
                global.requestAnimationFrame(function () { if (T) placeTour(); });
            });
        });
        return el;
    }

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

    function buildTourLayer(onboarding) {
        var layer = doc.createElement('div');
        layer.className = 'sc-tour-layer' + (onboarding ? ' is-onboarding' : '');
        layer.innerHTML =
            '<div class="sc-tour-block"></div>' +
            '<div class="sc-tour-spot"></div>' +
            (onboarding ? '<div class="sc-tour-chapter" role="status" aria-live="polite"></div>' : '') +
            '<div class="sc-tour-card" role="dialog" aria-modal="true" aria-labelledby="scTourTitle">' +
            (onboarding ? '<div class="sc-tour-progress" aria-hidden="true"></div>' : '') +
            '<div class="sc-tour-count"></div>' +
            '<div class="sc-tour-content"><div class="sc-tour-title" id="scTourTitle"></div><div class="sc-tour-body"></div></div>' +
            '<div class="sc-tour-actions">' +
            '<button type="button" class="sc-tour-off">' + (onboarding ? 'Skip tour' : 'Turn off tips') + '</button>' +
            '<span class="sc-tour-spacer"></span>' +
            '<button type="button" class="sc-tour-back">Back</button>' +
            '<button type="button" class="sc-tour-next">Next</button>' +
            '</div></div>';
        doc.body.appendChild(layer);
        void layer.offsetWidth;
        return layer;
    }

    function removeLayer(layer) {
        if (!layer) return;
        layer._gone = true;
        layer.classList.remove('show');
        setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 260);
    }

    function setSpot(spot, r, instant) {
        if (instant) spot.style.transition = 'none';
        spot.style.left = r.left + 'px';
        spot.style.top = r.top + 'px';
        spot.style.width = r.width + 'px';
        spot.style.height = r.height + 'px';
        if (instant) { void spot.offsetWidth; spot.style.transition = ''; }
    }

    // A spotlight the size of the screen means no dimming; shrinking it onto the target reads as an iris
    function screenRect() {
        return { left: -16, top: -16, width: global.innerWidth + 32, height: global.innerHeight + 32 };
    }

    // Stops listening but leaves the layer on screen (chapter hand-offs reuse it)
    function detachTour() {
        if (!T) return null;
        var t = T;
        global.removeEventListener('resize', t.onMove);
        global.removeEventListener('scroll', t.onMove, true);
        doc.removeEventListener('keydown', t.onKey, true);
        T = null;
        return t;
    }

    function endTour(markAll, finished) {
        if (!T) return;
        var page = T.page;
        var t = detachTour();
        if (markAll) {
            var seen = toursSeen();
            Object.keys(TOURS).forEach(function (p) { seen[p] = 1; });
            try { localStorage.setItem(TOUR_KEY, JSON.stringify(seen)); } catch (_) {}
        } else {
            markSeen(page);
        }
        removeLayer(t.layer);
        if (typeof t.onEnd === 'function') t.onEnd(!!finished);
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
        var step = T.steps[T.i];
        var r = step.target.getBoundingClientRect();
        if (step.def.maxH) {
            var h = Math.min(r.height, global.innerHeight * step.def.maxH);
            r = { left: r.left, top: r.top, width: r.width, height: h, right: r.right, bottom: r.top + h };
        }
        var pad = 6;
        var spot = T.layer.querySelector('.sc-tour-spot');
        setSpot(spot, { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

        var card = T.card;
        var vw = global.innerWidth, vh = global.innerHeight;
        var cw = Math.min(340, vw - 24);
        card.style.width = cw + 'px';
        var ch = card.offsetHeight;
        var below = r.bottom + pad + 12;
        var above = r.top - pad - 12 - ch;
        var fitsBelow = below + ch <= vh - 12;
        var top = fitsBelow ? below : (above >= 12 ? above : Math.max(12, vh - ch - 12));
        var left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
        card.style.top = top + 'px';
        card.style.left = left + 'px';
        card.setAttribute('data-side', fitsBelow ? 'below' : 'above');
    }

    // One segment per stop; the current one fills as its steps go by
    function renderProgress(el, total, cur, frac) {
        if (!el) return;
        if (el.children.length !== total) {
            var html = '';
            for (var i = 0; i < total; i++) html += '<i><b></b></i>';
            el.innerHTML = html;
        }
        for (var s = 0; s < total; s++) {
            el.children[s].firstChild.style.width = (s < cur ? 100 : s === cur ? Math.round(frac * 100) : 0) + '%';
        }
    }

    // dir: 1 forward, -1 back, 0 first step (content slides in from the side you're heading)
    function showStep(i, dir) {
        if (!T) return;
        T.i = i;
        var step = T.steps[i], card = T.card, n = T.steps.length, last = i === n - 1;
        var chap = T.chapter;
        var nextStop = chap && chap.route[chap.idx + 1];
        card.querySelector('.sc-tour-count').textContent = chap
            ? chap.route[chap.idx].label + ' · ' + (i + 1) + ' of ' + n
            : (i + 1) + ' of ' + n;
        if (chap) renderProgress(card.querySelector('.sc-tour-progress'), chap.route.length, chap.idx, (i + 1) / n);
        // An earlier step can re-render the page (the view picker does), so find the target again if it's gone
        if (!step.target.isConnected || !step.target.getClientRects().length) {
            var fresh = findTarget(step.def);
            if (fresh) step.target = fresh;
        }
        var def = step.def;
        var body = (isMobile() && def.mbody) || def.body;
        var titleEl = card.querySelector('.sc-tour-title');
        if (def.badge) {
            titleEl.innerHTML = esc(step.title) + ' <span class="sc-tip-new">' + esc(def.badge) + '</span>';
        } else {
            titleEl.textContent = step.title;
        }
        var bodyEl = card.querySelector('.sc-tour-body');
        bodyEl.textContent = typeof body === 'function' ? body() : body;
        if (def.picker === 'jobsView') {
            var picker = jobsViewPicker();
            if (picker) bodyEl.appendChild(picker);
        }
        card.querySelector('.sc-tour-back').style.visibility = i > 0 || (chap && chap.idx > 0) ? 'visible' : 'hidden';
        var next = card.querySelector('.sc-tour-next');
        if (last && nextStop) next.innerHTML = '<span>' + esc(nextStop.label) + '</span>' + icon('chevronRight', 15);
        else next.textContent = last ? (chap ? 'Finish' : 'Done') : 'Next';
        next.classList.toggle('is-onward', !!(last && nextStop));
        next.setAttribute('aria-label', last && nextStop ? 'Next stop: ' + nextStop.label : next.textContent);

        var r = step.target.getBoundingClientRect();
        if (def.maxH) {
            // Tall targets: bring the top in just under the top bar and light only the top part
            if (r.top < 70 || r.top > global.innerHeight * 0.3) global.scrollBy(0, r.top - 84);
        } else if (r.top < 70 || r.bottom > global.innerHeight - 90) {
            step.target.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        var content = card.querySelector('.sc-tour-content');
        content.classList.remove('fwd', 'back');
        void content.offsetWidth;
        if (dir) content.classList.add(dir < 0 ? 'back' : 'fwd');
        placeTour();
        if (!card.classList.contains('in')) {
            // Let the spotlight land before the card arrives
            setTimeout(function () { if (T && T.card === card) card.classList.add('in'); }, prefersReducedMotion() ? 0 : 200);
        }
        next.focus({ preventScroll: true });
    }

    // opts.chapter { route, idx }: a stop on the V5 welcome tour. It can't be dismissed by a stray tap or
    // Esc (only Skip), and Next/Back past either end call opts.onChapter(±1) to move to the next page.
    // opts.layer reuses a layer already on screen (the stop's title card morphs into the spotlight).
    // opts.atEnd opens on the last step (arriving with Back). opts.onEnd(finished) runs once it's gone.
    function startTour(force, opts) {
        opts = opts || {};
        var page = currentPage();
        var defs = TOURS[page];
        if (!defs || T || !isLoggedIn()) return false;
        if (!force && toursSeen()[page]) return false;
        if (!opts.layer && doc.querySelector('.sc-tour-layer, .sc-intro')) return false;
        var steps = [];
        var picked = opts.chapter ? defs.filter(function (d) { return d.tour; }) : defs;
        (picked.length ? picked : defs).forEach(function (d) {
            var target = findTarget(d);
            if (target) steps.push({ def: d, title: d.title, target: target });
        });
        if (!steps.length) {
            if (force && !opts.chapter) toast('No tips for this page yet.', 'info');
            return false;
        }
        closeSearch();

        var onboarding = !!opts.chapter;
        var layer = opts.layer || buildTourLayer(onboarding);
        var card = layer.querySelector('.sc-tour-card');
        T = {
            page: page, steps: steps, i: 0, layer: layer, card: card, onboarding: onboarding,
            chapter: opts.chapter || null, onChapter: opts.onChapter, onEnd: opts.onEnd
        };
        function goNext() {
            if (!T) return;
            if (T.i < T.steps.length - 1) { tap('light'); showStep(T.i + 1, 1); return; }
            if (T.chapter && typeof T.onChapter === 'function') { tap('success'); T.onChapter(1); return; }
            tap('success');
            endTour(false, true);
        }
        function goBack() {
            if (!T) return;
            if (T.i > 0) { showStep(T.i - 1, -1); return; }
            if (T.chapter && T.chapter.idx > 0 && typeof T.onChapter === 'function') T.onChapter(-1);
        }
        T.onMove = function () { if (T) placeTour(); };
        T.onKey = function (e) {
            if (!T) return;
            if (e.key === 'Escape') { e.preventDefault(); if (T.onboarding) nudgeTour(); else endTour(false); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
            else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); }
        };
        card.querySelector('.sc-tour-next').addEventListener('click', goNext);
        card.querySelector('.sc-tour-back').addEventListener('click', goBack);
        card.querySelector('.sc-tour-off').addEventListener('click', function () {
            if (T && T.onboarding) { endTour(false, false); return; }
            endTour(true);
            toast('Tips turned off. Replay them any time from Settings.', 'info');
        });
        layer.querySelector('.sc-tour-block').onclick = function () {
            if (!T) return;
            if (T.onboarding) nudgeTour(); else endTour(false);
        };
        global.addEventListener('resize', T.onMove, { passive: true });
        global.addEventListener('scroll', T.onMove, { passive: true, capture: true });
        doc.addEventListener('keydown', T.onKey, true);

        var chapterCard = layer.querySelector('.sc-tour-chapter.in');
        var spot = layer.querySelector('.sc-tour-spot');
        setSpot(spot, chapterCard ? chapterCard.getBoundingClientRect() : screenRect(), true);
        layer.classList.add('show');
        setTimeout(function () {
            if (!T || T.layer !== layer) return;
            layer.classList.remove('is-chapter', 'no-fade');
            if (chapterCard) { chapterCard.classList.remove('in'); chapterCard.classList.add('out'); }
            showStep(opts.atEnd ? steps.length - 1 : 0, 0);
        }, 30);
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
    // Stage per user in scV5Welcome: missing = never welcomed, 'tour' = intro seen but tour not finished
    // (resumes on next load), 'done'. Page tips are per device and only run once the welcome is done,
    // and the page toured during onboarding is marked seen so its tip never repeats.
    // Changing this key shows the welcome to everyone once more; list the old key below so it's cleared
    var ONBOARD_KEY = 'scV5Welcome2';
    try { localStorage.removeItem('scV5Onboard'); localStorage.removeItem('scV5Welcome'); } catch (_) {}

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
            '<h1 class="sc-intro-title" id="scIntroTitle" aria-label="Version 5.0.0"><span class="sc-intro-v" aria-hidden="true">V</span><span class="sc-intro-5" aria-hidden="true">5</span></h1>' +
            '<div class="sc-intro-version" aria-hidden="true">Version 5.0.0</div>' +
            '<p class="sc-intro-sub">The whole shop, one tap away.</p>' +
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

        // The intro covers the page straight away; in a background tab it holds on its first frame
        // until the tab is visible, so the animation is never played to nobody.
        function play() {
            el.classList.add('play');
            setTimeout(function () { try { go.focus({ preventScroll: true }); } catch (_) {} }, prefersReducedMotion() ? 50 : 2100);
        }
        void el.offsetWidth;
        if (doc.visibilityState === 'visible') { setTimeout(play, 20); return; }
        el.classList.add('held');
        doc.addEventListener('visibilitychange', function onVisible() {
            if (doc.visibilityState !== 'visible') return;
            doc.removeEventListener('visibilitychange', onVisible);
            el.classList.remove('held');
            setTimeout(play, 60);
        });
    }

    // ── Welcome tour: one stop per page, carried across page loads ───────────────
    // Stage 'tour:<page>' (or 'tour:<page>:end' when arriving with Back) says which stop is next.
    // Each stop opens with a title card that morphs into the spotlight; leaving a stop shows the next
    // title card and then navigates, and the new page opens on that same card so the hop reads as one motion.
    var ROUTE = [
        { page: 'index.html', label: 'Dashboard', icon: 'home', blurb: 'Your shop at a glance — shortcuts, live numbers and the latest jobs.' },
        { page: 'current-jobs.html', label: 'Current Jobs', icon: 'wrench', blurb: 'The repair board. Every job, where it’s at and who has it.' },
        { page: 'new-job.html', label: 'New Job', icon: 'plus', blurb: 'Logging a repair takes five short steps (pricing optional).' },
        { page: 'sales.html', label: 'Sales', icon: 'dollar', blurb: 'Ring up walk-ins and collect payment for finished repairs.', roles: ['cashier', 'manager'] },
        { page: 'special-orders.html', label: 'Special Orders', icon: 'cart', blurb: 'Parts and accessories customers are waiting on.' },
        { page: 'settings.html', label: 'Settings', icon: 'settings', blurb: 'Make the portal yours — and replay this tour any time.' }
    ];

    function userRole() {
        return typeof global.getUserRole === 'function' ? global.getUserRole() : 'technician';
    }

    function onboardRoute() {
        var role = userRole();
        return ROUTE.filter(function (r) { return !r.roles || r.roles.indexOf(role) !== -1; });
    }

    function routeIndex(route, page) {
        for (var i = 0; i < route.length; i++) if (route[i].page === page) return i;
        return -1;
    }

    function parseStage(stage) {
        if (stage === 'tour') return { page: 'index.html', atEnd: false };
        var m = /^tour:([^:]+)(:end)?$/.exec(stage || '');
        return m ? { page: m[1], atEnd: !!m[2] } : null;
    }

    // Pop-ups the page opened itself (not ours) and loading placeholders hold a stop back
    function pageSettled() {
        if (!isLoggedIn() || doc.querySelector('.sc-skel-list')) return false;
        var splash = doc.getElementById('splash-screen');
        if (splash && !splash.classList.contains('hidden')) return false;
        if (doc.querySelector('.notif-panel.open, .account-dropdown.open')) return false;
        var nodes = doc.querySelectorAll(OVERLAY_SEL);
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].matches('.sc-tour-layer, .sc-intro, .sc-search')) continue;
            if (isShownLayer(nodes[i])) return false;
        }
        return true;
    }

    function whenSettled(fn) {
        var start = Date.now();
        (function wait() {
            if (pageSettled() || Date.now() - start > 9000) { setTimeout(fn, 250); return; }
            setTimeout(wait, 120);
        })();
    }

    function tourSkipped() {
        setOnboardStage('done');
        toast('Tour skipped. You can replay it any time from Settings.', 'info');
    }

    function showStopCard(layer, route, idx, eyebrow, instant) {
        var ch = layer.querySelector('.sc-tour-chapter');
        var stop = route[idx];
        var bar = '';
        for (var i = 0; i < route.length; i++) bar += '<i class="' + (i < idx ? 'done' : i === idx ? 'cur' : '') + '"><b></b></i>';
        ch.className = 'sc-tour-chapter' + (instant ? ' instant' : '');
        ch.innerHTML =
            '<div class="sc-tour-chapter-icon" aria-hidden="true">' + icon(stop.icon, 26) + '</div>' +
            '<div class="sc-tour-chapter-eyebrow">' + esc(eyebrow) + '</div>' +
            '<div class="sc-tour-chapter-title">' + esc(stop.label) + '</div>' +
            '<p class="sc-tour-chapter-blurb">' + esc(stop.blurb) + '</p>' +
            '<div class="sc-tour-chapter-bar" aria-hidden="true">' + bar + '</div>' +
            '<button type="button" class="sc-tour-chapter-skip">Skip tour</button>';
        ch.querySelector('.sc-tour-chapter-skip').addEventListener('click', function () {
            detachTour();
            removeLayer(layer);
            tourSkipped();
        });
        var spot = layer.querySelector('.sc-tour-spot');
        var spotShown = layer.classList.contains('show') && !layer.classList.contains('is-chapter');
        layer.classList.add('is-chapter');
        layer.querySelector('.sc-tour-card').classList.remove('in');
        void ch.offsetWidth;
        ch.classList.add('in');
        // The spotlight melts into the title card on its way out
        if (spotShown) setSpot(spot, ch.getBoundingClientRect());
    }

    // Leave for another stop: its title card comes up here, then the page changes underneath it
    function departTo(layer, route, idx, atEnd) {
        setOnboardStage('tour:' + route[idx].page + (atEnd ? ':end' : ''));
        showStopCard(layer, route, idx, atEnd ? 'Back to' : 'Up next');
        layer.classList.add('show');
        setTimeout(function () {
            if (!layer._gone) global.location.href = route[idx].page;
        }, prefersReducedMotion() ? 200 : 520);
    }

    function moveStop(route, idx, dir) {
        var t = detachTour();
        if (!t) return;
        markSeen(route[idx].page);
        var to = idx + dir;
        if (to >= route.length) { finishTour(t.layer, route); return; }
        if (to < 0) return;
        departTo(t.layer, route, to, dir < 0);
    }

    // opts.fromIntro: straight after the intro (no title card if the page is already ready)
    // opts.arrive: just navigated here from the previous stop — the title card is already "on screen"
    function runStop(opts) {
        opts = opts || {};
        var route = onboardRoute();
        var page = currentPage();
        var idx = routeIndex(route, page);
        if (idx < 0 || T || doc.querySelector('.sc-tour-layer')) return false;
        setOnboardStage('tour:' + page + (opts.atEnd ? ':end' : ''));
        closeSearch();
        var layer = buildTourLayer(true);
        var titled = !opts.fromIntro || !pageSettled();
        var shownAt = Date.now();
        if (titled) {
            if (opts.arrive) layer.classList.add('no-fade');
            showStopCard(layer, route, idx, 'Stop ' + (idx + 1) + ' of ' + route.length, opts.arrive);
        }
        layer.classList.add('show');
        whenSettled(function () {
            // Arriving, the card was already read on the page before; it only needs a beat here
            var minHold = opts.arrive ? 600 : 1100;
            var hold = titled ? Math.max(0, (prefersReducedMotion() ? minHold / 2 : minHold) - (Date.now() - shownAt)) : 0;
            setTimeout(function () {
                if (layer._gone) return;
                var started = startTour(true, {
                    layer: layer,
                    atEnd: opts.atEnd,
                    chapter: { route: route, idx: idx },
                    onChapter: function (dir) { moveStop(route, idx, dir); },
                    onEnd: function (finished) { if (!finished) tourSkipped(); }
                });
                if (started) return;
                // Nothing to point at on this page; carry on in the direction we were going
                markSeen(page);
                var to = idx + (opts.atEnd ? -1 : 1);
                if (to >= route.length) finishTour(layer, route);
                else if (to < 0) { removeLayer(layer); setOnboardStage('done'); }
                else departTo(layer, route, to, !!opts.atEnd);
            }, hold);
        });
        return true;
    }

    function finishTour(layer, route) {
        setOnboardStage('done');
        var seen = toursSeen();
        route.forEach(function (r) { seen[r.page] = 1; });
        try { localStorage.setItem(TOUR_KEY, JSON.stringify(seen)); } catch (_) {}

        var role = userRole();
        var extra = [];
        if (!seen['inventory.html']) extra.push('Inventory');
        if (role === 'manager' && !seen['statistics.html']) extra.push('Statistics');
        var onHome = currentPage() === 'index.html';

        var mod = IS_MAC ? '⌘' : 'Ctrl';
        var rows = [
            { ic: 'search', title: 'Search from anywhere', body: isMobile()
                ? 'Tap the magnifier at the top of any page to find a job, customer, order or page.'
                : 'Press <kbd class="sc-kbd">' + mod + '</kbd><kbd class="sc-kbd">K</kbd> or <kbd class="sc-kbd">/</kbd> on any page to find a job, customer, order or page.' },
            { ic: 'help', title: 'More tips on every page', body: 'The tour showed the essentials. For the rest, open search and choose “Show tips for this page”.' }
        ];
        if (extra.length) {
            rows.push({ ic: 'package', title: 'Still to discover', body: esc(extra.join(' and ')) + ' will show a quick tip the first time you open ' + (extra.length > 1 ? 'them' : 'it') + '.' });
        }
        rows.push({ ic: 'settings', title: 'Replay any time', body: 'Settings → Page Tips has this tour and every page’s tips.' });

        var ch = layer.querySelector('.sc-tour-chapter');
        var spot = layer.querySelector('.sc-tour-spot');
        var spotShown = !layer.classList.contains('is-chapter');
        layer.classList.add('is-chapter');
        layer.querySelector('.sc-tour-card').classList.remove('in');
        ch.className = 'sc-tour-chapter is-finish';
        ch.innerHTML =
            '<div class="sc-tour-done-mark" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-16"/></svg></div>' +
            '<div class="sc-tour-chapter-title">You’re all set</div>' +
            '<ul class="sc-tour-done-list">' + rows.map(function (r) {
                return '<li><span class="sc-tour-done-ic" aria-hidden="true">' + icon(r.ic, 16) + '</span>' +
                    '<span><b>' + esc(r.title) + '</b><span>' + r.body + '</span></span></li>';
            }).join('') + '</ul>' +
            '<div class="sc-tour-done-actions">' +
            '<button type="button" class="sc-tour-done-go">' + (onHome ? 'Start using V5' : 'Go to Dashboard') + '</button>' +
            (onHome ? '' : '<button type="button" class="sc-tour-done-stay">Stay here</button>') +
            '</div>';
        void ch.offsetWidth;
        ch.classList.add('in');
        if (spotShown) setSpot(spot, ch.getBoundingClientRect());
        tap('success');

        function close(goHome) {
            doc.removeEventListener('keydown', onKey, true);
            removeLayer(layer);
            if (goHome && !onHome) setTimeout(function () { global.location.href = 'index.html'; }, 180);
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
        }
        doc.addEventListener('keydown', onKey, true);
        var goBtn = ch.querySelector('.sc-tour-done-go');
        goBtn.addEventListener('click', function () { close(true); });
        var stay = ch.querySelector('.sc-tour-done-stay');
        if (stay) stay.addEventListener('click', function () { close(false); });
        setTimeout(function () { try { goBtn.focus({ preventScroll: true }); } catch (_) {} }, 500);
    }

    // Left the tour's page some other way (back button, typed address): offer to pick it up again
    function showResumePill(route, idx, atEnd) {
        if (doc.querySelector('.sc-tour-resume')) return;
        var el = doc.createElement('div');
        el.className = 'sc-tour-resume';
        el.setAttribute('role', 'status');
        el.innerHTML =
            '<span class="sc-tour-resume-text"><b>Tour paused</b><span>Next stop: ' + esc(route[idx].label) + '</span></span>' +
            '<button type="button" class="sc-tour-resume-go">Continue</button>' +
            '<button type="button" class="sc-tour-resume-x" aria-label="End tour">' + icon('x', 16) + '</button>';
        doc.body.appendChild(el);
        function dismiss() {
            el.classList.remove('show');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
        }
        el.querySelector('.sc-tour-resume-go').addEventListener('click', function () {
            dismiss();
            tap('light');
            departTo(buildTourLayer(true), route, idx, atEnd);
        });
        el.querySelector('.sc-tour-resume-x').addEventListener('click', function () {
            dismiss();
            tourSkipped();
        });
        void el.offsetWidth;
        setTimeout(function () { el.classList.add('show'); }, 400);
    }

    function beginTour(fromIntro) {
        var route = onboardRoute();
        if (currentPage() === route[0].page) { runStop({ fromIntro: fromIntro }); return; }
        departTo(buildTourLayer(true), route, 0, false);
    }

    function resumeTour(stage) {
        var st = parseStage(stage);
        var route = onboardRoute();
        var idx = st ? routeIndex(route, st.page) : -1;
        if (idx < 0) { setOnboardStage('done'); autoStartTour(); return; }
        if (currentPage() === route[idx].page) runStop({ atEnd: st.atEnd, arrive: true });
        else showResumePill(route, idx, st.atEnd);
    }

    // Runs as soon as a signed-in page boots (or the moment sign-in succeeds), so a first-time welcome
    // covers the page before anything else can be tapped
    function startWelcome() {
        var stage = onboardStage();
        if (stage === 'done') { autoStartTour(); return; }
        if (stage.indexOf('tour') === 0) { resumeTour(stage); return; }
        playIntro(function (go) {
            if (go) beginTour(true);
            else { setOnboardStage('done'); autoStartTour(); }
        });
    }

    // Settings → "Watch the V5 intro": plays the intro, then the whole tour from the dashboard
    function replayIntro() {
        playIntro(function (go) { if (go) beginTour(true); });
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

    // Arriving on the next tour stop: put its title card up now, before the page's own scripts run,
    // so the hop from the previous page reads as one motion (boot then finds the tour already going)
    if (doc.body && isLoggedIn()) {
        var arriving = parseStage(onboardStage());
        if (arriving && arriving.page === currentPage()) resumeTour(onboardStage());
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
