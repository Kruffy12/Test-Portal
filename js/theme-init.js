/**
 * ServiCell Theme Init
 * MUST be first <script> in <head> on every page to prevent theme flash.
 * <script src="js/theme-init.js"></script>
 */
(function () {
    const THEMES = {
        light: {
            '--bg-gradient': 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            '--glass': 'rgba(255, 255, 255, 0.85)',
            '--glass-border': 'rgba(37, 99, 235, 0.1)',
            '--glass-strong': 'rgba(255, 255, 255, 0.95)',
            '--white-alt': '#e2e8f0',
            '--text-main': '#0f172a',
            '--text-dim': '#64748b',
            '--text-light': '#94a3b8',
            '--primary': '#2563eb',
            '--primary-rgb': '37, 99, 235',           // ← Added
            '--primary-light': '#3b82f6',
            '--primary-dark': '#1d4ed8',
            '--accent': '#60a5fa',
            '--shadow-md': '0 10px 30px rgba(37, 99, 235, 0.1)',
            '--login-scrim': 'rgba(248, 250, 252, 0.78)',
            '--login-field-bg': 'rgba(255, 255, 255, 0.96)',
        },
        dark: {
            '--bg-gradient': 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            '--glass': 'rgba(15, 23, 42, 0.85)',
            '--glass-border': 'rgba(255, 255, 255, 0.08)',
            '--glass-strong': 'rgba(15, 23, 42, 0.97)',
            '--white-alt': '#1e293b',
            '--text-main': '#f1f5f9',
            '--text-dim': '#94a3b8',
            '--text-light': '#64748b',
            '--primary': '#60a5fa',
            '--primary-rgb': '96, 165, 250',         // ← Added
            '--primary-light': '#93c5fd',
            '--primary-dark': '#3b82f6',
            '--accent': '#93c5fd',
            '--shadow-md': '0 10px 30px rgba(0, 0, 0, 0.4)',
            '--login-scrim': 'rgba(0, 0, 0, 0.58)',
            '--login-field-bg': '#1e293b',
        },
        scblue: {
            '--bg-gradient': 'linear-gradient(135deg, #0a1628 0%, #0f2044 100%)',
            '--glass': 'rgba(15, 32, 68, 0.85)',
            '--glass-border': 'rgba(37, 99, 235, 0.35)',
            '--glass-strong': 'rgba(10, 22, 40, 0.97)',
            '--white-alt': '#0f2044',
            '--text-main': '#e0eeff',
            '--text-dim': '#7eaee8',
            '--text-light': '#4d7db8',
            '--primary': '#3b82f6',
            '--primary-rgb': '59, 130, 246',         // ← Added
            '--primary-light': '#60a5fa',
            '--primary-dark': '#2563eb',
            '--accent': '#60a5fa',
            '--shadow-md': '0 10px 30px rgba(37, 99, 235, 0.25)',
            '--login-scrim': 'rgba(4, 10, 22, 0.72)',
            '--login-field-bg': '#132038',
        },
        merlot: {
            '--bg-gradient': 'linear-gradient(135deg, #1a0a0e 0%, #2d1018 100%)',
            '--glass': 'rgba(45, 16, 24, 0.75)',
            '--glass-border': 'rgba(201, 100, 80, 0.18)',
            '--glass-strong': 'rgba(26, 10, 14, 0.95)',
            '--white-alt': '#2d1018',
            '--text-main': '#f5e6e0',
            '--text-dim': '#c49a8a',
            '--text-light': '#8b5a50',
            '--primary': '#e8735a',
            '--primary-rgb': '232, 115, 90',
            '--primary-light': '#f0957e',
            '--primary-dark': '#c9533c',
            '--accent': '#c9a86c',
            '--shadow-md': '0 10px 30px rgba(232, 115, 90, 0.25)',
            '--login-scrim': 'rgba(12, 4, 6, 0.74)',
            '--login-field-bg': '#2a1018',
        }
    };

    const root = document.documentElement;

    // Get saved theme or default to 'light'
    const savedTheme = localStorage.getItem('scTheme');
    const theme = THEMES[savedTheme] ? savedTheme : 'light';

    // Apply theme variables
    Object.entries(THEMES[theme]).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    root.setAttribute('data-theme', theme);

    // Update browser/OS status bar color to match theme
    const THEME_COLORS = {
        light:   '#f8fafc',
        dark:    '#0f172a',
        scblue:  '#0a1628',
        merlot:  '#1a0a0e'
    };
    const themeColor = THEME_COLORS[theme] || '#0f172a';
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.name = 'theme-color';
        document.head.appendChild(metaTheme);
    }
    metaTheme.content = themeColor;

    // Apply compact mode if enabled
    if (localStorage.getItem('scCompact') === '1') {
        root.style.setProperty('--space-xs', '0.3rem');
        root.style.setProperty('--space-sm', '0.6rem');
        root.style.setProperty('--space-md', '1rem');
        root.style.setProperty('--space-lg', '1.6rem');
        root.style.setProperty('--space-xl', '2.5rem');
        root.style.setProperty('--radius-lg', '20px');
        root.style.setProperty('--radius-xl', '24px');
    }
})();