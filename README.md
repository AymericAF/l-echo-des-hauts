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

### `git commit --amend` ne passe plus au travers

Jusqu'au 2026-08-11, **un amendement sans rien réindexer laissait l'index vide** : le pré-filtre
n'y voyait aucun fichier sous garde, sortait à zéro, et imprimait « aucune application gardée dans
ce commit » — sur un commit dont git annonçait, deux lignes plus bas, « 1 file changed ». Le contenu
amendé n'avait jamais été jugé, et **rien ne le disait**. C'est le mode d'échec le plus cher : une
incapacité qui rend la même sortie qu'un succès.

Ce que git expose à ce moment-là ne permet pas de le détecter — **mesuré**, pas supposé :
`commit-msg` reçoit les mêmes arguments (`[.git/COMMIT_EDITMSG] [] []`) et le même environnement
qu'un commit ordinaire ; `prepare-commit-msg` distingue bien `--amend`, **sauf avec `-m`**, où il
annonce `message` comme n'importe quel commit. La question à laquelle git ne répond pas est
d'ailleurs une autre : *ce contenu a-t-il déjà été jugé ?*

Le déclencheur y répond donc lui-même. Après chaque exécution **verte**, il consigne l'empreinte de
l'arbre certifié dans `<git-dir>/gardes-au-commit-vu` (local, jamais versionné) :

| Geste | Ce qui est jugé | Coût mesuré le 2026-08-11 (poste Windows, 7 passages) |
|---|---|---|
| amendement de **message seul** | rien : l'arbre est déjà certifié | médiane **0,89 s** contre **0,79 s** avant le correctif, soit **+0,1 s** — un démarrage de `node`, et **0 test lancé** |
| amendement d'un contenu **jamais jugé** (historique antérieur au crochet, clone sans `core.hooksPath`, rebase, plomberie) | le **différentiel complet** du commit remplacé | le coût de ses tests — **8,7 s** dans le cas mesuré, qui touche le déclencheur lui-même et relance donc les 47 fichiers |
| amendement qui **réindexe** un fichier | inchangé : ce que l'index ajoute | inchangé |

La colonne du milieu est ce qui compte : le surcoût permanent est **un démarrage de `node` sur les
seuls commits sans rien de neuf à l'index**. Le `git diff --cached` du pré-filtre, lui, était déjà
payé avant — c'est le poste dominant de ce tableau, pas le correctif.

Un témoin absent, périmé ou écrit par une autre session fait juger **plus** de fichiers, jamais
moins : le déclencheur juge toujours l'arbre qui va être commité, donc un rouge y reste toujours un
vrai rouge. `outils/gardes-au-commit.recette.mjs` (14 cas, dépôts jetables, vrais `git commit`) le
**prouve en le cassant dans les deux sens** — l'amendement fautif est refusé en nommant le test,
l'amendement de message ne lance rien.

**Ce qui reste ouvert, et c'est délibéré** : le pré-filtre en `sh` sort à zéro — sans démarrer
`node`, donc sans consulter le témoin — quand l'index ajoute quelque chose dont **rien** n'est sous
garde. Un amendement qui réindexe un `README` par-dessus un contenu jamais jugé passe donc encore.
Fermer ce cas coûterait un démarrage de `node` **à chaque commit de documentation**, et un crochet
qui coûte se fait contourner — on perdrait alors aussi ce qui marche. La recette porte ce cas
**écrit pour être vert** : le jour où il rougit, c'est que la décision a changé.
- **`.github/workflows/gardes-du-code.yml`** — GitHub Actions, tardif, **exhaustif**. Il lance
  **tout** à chaque `push`, parce que le hook local se contourne d'un `--no-verify`, n'existe pas
  dans un clone frais tant que `core.hooksPath` n'y est pas posé, et ne voit pas un fichier
  qu'aucun test n'atteint.

La règle « quel fichier déclenche quel test » ne s'écrit pas à la main : elle se **dérive** du
graphe d'imports lu dans l'index. Seuls les fichiers qu'un test lit *par chemin* sans les importer
sont déclarés, dans la table `LECTURES` d'`outils/gardes-au-commit.js`.

**Coût mesuré le 2026-08-10** (poste Windows, Git for Windows) — ajouté au `git commit` :
commit hors `apps/` **~0,2 s**, aucun `node` lancé ; un fichier de test ciblé **~0,9 s** ;
4 tests sur 8 **~1,1 s** ; les 33 fichiers **~3,0 s**. Les suites complètes, à chaud :
`apps/web` 485 tests en ~1,8 s, `apps/cms` 81 tests en ~1,0 s.

