# L'Écho des Hauts

Démonstrateur — magazine éditorial local. **Strapi 5** pour le back-office, **Astro** en rendu
statique intégral pour le site public.

Ce dépôt ne contient **que le code**. Le média « L'Écho des Hauts » est fictif : c'est une
démonstration technique, pas un journal réel.

## Ce que le projet cherche à prouver

Un site éditorial à fort volume peut être servi en **pur statique** — aucun rendu serveur, aucune
base de données interrogée à la lecture — tout en laissant une rédaction non technique publier
depuis un back-office confortable. Deux contraintes structurent tout le reste :

- **`output: 'static'` intégral**, aucune route serveur.
- **Zéro JavaScript servi** sur les pages, hors la page de recherche.

Le contenu vit dans Strapi ; le site est reconstruit à chaque publication et déployé comme un
ensemble de fichiers.

## Structure du dépôt

```
apps/
  cms/    Strapi 5 — modèle de données, back-office, webhook de publication
  web/    Astro — site public, généré au build depuis l'API Strapi
```

Les deux applications sont indépendantes : chacune a son `package.json`, ses dépendances et son
cycle de vie. Il n'y a **pas** d'outil de monorepo (ni workspaces npm, ni Turborepo) — on installe
et on lance chaque application depuis son propre dossier.

## Prérequis

| | Version |
|---|---|
| Node.js pour `apps/cms` | `>= 20` et `<= 26` (`package.json`, champ `engines`) |
| Node.js pour `apps/web` | `>= 22.12` |
| npm | fourni avec Node |
| PostgreSQL | facultatif en local — SQLite est le défaut ; requis en production |

Une seule version de Node satisfait les deux applications : **Node 22 LTS** ou **Node 24**.

## Installation — back-office Strapi (`apps/cms`)

```bash
cd apps/cms
npm install
cp .env.example .env
```

Le fichier `.env.example` ne contient que des **valeurs-gabarit** (`tobemodified`). Elles doivent
toutes être remplacées avant le premier démarrage : Strapi chiffre des données avec, et une clé
perdue rend ces données illisibles.

Générer des valeurs aléatoires :

```bash
node -e "const c=require('crypto'), r=()=>c.randomBytes(32).toString('base64');
for (const k of ['APP_KEYS','API_TOKEN_SALT','ADMIN_JWT_SECRET','TRANSFER_TOKEN_SALT','JWT_SECRET','ENCRYPTION_KEY'])
  console.log([k, k === 'APP_KEYS' ? [r(), r()].join(',') : r()].join('='));"
```

Puis :

```bash
npm run develop     # démarre sur http://localhost:1337, admin sur /admin
```

Au premier lancement, Strapi demande la création du compte administrateur.

### Variables d'environnement de `apps/cms`

Aucune n'a de valeur par défaut utilisable en production : toutes sont injectées par
l'environnement, jamais écrites dans le dépôt.

| Variable | Rôle | En local |
|---|---|---|
| `HOST`, `PORT` | interface et port d'écoute | `0.0.0.0`, `1337` |
| `APP_KEYS` | clés de session (liste séparée par des virgules) | à générer |
| `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `JWT_SECRET`, `ENCRYPTION_KEY` | secrets applicatifs Strapi | à générer |
| `DATABASE_CLIENT` | `sqlite` (défaut), `postgres` ou `mysql` | `sqlite` |
| `DATABASE_URL` *ou* `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_NAME` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | connexion PostgreSQL | sans objet en SQLite |
| `PUBLIC_URL` | URL publique du back-office derrière un proxy inverse | `http://localhost:1337` |

`config/server.ts` pose `proxy: true` : derrière un proxy qui termine le TLS, `PUBLIC_URL` doit
être renseignée en `https://…`, faute de quoi Strapi fabrique des liens en `http://`.

En SQLite, la base est un fichier sous `apps/cms/.tmp/` — ignoré par Git.

## Installation — site public Astro (`apps/web`)

```bash
cd apps/web
npm install
npm run dev       # http://localhost:4321
npm run build     # génère ./dist/
npm run preview   # sert ./dist/ localement
```

`npm run build` produit un dossier de fichiers statiques ; il n'y a rien à exécuter côté serveur
pour le servir. Le site consomme l'API Strapi **au build**, jamais à la lecture, avec un token API
en **lecture seule** injecté par l'environnement.

> **État d'avancement** — `apps/web` est encore le squelette Astro : l'intégration du contenu
> Strapi (loader, routes, rendu de la Dynamic Zone) est en cours d'écriture. Les commandes
> ci-dessus fonctionnent, mais le site ne rend pas encore d'articles.

## Déploiement

L'image de production du back-office est décrite par `apps/cms/Dockerfile` (build multi-étages,
image finale `node:22-alpine`, `HEALTHCHECK` sur l'écoute TCP du port 1337). Le site public, lui,
n'a pas d'image : `npm run build` suffit, et le contenu de `dist/` est servi tel quel.

La chaîne de publication est déclenchée par un **webhook Strapi** à la publication d'un contenu :
il appelle l'hébergeur, qui relance le build du site. Le jeton porté par ce webhook vit dans les
variables d'environnement de Strapi — jamais dans ce dépôt.

## Secrets

**Aucun secret ne doit entrer dans ce dépôt, qui est public.** Trois garde-fous :

1. `.gitignore` exclut `.env` et `.env.*`, sauf `.env.example` — lequel ne porte que des
   valeurs-gabarit.
2. `secret scanning` et `push protection` sont activés côté GitHub : un push contenant une clé
   reconnue est refusé.
3. L'historique est relu périodiquement, et pas seulement le dernier commit.

Un secret poussé ici est **brûlé** même s'il est retiré au commit suivant : l'historique reste
public. Le geste correct est de le **révoquer et le régénérer**, pas de le supprimer.

## Ce que ce dépôt ne contient pas

Le cahier des charges, les arbitrages de conception, le plan éditorial, le protocole de mesure et
le runbook de provisionnement sont de la **documentation interne** et vivent dans un dépôt privé
séparé. Ce dépôt-ci est le livrable « code ».
