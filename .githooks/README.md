# Garde de détection de secrets (hook `pre-commit`)

## Activation — à refaire après chaque clone

```sh
git config core.hooksPath .githooks
```

Vérifier : `git config core.hooksPath` doit répondre `.githooks`.

**Sans cette ligne, les fichiers sont là mais ne protègent rien.** C'est le seul
mode d'échec sérieux de ce dispositif : la garde n'est pas absente, elle est
branchée ailleurs, et on cesse de regarder parce qu'on la croit active. Le
`core.hooksPath` est une configuration **locale**, que git ne versionne pas — un
clone frais repart donc sans garde.

## Ce que ça fait

Juste avant que git écrive l'objet commit, le contenu **ajouté** à l'index est
relu à la recherche de secrets : clés privées PEM, jetons GitHub, clés `sk-`,
clés d'API Google, jetons Slack, identifiants AWS, URL portant
`user:motdepasse@hôte`, assignations dont la clé est `password` / `token` /
`secret` / `apikey`, et littéraux longs et opaques au voisinage d'un mot parlant
de jeton.

Un `.gitignore` filtre par **nom de fichier** : il ne peut pas voir ce qu'il ne
nomme pas. Cette garde regarde le **contenu**, au seul endroit où la contrainte
mord.

Le hook **n'imprime jamais la valeur trouvée** — seulement le chemin, le numéro
de ligne et le nom de la règle.

## Si un commit est refusé

1. **Vraie fuite** → sortir la valeur du fichier et la lire depuis une variable
   d'environnement. Si elle a déjà été poussée, **la rotation est le seul
   remède** : ce dépôt est public.
2. **Faux positif** → ajouter le marqueur `secret-ok` en commentaire **sur la
   ligne concernée**. C'est borné à cette ligne, versionné et relisible.
3. En dernier recours `git commit --no-verify`, qui désactive la garde entière
   pour tout le commit et **ne laisse aucune trace**. À ne pas prendre en
   réflexe : si un motif déclenche souvent, c'est la règle qu'il faut corriger.

## Recette

```sh
node .githooks/detect-secrets.recette.mjs
```

Chaque cas monte un dépôt jetable, y met une sonde à l'index et lit le code de
sortie — le vrai chemin, pas une copie de la logique. Les valeurs d'épreuve sont
**inventées** ; aucun secret réel ne figure dans ce dépôt.

## Source de vérité

Le détecteur est maintenu dans `~/.claude/.githooks/` (documentation complète et
historique de calibrage). Les fichiers présents ici en sont une **copie
versionnée**, pour que la garde voyage avec le dépôt. Toute correction se fait
**d'abord** à la source, puis se recopie ici — sinon les deux divergent.
