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

    /* Options du select Modèle — composite {provider}/{model}, reflétées de la
       config serveur (fournisseurs enabled uniquement, fake d'abord : un
       test-run ne dépense jamais un appel réel par accident). */
    const AI_MODEL_OPTIONS = [
        'fake/demo',
        'openai/gpt-4o-mini',
        'openai/gpt-4o',
        'anthropic/claude-haiku-4-5',
        'anthropic/claude-sonnet-5',
        'anthropic/claude-opus-5',
        'zai/glm-4.6',
        'zai/glm-4.5-flash',
    ];

    /* Clés de sortie des nodes IA (contrat moteur) : la clé usage
       {prompt_tokens, completion_tokens} accompagne toujours la sortie du mode. */
    const AI_OUTPUT_KEYS = {
        'ai.prompt': ['text', 'usage'],
        'ai.classification': ['label', 'usage'],
        'ai.extraction': ['structured', 'usage'],
        'ai.summarization': ['text', 'usage'],
        'ai.generation': ['text', 'usage'],
    };

    /* Catalogue de types — miroir du futur registre de handlers */
    const NODE_TYPES = {
        webhook: {
            cat: 'trigger', icon: 'webhook', label: 'Webhook', desc: 'Appel HTTP entrant, idempotent et rate-limité',
            inputs: 0, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'sample_input', label: 'Input d’échantillon (JSON)', type: 'textarea', placeholder: '{ "email": "client@example.com" }', mono: true },
            ],
            webhookPanel: true,
        },
        schedule: {
            cat: 'trigger', icon: 'calendar-clock', label: 'Planifié', desc: 'Exécution récurrente (expression cron)',
            inputs: 0, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'cron', label: 'Expression cron', type: 'text', placeholder: '0 9 * * 1', mono: true },
                { key: 'sample_input', label: 'Input d’échantillon (JSON)', type: 'textarea', placeholder: '{ "email": "client@example.com" }', mono: true },
            ],
        },
        manual: {
            cat: 'trigger', icon: 'play', label: 'Manuel', desc: 'Lancement depuis l’interface',
            inputs: 0, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'sample_input', label: 'Input d’échantillon (JSON)', type: 'textarea', placeholder: '{ "email": "client@example.com" }', mono: true },
            ],
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
        output: {
            cat: 'data', icon: 'arrow-right-to-line', label: 'Sortie', desc: 'Termine le run et expose le résultat final',
            inputs: 1, outputs: [],
            fields: [],
        },
        condition: {
            cat: 'logic', icon: 'git-branch', label: 'Condition', desc: 'Deux branches : true / false',
            inputs: 1, outputs: [{ id: 'true', pos: 0.36, label: 'true' }, { id: 'false', pos: 0.68, label: 'false' }],
            fields: [
                { key: 'expression', label: 'Expression', type: 'text', placeholder: '{{ ai.label }}', mono: true },
                { key: 'operator', label: 'Opérateur', type: 'select', options: ['==', '!=', 'contains', 'empty'] },
                { key: 'value', label: 'Valeur', type: 'text', placeholder: 'lead' },
            ],
        },
        filter: {
            cat: 'logic', icon: 'filter', label: 'Filtre', desc: 'Ne laisse passer que les éléments qui satisfont la condition',
            inputs: 1, outputs: [{ id: 'passed', pos: 0.3, label: 'Passés' }, { id: 'dropped', pos: 0.7, label: 'Écartés' }],
            fields: [
                { key: 'expression', label: 'Liste à filtrer', type: 'text', placeholder: '{{ input.items }}', mono: true },
                { key: 'operator', label: 'Opérateur', type: 'select', options: ['==', '!=', 'contains', 'empty'] },
                { key: 'value', label: 'Valeur', type: 'text', placeholder: 'lead' },
            ],
        },
        'logic.batch': {
            cat: 'logic', icon: 'repeat', label: 'Boucle', desc: 'Exécute le corps pour chaque élément d’une liste (séquentiel, plafonné à 100 items)',
            inputs: 1, outputs: [{ id: 'item', pos: 0.34, label: 'Pour chaque' }, { id: 'done', pos: 0.72, label: 'Après la boucle' }],
            fields: [
                { key: 'expression', label: 'Liste source', type: 'text', placeholder: '{{ trigger.items }}', mono: true },
                { key: 'failure_policy', label: 'Politique d’échec', type: 'select', options: ['fail', 'continue'] },
            ],
            batchPanel: true,
        },
        'ai.prompt': {
            cat: 'ai', icon: 'pen-line', label: 'Prompt', desc: 'Interroge un modèle IA avec un prompt libre',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: AI_MODEL_OPTIONS },
                { key: 'prompt', label: 'Prompt', type: 'textarea' },
                { key: 'temperature', label: 'Température', type: 'range', min: 0, max: 1, step: 0.1 },
                { key: 'max_tokens', label: 'Max tokens', type: 'text', mono: true },
            ],
        },
        'ai.classification': {
            cat: 'ai', icon: 'bot', label: 'Classification', desc: 'Catégorise un contenu (sortie structurée)',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: AI_MODEL_OPTIONS },
                { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Classe ce message parmi…' },
                { key: 'labels', label: 'Étiquettes', type: 'text', placeholder: 'lead, spam, question', mono: true },
                { key: 'temperature', label: 'Température', type: 'range', min: 0, max: 1, step: 0.1 },
                { key: 'max_tokens', label: 'Max tokens', type: 'text', mono: true },
            ],
        },
        'ai.extraction': {
            cat: 'ai', icon: 'scan-text', label: 'Extraction', desc: 'Extrait des champs structurés (JSON) d’un contenu',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: AI_MODEL_OPTIONS },
                { key: 'prompt', label: 'Contenu à analyser', type: 'textarea' },
                { key: 'fields', label: 'Champs (Clé: type, une par ligne)', type: 'textarea', placeholder: 'nom: text\nmontant: number', mono: true },
                { key: 'temperature', label: 'Température', type: 'range', min: 0, max: 1, step: 0.1 },
                { key: 'max_tokens', label: 'Max tokens', type: 'text', mono: true },
            ],
        },
        'ai.summarization': {
            cat: 'ai', icon: 'file-text', label: 'Résumé', desc: 'Condense un contenu long',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: AI_MODEL_OPTIONS },
                { key: 'prompt', label: 'Consigne', type: 'textarea' },
                { key: 'temperature', label: 'Température', type: 'range', min: 0, max: 1, step: 0.1 },
                { key: 'max_tokens', label: 'Max tokens', type: 'text', mono: true },
            ],
        },
        'ai.generation': {
            cat: 'ai', icon: 'sparkles', label: 'Génération', desc: 'Produit un texte à partir du contexte',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'model', label: 'Modèle', type: 'select', options: AI_MODEL_OPTIONS },
                { key: 'prompt', label: 'Instructions', type: 'textarea' },
                { key: 'temperature', label: 'Température', type: 'range', min: 0, max: 1, step: 0.1 },
                { key: 'max_tokens', label: 'Max tokens', type: 'text', mono: true },
            ],
        },
        email: {
            cat: 'action', icon: 'mail', label: 'Email', desc: 'Envoie un e-mail transactionnel',
            inputs: 1, outputs: [],
            fields: [
                { key: 'to', label: 'Destinataire', type: 'text', placeholder: '{{ trigger.email }}', mono: true },
                { key: 'subject', label: 'Sujet', type: 'text' },
                { key: 'body', label: 'Corps', type: 'textarea' },
                { key: 'integration_id', label: 'Intégration SMTP (optionnelle)', type: 'integration' },
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
        http: {
            cat: 'action', icon: 'globe', label: 'Requête HTTP', desc: 'Appel sortant protégé (garde-fous SSRF)',
            inputs: 1, outputs: [{ id: 'out', pos: 0.5 }],
            fields: [
                { key: 'method', label: 'Méthode', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
                { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.exemple.com/v1/…', mono: true },
                { key: 'headers', label: 'En-têtes (Clé: valeur, une par ligne)', type: 'textarea', placeholder: 'Content-Type: application/json', mono: true },
                { key: 'body', label: 'Corps', type: 'textarea', placeholder: '{"name": "{{ trigger.name }}"}', mono: true },
                { key: 'integration_id', label: 'Intégration', type: 'integration' },
                { key: 'failure_policy', label: 'Politique d’échec', type: 'select', options: ['fail', 'continue'] },
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
        ai: { label: 'lead', usage: { prompt_tokens: 128, completion_tokens: 45 } },
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
                wfName: 'Relance des devis en attente',
                wfStatus: 'Brouillon',
                saveState: 'saved', // saved | saving
                savedAt: '12:04',
                view: { x: 30, y: 24, zoom: 0.82 },
                nodes: [
                    { id: 'n1', type: 'schedule', title: 'Chaque matin', x: 60, y: 210, status: 'idle', config: { cron: '0 8 * * 1-5', sample_input: '{ "statut": "en_attente" }' } },
                    { id: 'n2', type: 'http', title: 'Lister les devis', x: 330, y: 210, status: 'idle', config: { method: 'GET', url: 'https://erp.exemple.com/v1/devis?statut=en_attente', headers: '', body: '', integration_id: '', failure_policy: 'fail' } },
                    { id: 'n3', type: 'logic.batch', title: 'Relancer chaque devis', x: 610, y: 210, status: 'idle', config: { expression: '{{ erp.body.devis }}', failure_policy: 'continue' } },
                    { id: 'n4', type: 'email', title: 'Relancer le client', x: 950, y: 130, status: 'idle', config: { to: '{{ item.email }}', subject: 'Relance devis {{ item.reference }} ({{ batch.index }}/{{ batch.total }})', body: 'Bonjour {{ item.contact }}, votre devis {{ item.reference }} du {{ item.date_emission }} reste sans réponse. Sauriez-vous nous dire où il en est ?', integration_id: '' } },
                    { id: 'n5', type: 'output', title: 'Synthèse de la relance', x: 950, y: 320, status: 'idle', config: {} },
                ],
                edges: [
                    { id: 'e1', from: 'n1', fromPort: 'out', to: 'n2' },
                    { id: 'e2', from: 'n2', fromPort: 'out', to: 'n3' },
                    { id: 'e3', from: 'n3', fromPort: 'item', to: 'n4' },
                    { id: 'e4', from: 'n3', fromPort: 'done', to: 'n5' },
                ],
                selection: null, // { kind: 'node'|'edge', id }
                connecting: null, // { fromId, fromPort, x, y }
                drag: null, // interaction courante
                dragNew: null, // { type, x, y } ghost palette → canvas
                running: false,
                drawerOpen: false,
                logs: [],
                runSummary: null,
                /* Erreur de l'input d'échantillon du déclencheur (affichée dans l'inspecteur, sous le champ) */
                sampleError: null,
                paletteOpen: true,
                inspectorOpen: true,
                inspectorTab: 'settings',
                regenerateOpen: false,
                /* Aide-mémoire des variables de l'inspecteur IA (repliable) */
                aiCheatOpen: false,
                /* Aide-mémoire du contexte d'itération (node logic.batch) */
                batchCheatOpen: false,
                batchVariables: [
                    { expr: '{{ item.champ }}', desc: 'Champ de l’élément courant' },
                    { expr: '{{ item }}', desc: 'L’élément courant entier (valeur brute)' },
                    { expr: '{{ batch.index }}', desc: 'Position de l’item, à partir de 1' },
                    { expr: '{{ batch.total }}', desc: 'Nombre d’items de la liste' },
                ],
                /* Groupes « item » du journal d'exécution : repliables (ouverts par défaut) */
                collapsedItems: {},
                /* Items de démonstration de la boucle (run testé : 3 devis, 1 échec) */
                demoItems: [
                    { reference: 'D-2026-1041', contact: 'Kadia R.', email: 'kadia@exemple.com' },
                    { reference: 'D-2026-1042', contact: 'Boutique MDA', email: '' },
                    { reference: 'D-2026-1043', contact: 'Hery T.', email: 'hery@exemple.com' },
                ],
                /* Intégrations de l'équipe (props, jamais de credential) */
                integrations: [
                    { id: 1, name: 'CRM API — production', type: 'generic_http' },
                    { id: 2, name: 'SMTP transactionnel', type: 'smtp' },
                ],
                /* URL publique du webhook du workflow (chargée à la sélection du node) */
                webhookUrl: 'https://faucon.app/webhooks/9f8e7d6c5b4a3f2e1d0c',
                webhookUrlLoading: false,
                webhookCopied: false,
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
            /* Chemins interpolables du node sélectionné : contexte trigger +
               ancêtres (BFS sur les arêtes entrants), aide-mémoire de l'inspecteur IA. */
            upstreamVariables() {
                if (!this.selectedNode) {
                    return [];
                }
                const paths = ['{{ trigger.… }}'];
                const parentsOf = {};
                this.edges.forEach((e) => {
                    (parentsOf[e.to] = parentsOf[e.to] || []).push(e.from);
                });
                const seen = new Set();
                const queue = (parentsOf[this.selectedNode.id] || []).slice();
                while (queue.length) {
                    const id = queue.shift();
                    if (seen.has(id)) {
                        continue;
                    }
                    seen.add(id);
                    (parentsOf[id] || []).forEach((parent) => queue.push(parent));
                    const node = this.nodeById[id];
                    if (!node) {
                        continue;
                    }
                    if (NODE_TYPES[node.type] && NODE_TYPES[node.type].cat === 'trigger') {
                        // Le payload du déclencheur vit sous le contexte `trigger` (déjà listé).
                        continue;
                    }
                    if (node.type === 'input') {
                        const name = String(node.config.name || '').trim() || 'payload';
                        paths.push(`{{ ${name}.… }}`);
                        continue;
                    }
                    const outputKeys = AI_OUTPUT_KEYS[node.type];
                    if (outputKeys) {
                        outputKeys.forEach((outputKey) => paths.push(`{{ ${id}.${outputKey} }}`));
                        continue;
                    }
                    paths.push(`{{ ${id}.… }}`);
                }
                return paths;
            },
            /* Journal groupé : les lignes marquées d'un index d'item forment
               des sous-groupes « item 1…N » (statut par item), les autres
               restent des lignes à plat. */
            logGroups() {
                const segments = [];
                let current = null;
                this.logs.forEach((l) => {
                    if (l.item == null) {
                        current = null;
                        segments.push({ kind: 'line', line: l });
                        return;
                    }
                    if (!current || current.item !== l.item) {
                        current = { kind: 'group', item: l.item, total: l.total, label: l.itemLabel, status: 'ok', lines: [] };
                        segments.push(current);
                    }
                    if (l.itemLabel) {
                        current.label = l.itemLabel;
                    }
                    if (l.level === 'err') {
                        current.status = 'err';
                    }
                    current.lines.push(l);
                });
                return segments;
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

            /* ---------- Usage tokens des nodes IA ---------- */
            aiUsageText(output) {
                const usage = output && output.usage;
                if (
                    usage
                    && typeof usage.prompt_tokens === 'number'
                    && typeof usage.completion_tokens === 'number'
                ) {
                    return `Tokens : ${usage.prompt_tokens} prompt · ${usage.completion_tokens} réponse`;
                }
                return null;
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
            /* Libellé du port d'origine d'une arête (label du catalogue si défini,
               sinon id brut) — jamais la couleur seule sur le canvas. */
            portLabel(edge) {
                const from = this.nodeById[edge.from];
                const portDef = from
                    ? (NODE_TYPES[from.type].outputs || []).find((p) => p.id === edge.fromPort)
                    : null;
                return (portDef && portDef.label) || edge.fromPort;
            },
            /* Corps d'une boucle : nodes atteignables depuis la sortie « item »
               sans retraverser le node batch ni entrer dans la fermeture de « done »
               (règles de graphe — même définition que la validation à la sauvegarde). */
            batchBodyOf(batchId) {
                const doneClosure = new Set();
                const doneQueue = this.edges.filter((e) => e.from === batchId && e.fromPort === 'done').map((e) => e.to);
                while (doneQueue.length) {
                    const id = doneQueue.shift();
                    if (doneClosure.has(id)) {
                        continue;
                    }
                    doneClosure.add(id);
                    this.edges.filter((e) => e.from === id).forEach((e) => doneQueue.push(e.to));
                }
                const body = [];
                const seen = new Set([batchId, ...doneClosure]);
                const queue = this.edges.filter((e) => e.from === batchId && e.fromPort === 'item').map((e) => e.to);
                while (queue.length) {
                    const id = queue.shift();
                    if (seen.has(id)) {
                        continue;
                    }
                    seen.add(id);
                    const node = this.nodeById[id];
                    if (node) {
                        body.push(node);
                    }
                    this.edges.filter((e) => e.from === id).forEach((e) => queue.push(e.to));
                }
                return body;
            },
            toggleItemGroup(item) {
                this.collapsedItems = { ...this.collapsedItems, [item]: !this.collapsedItems[item] };
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
            async copyWebhookUrl() {
                try {
                    await navigator.clipboard.writeText(this.webhookUrl);
                    this.webhookCopied = true;
                    setTimeout(() => {
                        this.webhookCopied = false;
                    }, 2000);
                } catch (e) {
                    this.$toast({ title: 'Copie impossible', type: 'error' });
                }
            },
            regenerateWebhookToken() {
                this.regenerateOpen = true;
            },
            confirmRegenerateWebhookToken() {
                this.regenerateOpen = false;
                /* App serveur : nouveau token + hash, l'ancienne URL meurt immédiatement */
                this.webhookUrl = `https://faucon.app/webhooks/${Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
                this.$toast({ title: 'Token régénéré', description: 'L’ancienne URL n’est plus valide.', type: 'success' });
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
                    // Select initialisé sur sa première option (fake/demo pour le Modèle IA).
                    config: Object.fromEntries((def.fields || []).map((f) => [f.key, f.type === 'select' ? (f.options && f.options[0] || '') : f.type === 'range' ? 0.5 : ''])),
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

            /* ---------- Test d'exécution (sample stocké dans le déclencheur, plus de popup) ---------- */
            sampleOf() {
                const trigger = this.nodes.find((n) => NODE_TYPES[n.type] && NODE_TYPES[n.type].cat === 'trigger');
                const raw = trigger && trigger.config && typeof trigger.config.sample_input === 'string' ? trigger.config.sample_input : '';
                return { trigger, raw };
            },

            runTest() {
                if (this.running) {
                    return;
                }
                const { trigger, raw } = this.sampleOf();
                if (!trigger) {
                    this.$toast({ title: 'Aucun déclencheur', description: 'Ajoutez un node déclencheur pour tester le workflow.', type: 'error' });
                    return;
                }
                try {
                    if (raw.trim()) {
                        JSON.parse(raw);
                    }
                } catch (e) {
                    /* JSON invalide : message d'erreur en bas, comme l'ancienne dialog —
                       l'inspecteur s'ouvre sur le déclencheur, sous le champ. */
                    this.sampleError = `JSON invalide — ${e.message}`;
                    this.selectNode(trigger.id);
                    this.inspectorTab = 'settings';
                    this.inspectorOpen = true;
                    return;
                }
                this.sampleError = null;
                this.runWorkflow();
            },

            async runWorkflow() {
                if (this.running) {
                    return;
                }
                const { trigger, raw } = this.sampleOf();
                let sample = {};
                try {
                    sample = raw.trim() ? JSON.parse(raw) : {};
                } catch (e) {
                    return;
                }
                const sampleKeys = Object.keys(sample).length;
                this.running = true;
                this.drawerOpen = true;
                this.logs = [];
                this.runSummary = null;
                this.nodes.forEach((n) => {
                    n.status = 'idle';
                });
                this.t0 = performance.now();
                this.log('système', `Validation du graphe… ${this.nodes.length} nodes, ${this.edges.length} arêtes — OK`, 'info');
                /* Règles de graphe des boucles (même messages que la validation à la sauvegarde) */
                this.nodes.filter((n) => n.type === 'logic.batch').forEach((b) => {
                    const itemTargets = this.edges.filter((e) => e.from === b.id && e.fromPort === 'item');
                    const doneTargets = this.edges.filter((e) => e.from === b.id && e.fromPort === 'done');
                    if (!itemTargets.length) {
                        this.log('système', `Boucle « ${b.title} » : le corps de la boucle est vide : connectez au moins un node à la sortie « item ».`, 'err');
                    } else if (doneTargets.length !== 1) {
                        this.log('système', `Boucle « ${b.title} » : la sortie « done » doit avoir exactement une reprise, en a ${doneTargets.length}.`, 'err');
                    } else {
                        const body = this.batchBodyOf(b.id);
                        this.log('système', `Boucle « ${b.title} » : corps de ${body.length} node${body.length > 1 ? 's' : ''}, reprise « Après la boucle » unique — OK`, 'info');
                    }
                });
                await this.wait(420);
                this.log('système', `Test démarré — déclencheur : ${NODE_TYPES[trigger.type].label.toLowerCase()}, input d'échantillon (${sampleKeys} clés)`, 'info');

                /* Les nodes du corps de boucle ne sont pas exécutés au niveau
                   principal : ils le sont une fois par item, dans la boucle. */
                const bodyIds = new Set(
                    this.nodes
                        .filter((n) => n.type === 'logic.batch')
                        .flatMap((b) => this.batchBodyOf(b.id).map((n) => n.id)),
                );
                const order = this.topoOrder().filter((n) => !bodyIds.has(n.id));
                let runItems = 0;
                let runFailed = 0;
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
                    if (node.type === 'logic.batch') {
                        const result = await this.runBatch(node, def);
                        runItems = result.processed + result.failed;
                        runFailed = result.failed;
                        const doneEdge = this.edges.find((ed) => ed.from === node.id && ed.fromPort === 'done');
                        if (doneEdge) {
                            doneEdge.flowing = true;
                            setTimeout(() => {
                                doneEdge.flowing = false;
                            }, 1400);
                        }
                    }
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
                    if (node.type && node.type.indexOf('ai.') === 0) {
                        const usage = `Tokens : ${120 + Math.floor(Math.random() * 90)} prompt · ${28 + Math.floor(Math.random() * 50)} réponse`;
                        if (node.type === 'ai.classification') {
                            this.log(def.label, 'Sortie structurée : { label: "lead" }', 'ok', usage);
                        } else {
                            this.log(def.label, 'Complétion reçue — sortie disponible pour les nodes suivants', 'ok', usage);
                        }
                    }
                    if (node.type === 'output') {
                        this.log(def.label, `Résultat final exposé : { processed: ${runItems - runFailed}, failed: ${runFailed} } — fin du run`, 'ok');
                    }
                    await this.wait(120);
                }
                const total = Math.round(performance.now() - this.t0);
                this.runSummary = { ok: true, nodes: order.length, ms: total, items: runItems, failed: runFailed };
                this.log('système', `Test terminé avec succès en ${(total / 1000).toFixed(1)} s`, 'ok');
                this.running = false;
                this.$toast({ title: 'Test réussi', description: `${order.length} nodes · ${runItems} items · ${(total / 1000).toFixed(1)} s`, type: 'success' });
            },

            /* ---------- Boucle logic.batch : exécution séquentielle par item ---------- */
            async runBatch(node, def) {
                const body = this.batchBodyOf(node.id);
                const policy = node.config.failure_policy === 'continue' ? 'continue' : 'fail';
                const items = this.demoItems;
                this.log(def.label, `Liste résolue : ${items.length} items (plafond : 100) — politique d'échec : ${policy}`, 'info');
                let processed = 0;
                let failed = 0;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemLabel = `devis ${item.reference} · ${item.contact}`;
                    const mark = { item: i + 1, total: items.length, itemLabel };
                    node.status = 'running';
                    this.log(def.label, `Item ${i + 1}/${items.length} — contexte posé : {{ item }}, {{ batch.index }} = ${i + 1}, {{ batch.total }} = ${items.length}`, 'info', null, mark);
                    const itemEdge = this.edges.find((ed) => ed.from === node.id && ed.fromPort === 'item');
                    if (itemEdge) {
                        itemEdge.flowing = true;
                        setTimeout(() => {
                            itemEdge.flowing = false;
                        }, 1400);
                    }
                    let itemFailed = false;
                    for (const bn of body) {
                        const bDef = NODE_TYPES[bn.type];
                        bn.status = 'running';
                        this.log(bDef.label, `Démarrage — ${bn.title}`, 'info', null, mark);
                        const bMs = 320 + Math.random() * 420;
                        await this.wait(bMs);
                        /* Item de démonstration sans e-mail : l'interpolation
                           {{ item.email }} ne résout pas → échec de l'envoi. */
                        if (bn.type === 'email' && !item.email) {
                            itemFailed = true;
                            bn.status = 'error';
                            this.log(bDef.label, `Échec — destinataire vide : {{ item.email }} non résolu pour cet item`, 'err', null, mark);
                            break;
                        }
                        bn.status = 'ok';
                        this.log(bDef.label, `Envoyé à {{ item.email }} → ${item.email} — terminé en ${Math.round(bMs)} ms`, 'ok', null, mark);
                    }
                    if (itemFailed) {
                        failed++;
                        if (policy === 'fail') {
                            this.log(def.label, 'Politique « fail » : la boucle s’arrête au premier item en échec — le run échoue, « done » n’est pas atteint.', 'err', null, mark);
                            node.status = 'error';
                            return { processed, failed };
                        }
                        this.log(def.label, `Politique « continue » : item compté en échec, passage au suivant.`, 'info', null, mark);
                    } else {
                        processed++;
                    }
                    await this.wait(140);
                }
                node.status = 'ok';
                this.log(def.label, `Boucle terminée — sortie : { processed: ${processed}, failed: ${failed} }`, 'ok');
                return { processed, failed };
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
            log(node, msg, level, usage, extra) {
                const t = ((performance.now() - this.t0) / 1000).toFixed(2);
                const entry = { t: `${t}s`, node, msg, level };
                if (usage) {
                    entry.usage = usage;
                }
                if (extra) {
                    Object.assign(entry, extra);
                }
                this.logs.push(entry);
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