## Un troisième étage : la sortie réellement construite

Les 566 tests ci-dessus jugent des **arborescences fabriquées**. C'est utile et ce n'est pas la
même chose que juger le site produit : `build.inlineStylesheets` peut repasser à `'auto'`, une
intégration peut sortir d'`astro.config.mjs`, un composant peut cesser d'écrire ses dimensions —
**les 566 tests restent verts**, et c'est le lecteur qui voit le défaut. Dix scripts existent qui
lisent, eux, la sortie d'un build réel — **ou, pour le dernier, la réponse de la production**.

~~`apps/web/scripts/verifier-*` et `preuve-*` lisent un `dist/` réellement construit ou sortent
sur le réseau. Les câbler rendrait le dispositif rouge en permanence faute d'infrastructure.~~
**Faux, mesuré le 2026-08-10** : `fetch` n'apparaît **qu'une fois** dans tout `scripts/` et
`integrations/` — `medias-locaux.mjs`, qui télécharge depuis l'URL qu'on lui donne. Les six
`verifier-*` lisent un répertoire sur disque ; les trois `preuve-*` construisent contre un Strapi
de substitution servi en `127.0.0.1`. **Aucun ne sort de la machine, aucun n'a besoin
d'infrastructure.** Ils tournent donc à chaque `push`, dans le job `sortie` de
`.github/workflows/gardes-du-code.yml`.

**Une exception, et elle est délibérée : `verifier:en-tetes`.** Il *doit* sortir de la machine,
parce que ce qu'il juge n'existe nulle part ailleurs que dans la réponse de la production — les
en-têtes du §5.5 sont posés en labels Traefik sur l'application Coolify, et **n'ont aucun domicile
dans ce dépôt**. Il n'est donc **ni branché dans le build ni dans le job `sortie`** : un
vérificateur qui dépend d'un site en ligne rendrait le dispositif rouge sur une coupure réseau, et
un rouge qui ne veut rien dire se fait ignorer. ~~Il se lance à la main — et lui donner une cadence
est un travail qui reste à faire.~~

**2026-08-12 — sa cadence est tranchée, et elle n'est pas ici** (tâche `5e568f4a`). Ce qu'a coûté la
mesure vaut d'être écrit, parce que le raisonnement « il suffit de le brancher au build » se
refait tout seul : **la production ne construit pas ce dépôt, elle construit `apps/web` seul**.
Relevé en lecture seule sur la base Coolify du VPS et dans le journal du déploiement `371` (commit
`c35e7d5`, celui qui sert) — application `echo-site`, `build_pack = nixpacks`,
`base_directory = /apps/web`, `publish_directory = /dist`, commandes d'installation et de
construction **vides**, donc le plan Nixpacks réellement exécuté : `npm ci`, puis `npm run build`.
**`npm test` ne tourne nulle part sur ce chemin, et ce workflow non plus** : GitHub Actions et
Coolify sont deux chemins qui ne se croisent pas.

~~Le seul crochet qu'exécute la production est donc `npm run build`.~~ **Depuis le 2026-08-18, la
phase `build` de `apps/web/nixpacks.toml` en porte deux** : `node --experimental-strip-types
scripts/attendre-schema.mjs`, **puis** `npm run build`. La sonde fait attendre la construction que
le Strapi de production serve le nouveau schéma, au lieu de la laisser sortir en `1` sur un
`400 Invalid key …` (queues `455`, `501`, `506` — écarts mesurés 189 s, 86 s, 275 s). **Ce qui suit
ne change pas d'un mot** : la sonde interroge le **CMS avant le build**, pas le **site après la
bascule**, et c'est bien pourquoi elle a le droit d'y vivre quand ce vérificateur-là ne l'a pas.

Y brancher ce vérificateur-là
ferait **deux** dégâts, pas un : au moment du build la bascule n'a pas eu lieu — le journal du `371`
place la fin du build à `11:20:15` et le « Rolling update » **après** —, on mesurerait donc
**l'ancien conteneur** en croyant mesurer le nouveau ; et une coupure réseau ferait **échouer un
déploiement** sur un `2`, c'est-à-dire sur un verdict qui ne parle pas du site.

