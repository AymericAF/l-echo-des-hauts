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
outils/   déclencheur des gardes au commit
```

Les deux applications sont indépendantes : chacune a son `package.json`, ses dépendances et son
cycle de vie. Il n'y a **pas** d'outil de monorepo (ni workspaces npm, ni Turborepo) — on installe
et on lance chaque application depuis son propre dossier.

## Les tests se lancent tout seuls — deux étages

Les 33 fichiers de test des deux applications (566 tests) **ne dépendent plus de la mémoire de
qui commite**. Une garde qu'il faut penser à lancer ne garde rien.

- **`.githooks/commit-msg`** — local, immédiat, **ciblé**. Il n'écrit rien dans
  `.githooks/pre-commit`, qui appartient au lot commun de détection de secrets propagé sur
  d'autres dépôts : c'est un hook git **distinct**, qui tourne **après** lui. Un commit hors
  `apps/…` ne paie **rien** (pré-filtre en `sh`, aucun démarrage de `node`). Sinon,
  `outils/gardes-au-commit.js` matérialise le **contenu indexé** — jamais la copie de travail —
  et ne lance que les tests dont une entrée est dans le commit.
  **Il faut l'activer une fois par clone** : `git config core.hooksPath .githooks`.
- **`.github/workflows/gardes-du-code.yml`** — GitHub Actions, tardif, **exhaustif**. Il lance
  **tout** à chaque `push`, parce que le hook local se contourne d'un `--no-verify`, n'existe pas
  dans un clone frais tant que `core.hooksPath` n'y est pas posé, et ne voit pas un fichier
  qu'aucun test n'atteint.

La règle « quel fichier déclenche quel test » ne s'écrit pas à la main : elle se **dérive** du
graphe d'imports lu dans l'index. Seuls les fichiers qu'un test lit *par chemin* sans les importer
sont déclarés, dans la table `LECTURES` d'`outils/gardes-au-commit.js`.

**Ce qui n'est pas dans le dispositif, et pourquoi** : `apps/web/scripts/verifier-*` et `preuve-*`
lisent un `dist/` réellement construit ou sortent sur le réseau. Les câbler ici les rendrait
rouges en permanence faute d'infrastructure — et un dispositif toujours rouge n'est plus lu. Leur
place est la recette, sur l'environnement en ligne.

**Coût mesuré le 2026-08-10** (poste Windows, Git for Windows) — ajouté au `git commit` :
commit hors `apps/` **~0,2 s**, aucun `node` lancé ; un fichier de test ciblé **~0,9 s** ;
4 tests sur 8 **~1,1 s** ; les 33 fichiers **~3,0 s**. Les suites complètes, à chaud :
`apps/web` 485 tests en ~1,8 s, `apps/cms` 81 tests en ~1,0 s.

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

### Charger le contenu de démonstration (`npm run seed`)

Le contenu de démonstration est **versionné** dans `apps/cms/data/` : rubriques, signatures, tags,
dossiers, articles (en Markdown, un fichier par article et par locale), `Configuration`, et les
images avec leur manifeste. Le script `seed` le charge dans Strapi par l'API REST.

```bash
cd apps/cms
export SEED_STRAPI_URL=http://localhost:1337      # défaut si non renseignée
export SEED_STRAPI_TOKEN=<jeton API full-access>  # PAS le jeton du build
npm run seed
```

Le jeton se crée dans l'admin Strapi : **Settings → API Tokens → Create new API Token**, avec
*Token type* = **Full access**. Ce n'est **pas** le jeton du site public, qui est en **lecture
seule** — le seed écrit, le build ne fait que lire.

Le script est **rejouable** : le rapprochement se fait sur le **slug**, par locale, et sur le
**nom de fichier** pour les médias. Deux exécutions consécutives donnent le même comptage en base.
Il sert donc deux fois : au montage du démonstrateur, et pour **reconstruire l'environnement
depuis le dépôt** en cas de perte.

Une instance Strapi fraîchement installée se repeuple par cette seule commande : les locales
`fr` (par défaut) et `en` sont posées au démarrage par `src/locales.ts`, la création d'une locale
n'étant pas exposée sur l'API de contenu.

Deux sous-commandes n'écrivent rien :

```bash
npm run seed:comptage    # le comptage en base, famille par famille et locale par locale
npm run seed:verifier    # vérifie que chaque localisation EN porte son slug
                         # et que ses relations ne pointent que des entrées EN
```

`seed:verifier` sort en **1** si un écart est trouvé. C'est le seul contrôle dont l'échec ne se
signale nulle part ailleurs : une localisation anglaise dont les relations pointent encore les
entrées françaises ne lève aucune erreur — elle produit un site anglais aux rubriques françaises.

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

**Deux gardes font échouer le build**, volontairement — elles ne se contournent pas, elles se
corrigent. Elles inspectent la **sortie** (`dist/`), jamais le code source, parce que c'est le seul
endroit où les deux contraintes se voient :

| Garde | Ce qu'elle refuse | À la main |
|---|---|---|
| `garde-t09` | tout JavaScript servi hors `/recherche`, toute trace de sortie serveur | `npm run verifier:sortie` |
| `garde-images` | un `<img>` sans `width`/`height` explicites, ou sans `loading` (`lazy` \| `eager`) — cahier §5.3, suppression du CLS | `npm run verifier:images` |

⚠ La garde `garde-images` lit le **HTML**. Elle ne peut donc pas voir qu'une règle CSS annule les
attributs : un `<img>` dont la CSS laisse **les deux axes en `auto`** est posé à 0 × 0 avant
d'arriver, et décale la page malgré des attributs corrects. Il faut **un axe défini** — le
`width: 100%` des blocs, le `height` de l'en-tête. Cette classe-là ne se voit qu'à la mesure.

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

## Licence

Le code de ce dépôt est publié sous **licence MIT** (voir le fichier `LICENSE`) : il peut être
réutilisé, modifié et redistribué, y compris commercialement, à condition de conserver l'avis de
copyright. Le contenu éditorial de démonstration — textes, visuels et données du magazine — n'est
pas du code : il est l'œuvre du projet et sert d'illustration, pas de matériau réutilisable.
