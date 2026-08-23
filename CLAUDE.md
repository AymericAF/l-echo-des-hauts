# echo-code — ce qu'il faut savoir avant de pousser

Ce dépôt porte le **code** de *L'Écho des Hauts*, et il est **public**. Le brief, la documentation
de conception et les gardes documentaires vivent dans l'autre dépôt, privé
(`l-echo-des-hauts-magazine-editorial-local`). Aucun secret ici, jamais.

## Trois gardes, et une seule qui surprend

| Quand | Ce qui est joué | Où c'est écrit |
| --- | --- | --- |
| `git commit` | détection de secrets, puis les tests des seuls fichiers de l'index | `README.md` § « Les tests se lancent tout seuls », `.githooks/README.md` |
| `git push` vers `main` | **les deux suites complètes**, et le verrou de campagne R-09 | en-tête de `.githooks/gardes-avant-push.js` |
| après le push | la CI GitHub, exhaustive | `.github/workflows/gardes-du-code.yml` |

Aucun crochet ne tourne tant que `git config core.hooksPath .githooks` n'est pas posé — **une fois
par clone**, et ce réglage n'est pas versionné.

## Aucun arbre ne pousse sur `main` sans `npm ci` d'abord

Le crochet de pré-push joue `npm test` **dans l'arbre courant** — pas dans une copie, pas depuis le
dépôt principal. Il exige en plus que `HEAD` soit exactement le commit poussé, sur un arbre propre.

Un worktree neuf n'a pas de `node_modules` : les deux suites y échouent pour une raison qui n'a
**rien à voir avec le code**. Avant de pousser depuis un arbre qui vient d'être créé :

```sh
npm ci --prefix apps/cms
npm ci --prefix apps/web
```

Un autre arbre ne peut prêter les siens que si ses **deux** lockfiles sont identiques aux tiens
(`git rev-parse HEAD:apps/web/package-lock.json` des deux côtés) — sinon l'installation empruntée
produit le second cas ci-dessous.

### Reconnaître le faux rouge

Depuis le 2026-08-24, **le crochet nomme lui-même sa cause** : c'est lui qu'il faut lire, pas ce
fichier. Trois refus, trois gestes différents :

- « **LES DÉPENDANCES NE SONT PAS INSTALLÉES ici** », avec les `node_modules` manquants nommés →
  rien n'a été jugé, le code n'est pas en cause. Installe, recommence.
- « **CE ROUGE A LA SIGNATURE D'UNE DÉPENDANCE ABSENTE** », sous un rouge de suite → l'arbre a bien
  un `node_modules`, mais il date d'avant une fusion qui a déplacé les lockfiles. Réinstalle
  **avant** de conclure quoi que ce soit sur le code.
- Un rouge **sans** l'un de ces deux blocs est un vrai rouge : il nomme le compte d'échecs et
  l'erreur (`ℹ fail 3 · AssertionError [ERR_ASSERTION] …`).

Avant le 2026-08-24, ces trois situations rendaient la même phrase — `· apps/cms : 'test failed'` —
et un run a conclu que le code était cassé alors qu'il manquait une installation. C'est un piège qui
coûte un diagnostic complet à chaque fois, et qui peut faire abandonner une fusion parfaitement
saine.

### Ne désarme jamais ce crochet

Pas de `--no-verify`, pas de `npm test` rendu optionnel. C'est la seule chose qui juge un résultat
de **fusion** avant qu'il n'atterrisse sur `main` — et un push sur `main` déclenche un déploiement
Coolify. Le remède est toujours d'installer ou de corriger, jamais de contourner.

## Deux autres refus qui ne sont pas des échecs de test

- « **la copie de travail est sur X, mais le push envoie Y** », ou « **modifications non
  commitées** » : le crochet refuse de prononcer sur autre chose que ce qui partirait. Commite, ou
  place-toi sur le commit poussé.
- « **une CAMPAGNE DE MESURE est en vol** » : R-09 interdit tout build pendant une campagne de
  mesure du dépôt de documentation. Le code peut être parfait, c'est le moment qui ne va pas. Le
  verrou se lève seul, et le message dit s'il couvre la passe ou la campagne entière.

## Deux branches portent le MÊME alignement du lot de crochets

Constaté le **2026-08-24**, et **rien n'a été supprimé ni fusionné** : le ménage est un arbitrage
d'Aymeric.

| Branche | Commit | Écrit le | Sur `origin` |
| --- | --- | --- | --- |
| `p2/pluriel-du-compte-episodes` | `a932e5e` | 2026-08-22 20:11:55 | oui |
| `p3/verrou-partage-doc` | `d539ebd` | 2026-08-22 20:12:13 | oui |

Les deux portent le même message — *« securite(parc): aligner le lot de crochets sur la source
(recette 111 -> 118 cas) »* — et, cette fois, **le même contenu** : `git patch-id --stable` rend
`43cf9a3e` pour les deux, les blobs produits sont identiques (`.githooks/README.md` →
`1d064a97`, `.githooks/detect-secrets.recette.mjs` → `8cb9b57c`), et les deux diffs contre
`main` font 43 990 octets **strictement égaux**. Aucune autre branche du dépôt ne porte ce
patch-id.

**Ni l'un ni l'autre n'est fusionné.** `origin/main` (`3ed120b`) porte encore les blobs d'avant
l'alignement (`5d7715f`, `3a9365f`) : la recette de détection de secrets y est toujours à 111 cas.

### Ce n'est PAS un risque de conflit

Deux côtés d'une fusion qui portent le **même blob** se résolvent seuls — vérifié par fusion à trois
points sur les blobs réels (base `5d7715f`, les deux côtés `1d064a97`) : sortie 0, zéro marqueur.
Fusionner les deux à la suite est propre ; le second devient simplement un no-op. Le risque réel
n'est donc pas le désalignement du parc, c'est **une histoire dupliquée** que personne ne relit.

### L'une contient l'autre

`p2/pluriel-du-compte-episodes` contient **la totalité** de `p3/verrou-partage-doc`, et y ajoute
un commit sans aucun rapport avec les crochets — `507e5d6` (*le pluriel du compte d'épisodes*,
10 fichiers, ~1 094 lignes sous `apps/web`). `p3/verrou-partage-doc`, elle, n'apporte **pas un
octet** que `p2` n'ait déjà.

- Fusionner `p2` seul : **rien n'est perdu**. `p3/verrou-partage-doc` devient vide de sens.
- Fusionner `p3` seul : les crochets arrivent à l'identique, mais `507e5d6` **reste dehors**.

**Ce qui reste à trancher** : fusionner `p2` embarque le lot « pluriel » **avec** le lot crochets,
deux sujets dans une seule fusion. Si l'on veut les séparer, c'est `p3/verrou-partage-doc` qu'on
fusionne d'abord, puis `p2` — qui n'apportera alors plus que `507e5d6`.

### Deux détails qui ont déjà égaré un run

- **Aucun worktree ne porte `p3/verrou-partage-doc`.** `wt-echocode-verrou-partage`, que son nom
  désigne, est en réalité sur `p3/faux-rouge-dependances` (`3ed120b`, soit `origin/main`). Le
  nom d'un worktree ne dit pas ce qu'il contient : lire `git worktree list`.
- **Le `main` local du checkout principal est en retard** (`7766e7d` contre `3ed120b` sur
  `origin`). Toute conclusion « c'est déjà dans main » ou « ce n'est pas dans main » doit se lire
  sur `origin/main`, pas sur `main`.