**Sa cadence vit sur le porteur qui existe déjà**, dans le dépôt privé : `ops/echo-veille.sh` et ses
contrôles `ops/veille.d/` (tâche `115b6646`). Son contrat est **mot pour mot** ce que ce
vérificateur rend déjà — `0` conforme et le porteur reste muet, `1` divergence et la sortie standard
*est* le message, `2` incapacité, jamais aplaties l'une sur l'autre. Il ne manque donc ni cadence,
ni canal, ni distinction des trois issues : il manque **une enveloppe dans `checks.d/`**. Un second
mécanisme périodique pour le même site serait un mécanisme de plus à maintenir, et c'est toujours le
second qui meurt en silence.

**Le seul point qui restait ouvert est fermé, mesuré le 2026-08-12** : le VPS **n'a pas Node**
(`node: command not found`), mais il porte l'image de construction du site. Depuis l'hôte, sans rien
installer :

```bash
img=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^<uuid-echo-site>:.*-build$' | head -1)
docker run --rm --entrypoint node "$img" scripts/verifier-en-tetes.mjs [origine]
```

Prouvé **dans les deux sens, depuis le VPS, sans toucher à la production** : sur
`https://echo.ayfiweb.fr` → **code 0**, une ligne de compte rendu, aucune erreur ; sur l'origine
d'aperçu, qui ne sert aucune politique → **code 1**, *12 manquements* nommant chaque en-tête absent
sur chacune des trois URL. ⚠️ Le nom de l'image porte le **SHA du commit déployé** : il change à
chaque déploiement et Coolify finit par élaguer les anciennes — l'enveloppe doit **résoudre** le
tag à chaque passage (jamais le figer) et rendre `2` si elle n'en trouve aucun, plutôt que de se
taire.

**Ce qui, dans ce dépôt, empêche désormais de le rebrancher au mauvais endroit** :
`apps/web/tests/cadence-en-tetes.test.ts`. Il tient le **code de sortie** du processus (et pas
seulement le verdict de la fonction, seule chose que `garde-en-tetes-securite.test.ts` exerçait) sur
une origine de substitution servie en `127.0.0.1`, et il refuse toute apparition des vérificateurs
qui sortent sur le réseau dans `npm run build`, dans les intégrations d'`astro.config.mjs` ou dans
un pas du workflow. La population n'y est pas écrite : ce sont les **exemptés** de
`scripts/verificateurs-de-sortie.mjs`, `verifier:surface-publique` compris.

| Script | Ce qu'il lit | Ce qu'il attrape que les tests ne voient pas | Coût |
|---|---|---|---|
| `verifier:sortie` (T‑09) | `dist/` | un `.js` servi, un `<script>`, un `on…=`, une sortie serveur — **dans la sortie**, pas dans le code | ~7 ms |
| `verifier:images` (§5.3) | le HTML émis | un `<img>` dont Strapi n'a pas rendu les dimensions : Astro omet l'attribut **sans avertissement** | ~6 ms |
| `verifier:liens` (T‑06) | `<a>`, `<link>` vs `dist/` | une URL que le registre annonce et que `getStaticPaths` n'émet pas | ~8 ms |
| `verifier:origine-medias` (T‑01) | `src`, `srcset`, `og:image`, `rel=icon` | une image d'origine étrangère, que la CSP servie **refuse** — déclarée, jamais peinte | ~9 ms |
| `verifier:seo` (§5.2, §4.5) | sitemaps, flux, métas, PNG OG | une `<loc>` morte, une page indexable hors sitemap, une **vignette OG sans glyphes** | ~66 ms |
| `verifier:styles-en-ligne` (§5.5) | le HTML émis | un bloc `<style>` ou un `style=` que `style-src 'self'` refuse — la page répond 200 et rend autre chose | ~9 ms |
| `verifier:en-tetes` (§5.5) | la **réponse servie** par `echo.ayfiweb.fr` | la disparition des en-têtes de sécurité — arrivée le 2026-08-10, sans **aucun** signal : build vert, `200` partout, images et styles affichés, politique absente | ~1 s |
| `preuve:rendu` | un build sur fixtures **ou sur l'instance réelle** (`-- --reel`) | que chaque page article rend les blocs que sa source lui pose, **les 8 types y compris**, et **dans chaque locale** — ce qu'aucune garde ne sait dire | 3,3 s (banc) · 27 s (instance) |
| `preuve:pagination` | un build sur corpus de recette | les **bornes** que le corpus éditorial n'atteint pas : page 2, catégorie à exactement 12, article non traduit | 4,9 s |
| `preuve:encre-og` | le gabarit rastérisé deux fois | que le seuil de la garde OG **sépare encore** les deux populations (avec fontes / sans aucune fonte) | 1,5 s |

