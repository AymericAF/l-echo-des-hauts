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
