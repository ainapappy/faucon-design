/* ============================================================
   Faucon — Éditeur visuel de workflow (maquette phase 3)
   Graphe réactif : nodes déplaçables, connexion de ports,
   pan / zoom, inspection, suppression, simulation d'exécution.
   Consommé par builder.html via FauconUI.builderMixin.
   ============================================================ */
(function () {
    'use strict';

    const NODE_W = 190;
    const NODE_H = 78;

    const CATS = {
        trigger: { label: 'Déclencheurs', color: 'var(--cat-1)', icon: 'zap' },
        data: { label: 'Données', color: 'var(--cat-2)', icon: 'database' },
        logic: { label: 'Logique', color: 'var(--cat-5)', icon: 'git-branch' },
        ai: { label: 'IA', color: 'var(--cat-3)', icon: 'bot' },
        action: { label: 'Actions', color: 'var(--cat-4)', icon: 'send' },
    };

    /* Catalogue de types — miroir du futur registre de handlers */
    const NODE_TYPES = {
        webhook: {
            cat: 'trigger', icon: 'webhook', label: 'Webhook', desc: 'Appel HTTP entrant, idempotent et rate-limité',
            inputs: 0, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'method', label: 'Méthode', type: 'select', options: ['POST', 'GET'] },
                { key: 'path', label: 'Chemin', type: 'text', placeholder: 'hooks/leads' },
            ],
        },
        schedule: {
            cat: 'trigger', icon: 'calendar-clock', label: 'Planifié', desc: 'Exécution récurrente (expression cron)',
            inputs: 0, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'cron', label: 'Expression cron', type: 'text', placeholder: '0 9 * * 1', mono: true },
            ],
        },
        manual: {
            cat: 'trigger', icon: 'play', label: 'Manuel', desc: 'Lancement depuis l’interface',
            inputs: 0, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [],
        },
        input: {
            cat: 'data', icon: 'braces', label: 'Entrée', desc: 'Données injectées dans le workflow',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'name', label: 'Nom de la variable', type: 'text', placeholder: 'payload', mono: true },
            ],
        },
        transform: {
            cat: 'data', icon: 'shuffle', label: 'Transformation', desc: 'Restructure les variables du contexte',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'expression', label: 'Expression', type: 'textarea', placeholder: '{{ trigger.email }}', mono: true },
            ],
        },
        http: {
            cat: 'data', icon: 'globe', label: 'Requête HTTP', desc: 'Appel sortant protégé (garde-fous SSRF)',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'method', label: 'Méthode', type: 'select', options: ['GET', 'POST', 'PUT'] },
                { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.exemple.com/v1/…', mono: true },
            ],
        },
        condition: {
            cat: 'logic', icon: 'git-branch', label: 'Condition', desc: 'Deux branches : true / false',
            inputs: 1, outputs: [{ id: 'true', pos: 0.36, label: 'true' }, { id: 'false', pos: 0.68, label: 'false' }],
            fields: [
                { key: 'expression', label: 'Expression', type: 'text', placeholder: '{{ ai.label }} == "lead"', mono: true },
            ],
        },
        filter: {
            cat: 'logic', icon: 'filter', label: 'Filtre', desc: 'Ne laisse passer que les éléments valides',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'expression', label: 'Condition d’inclusion', type: 'text', mono: true },
            ],
        },
        classification: {
            cat: 'ai', icon: 'bot', label: 'Classification', desc: 'Catégorise un contenu (sortie structurée)',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: ['gpt-4o-mini', 'claude-haiku', 'claude-sonnet'] },
                { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Classe ce message parmi…' },
                { key: 'labels', label: 'Étiquettes', type: 'text', placeholder: 'lead, spam, question', mono: true },
            ],
        },
        generation: {
            cat: 'ai', icon: 'sparkles', label: 'Génération', desc: 'Produit un texte à partir du contexte',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: ['gpt-4o', 'claude-sonnet', 'claude-haiku'] },
                { key: 'prompt', label: 'Prompt', type: 'textarea' },
                { key: 'temperature', label: 'Température', type: 'range', min: 0, max: 1, step: 0.1 },
            ],
        },
        summary: {
            cat: 'ai', icon: 'file-text', label: 'Résumé', desc: 'Condense un contenu long',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: ['gpt-4o-mini', 'claude-haiku'] },
                { key: 'prompt', label: 'Consigne', type: 'textarea' },
            ],
        },
        email: {
            cat: 'action', icon: 'mail', label: 'Email', desc: 'Envoie un e-mail transactionnel',
            inputs: 1, outputs: [],
            fields: [
                { key: 'to', label: 'Destinataire', type: 'text', placeholder: '{{ trigger.email }}', mono: true },
                { key: 'subject', label: 'Sujet', type: 'text' },
                { key: 'body', label: 'Corps', type: 'textarea' },
            ],
        },
        slack: {
            cat: 'action', icon: 'message-square', label: 'Message', desc: 'Poste un message (Slack, webhook…)',
            inputs: 1, outputs: [],
            fields: [
                { key: 'channel', label: 'Canal', type: 'text', placeholder: '#ventes' },
                { key: 'message', label: 'Message', type: 'textarea' },
            ],
        },
        delay: {
            cat: 'action', icon: 'timer', label: 'Temporisation', desc: 'Attend avant de continuer',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'seconds', label: 'Durée (secondes)', type: 'text', mono: true },
            ],
        },
    };

    const NODE_EXAMPLES = {
        trigger: { event: 'lead.received', payload: { email: 'client@exemple.com', message: 'Bonjour, je veux une démo…' } },
        data: { status: 200, body: { items: 3 } },
        logic: { branch: 'true', evaluated: '{{ ai.label }} == "lead"' },
        ai: { label: 'lead', confidence: 0.94, tokens: { input: 412, output: 58 } },
        action: { delivered: true, id: 'msg_01J9…' },
    };

    let uid = 100;
    const nextId = (prefix) => `${prefix}${++uid}`;

    /* ---------------- Mixin ---------------- */
    const builderMixin = {
        data() {
            return {
                NODE_TYPES,
                CATS,
                nodeW: NODE_W,
                nodeH: NODE_H,
                wfName: 'Traitement des nouveaux leads',
                wfStatus: 'Brouillon',
                saveState: 'saved', // saved | saving
                savedAt: '12:04',
                view: { x: 30, y: 24, zoom: 0.82 },
                nodes: [
                    { id: 'n1', type: 'webhook', title: 'Nouveau lead', x: 60, y: 200, status: 'idle', config: { method: 'POST', path: 'hooks/leads' } },
                    { id: 'n2', type: 'classification', title: 'Classifier le message', x: 330, y: 150, status: 'idle', config: { model: 'claude-haiku', prompt: 'Classe ce message entrant parmi les étiquettes.', labels: 'lead, spam, question' } },
                    { id: 'n3', type: 'condition', title: 'Est-ce un lead ?', x: 610, y: 150, status: 'idle', config: { expression: '{{ ai.label }} == "lead"' } },
                    { id: 'n4', type: 'generation', title: 'Rédiger la réponse', x: 890, y: 40, status: 'idle', config: { model: 'claude-sonnet', prompt: 'Rédige une réponse commerciale courte.', temperature: 0.4 } },
                    { id: 'n5', type: 'email', title: 'Envoyer la réponse', x: 1170, y: 40, status: 'idle', config: { to: '{{ trigger.email }}', subject: 'Merci pour votre message', body: 'Bonjour {{ trigger.name }}…' } },
                    { id: 'n6', type: 'http', title: 'Noter le spam', x: 890, y: 260, status: 'idle', config: { method: 'POST', url: 'https://api.exemple.com/spam' } },
                ],
                edges: [
                    { id: 'e1', from: 'n1', fromPort: 'out', to: 'n2' },
                    { id: 'e2', from: 'n2', fromPort: 'out', to: 'n3' },
                    { id: 'e3', from: 'n3', fromPort: 'true', to: 'n4' },
                    { id: 'e4', from: 'n3', fromPort: 'false', to: 'n6' },
                    { id: 'e5', from: 'n4', fromPort: 'out', to: 'n5' },
                ],
                selection: null, // { kind: 'node'|'edge', id }
                connecting: null, // { fromId, fromPort, x, y }
                drag: null, // interaction courante
                dragNew: null, // { type, x, y } ghost palette → canvas
                running: false,
                drawerOpen: false,
                logs: [],
                runSummary: null,
                paletteOpen: true,
                inspectorOpen: true,
                inspectorTab: 'settings',
            };
        },
        computed: {
            nodeById() {
                const map = {};
                this.nodes.forEach((n) => {
                    map[n.id] = n;
                });
                return map;
            },
            worldSize() {
                return { w: 2400, h: 1400 };
            },
            zoomPercent() {
                return Math.round(this.view.zoom * 100);
            },
            selectedNode() {
                return this.selection && this.selection.kind === 'node' ? this.nodeById[this.selection.id] : null;
            },
            selectedType() {
                return this.selectedNode ? NODE_TYPES[this.selectedNode.type] : null;
            },
            nodeColor() {
                return this.selectedType ? CATS[this.selectedType.cat].color : null;
            },
            paletteGroups() {
                const groups = [];
                Object.entries(CATS).forEach(([key, cat]) => {
                    const items = Object.entries(NODE_TYPES)
                        .filter(([, def]) => def.cat === key)
                        .map(([type, def]) => ({ type, ...def }));
                    if (items.length) {
                        groups.push({ key, ...cat, items });
                    }
                });
                return groups;
            },
        },
        methods: {
            /* ---------- Thème (le builder n'utilise pas le shellMixin) ---------- */
            isDark() {
                return window.FauconUI.Theme.get() === 'dark';
            },
            toggleTheme() {
                window.FauconUI.Theme.toggle();
            },

            /* ---------- Géométrie ---------- */
            toWorld(clientX, clientY) {
                const rect = this.$refs.viewport.getBoundingClientRect();
                return {
                    x: (clientX - rect.left - this.view.x) / this.view.zoom,
                    y: (clientY - rect.top - this.view.y) / this.view.zoom,
                };
            },
            portOut(node, port) {
                return { x: node.x + NODE_W, y: node.y + NODE_H * (port.pos || 0.5) };
            },
            portIn(node) {
                return { x: node.x, y: node.y + NODE_H / 2 };
            },
            edgePath(edge) {
                const from = this.nodeById[edge.from];
                const to = this.nodeById[edge.to];
                if (!from || !to) {
                    return '';
                }
                const portDef = (NODE_TYPES[from.type].outputs || []).find((p) => p.id === edge.fromPort) || { pos: 0.5 };
                const a = this.portOut(from, portDef);
                const b = this.portIn(to);
                const dx = Math.max(44, Math.abs(b.x - a.x) * 0.5);
                return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
            },
            edgeLabelPos(edge) {
                const from = this.nodeById[edge.from];
                const to = this.nodeById[edge.to];
                if (!from || !to) {
                    return { x: 0, y: 0 };
                }
                const portDef = (NODE_TYPES[from.type].outputs || []).find((p) => p.id === edge.fromPort) || { pos: 0.5 };
                const a = this.portOut(from, portDef);
                const b = this.portIn(to);
                return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 };
            },
            connectPath() {
                if (!this.connecting) {
                    return '';
                }
                const from = this.nodeById[this.connecting.fromId];
                if (!from) {
                    return '';
                }
                const portDef = (NODE_TYPES[from.type].outputs || []).find((p) => p.id === this.connecting.fromPort) || { pos: 0.5 };
                const a = this.portOut(from, portDef);
                const b = { x: this.connecting.x, y: this.connecting.y };
                const dx = Math.max(44, Math.abs(b.x - a.x) * 0.5);
                return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
            },
            nodeStyle(node) {
                const type = NODE_TYPES[node.type];
                return {
                    left: node.x + 'px',
                    top: node.y + 'px',
                    '--node-color': CATS[type.cat].color,
                };
            },
            edgeStyle(edge) {
                const from = this.nodeById[edge.from];
                if (!from) {
                    return {};
                }
                const portDef = (NODE_TYPES[from.type].outputs || []).find((p) => p.id === edge.fromPort) || { pos: 0.5 };
                return { '--node-color': CATS[NODE_TYPES[from.type].cat].color };
            },
            portStyle(port) {
                return { top: (port.pos || 0.5) * 100 + '%' };
            },

            /* ---------- Sélection / édition ---------- */
            selectNode(id) {
                this.selection = { kind: 'node', id };
                this.inspectorTab = 'settings';
            },
            selectEdge(id) {
                this.selection = { kind: 'edge', id };
            },
            deleteSelected() {
                if (!this.selection) {
                    return;
                }
                if (this.selection.kind === 'node') {
                    this.edges = this.edges.filter((e) => e.from !== this.selection.id && e.to !== this.selection.id);
                    this.nodes = this.nodes.filter((n) => n.id !== this.selection.id);
                    this.$toast({ title: 'Node supprimé', type: 'info' });
                } else {
                    this.edges = this.edges.filter((e) => e.id !== this.selection.id);
                }
                this.selection = null;
            },
            removeEdge(id) {
                this.edges = this.edges.filter((e) => e.id !== id);
            },
            addNode(type, world) {
                const def = NODE_TYPES[type];
                const node = {
                    id: nextId('n'),
                    type,
                    title: def.label,
                    x: world.x - NODE_W / 2,
                    y: world.y - NODE_H / 2,
                    status: 'idle',
                    config: Object.fromEntries((def.fields || []).map((f) => [f.key, f.type === 'range' ? 0.5 : ''])),
                };
                this.nodes.push(node);
                this.selectNode(node.id);
                this.$toast({ title: `« ${def.label} » ajouté au graphe`, type: 'success' });
            },

            /* ---------- Canvas : pointer events ---------- */
            onViewportDown(e) {
                // fond du canvas : pan + désélection
                if (e.button !== 0 && e.button !== 1) {
                    return;
                }
                this.selecting = { sx: e.clientX, sy: e.clientY, moved: false };
                this.drag = {
                    kind: 'pan',
                    startX: this.view.x,
                    startY: this.view.y,
                    cx: e.clientX,
                    cy: e.clientY,
                };
            },
            onNodeDown(node, e) {
                if (e.button !== 0) {
                    return;
                }
                e.stopPropagation();
                this.selectNode(node.id);
                const world = this.toWorld(e.clientX, e.clientY);
                this.drag = {
                    kind: 'node',
                    id: node.id,
                    dx: world.x - node.x,
                    dy: world.y - node.y,
                    moved: false,
                };
            },
            onPortDown(node, port, e) {
                if (e.button !== 0) {
                    return;
                }
                e.stopPropagation();
                const world = this.toWorld(e.clientX, e.clientY);
                this.connecting = { fromId: node.id, fromPort: port.id, x: world.x, y: world.y };
                this.drag = { kind: 'connect' };
            },
            onPointerMove(e) {
                if (this.dragNew) {
                    this.dragNew.x = e.clientX;
                    this.dragNew.y = e.clientY;
                    return;
                }
                if (!this.drag) {
                    return;
                }
                if (this.drag.kind === 'pan') {
                    this.view.x = this.drag.startX + (e.clientX - this.drag.cx);
                    this.view.y = this.drag.startY + (e.clientY - this.drag.cy);
                    if (this.selecting && (Math.abs(e.clientX - this.selecting.sx) > 4 || Math.abs(e.clientY - this.selecting.sy) > 4)) {
                        this.selecting.moved = true;
                        this.$refs.viewport.classList.add('panning');
                    }
                } else if (this.drag.kind === 'node') {
                    const world = this.toWorld(e.clientX, e.clientY);
                    const node = this.nodeById[this.drag.id];
                    if (node) {
                        node.x = Math.round(world.x - this.drag.dx);
                        node.y = Math.round(world.y - this.drag.dy);
                        this.drag.moved = true;
                    }
                } else if (this.drag.kind === 'connect') {
                    const world = this.toWorld(e.clientX, e.clientY);
                    this.connecting.x = world.x;
                    this.connecting.y = world.y;
                }
            },
            onPointerUp(e) {
                if (this.dragNew) {
                    const rect = this.$refs.viewport.getBoundingClientRect();
                    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
                    if (inside) {
                        this.addNode(this.dragNew.type, this.toWorld(e.clientX, e.clientY));
                    }
                    this.dragNew = null;
                    return;
                }
                if (this.drag && this.drag.kind === 'pan' && this.selecting && !this.selecting.moved) {
                    // simple clic sur le fond : désélection
                    this.selection = null;
                }
                if (this.drag && this.drag.kind === 'connect') {
                    // dépose sur un port d'entrée ?
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    const portEl = el && el.closest ? el.closest('.port-in') : null;
                    if (portEl) {
                        const targetId = portEl.dataset.node;
                        const from = this.connecting.fromId;
                        const fromPort = this.connecting.fromPort;
                        if (targetId && targetId !== from && !this.edges.some((ed) => ed.from === from && ed.to === targetId)) {
                            this.edges.push({ id: nextId('e'), from, fromPort, to: targetId });
                            this.$toast({ title: 'Connexion créée', type: 'success', duration: 2200 });
                        }
                    }
                    this.connecting = null;
                }
                this.$refs.viewport.classList.remove('panning');
                this.selecting = null;
                this.drag = null;
            },
            onWheel(e) {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    const rect = this.$refs.viewport.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;
                    const factor = Math.exp(-e.deltaY * 0.0016);
                    const zoom = Math.min(2, Math.max(0.3, this.view.zoom * factor));
                    const wx = (mx - this.view.x) / this.view.zoom;
                    const wy = (my - this.view.y) / this.view.zoom;
                    this.view.x = mx - wx * zoom;
                    this.view.y = my - wy * zoom;
                    this.view.zoom = zoom;
                } else {
                    this.view.x -= e.deltaX;
                    this.view.y -= e.deltaY;
                }
            },
            zoomBy(factor) {
                const rect = this.$refs.viewport && this.$refs.viewport.getBoundingClientRect();
                if (!rect) {
                    return;
                }
                const mx = rect.width / 2;
                const my = rect.height / 2;
                const zoom = Math.min(2, Math.max(0.3, this.view.zoom * factor));
                const wx = (mx - this.view.x) / this.view.zoom;
                const wy = (my - this.view.y) / this.view.zoom;
                this.view.x = mx - wx * zoom;
                this.view.y = my - wy * zoom;
                this.view.zoom = zoom;
            },
            zoomFit() {
                const viewport = this.$refs.viewport;
                if (!viewport || !this.nodes.length) {
                    return;
                }
                const rect = viewport.getBoundingClientRect();
                const minX = Math.min(...this.nodes.map((n) => n.x)) - 90;
                const maxX = Math.max(...this.nodes.map((n) => n.x + NODE_W)) + 90;
                const minY = Math.min(...this.nodes.map((n) => n.y)) - 90;
                const maxY = Math.max(...this.nodes.map((n) => n.y + NODE_H)) + 90;
                const zoom = Math.min((rect.width - 60) / (maxX - minX), (rect.height - 60) / (maxY - minY), 1.15);
                this.view.zoom = Math.max(0.3, zoom);
                this.view.x = (rect.width - (maxX - minX) * this.view.zoom) / 2 - minX * this.view.zoom;
                this.view.y = (rect.height - (maxY - minY) * this.view.zoom) / 2 - minY * this.view.zoom;
            },

            /* ---------- Palette → canvas ---------- */
            startDragNew(type, e) {
                this.dragNew = { type, x: e.clientX, y: e.clientY };
            },
            cancelDragNew() {
                this.dragNew = null;
            },

            /* ---------- Sauvegarde simulée ---------- */
            scheduleSave() {
                if (this._saveTimer) {
                    clearTimeout(this._saveTimer);
                }
                this.saveState = 'saving';
                this._saveTimer = setTimeout(() => {
                    this.saveState = 'saved';
                    this.savedAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                }, 800);
            },

            /* ---------- Simulation d'exécution ---------- */
            async runWorkflow() {
                if (this.running) {
                    return;
                }
                this.running = true;
                this.drawerOpen = true;
                this.logs = [];
                this.runSummary = null;
                this.nodes.forEach((n) => {
                    n.status = 'idle';
                });
                this.t0 = performance.now();
                this.log('système', 'Validation du graphe… 5 nodes, 5 arêtes — OK', 'info');
                await this.wait(420);
                this.log('système', 'Exécution #exec-042 démarrée (déclencheur : webhook)', 'info');

                const order = this.topoOrder();
                for (const node of order) {
                    const def = NODE_TYPES[node.type];
                    node.status = 'running';
                    this.log(def.label, `Démarrage — ${node.title}`, 'info');
                    const ms = 380 + Math.random() * 720;
                    await this.wait(ms);
                    node.status = 'ok';
                    this.edges
                        .filter((ed) => ed.from === node.id)
                        .forEach((ed) => {
                            ed.flowing = true;
                            setTimeout(() => {
                                ed.flowing = false;
                            }, 1400);
                        });
                    this.log(def.label, `Terminé en ${Math.round(ms)} ms`, 'ok');
                    if (node.type === 'condition') {
                        this.log(def.label, 'Évaluation : label = "lead" → branche true', 'info');
                        const other = this.edges.find((ed) => ed.from === node.id && ed.fromPort === 'false');
                        if (other) {
                            const skipped = this.nodeById[other.to];
                            if (skipped && !order.includes(skipped)) {
                                skipped.status = 'idle';
                            }
                        }
                    }
                    if (node.type === 'classification') {
                        this.log(def.label, 'Sortie structurée : { label: "lead", confidence: 0.94 }', 'ok');
                    }
                    await this.wait(120);
                }
                const total = Math.round(performance.now() - this.t0);
                this.runSummary = { ok: true, nodes: order.length, ms: total };
                this.log('système', `Exécution terminée avec succès en ${(total / 1000).toFixed(1)} s`, 'ok');
                this.running = false;
                this.$toast({ title: 'Exécution réussie', description: `${order.length} nodes · ${(total / 1000).toFixed(1)} s`, type: 'success' });
            },
            topoOrder() {
                // BFS depuis les déclencheurs
                const targets = new Set(this.edges.map((e) => e.to));
                const queue = this.nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);
                const order = [];
                const seen = new Set();
                while (queue.length) {
                    const id = queue.shift();
                    if (seen.has(id)) {
                        continue;
                    }
                    seen.add(id);
                    const node = this.nodeById[id];
                    if (node) {
                        order.push(node);
                    }
                    this.edges.filter((e) => e.from === id).forEach((e) => queue.push(e.to));
                }
                this.nodes.forEach((n) => {
                    if (!seen.has(n.id)) {
                        order.push(n);
                    }
                });
                return order;
            },
            wait(ms) {
                return new Promise((resolve) => setTimeout(resolve, ms));
            },
            log(node, msg, level) {
                const t = ((performance.now() - this.t0) / 1000).toFixed(2);
                this.logs.push({ t: `${t}s`, node, msg, level });
                this.$nextTick(() => {
                    const box = this.$refs.logs;
                    if (box) {
                        box.scrollTop = box.scrollHeight;
                    }
                });
            },
            onKeydown(e) {
                const tag = (e.target && e.target.tagName) || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                    return;
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.deleteSelected();
                } else if (e.key === 'Escape') {
                    this.connecting = null;
                    this.dragNew = null;
                    this.selection = null;
                }
            },
        },
        mounted() {
            window.addEventListener('pointermove', this.onPointerMove);
            window.addEventListener('pointerup', this.onPointerUp);
            window.addEventListener('keydown', this.onKeydown);
            this.$refs.viewport.addEventListener('wheel', this.onWheel, { passive: false });
            this.$watch(
                () => JSON.stringify([this.nodes, this.edges, this.wfName]),
                () => this.scheduleSave()
            );
        },
        beforeUnmount() {
            window.removeEventListener('pointermove', this.onPointerMove);
            window.removeEventListener('pointerup', this.onPointerUp);
            window.removeEventListener('keydown', this.onKeydown);
        },
    };

    window.FauconUI = window.FauconUI || {};
    window.FauconUI.builderMixin = builderMixin;
    window.FauconUI.builderHelpers = { NODE_TYPES, CATS, NODE_EXAMPLES, NODE_W, NODE_H };
})();