**Le banc des preuves est déplaçable, et c'est ce qui les rend rejouables.** Les trois
`preuve-*` construisent contre un Strapi de substitution servi depuis `tests/fixtures/`.
Pour reproduire un défaut, il faut pouvoir servir un banc **abîmé exprès** sans muter le
dépôt — et jusqu'au 2026-08-12 c'était impossible : `demarrerServeurFixtures()` ne savait
pas recevoir de dossier, si bien qu'un run l'a réécrit dans son scratchpad, où il a disparu
avec sa session. Le geste est désormais versionné :

```bash
cp -r apps/web/tests/fixtures /tmp/banc-temoin       # puis on abîme ce qu'on veut voir
node apps/web/scripts/serveur-fixtures.mjs /tmp/banc-temoin   # l'URL sort sur stdout
ECHO_STRAPI_URL=<url> ECHO_STRAPI_API_TOKEN_READONLY=jeton-de-fixture npm run build
```

Le défaut reste `tests/fixtures/` : les preuves existantes ne changent pas de corpus. ⚠ Ce
qui manquait n'était pas seulement le paramètre — les messages d'incapacité écrivaient
`tests/fixtures/<nom>.json` **quel que soit** le banc consulté, donc envoyaient chercher un
fichier absent là où il existe. Ils nomment maintenant le dossier réellement lu.

**`preuve:rendu` sait viser deux cibles, et le choix est explicite** (2026-08-12, tâche
`7b96216a`). Jusqu'à cette date la cible était **écrite en dur** : la surcouche d'environnement du
banc était appliquée **après** `process.env`, si bien qu'un `ECHO_STRAPI_URL=https://echoback…`
posé dans le shell était écrasé sans un mot — mesure avant correctif, le run démarrait quand même
`http://127.0.0.1:54860` et rendait **24 pages de fixtures, vertes**. Le critère « les 8 types de
blocs » ne pouvait donc s'exercer que sur des données écrites à la main, c'est-à-dire sur le seul
terrain où il ne risquait pas d'échouer.

```
npm run preuve:rendu                      # le BANC — hors ligne, sans jeton. Le défaut, inchangé.
npm run preuve:rendu -- --reel            # l'INSTANCE réelle (ECHO_STRAPI_URL + jeton de lecture)
PREUVE_CIBLE=instance npm run preuve:rendu
```

La précédence **n'a pas été inversée** : cela aurait fermé un piège en ouvrant son symétrique, pire
parce que silencieux — un `ECHO_STRAPI_URL` qui traîne ferait viser l'instance à un run qui se croit
sur fixtures. C'est la **cible** qui se choisit, et la surcouche qui s'en **dérive**. Un mot de cible
non reconnu (`PREUVE_CIBLE=distan`) est **refusé en `2`**, jamais replié sur le banc. Et l'attendu
suit la cible : blocs posés, Configuration de référence et portraits viennent de la source choisie,
jamais des fixtures quand on vise l'instance.

⚠️ **En mode instance, `bloc.video` rend `2` et c'est le verdict juste** : le corpus réel n'exerce
que **7 des 8** types — trou d'énumération **assumé** par l'avenant **A5** du 2026-08-10. `2` envoie
corriger le corpus, `1` enverrait chercher une régression de rendu qui n'existe pas.

Les six vérificateurs sont **déjà branchés dans le build** comme intégrations Astro : un défaut de
sortie fait échouer `astro build`, donc le déploiement Coolify. Le job les relance **aussi en
ligne de commande**, et ce n'est pas une redondance : le build ne les exerce que **tant qu'ils
sont branchés** dans `astro.config.mjs`. Débrancher une ligne rend le build vert sur une sortie
fautive ; ce second passage lit la même sortie par l'autre porte.

