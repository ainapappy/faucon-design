# Faucon Design - UI Kit & Product Prototype

Prototype front-end complet pour une plateforme d'automatisation de workflows orientee SaaS.

Ce repository presente une maquette premium, interactive et prete a etre transformee en produit client (MVP, demo commerciale, proof-of-concept ou base de design system).

## Pourquoi ce projet peut aider vos clients

- Acceleration du time-to-market: vous partez d'une base deja structuree.
- Experience utilisateur moderne: interface claire, fluide, orientee conversion.
- Demonstration commerciale immediate: ideal pour convaincre un prospect ou un investisseur.
- Base evolutive: les ecrans couvrent tout le cycle produit (auth, dashboard, workflows, executions, settings).

## Ce que contient la maquette

11 ecrans fonctionnels:

- Authentification: login, register, forgot/reset/confirm password
- Pilotage: dashboard KPI et activite live
- Automatisation: workflows, builder visuel, executions, templates
- Administration: settings (profil, securite, equipe, integrations)

Interactions implementees:

- Theme clair/sombre avec memorisation locale
- Palette de commandes (Ctrl/Cmd + K)
- Toasts de feedback utilisateur
- Graphiques SVG dynamiques
- Builder de workflow interactif (drag/drop logique, connexions, simulation)

## Stack utilisee

- HTML5
- CSS (tokens + composants + styles d'application)
- JavaScript Vanilla
- Vue 3 (CDN)
- Lucide Icons

## Structure rapide

```text
.
|- index.html
|- login.html / register.html / forgot-password.html / reset-password.html / confirm-password.html
|- dashboard.html
|- workflows.html
|- builder.html
|- executions.html
|- templates.html
|- settings.html
|- css/
|  |- tokens.css
|  |- base.css
|  |- components.css
|  |- app.css
|- js/
|  |- app.js
|  |- builder.js
```

## Lancer en local

Comme il s'agit de maquettes statiques, ouvrez simplement `index.html` dans votre navigateur.

Pour une meilleure experience (liens, assets, cache), vous pouvez aussi lancer un serveur statique:

```bash
# exemple Python
python -m http.server 8080
```

Puis ouvrir:

```text
http://localhost:8080
```

## Pour vos besoins clients

Je peux adapter cette base pour:

- votre branding (couleurs, typo, tone of voice)
- votre domaine metier (immobilier, e-commerce, RH, support, etc.)
- votre stack cible (Laravel, Vue, Inertia, API, CRM)
- vos parcours de conversion (lead capture, onboarding, activation)

## Utilisation libre

Ce projet est propose en utilisation libre:

- usage personnel ou commercial
- modification autorisee
- redistribution autorisee

Attribution appreciee: mentionner ce repository ou le createur dans vos credits.

## Contact

Vous souhaitez une version personnalisee, plus dynamique, ou prete a vendre a vos clients ?

Contactez-moi:

- GitHub: via les Issues ou Discussions du repository
- Email: ainapappy@gmail.com ou nyaina@ainatrix.com
- web: https://www.ainatrix.com

Je peux transformer cette maquette en produit operationnel et deployable.
