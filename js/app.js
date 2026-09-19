/* ============================================================
   Faucon — Runtime partagé des maquettes (design phase)
   - Thème clair / sombre (localStorage, sans dépendance)
   - Système de toasts (style Sonner)
   - Plugin Vue : composant <Ic> (icônes lucide), directive
     v-click-outside, mixin shell (sidebar/topbar/⌘K)
   - Helpers : countUp, courbes SVG, formatage
   ============================================================ */
(function () {
    'use strict';

    /* ---------------- Thème ---------------- */
    const Theme = {
        get() {
            try {
                const stored = localStorage.getItem('faucon-theme');
                if (stored === 'light' || stored === 'dark') {
                    return stored;
                }
            } catch (e) { /* stockage indisponible */ }
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        },
        apply(mode) {
            document.documentElement.classList.toggle('dark', mode === 'dark');
        },
        set(mode) {
            this.apply(mode);
            try {
                localStorage.setItem('faucon-theme', mode);
            } catch (e) { /* stockage indisponible */ }
        },
        toggle() {
            this.set(this.get() === 'dark' ? 'light' : 'dark');
        },
        init() {
            this.apply(this.get());
        },
    };

    /* ---------------- Toasts (style Sonner) ---------------- */
    const TOAST_ICONS = {
        success: 'circle-check',
        error: 'circle-x',
        info: 'info',
    };

    function iconSvg(name, size) {
        const lib = window.lucide;
        if (!lib || !lib.icons) {
            return '';
        }
        const pascal = name.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
        const node = lib.icons[pascal];
        if (!node || !Array.isArray(node)) {
            return '';
        }
        const body = node
            .filter((item) => Array.isArray(item))
            .map(([tag, attrs]) => {
                const a = Object.entries(attrs || {})
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(' ');
                return `<${tag} ${a}></${tag}>`;
            })
            .join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    }

    function toast({ title, description = '', type = 'success', duration = 4200 }) {
        let viewport = document.querySelector('.toast-viewport');
        if (!viewport) {
            viewport = document.createElement('div');
            viewport.className = 'toast-viewport';
            document.body.appendChild(viewport);
        }
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.setAttribute('role', 'status');
        el.innerHTML = `
            <span class="toast-icon">${iconSvg(TOAST_ICONS[type] || 'info', 17)}</span>
            <div>
                <div class="toast-title"></div>
                ${description ? '<div class="toast-description"></div>' : ''}
            </div>
            <button class="toast-close" aria-label="Fermer">${iconSvg('x', 14)}</button>`;
        el.querySelector('.toast-title').textContent = title;
        if (description) {
            el.querySelector('.toast-description').textContent = description;
        }
        viewport.appendChild(el);

        let done = false;
        const close = () => {
            if (done) {
                return;
            }
            done = true;
            el.classList.add('toast-leaving');
            setTimeout(() => el.remove(), 200);
        };
        el.querySelector('.toast-close').addEventListener('click', close);
        setTimeout(close, duration);
    }

    /* ---------------- Composant <Ic> : icônes lucide ---------------- */
    const Ic = {
        name: 'Ic',
        props: {
            name: { type: String, required: true },
            size: { type: [Number, String], default: 16 },
            strokeWidth: { type: [Number, String], default: 2 },
        },
        computed: {
            children() {
                const lib = window.lucide;
                if (!lib || !lib.icons) {
                    return [];
                }
                const pascal = this.name
                    .split('-')
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join('');
                const node = lib.icons[pascal];
                if (!node || !Array.isArray(node)) {
                    return [];
                }
                // Format actuel : [[tag, attrs], …] — ancien : ['svg', attrs, children]
                if (node.length && typeof node[0] === 'string') {
                    return node[2] || [];
                }
                return node;
            },
        },
        render() {
            const h = window.Vue.h;
            if (!this.children.length) {
                // filet de sécurité : point discret si l'icône manque
                return h('span', { class: 'ic-missing', style: { width: this.size + 'px', height: this.size + 'px', display: 'inline-block' } });
            }
            return h(
                'svg',
                {
                    xmlns: 'http://www.w3.org/2000/svg',
                    viewBox: '0 0 24 24',
                    width: this.size,
                    height: this.size,
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': this.strokeWidth,
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'aria-hidden': 'true',
                    class: 'ic',
                },
                this.children
                    .filter((item) => Array.isArray(item))
                    .map(([tag, attrs]) => h(tag, { ...attrs, 'stroke-width': this.strokeWidth }))
            );
        },
    };

    /* ---------------- Directive v-click-outside ---------------- */
    const clickOutside = {
        beforeMount(el, binding) {
            el.__fauconOutside = (event) => {
                if (!(el === event.target || el.contains(event.target))) {
                    binding.value(event);
                }
            };
            document.addEventListener('pointerdown', el.__fauconOutside, true);
        },
        unmounted(el) {
            document.removeEventListener('pointerdown', el.__fauconOutside, true);
        },
    };

    /* ---------------- Helpers ---------------- */
    const fmt = {
        number(value) {
            return new Intl.NumberFormat('fr-FR').format(value);
        },
        compact(value) {
            return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
        },
        percent(value) {
            return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(value);
        },
        ms(ms) {
            return ms >= 1000 ? (ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s' : ms + ' ms';
        },
    };

    // anime state[key] vers `to` (ease-out cubique)
    function countUpTo(state, key, to, { duration = 900, decimals = 0 } = {}) {
        const start = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        function frame(now) {
            const t = Math.min(1, (now - start) / duration);
            state[key] = +(to * ease(t)).toFixed(decimals);
            if (t < 1) {
                requestAnimationFrame(frame);
            }
        }
        requestAnimationFrame(frame);
    }

    function linePath(points, width, height, { pad = 4 } = {}) {
        // points : array de nombres ; renvoie un path "M… L…" normalisé
        if (!points.length) {
            return '';
        }
        const min = Math.min(...points);
        const max = Math.max(...points);
        const range = max - min || 1;
        const stepX = (width - pad * 2) / (points.length - 1 || 1);
        return points
            .map((p, i) => {
                const x = pad + i * stepX;
                const y = pad + (1 - (p - min) / range) * (height - pad * 2);
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }

    function areaPath(points, width, height, { pad = 4 } = {}) {
        const line = linePath(points, width, height, { pad });
        if (!line) {
            return '';
        }
        return `${line} L${(width - pad).toFixed(1)},${height} L${pad},${height} Z`;
    }

    /* ---------------- Mixin shell (sidebar / topbar / ⌘K) ---------------- */
    const SHELL_COMMANDS = [
        { group: 'Navigation', label: 'Tableau de bord', icon: 'layout-dashboard', href: 'dashboard.html' },
        { group: 'Navigation', label: 'Workflows', icon: 'workflow', href: 'workflows.html' },
        { group: 'Navigation', label: 'Éditeur de workflow', icon: 'git-branch', href: 'builder.html' },
        { group: 'Navigation', label: 'Exécutions', icon: 'activity', href: 'executions.html' },
        { group: 'Navigation', label: 'Templates', icon: 'layers', href: 'templates.html' },
        { group: 'Navigation', label: 'Paramètres', icon: 'settings', href: 'settings.html' },
        { group: 'Actions', label: 'Créer un workflow', icon: 'plus', href: 'builder.html' },
        { group: 'Actions', label: 'Inviter un membre', icon: 'user-plus', href: 'settings.html', anchor: '#equipe' },
        { group: 'Actions', label: 'Ajouter un credential', icon: 'key-round', href: 'settings.html', anchor: '#integrations' },
        { group: 'Workflows', label: 'Veille concurrentielle IA', icon: 'zap', href: 'workflows.html' },
        { group: 'Workflows', label: 'Lead capture → CRM', icon: 'zap', href: 'workflows.html' },
        { group: 'Workflows', label: 'Rapport hebdomadaire', icon: 'zap', href: 'workflows.html' },
    ];

    const shellMixin = {
        data() {
            return {
                ui: {
                    collapsed: false,
                    searchOpen: false,
                    searchQuery: '',
                    searchIndex: 0,
                    teamOpen: false,
                    userOpen: false,
                    notifOpen: false,
                },
                currentTeam: 'Studio Faucon',
                teams: [
                    { name: 'Studio Faucon', role: 'Propriétaire', initials: 'SF' },
                    { name: 'Aina — Perso', role: 'Propriétaire', initials: 'AP' },
                ],
                notifications: [
                    { id: 1, icon: 'circle-check', color: 'var(--success)', text: '« Veille concurrentielle IA » terminée en 4,1 s', time: 'il y a 2 min', unread: true },
                    { id: 2, icon: 'circle-alert', color: 'var(--warning)', text: 'Le webhook « leads » a été ralenti (rate limit)', time: 'il y a 26 min', unread: true },
                    { id: 3, icon: 'user-plus', color: 'var(--info)', text: 'Lina R. a rejoint l’équipe Studio Faucon', time: 'il y a 1 h', unread: false },
                    { id: 4, icon: 'bot', color: 'var(--cat-3)', text: 'Quota IA à 68 % pour ce mois', time: 'il y a 3 h', unread: false },
                ],
            };
        },
        computed: {
            unreadCount() {
                return this.notifications.filter((n) => n.unread).length;
            },
            searchResults() {
                const q = this.ui.searchQuery.trim().toLowerCase();
                if (!q) {
                    return SHELL_COMMANDS;
                }
                return SHELL_COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
            },
        },
        methods: {
            toggleTheme() {
                Theme.toggle();
            },
            isDark() {
                return Theme.get() === 'dark';
            },
            toggleSidebar() {
                this.ui.collapsed = !this.ui.collapsed;
            },
            markAllRead() {
                this.notifications.forEach((n) => {
                    n.unread = false;
                });
                toast({ title: 'Notifications marquées comme lues', type: 'info' });
            },
            openSearch() {
                this.ui.searchOpen = true;
                this.ui.searchQuery = '';
                this.ui.searchIndex = 0;
            },
            searchMove(dir) {
                const len = this.searchResults.length;
                this.ui.searchIndex = (this.ui.searchIndex + dir + len) % len;
            },
            searchGo() {
                const item = this.searchResults[this.ui.searchIndex];
                if (item) {
                    window.location.href = item.anchor ? item.href + item.anchor : item.href;
                }
            },
            fmtNumber: fmt.number,
            fmtCompact: fmt.compact,
        },
        onKeydown(e) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.openSearch();
            } else if (this.ui.searchOpen) {
                if (e.key === 'Escape') {
                    this.ui.searchOpen = false;
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.searchMove(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.searchMove(-1);
                } else if (e.key === 'Enter') {
                    this.searchGo();
                }
            }
        },
        mounted() {
            window.addEventListener('keydown', this.onKeydown);
        },
        beforeUnmount() {
            window.removeEventListener('keydown', this.onKeydown);
        },
    };

    /* ---------------- Plugin Vue ---------------- */
    const plugin = {
        install(app) {
            app.component('Ic', Ic);
            app.directive('click-outside', clickOutside);
            app.config.globalProperties.$toast = toast;
            app.config.globalProperties.$fmt = fmt;
            app.config.globalProperties.$countUp = countUpTo;
            app.config.globalProperties.$linePath = linePath;
            app.config.globalProperties.$areaPath = areaPath;
        },
    };

    /* ---------------- Exposition ---------------- */
    window.FauconUI = { Theme, toast, plugin, shellMixin, fmt, linePath, areaPath, countUpTo, iconSvg };

    /* ---------------- Init hors-Vue ---------------- */
    function boot() {
        Theme.init();
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            // pages statiques (index.html) : remplace les <i data-lucide>
            window.lucide.createIcons();
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