**Trois issues, trois codes de sortie** — `0` vérifié et conforme, `1` vérifié et anomalie, `2`
**vérification impossible** (`apps/web/scripts/issues.mjs`, convention reprise du parc). La
troisième est la seule qui compte ici : sans elle, « je n'ai rien pu vérifier » rend le même code
que « j'ai tout vérifié ». Mesuré le 2026-08-10 sur le `dist/` du dépôt, **avant** correctif, avec
une origine vide : `verifier:liens` affichait `✔ 311 lien(s) interne(s)` au lieu de `✔ 425` — même
coche, même code `0`, 114 liens absolus silencieusement retirés de la garde ; `verifier:seo`
rendait une sortie **identique au caractère près**. Les trois vérificateurs qui ont besoin de
l'origine du site (`liens`, `origine-medias`, `seo`) la lisent désormais par un seul module,
`scripts/origine.mjs`, qui **déclare son incapacité** au lieu de rendre un `null` que l'appelant
prenait pour « aucun lien interne à vérifier ». Un lien **réellement** externe, lui, reste hors
garde et le reste en silence : c'est un lien sortant légitime, pas un défaut.

**Les six l'appliquent, et c'est mesuré sur chacun.** La convention n'a d'abord été portée que par
ces trois-là ; les trois autres rendaient encore l'**incapacité** avec le code de l'**anomalie**.
Relevé le 2026-08-10 en écartant `apps/web/dist` puis en lançant les six — même cause, même phrase
`sortie absente : …\dist` : `sortie` → `1`, `images` → `1`, `styles-en-ligne` → `1`, contre `2`
pour `liens`, `origine-medias` et `seo`. Un dispositif à **moitié** converti est plus trompeur
qu'un dispositif uniforme : on croit la règle appliquée partout. Second endroit corrigé, dans le
même mouvement : `styles-en-ligne` était le seul des six à voir une sortie **sans aucune page
HTML** — son message le nommait déjà (« la garde n'a rien inspecté »), son code envoyait corriger
le site. L'invariant est tenu par `tests/verificateurs-incapacite.test.ts`, qui exerce les **trois
sens** (absence → `2`, manquement réel → `1`, sortie saine → `0`) sur la fonction **et** en ligne
de commande, et qui **refuse** un septième `scripts/verifier-*.mjs` qui n'y figurerait pas.

**Ce que ça ne donne à personne, et il faut le dire** : le seul lecteur **automatique** de ces
codes dans le dépôt est le job `sortie` ci-dessous, et il fait `|| echec=1` — il aplatit donc tout
code non nul sur un seul rouge. Le gain va au lecteur en **ligne de commande** (la recette), et à
l'uniformité — pouvoir lire un code sans aller relire la source de celui qui l'a rendu.

**Par où le défaut était joignable, et par où il ne l'était pas** — mesuré, pas supposé.
**Pas** par `astro build` : Astro refuse `ECHO_SITE_URL=''` à la validation de configuration
(`! Invalid URL`) et meurt dans `compileAstro` sur `foo:bar`, donc avant `astro:build:done` ; les
trois gardes d'intégration ne pouvaient pas voir le repli. Elles sont corrigées quand même — une
défense ne doit pas dépendre d'une protection qui vit chez un tiers. **Par la ligne de commande**,
en revanche, grande ouverte : `node scripts/verifier-*.mjs [dist] [origine]` et
`npm run verifier:*` avec un `ECHO_SITE_URL` exporté **vide** (`??` ne remplace que
`null`/`undefined`, jamais la chaîne vide). C'est-à-dire **la seconde porte du job `sortie`**,
celle qui juge un `dist/` déjà construit — la porte de la recette.

**Le paragraphe ci-dessus reste vrai pour l'origine _illisible_ — et un second défaut de la même
famille, lui, était bel et bien joignable par `astro build`. Mesuré le 2026-08-11.** Les trois
gardes lisaient `process.env.ECHO_SITE_URL`, or **l'environnement n'est pas la configuration** :
`--site` est une option **publique** d'Astro, elle gagne sur le fichier de configuration donc sur
la variable qui l'alimente, et elle ne demande aucune manipulation d'environnement. Sous
`ECHO_SITE_URL=https://echo.ayfiweb.fr astro build --site https://autre-origine.test`, le
producteur émet correctement `https://autre-origine.test/`, et **les trois gardes jugent contre
une référence que le producteur n'a pas utilisée** — chacune à sa façon, ce qui est le point :
`garde-origine-medias` fait échouer le build sur **238** fausses accusations, `garde-seo` sur
**121**, et `garde-liens` **rend vert** en imprimant sa coche sur `2990 lien(s) interne(s)` au
lieu de `3587` — 597 liens absolus sortis de la garde **sans un mot**. Deux accusent à tort, ce
qui se voit ; la troisième se **désarme** en affichant le signe de la conformité. Les trois lisent
désormais la configuration **résolue** (`astro:config:done`), par la même chaîne de repli que le
producteur (`scripts/origine.mjs`, `origineDuBuild()`). L'invariant est tenu par
`tests/origine-des-gardes.test.ts`, qui exerce les **deux sens** : plus de fausse alerte sous une
origine divergente, et une référence **réellement** fautive — hôte tiers, octets absents, lien
mort, `<loc>` sans page — toujours attrapée.

**Pas dans le crochet local, et c'est mesuré** : les vérificateurs coûtent ~105 ms à eux six, mais
le **build** coûte 3,3 s (17 pages) à 4,9 s (52 pages) — contre 0,2 à 3,0 s pour le crochet entier
aujourd'hui. Un crochet à plusieurs secondes se fait contourner, après quoi on perd aussi ce qui
marchait.

**Ce qui reste hors de portée de l'intégration continue**, et n'y entrera pas : tout ce qui se lit
sur la **réponse servie** — en-têtes et CSP, compression et version HTTP négociées, certificat,
campagnes Lighthouse, inventaire réseau. Ce ne sont pas des scripts de ce dépôt : ce sont les
mesures du protocole, et leur place est la recette sur l'environnement en ligne.

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
export SEED_STRAPI_TOKEN=<jeton API full-access, à DURÉE LIMITÉE>  # PAS le jeton du build (lecture seule)
npm run seed
```

Le jeton se crée dans l'admin Strapi : **Settings → API Tokens → Create new API Token**, avec
*Name* = un nom dédié à cet usage (celui en vigueur : `seed-corpus-editorial`), *Token type* =
**Full access** et *Token duration* = **30 days** — ⚠️ jamais `Unlimited` : un jeton plein accès
sans expiration survit à qui l'a créé. Il s'inscrit à la **matrice des secrets** du dépôt de
documentation (§13 du runbook de provisionnement), qui porte sa date d'expiration — elle n'est
pas recopiée ici, deux copies divergeraient à la première rotation. Ce n'est **pas** le jeton du
site public, qui est en **lecture seule** — le seed écrit, le build ne fait que lire.

Le script est **rejouable** : le rapprochement se fait sur le **slug**, par locale, et sur le
**nom de fichier** pour les médias. Deux exécutions consécutives donnent le même comptage en base.
Il sert donc deux fois : au montage du démonstrateur, et pour **reconstruire l'environnement
depuis le dépôt** en cas de perte.

Une instance Strapi fraîchement installée se repeuple par cette seule commande : les locales
`fr` (par défaut) et `en` sont posées au démarrage par `src/locales.ts`, la création d'une locale
n'étant pas exposée sur l'API de contenu.

**Ce maillon-là est exercé sur l'artefact du canal réel depuis le 2026-08-12** (tâche `f30fc73e`) —
il ne l'était qu'en local jusque-là, et c'était un trou : la locale `fr` de `echoback.ayfiweb.fr` a
été créée **à la main** le 2026-08-06 à 22:06 UTC, soit ~14 h **avant** que `src/locales.ts` n'existe
(commit `c2474e2`), et son nom sur l'instance le prouve — « French (fr) », le libellé du sélecteur
ISO de l'admin, là où `assurerLocales` écrit « Francais (fr) ». Preuve : l'image que Coolify a
construite pour l'application `echo-strapi` (`ydaghuigfanqwdof0nru2ysk`, tag `3c430ab`) démarrée
contre une **base PostgreSQL jetable et vide**, sur le VPS, sans toucher à la production —
`fr` créée avec le nom déclaré, `plugin_i18n_default_locale` posé sur `"fr"`, relu en base.

**Et le passage du bootstrap se CONSTATE désormais, même quand il n'a rien à faire.** Il ne
journalisait que s'il avait créé une locale ou posé le défaut : sur une instance déjà conforme il
n'écrivait **aucune ligne**, si bien qu'« il a tourné sans rien changer » et « il n'a jamais tourné »
rendaient la même sortie. Mesure du 2026-08-12 sur le conteneur de production : **0** ligne
`[locales]` sur 4 717, pour un unique `Strapi started successfully`, alors que le code **était** dans
l'image. Une ligne part maintenant à chaque démarrage, dans les quatre états — et elle signale un
nom divergent **sans renommer**, une écriture non demandée sur une instance en service n'étant pas
à la charge d'un bootstrap.

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
