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

**Relu le 2026-08-27 : cette section ne décrivait plus l'état.** Le constat d'origine, du
2026-08-24, est conservé plus bas et marqué ligne à ligne — rien n'en a été supprimé. Ce qui suit
est ce qui vaut aujourd'hui, et surtout **ce qui le recompte** : c'est un cardinal figé ici
(« 111 cas ») qui s'est périmé le premier, et un raccourci de méthode qui a produit le conseil
inverse du bon.

### La règle, avant les faits

Cette section ne fige plus **aucun** compte ni **aucun** SHA d'état mouvant — position de branche,
nombre de cas d'une recette, taille d'un diff. Chacun s'écrit désormais par **la commande qui le
rend**, jamais par sa valeur, et aucune réécriture ultérieure n'en réintroduira. Un chiffre juste
écrit ici redevient faux à la fusion suivante, sans que personne s'en aperçoive : ce paragraphe en
est la démonstration, puisqu'il conseillait de fusionner la branche qui perdait du travail.

Trois pièges qu'il a lui-même payés, et qui valent bien au-delà de ces deux branches :

1. **`git patch-id` sur les *têtes* ne dit rien du *reste* de la branche.** Deux têtes de même
   patch-id peuvent tenir sur des chemins qui divergent en amont : l'une porte alors des commits que
   l'autre n'a pas. Comparer les têtes puis conclure « l'une contient l'autre » est un saut. La
   question « X est-il dans Y ? » se pose à `git merge-base --is-ancestor X Y` (sortie 0 = oui), et
   à rien d'autre.
2. **`git log A..B` liste des commits, pas des octets.** Un commit peut rester listé sans plus rien
   apporter, quand son contenu est déjà arrivé par un autre chemin. L'inverse est vrai aussi.
3. **Ce qu'une fusion apporterait ne se lit ni dans `git log`, ni dans un diff à deux ou trois
   points** — ils répondent à d'autres questions, et le diff à trois points compte contre la base de
   fusion, pas contre `main`. Cela se **simule**, sans rien fusionner :

```sh
git merge-tree --write-tree origin/main origin/p2/pluriel-du-compte-episodes  # sortie 0 = sans conflit
git diff --stat origin/main <arbre-rendu>                                     # ce que main gagnerait
```

### Ce qui se constate, et par quelle commande

| Question | Ce qui répond | Piège |
| --- | --- | --- |
| Où est `origin/main` ? | `git fetch origin && git rev-parse --short origin/main` | jamais `main` local |
| Telle branche est-elle fusionnée ? | `git merge-base --is-ancestor origin/<branche> origin/main` | sortie 0 = fusionnée |
| À combien de cas est la recette de détection de secrets ? | `node .githooks/detect-secrets.recette.mjs` | le compte est dans le **corps**, dernière ligne |
| Que telle branche apporte-t-elle encore ? | la simulation `merge-tree` ci-dessus | ni `git log`, ni `git diff` |

Au 2026-08-27, ces commandes rendent : `p3/verrou-partage-doc` **est fusionnée** — par `bdfddc7`,
horodatée 2026-08-24 20:21:13 — et `p2/pluriel-du-compte-episodes` **ne l'est pas**. Ce sont des
**verdicts datés**, pas des valeurs à tenir à jour : relance les commandes plutôt que de les croire.
L'ordre entre cette fusion et le constat d'origine n'est pas établissable — le constat porte une
date sans heure, et *on ne déduit pas une antériorité d'un ordre d'arrivée*.

`p2` porte encore son **propre** commit d'alignement, distinct de celui entré dans `main` mais de
même contenu. Il reste donc listé par `git log origin/main..origin/p2/pluriel-du-compte-episodes`,
et **il n'apporte pourtant plus un octet** : la simulation rend un arbre sans conflit qui ne touche
que `apps/`, et pas un fichier de `.githooks`. C'est la nuance à retenir — *un commit encore listé
dans un journal peut n'apporter rien du tout.*

**Ce qui reste à trancher** : la maturité du lot applicatif de `p2` (le « pluriel »), qui est un
arbitrage d'Aymeric. Ce fichier ne le tranche pas, et rien n'est à supprimer ici.

