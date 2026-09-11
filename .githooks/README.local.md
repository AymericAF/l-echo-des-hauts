# Crochets propres à ce dépôt — hors du lot commun

Ce fichier complète `.githooks/README.md` **sans le modifier**.

`README.md` appartient au **lot commun** de détection de secrets : il est recopié
à l'identique dans tout le parc et comparé empreinte par empreinte à sa source
(`~/.claude/.githooks/`). Une ligne ajoutée ici même le fait diverger, et le
premier `verifier-alignement.mjs --corriger` l'écrase : c'est ce qui est arrivé le
2026-08-22 aux trois lignes ci-dessous, posées le 2026-08-14 (commit `10314f8`).

Les fichiers qu'elles décrivent n'existent **que dans ce dépôt**. Les inscrire dans
la source ferait mentir le tableau des autres copies. Arbitrage de la décision
`72865a6a` (2026-08-24), branche **B** pour ces lignes : elles vivent dans ce
fichier, que le vérificateur range en « FICHIERS HORS LOT (signalés, pas comptés
comme dérive) » — la même porte que `commit-msg` emprunte déjà. `README.md` reste,
lui, vérifié en entier.

## Ce qui est installé en plus du lot

| Fichier | Rôle |
| --- | --- |
| `.githooks/pre-push` | enveloppe `/bin/sh`, même forme — **elle garde `main` d'un résultat de fusion rouge**, cf. la section dédiée |
| `.githooks/gardes-avant-push.js` | les deux suites jouées sur le commit poussé, avant qu'il n'atteigne `main` |
| `.githooks/gardes-avant-push.recette.mjs` | 7 cas sur de vrais dépôts et de vrais `git push` — elle prouve que la garde REFUSE |

La « section dédiée » est « Le troisième filet : le résultat de FUSION, jugé avant
`main` ». Elle a été retirée du `README.md` vivant le 2026-08-22 et son texte reste
dans l'historique (`git show 10314f8:.githooks/README.md`). La même décision la fait
remonter dans la source du parc (branche **A**), pas dans ce fichier.

`commit-msg`, également hors lot, se documente dans son propre en-tête.
