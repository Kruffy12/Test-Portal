/**
 * ServiCell Auth Guard
 * Add <script src="js/auth-guard.js"></script> to the <head> of every
 * protected page EXCEPT index.html (which handles login itself).
 */
(function () {
    const PAGE_ACCESS = {
        'inventory.html':      ['technician', 'cashier', 'manager'],
        'sales.html':          ['cashier', 'manager'],
        'statistics.html':     ['manager'],
    };

    function getUser() {
        return localStorage.getItem('scUser') || sessionStorage.getItem('scUser') || '';
    }

    function hasOldLogin() {
        return localStorage.getItem('isLoggedIn') === 'true' ||
               sessionStorage.getItem('isLoggedIn') === 'true';
    }

    function isLoggedIn() {
        return hasOldLogin() && !!(localStorage.getItem('scSession') || sessionStorage.getItem('scSession'));
    }

    function deriveRole(username) {
        const u = (username || '').toLowerCase();
        if (u.startsWith('manager'))    return 'manager';
        if (u.startsWith('cashier'))    return 'cashier';
        if (u.startsWith('technician')) return 'technician';
        return 'technician';
    }

    function getUserRole() {
        const stored = (localStorage.getItem('scRole') || sessionStorage.getItem('scRole') || '').toLowerCase().trim();
        if (['manager', 'cashier', 'technician'].includes(stored)) return stored;
        return deriveRole(getUser());
    }

    const page = window.location.pathname.split('/').pop() || 'index.html';

    // Not logged in → back to login. A login from before the security upgrade has no session
    // token; the sign-in page explains why they need to sign in again.
    if (!isLoggedIn() && page !== 'index.html') {
        window.location.replace(hasOldLogin() ? 'index.html?signedout=upgrade' : 'index.html');
        throw new Error('Auth guard: not logged in.');
    }

    // Role-restricted page → check access
    if (PAGE_ACCESS[page]) {
        const role = getUserRole();
        if (!PAGE_ACCESS[page].includes(role)) {
            window.location.replace('index.html');
            throw new Error(`Auth guard: role "${role}" cannot access ${page}`);
        }
    }
})();