### Deux règles qui ont déjà égaré un run — leurs exemples, eux, ont bougé

- **Le nom d'un worktree ne dit pas ce qu'il contient.** Lire `git worktree list`, jamais le nom du
  répertoire. Le worktree `wt-echocode-verrou-partage` en reste l'illustration, mais il n'est plus
  sur la branche que l'exemple d'origine lui prêtait : raison de plus pour lire la commande.
- **« C'est dans `main` » se lit sur `origin/main`, jamais sur `main`.** Un `main` local peut être
  en retard, à jour ou en avance ; seul `git fetch` puis `git rev-parse origin/main` tranche. Il se
  trouve qu'il est à jour aujourd'hui — ce qui ne change rien à la règle, et ne se réécrira pas ici
  la prochaine fois qu'il dérivera.

### Conservé pour mémoire — sans portée (état constaté le 2026-08-24)

Convention du dépôt : l'historique se marque en place, il ne se supprime pas. Le texte ci-dessous
est celui du 2026-08-24, inchangé ; les verdicts sont posés **dans la ligne** qu'ils jugent, pour
qu'un lecteur pressé ne lise pas une affirmation périmée sans son démenti. Le motif du marquage est
partout le même — *ces phrases ne décrivent plus l'état* —, et non qu'elles auraient été écrites à
la légère : trois d'entre elles étaient exactes le jour où elles ont été écrites.

> Constaté le **2026-08-24**, et **rien n'a été supprimé ni fusionné** : le ménage est un arbitrage
> d'Aymeric.
> — **PÉRIMÉ le 2026-08-24 20:21:13** (`bdfddc7`) : `p3/verrou-partage-doc` a été fusionnée. Rien
> n'a été supprimé, cela reste vrai.
>
> | Branche | Commit | Écrit le | Sur `origin` |
> | --- | --- | --- | --- |
> | `p2/pluriel-du-compte-episodes` | `a932e5e` | 2026-08-22 20:11:55 | oui |
> | `p3/verrou-partage-doc` | `d539ebd` | 2026-08-22 20:12:13 | oui |
>
> — Ce tableau reste exact au 2026-08-27, mais il fige quatre valeurs mouvantes : il ne se met pas
> à jour, il se **recompte** (`git for-each-ref --format='%(refname:short) %(objectname:short)
> %(committerdate:iso)' refs/remotes/origin/p2 refs/remotes/origin/p3`).
>
> Les deux portent le même message — *« securite(parc): aligner le lot de crochets sur la source
> (recette 111 -> 118 cas) »* — et, cette fois, **le même contenu** : `git patch-id --stable` rend
> `43cf9a3e` pour les deux, les blobs produits sont identiques (`.githooks/README.md` →
> `1d064a97`, `.githooks/detect-secrets.recette.mjs` → `8cb9b57c`), et les deux diffs contre
> `main` font 43 990 octets **strictement égaux**. Aucune autre branche du dépôt ne porte ce
> patch-id.
> — **TROMPEUR, marqué le 2026-08-27.** Les blobs et le patch-id sont exacts, mais ils ne portent
> que sur les **têtes** : ils ne prouvent rien sur le reste des deux branches, et c'est ce saut qui a
> produit l'erreur marquée plus bas. Les « 43 990 octets » sont un cardinal ancré **sans sa
> commande** : ils ne se reproduisent que par `git diff 3ed120b...<branche> -- .githooks`, base qui
> n'est plus `main` — le nombre est donc devenu irrecalculable depuis ce texte. Et « aucune autre
> branche ne porte ce patch-id » ne valait que pour les **têtes** de branches : `origin/main`
> **contient** aujourd'hui le commit qui le porte.
>
> **Ni l'un ni l'autre n'est fusionné.** `origin/main` (`3ed120b`) porte encore les blobs d'avant
> l'alignement (`5d7715f`, `3a9365f`) : la recette de détection de secrets y est toujours à 111 cas.
> — **FAUX depuis le 2026-08-24 20:21:13** (`bdfddc7`), sur les trois affirmations : `p3` **est**
> fusionnée (`p2` ne l'est pas) ; `origin/main` n'est plus à `3ed120b` ; et il porte les blobs
> d'**après** l'alignement, donc la recette n'est plus à 111 cas. Le compte juste n'est pas réécrit
> ici : il se relit en lançant la recette (voir le tableau plus haut).
>
> ### Ce n'est PAS un risque de conflit
>
> Deux côtés d'une fusion qui portent le **même blob** se résolvent seuls — vérifié par fusion à trois
> points sur les blobs réels (base `5d7715f`, les deux côtés `1d064a97`) : sortie 0, zéro marqueur.
> Fusionner les deux à la suite est propre ; le second devient simplement un no-op. Le risque réel
> n'est donc pas le désalignement du parc, c'est **une histoire dupliquée** que personne ne relit.
> — Toujours vrai, et vérifié depuis : la simulation `merge-tree` de `p2` sur `origin/main` rend
> aujourd'hui un arbre sans conflit.
>
> ### L'une contient l'autre
>
> `p2/pluriel-du-compte-episodes` contient **la totalité** de `p3/verrou-partage-doc`, et y ajoute
> un commit sans aucun rapport avec les crochets — `507e5d6` (*le pluriel du compte d'épisodes*,
> 10 fichiers, ~1 094 lignes sous `apps/web`). `p3/verrou-partage-doc`, elle, n'apporte **pas un
> octet** que `p2` n'ait déjà.
> — **FAUX, et déjà faux le 2026-08-24 : ce n'est pas une péremption, c'est une erreur.** `p2` ne
> contient pas `p3` (`git merge-base --is-ancestor` le refuse) : les deux branches partent d'une base
> commune puis **divergent**, et chacune porte son propre commit d'alignement. `p3` apportait bien un
> commit que `p2` n'a pas — celui qui ajoute au crochet de pré-push ce qui le relie à l'autre dépôt.
> C'est le piège n° 1 de la règle plus haut : le patch-id des têtes a été lu comme une inclusion de
> branches.
>
> - Fusionner `p2` seul : **rien n'est perdu**. `p3/verrou-partage-doc` devient vide de sens.
> - Fusionner `p3` seul : les crochets arrivent à l'identique, mais `507e5d6` **reste dehors**.
> — **La première puce est FAUSSE, marquée le 2026-08-27**, et c'est le conseil dangereux de ce
> paragraphe : fusionner `p2` seul aurait laissé dehors le commit ci-dessus. C'est `p3` qui a été
> fusionnée, et rien n'a donc été perdu — mais pas grâce à ce texte. La seconde puce était exacte.
>
> **Ce qui reste à trancher** : fusionner `p2` embarque le lot « pluriel » **avec** le lot crochets,
> deux sujets dans une seule fusion. Si l'on veut les séparer, c'est `p3/verrou-partage-doc` qu'on
> fusionne d'abord, puis `p2` — qui n'apportera alors plus que `507e5d6`.
> — **SANS OBJET depuis le 2026-08-24 20:21:13** : la séparation recommandée ici a été faite, dans
> cet ordre. Ce qui reste à trancher est écrit dans la partie vivante ci-dessus.
>
> ### Deux détails qui ont déjà égaré un run
>
> - **Aucun worktree ne porte `p3/verrou-partage-doc`.** `wt-echocode-verrou-partage`, que son nom
>   désigne, est en réalité sur `p3/faux-rouge-dependances` (`3ed120b`, soit `origin/main`). Le
>   nom d'un worktree ne dit pas ce qu'il contient : lire `git worktree list`.
> — **PÉRIMÉ, marqué le 2026-08-27** : ce worktree n'est plus sur la branche nommée, ni sur ce
> commit, et `3ed120b` n'est plus `origin/main`. La règle finale, elle, tient — et l'exemple vient
> de la démontrer une seconde fois.
> - **Le `main` local du checkout principal est en retard** (`7766e7d` contre `3ed120b` sur
>   `origin`). Toute conclusion « c'est déjà dans main » ou « ce n'est pas dans main » doit se lire
>   sur `origin/main`, pas sur `main`.
> — **PÉRIMÉ, marqué le 2026-08-27** : les deux SHA sont dépassés et ce `main` local n'est plus en
> retard. La règle finale tient, et ne dépend d'aucun des deux chiffres.
