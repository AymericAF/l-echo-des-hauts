# Garde de détection de secrets (hook `pre-commit`)

## Pourquoi

Le `.gitignore` est une convention **par motif de nom**. Il a échoué deux fois en
six semaines sur la même famille de fichiers :

- **2026-06** — un `.env.bak` de 6 Ko poussé sur GitHub (`*.bak` ne couvrait pas
  les suffixes datés, `.env.*` n'existait pas encore) ;
- **2026-08** — 185 fichiers `projects/**/tool-results/*.txt` versionnés dans
  HEAD (628 dans l'historique), dont des dumps d'exécutions n8n porteurs de clés
  d'API Google réelles. **Aucun motif de nom ne regardait ce chemin.**

Un motif de nom ne peut pas voir ce qu'il ne nomme pas. Ce hook regarde le
**contenu**, au seul endroit où la contrainte mord : juste avant que `git` écrive
l'objet commit. Cf. `[[garantie-par-mecanisme-pas-convention]]`.

## Ce qui est installé

| Fichier | Rôle |
| --- | --- |
| `.githooks/pre-commit` | enveloppe `/bin/sh`, résout `node`, échoue bruyamment s'il manque |
| `.githooks/detect-secrets.js` | la détection elle-même |
| `.githooks/package.json` | `{"type": "commonjs"}` — **ne pas l'oublier en copiant le dossier** |

> **Pourquoi ce `package.json` de trois lignes** (2026-08-08, en armant
> `assistant-business-ia`). `detect-secrets.js` est du CommonJS (`require`,
> `module.exports`, `return` au niveau module). Dans un dépôt dont le
> `package.json` racine porte `"type": "module"`, node charge tout `.js` comme un
> module ES et meurt sur `SyntaxError: Illegal return statement`. Le hook rend
> alors 1 sur **tous** les commits, y compris propres — un dépôt qui refuse ses
> propres commits légitimes se fait désinstaller dans la journée, ou se contourne
> au `--no-verify`, ce qui revient au même. Le `package.json` du dossier ramène
> ces `.js` en CommonJS quel que soit le dépôt hôte, sans toucher au détecteur.
> Le `.mjs` de la recette n'est pas concerné : son extension prime.

Activation — voir **« Armer un clone frais »** ci-dessous. En une ligne : sur le
poste d'Aymeric, un `git clone` s'arme tout seul ; ailleurs, il faut la poser à
la main :

```sh
git config core.hooksPath .githooks
```

Sans l'une ou l'autre, les fichiers sont là mais **ne protègent rien**.

> `gitleaks` n'est pas installé sur ce poste. Le détecteur est maison (Node, zéro
> dépendance) pour ne pas introduire un binaire tiers sans arbitrage. Si
> `gitleaks` est adopté un jour, remplacer l'appel dans `.githooks/pre-commit`
> suffit — le reste du dispositif ne bouge pas.

## Armer un clone frais

Les 6 fichiers de la garde sont **versionnés** : ils voyagent avec le dépôt. Mais
`core.hooksPath` est une **configuration locale**, et git ne versionne pas la
configuration. Un dépôt fraîchement cloné repart donc **désarmé** : la garde est
là, elle ne tourne pas, et rien ne le dit au moment où l'on commite.

Mesuré le 2026-08-08 sur un clone réel : sans mécanisme, un commit contenant
`api_key = "<48 caractères hexadécimaux>"` **passe**. Un `git clone` sur une autre
machine, ou un reclonage après incident, suffisait à faire disparaître la
protection en silence.

### Le mécanisme retenu : un modèle de dépôt (`init.templateDir`)

```sh
git config --global init.templateDir ~/.claude/.git-template
```

`~/.claude/.git-template/hooks/` contient deux fichiers **identiques**,
`pre-commit` et `pre-push`. Git les recopie dans `.git/hooks/` de **tout** nouveau
clone ou `git init`. Ils ne détectent rien : ils **délèguent** au hook de même nom
porté par le dépôt (`.githooks/<nom>`), et **sortent en 0 s'il n'existe pas**.

C'est le seul endroit où git accepte de déposer quelque chose d'exécutable au
moment du clone, sans geste humain. Aucune autre voie ne le fait : par
construction, git n'exécute jamais rien qui vienne du dépôt cloné.

Trois propriétés en découlent, et ce sont elles qui rendent le choix défendable :

- **Aucun dépôt qui n'a rien demandé ne change de comportement.** Un dépôt client,
  un dépôt tiers, un clone jetable, et tout dépôt délibérément laissé nu (voir
  `DEPOTS-DU-PARC.txt`, qui les nomme avec leur motif) ne portent pas
  `.githooks/` : l'amorceur sort immédiatement. Coût réel : un `test -f` par commit.
- **Rien à défaire sur les 27 dépôts déjà armés.** Dès que `core.hooksPath` est
  défini, git **ignore entièrement** `.git/hooks/` — les deux voies ne tournent
  jamais ensemble, il n'y a ni double exécution ni conflit. Le modèle ne concerne
  que ce qui sera cloné ensuite.
- **L'amorceur n'a aucune raison de changer.** Toute la logique reste dans le
  dépôt, donc se met à jour avec lui. Le modèle n'entre pas dans le lot des
  6 fichiers à garder alignés sur 38 copies (31 au 2026-08-08 au matin ; voir « Le parc n'est pas un répertoire »).

Effet de bord favorable : l'amorceur appelle sa cible par `sh <chemin>`, donc le
bit d'exécution de `.githooks/pre-commit` **cesse de compter** dans un dépôt armé
par cette voie. Seul le mode de l'amorceur importe, et c'est git qui le pose en
recopiant le modèle.

### Ce qui a été écarté, et pourquoi

| Voie | Pourquoi écartée |
| --- | --- |
| `git config --global core.hooksPath` | Arme **tous** les dépôts du poste, sans exception possible. Pire : `pre-commit` cherche `$repo/.githooks/detect-secrets.js` — dans un dépôt qui ne le porte pas, node échoue et **tous** les commits sont refusés. Et le réglage global **désactive** `.git/hooks/` partout, donc casse silencieusement tout dépôt tiers qui s'en sert. |
| Une entrée `prepare` dans le `package.json` du projet | Ne s'exécute qu'à `npm install`, et la majorité des 28 dépôts ne sont pas des projets npm. Il faudrait modifier 28 `package.json` de projet pour un dispositif transverse. |
| Un script d'amorçage à lancer une fois après le clone | C'est **exactement** le geste manuel qui a créé le trou : `git config core.hooksPath .githooks` est déjà une ligne, et elle est déjà documentée. Un script ne rend pas plus probable qu'on y pense. |
| Ne rien faire, documenter mieux | Le README documentait déjà le geste, et le vérificateur signalait déjà les dépôts désarmés. Le clone repartait quand même nu : c'est la différence entre savoir et faire. |

### Ce que ce choix laisse ouvert — à dire, pas à cacher

- **Il ne protège que ce poste.** `init.templateDir` est une configuration
  globale : elle ne se versionne pas non plus. Un clone sur **une autre machine**
  repart nu, et le seul remède y reste `git config core.hooksPath .githooks`. Le
  trou n'est pas bouché dans l'absolu, il est bouché là où l'on travaille.
- **Il n'arme pas rétroactivement.** Les dépôts déjà clonés gardent leur
  `core.hooksPath` ; c'est délibéré (ne rien casser sur ce qui marche), mais cela
  laisse deux voies d'armement coexister. Le vérificateur accepte les deux.
- **Un dépôt qui porterait le lot sans vouloir la garde s'armerait à chaque
  clone.** Le cas n'existe pas aujourd'hui (les dépôts nus n'ont pas `.githooks/`),
  et l'échappatoire est locale et explicite :

  ```sh
  git config hooks.secrets off
  ```

- **`git commit --no-verify` continue de tout contourner, sans laisser aucune
  trace.** Rien ici ne change cela : un hook s'exécute côté client, il est par
  nature contournable par celui qui commite.
- **Le comportement d'un hook en `100644` hors Windows** (sauté **en silence**)
  est repris de la connaissance existante ; il n'a pas été exercé sur une machine
  POSIX. Les modes `100755` sont vérifiés dans l'index, pas éprouvés à l'exécution.

## Ce qu'il scanne

Les **lignes ajoutées de l'index** (`git diff --cached`), pas les fichiers
entiers. Conséquence voulue : un fichier neuf est scanné intégralement (c'est le
cas `.env.bak`), un fichier modifié ne l'est que sur ses ajouts. Sinon chaque
commit rejouerait tout le passé du dépôt et la garde serait désactivée dans la
semaine.

Le diff est lu avec **une ligne de contexte** (`-U1`, voir `CONTEXTE_LIGNES`).
Les lignes **inchangées** ainsi rendues ne sont **jamais jugées** — aucun littéral
n'y est cherché — elles servent uniquement de **voisinage** au mot-clé. Sans
elles, la forme la plus banale d'une fuite passait : ajouter une valeur sous une
déclaration qui, elle, ne bouge pas.

### Règles à **motif nommé** (sans condition de voisinage)

Elles reconnaissent un préfixe qui n'a **qu'une seule signification au monde**.
Elles ne demandent **aucun** mot-clé alentour — c'est ce qui les distingue des
deux règles heuristiques ci-dessous, et c'est tout leur intérêt.

| Préfixe | Règle |
| --- | --- |
| `-----BEGIN … PRIVATE KEY-----` | `cle-privee-pem` |
| `AKIA…` / `aws_secret_access_key=` | `aws-access-key-id` / `aws-secret-access-key` |
| `ghp_ gho_ ghu_ ghs_ ghr_` | `jeton-github` |
| `github_pat_` | `jeton-github-pat` |
| `sk-` / `sk-ant-` | `cle-openai-anthropic` |
| `AIza…` | `cle-api-google` |
| `xoxb- xoxp- xoxa- xoxr- xoxs-` | `jeton-slack` |
| `sk_live_` / `rk_live_` | `cle-secrete-stripe-live` **(2026-08-08)** |
| `whsec_` | `secret-webhook-stripe` **(2026-08-08)** |
| `user:motdepasse@hôte` dans une URL | `url-avec-identifiants` |

**Pourquoi les deux dernières ont été ajoutées.** La clé secrète Stripe **LIVE**
d'un client — accès API complet à son compte de paiement — a bien été trouvée par
le balayage du 2026-08-07, mais par la **seule règle d'entropie**, et seulement
parce qu'un mot parlant de secret se trouvait dans les 80 caractères voisins.
Déplacez la ligne, et la trouvaille la plus grave du balayage passait. Aucune
règle ne reconnaissait `sk_live_` pour ce qu'il est.

**Vérification faite à cette occasion** : tous les autres préfixes du tableau
étaient **déjà** inconditionnels. Aucun ne dépendait du voisinage. Seul Stripe
manquait.

Les deux règles Stripe exigent **au moins 16 caractères** après le préfixe : sans
cela, le préfixe cité dans de la documentation — y compris dans ce README —
suffirait à refuser le commit. Une règle nommée qui rougit sur sa propre notice
se fait désinstaller.

### Ce qui n'est **délibérément pas** une règle nommée

- **`pk_live_` / `pk_test_` (Stripe)** — **publiables par construction** : ils
  sont faits pour partir dans le navigateur. Les détecter serait un faux positif
  **garanti**, et une règle nommée qui crie sur une clé publique se fait
  désarmer. Ils ont donc l'exemption explicite `RE_PUBLIABLE`, qui vaut aussi
  contre les **règles heuristiques** : une clé nommée `stripe_api_key` portant une
  valeur en `pk_live_…` est l'usage **normal** côté front et doit rester muette.
  (Cette phrase a été écrite sans signe `=` exprès : avec lui, elle avait la forme
  d'une assignation sensible et **ce README refusait son propre commit** sur les
  28 dépôts. C'est le pire cas qui l'a montré, pas la relecture.)
- **`sk_test_` / `rk_test_` (Stripe)** — **arbitrage du 2026-08-08 : ni règle
  nommée, ni exemption.** Une clé de test n'ouvre ni argent ni données réelles :
  ce n'est pas une fuite, donc elle ne mérite pas un refus inconditionnel, qui
  rougirait sur toutes les fixtures d'intégration. Mais elle n'est pas non plus
  publiable par construction : elle ne mérite pas davantage une exemption. Elle
  reste donc soumise aux **règles génériques** comme n'importe quelle valeur —
  **muette isolée**, **signalée** posée sous un nom parlant. C'est la *pratique*
  qu'on veut voir, pas la *valeur* qu'on veut bloquer. Deux cas de recette fixent
  cet arbitrage : s'ils changent, c'est que quelqu'un a tranché autrement.
- **`AKIA` et `AIza` restent inconditionnels** bien qu'ils apparaissent dans de la
  documentation et des dumps d'analyse — les restreindre **perdrait** des
  détections, ce que la contre-épreuve interdit. Le coût est connu et **mesuré** :
  `maj-divi5-zeller` porte des dumps PageSpeed contenant une clé `AIza` publique
  par construction, qui produisent 92 détections. Le dépôt est **branché quand
  même** depuis le 2026-08-08, avec son résidu écrit : voir « Les dépôts laissés
  nus, et les résidus assumés » plus bas.

### Les deux règles heuristiques

- **`assignation-sensible`** — une clé dont la **composition** désigne un secret
  (voir la règle ci-dessous), suivie d'une valeur d'allure secrète ;
- **`litteral-haute-entropie`** — une chaîne longue et opaque à moins de
  80 caractères d'un mot parlant de jeton ou de secret. C'est elle qui attrape ce
  que l'assignation rate (une constante nommée `EXPECTED`, par exemple).

#### La règle de composition d'un nom de variable

**Ce n'est plus une liste de mots.** Un nom se lit comme une phrase :

```
[fournisseur]   [marqueur ...]    PORTEUR    [qualificatif]
  STRIPE_           SECRET_         KEY
 SUPABASE_       SERVICE_ROLE_      KEY
                     API_           KEY         _HEADER   -> référence
```

| Rôle | Ce que le mot dit | Membres |
| --- | --- | --- |
| **Porteur fort** | le mot seul **est** un secret | `password` `passwd` `pass` `passphrase` `motdepasse` `mdp` `secret` `token` `credential(s)` |
| **Porteur composé** | fort seulement **accompagné** | `pwd` (seul, c'est le répertoire courant Unix) |
| **Porteur armé** | ne dit rien seul ; secret **si un marqueur précède** | `key` `salt` |
| **Marqueur** | arme un porteur situé **après** lui, adjacent ou non | `api` `secret` `private` `access` `auth` `signing` `encryption` `master` `service` `client` `app` `application` `session` `consumer` `shared` `licence` `license` `secure` `logged` `nonce` |
| **Qualificatif final** | le nom **désigne** un secret, il n'en est pas un | `name` `path` `type` `url` `header` `id` `env` `var` `label` `format` `option` `prefix` `regex` `pattern` `placeholder` `hint` `desc` `file` `field` `kind` `uri` |

Deux mécanismes portent tout le reste :

- **Décollage** — un mot inconnu qui se décompose exactement en
  `<marqueur><porteur>` est rendu à ses deux mots. `apikey`, `secretkey`,
  `accesskey`, `privatekey`, `authkey`, `clientsecret`, `servicekey`, `apitoken`
  **ne sont plus écrits nulle part** : ils se **dérivent**. Les deux moitiés
  doivent appartenir aux vocabulaires — sans cette borne, `bypass` deviendrait
  `by` + `pass` et les faux positifs PASSE/PASSAGE reviendraient.
- **Le marqueur porte à distance** — `service` arme `key` à travers `role`, ce
  qui est la seule façon de voir `SUPABASE_SERVICE_ROLE_KEY`, la clé qui
  contourne toutes les règles de sécurité au niveau ligne.

**`key` n'est plus un qualificatif**, c'est un porteur : sa présence parmi les
qualificatifs est **la cause unique des deux trous** `api_key` et `SECRET_KEY`.

##### Ce qui n'est délibérément **pas** couvert

Décidé sur les **3 055 combinaisons engendrées** depuis la règle et passées au
détecteur — pas au jugement. Élargir est facile ; ne pas devenir bavard est le
travail, et un dépôt qui refuse des commits légitimes se fait contourner au
`--no-verify` sur les 28 d'un coup.

| Écarté | Pourquoi |
| --- | --- |
| `signature`, `sig` | une signature est le **produit** d'un secret, publiée dans la requête ; `webhook_signature` peuple les fixtures. Le secret de signature est couvert (`whsec_`, `signing_key`). |
| `hash`, `digest` | conçus pour être stockés — et `hash` est déjà une **exemption** (`RE_CONTEXTE_EMPREINTE`). Les détecter contredirait cette exemption. |
| `id` | `client_id`, `app_id`, `session_id` sont **publics par construction**. Reste un qualificatif. |
| `code` | `status_code`, `country_code`, `error_code` — bruit garanti. Un code OAuth expire en secondes. |
| `cert`, `certificate` | un certificat est public ; c'est sa **clé** qui est secrète, et elle a une règle nommée (`cle-privee-pem`). |
| `seed`, `string`, `value` | trop génériques. La chaîne de connexion à identifiants a déjà `url-avec-identifiants`. |
| marqueurs `refresh` `admin` `role` `bearer` `webhook` | la forme réelle du terrain est `REFRESH_TOKEN` / `BEARER_TOKEN` (porteurs forts, déjà couverts), pas `REFRESH_KEY` ; `SERVICE_ROLE_KEY` est déjà armé par `service`. Chacun élargirait `key` et `salt` sans qu'aucun nom rencontré ne le demande. |
| formes collées **sans marqueur** (`dbpassword`, `stripetoken`) | les attraper demanderait de décoller contre un ensemble **ouvert** de préfixes, ce qui rouvre `bypass`. Aucun `.env` du terrain ne les écrit ainsi. |
| `PUBLIC_KEY` | une clé publique est faite pour être lue. `public` n'est pas un marqueur et ne doit pas le devenir — même logique que l'exemption `pk_live_`. |

**Le hook n'imprime jamais une valeur de secret** — uniquement chemin, numéro de
ligne et nom de règle. Sa sortie finit dans `backup-claude.log` quand le backup
de 20 h se fait refuser : un journal ne doit pas devenir un déversoir.

## Calibrage (et pourquoi il n'est pas négociable)

Un hook qui bloque trop est désinstallé dans la semaine — c'est pire que pas de
hook. Les filtres ont donc été calibrés en **rejouant la détection sur les
commits réels du dépôt**, pas sur des cas imaginés :

| Version | Commits refusés / 60 | Dont vrais positifs |
| --- | --- | --- |
| Première écriture | 7 | 0 |
| Après calibrage | 2 | 2 |

Sur les **30 derniers commits : zéro faux positif**, et **aucun commit
`backup auto` refusé**. Les 2 refus portent sur la même ligne d'un même fichier,
et c'est un vrai secret en dur.

Ce que le calibrage a corrigé, à garder en tête avant d'élargir une règle :

1. `PASS` cherché en sous-chaîne attrapait les mots français **PASSAGE** et
   **PASSE** → la clé est découpée en mots (sur `_ - .` et les bascules de casse).
2. Une clé qui **nomme** un secret n'en est pas un : `nodeCredentialType`,
   `tokenName`, `secretPath` → un dernier mot qualificatif (`type`, `name`,
   `path`, `url`, `header`…) désamorce.
3. Une valeur qui est du **code** (`item.headers?.[…]`) ou une **référence**
   (`$VAR`, `${…}`, `$$`, `%VAR%`, `process.env`) n'est pas un secret.
4. Le voisinage se mesure sur une **fenêtre de 80 caractères**, pas sur la ligne :
   ce dépôt versionne des JSON d'une seule ligne de plusieurs centaines de
   milliers de caractères.
5. SHA git, empreintes SHA-256 et UUID sont exclus — ils sont partout ici.

6. Le voisinage déborde d'**une ligne** de part et d'autre (`CONTEXTE_LIGNES`),
   dans le même fichier uniquement. Élargi le 2026-08-06 : le nom parlant est
   souvent sur une ligne et la valeur sur la suivante (JS, JSON, PHP), forme que
   la garde ne voyait pas.

7. Ce voisinage porte aussi sur les lignes **inchangées** (`-U1`), depuis le
   2026-08-08. Le point 6 ne regardait que les lignes *ajoutées* : sur un fichier
   neuf tout est ajouté — donc la recette était verte — mais sur un fichier
   **modifié** le mot-clé vit presque toujours sur une ligne qui ne bouge pas, et
   la garde était aveugle. Contre-épreuve : rejeu des 60 derniers commits réels,
   **7 refus avant, les mêmes 7 après** ; pire cas inchangé (24 détections, liste
   identique).

8. **Vocabulaire de gabarit** (2026-08-08) : `tobemodified` (l'échafaudage
   Strapi), plus les équivalents français des mots déjà exemptés en anglais
   (`factice`, `bidon`, `fixture`, `de_test`, `de_recette`, `a_modifier`). Mesuré
   sur `echo-code` : **4 commits réels sur 32 étaient refusés, faux à 100 %**, et
   les 10 détections en pire cas portaient toutes sur des fichiers **vivants**
   (`.env.example`, jetons de fixture des tests) → 0 après. Un `secret-ok` était
   exclu dans `.env.example` : un `#` après une valeur non quotée est avalé par
   certains lecteurs `dotenv`, on aurait corrompu un fichier fait pour être copié.

9. **Balayage de `~/projects` (2026-08-08)** — 32 dépôts mesurés avant d'être
   équipés. Quatre corrections, toutes tirées d'un relevé, pas d'une intuition :

   - **Le qualificatif `key` désamorçait `api_key`.** `cleSensible` découpe la clé
     en mots, reconnaît `apikey`… puis annule tout si le **dernier** mot est un
     qualificatif. Or `api_key` se découpe en `[api, key]` : `key` étant un
     qualificatif, **la clé la plus répandue au monde était exemptée sans
     condition**. Pire, l'angle mort se recouvrait avec celui de l'autre règle :
     `RE_LITTERAL` exige des **guillemets**, donc `api_key=<valeur>` dans un
     `.env` échappait aux deux. Un qualificatif ne désamorce plus quand il
     **forme lui-même** le mot secret avec celui qui le précède (`api_key`,
     `access_key`, `private_key`) ; `tokenName` et `secretPath` restent désamorcés.
   - **`option`/`options` rejoignent les qualificatifs** : `TOKEN_OPTION` nomme un
     réglage WordPress, il n'en est pas un.
   - **Valeurs énumérées du web** : `credentials: 'same-origin'` (et la famille
     `referrerPolicy`) déclenchait `assignation-sensible` sur **tout** appel
     `fetch` — 3 dépôts touchés, dont deux à cause de la même ligne de thème.
   - **`test` encadré d'un séparateur** (`jeton-test`, `test_token`) rejoint le
     vocabulaire de gabarit, et **une valeur uniquement alphabétique de moins de
     16 caractères** n'est plus plausible : c'est un mot (`Required`, `newToken`,
     `Continue`), pas un jeton engendré. C'est ce dernier filtre qui règle la
     famille « If tests **pass**: Continue », survivance des faux positifs
     `PASSE`/`PASSAGE` du point 1.

   **Contre-épreuve sur ~/.claude, avant/après** : rejeu des 60 derniers commits
   → **6 refus avant, les 6 mêmes après** (`99db29b 0cf232e 2b7ba4c 80df1eb
   0526e02 8052d71`). Pire cas 24 → 22 : les deux détections perdues sont de la
   **prose de plugins tiers** (la ligne de documentation qui décrit la variable
   `ANTHROPIC_AUTH_TOKEN`, et « If tests pass — Continue »). Aucun vrai positif
   perdu. Effet sur les dépôts mesurés :
   `migration-divi5-ksio` 3 refus/30 → **0**, `refonte-site-aymeric-filliot`
   1 refus/30 → **0** ; en sens inverse, `ChosenPath` passe de 58 à 62 détections
   en pire cas, toutes des `api_key` de fixtures que le trou ci-dessus masquait.

10. **Règles à motif nommé Stripe (2026-08-08, tâche `6437c6d3`)** — voir la
    section « Règles à motif nommé » plus haut pour le *pourquoi*. Ce qui suit est
    la **mesure**, faite sur les **27 dépôts branchés** (`~/.claude`, 25 sous
    `~/projects`, `clubwpress-agent`) :

    | | Refus / 60 derniers commits | Pire cas |
    | --- | --- | --- |
    | Avant | 10 | 24 |
    | Après | **10 — les mêmes** | **24 — la même liste** |

    **Zéro refus ajouté, zéro détection perdue, sur les 27 dépôts.** Ce résultat
    n'a rien d'étonnant et c'est justement ce qu'on voulait : une règle nommée sur
    un préfixe qui n'existe qu'une fois au monde ne peut pas fabriquer de faux
    positif crédible. Le détail par dépôt est reproductible avec le banc décrit
    ci-dessous.

    Ce que les règles **gagnent**, mesuré sur `le-rucher-seo` (dépôt **non
    branché**, celui où la clé du balayage vit) : **1 détection avant, 3 après**.
    Le `whsec_` n'était détecté par **rien** ; le `sk_live_`, uniquement par la
    règle d'entropie, et seulement grâce à un mot voisin.

11. **`secretkey` rejoint `MOTS_SECRET` (2026-08-08)** — même trou que `api_key`
    (point 9), sur le nom le plus canonique qui soit. `accesskey` et `privatekey`
    y étaient déjà, `secretkey` manquait : `SECRET_KEY=<valeur>` et
    `STRIPE_SECRET_KEY=<valeur>` n'étaient donc **jamais examinés** — le mot
    `secret` passait le premier filtre, puis le qualificatif final `key` annulait
    tout. Mesure sur les 27 dépôts : **zéro refus ajouté, zéro perdu, pire cas
    inchangé**. C'est aussi ce point qui a révélé que la phrase d'exemple de ce
    README avait la forme d'une assignation sensible et faisait **refuser son
    propre commit** — corrigé, et signalé ici parce que c'est le mode d'échec
    typique d'un élargissement : il se paie sur la documentation avant de se payer
    sur le code.

12. **Le vocabulaire devient une RÈGLE (2026-08-08, tâche `249fdfd5`)** — voir la
    section « La règle de composition » plus haut pour le *quoi*. Ce qui suit est
    le *pourquoi* et la **mesure**.

    **Le motif, et c'est lui le sujet.** En une nuit, deux runs indépendants ont
    trouvé, **chacun par hasard**, un mot manquant : `api_key` (point 9) puis
    `secretkey` (point 11). Deux fois le même mode d'échec, découvert deux fois
    par accident. Le troisième trou existait déjà ; il aurait été trouvé par un
    accident qui n'aurait pas eu lieu, ou par une fuite. **Une liste de mots
    grandit par accident et se troue en silence ; une règle de composition se
    vérifie.**

    La cause commune tient en une phrase : le désamorçage demandait à
    `MOTS_SECRET` si la forme collée `<avant-dernier><dernier>` en faisait
    partie. Il fallait donc y avoir écrit **d'avance** `apikey`, `secretkey`,
    `servicekey`, `authkey`… et tout nom non prévu passait sans bruit. Les deux
    trous ont été **reproduits par mutation avant d'être corrigés** — le
    correctif est fondé sur une mesure refaite, pas sur le rapport des deux runs.

    **La génération remplace l'intuition.** 3 055 combinaisons ont été engendrées
    depuis la règle (porteurs × marqueurs × neutres × qualificatifs × 9 préfixes
    fournisseur × 5 casses : `SNAKE_MAJ`, `snake_min`, `camelCase`, `kebab-case`,
    collée) et passées au détecteur. **+251 détections gagnées, 0 perdue.** Ce
    qui reste non détecté est listé dans « Ce qui n'est délibérément pas
    couvert » : ce sont des **décisions écrites**, plus des oublis.

    Sont notamment couverts, dans les 5 casses et avec les préfixes `STRIPE_`
    `SUPABASE_` `AWS_` `GOOGLE_` `GITHUB_` `N8N_` `DB_` `WP_` : `SECRET_KEY`
    `API_KEY` `ACCESS_TOKEN` `AUTH_TOKEN` `PRIVATE_KEY` `CLIENT_SECRET`
    `APP_SECRET` `DB_PASSWORD` `SERVICE_ROLE_KEY` `DB_PWD` `AUTH_SALT`.

    **Contre-épreuve sur les 28 dépôts branchés, avant / après :**

    | | Refus / 60 derniers commits | Pire cas |
    | --- | --- | --- |
    | Avant | 10 | 26 |
    | Après | **10 — les mêmes SHA** | **26 — la même liste** |

    **Zéro dépôt avec écart**, comparaison ligne à ligne (chemin + numéro + nom
    de règle). Détail par dépôt : `~/.claude` 5 refus/60, `l-echo-des-hauts` 2/60,
    `assistant-business-ia` 1/60, `migration-divi5-anaphore` 1/41,
    `reprise-securisation-lytho-box` 1/14, **les 23 autres 0**. Pire cas :
    `~/.claude` 22, `assistant-business-ia` 2, `reprise-securisation-lytho-box` 2,
    **les 25 autres 0**.

    **Le seul faux positif que l'élargissement ait produit** — et comment il a été
    fermé plutôt qu'accepté. Sortir `key` des qualificatifs a fait rougir une
    ligne, une seule, sur les 28 dépôts :
    `const INVALID_API_KEY_ERROR_COUNT_CACHE_KEY = 'invalid_api_key_error_count'`
    (fichier vendorisé WooCommerce Stripe). Plutôt que de vivre avec, une règle
    **générale** a été ajoutée : *une valeur qui n'est qu'une reformulation des
    mots de sa propre clé est un identifiant, pas un secret*. Elle ne peut pas
    aveugler la garde sur un mot de passe choisi par un humain — un `DB_PASSWORD`
    valant `super_secret_pass` reste signalé, ses mots n'étant pas ceux de sa
    clé — et les deux cas de recette fixent ce couple. (Phrase écrite sans signe
    `=`, **exprès** : avec lui elle avait la forme d'une assignation sensible et
    ce README refusait son propre commit sur les 28 dépôts, comme au point 11.
    C'est le pire cas qui l'a montré, pas la relecture.)

    **Preuve par mutation, 7 clauses, chacune tuée séparément** : remettre `key`
    parmi les qualificatifs (7 cas rouges), neutraliser le décollage (1), le
    déborner (`bypass` → `by`+`pass`, 1), faire de `pwd` un porteur fort (1),
    retirer `salt` (1), exiger l'adjacence du marqueur (`SERVICE_ROLE_KEY`, 1),
    neutraliser l'exemption de reformulation (1). Aucune mutation ne survit à la
    recette — sans quoi la recette ne prouverait rien.

13. **Les trois angles morts, fermés en une passe (2026-08-08, tâche `b01265b7`)** —
    voir « Trois angles morts mesurés » plus bas pour le *quoi*. Ce qui suit est la
    **mesure**, faite sur **38 dépôts** (le parc entier, registre compris).

    **Ce qu'ils avaient en commun, et c'est le sujet.** Ce n'étaient pas trois
    règles trop étroites : c'étaient trois **filtres d'exclusion qui jugeaient la
    valeur sans regarder la clé qui la porte**. Le détecteur croise pourtant déjà
    « littéral » et « mot-clé au voisinage ». Le correctif est donc un
    **resserrement du contexte**, pas un assouplissement — et c'est ce qui permet
    d'élargir sans devenir bavard.

    | | Refus / 60 derniers commits | Pire cas |
    | --- | --- | --- |
    | Avant | 26 | 261 |
    | Après | **26** (+1, −1) | **261** (+2, −2) |

    **Le détail, ligne à ligne, parce que c'est lui qui engage :**

    - **+1 refus** — `~/.claude`, commit `51a9094` : la ligne de
      `INVENTAIRE-PARC.md` qui **documente l'angle mort 1**, avec une valeur
      fictive au gabarit exact. La garde fait ce qu'on lui demande ; c'est le mode
      d'échec déjà rencontré aux points 11 et 12 — un élargissement se paie
      d'abord sur la documentation. La ligne vivante porte désormais `secret-ok`,
      donc **aucun commit futur n'est bloqué** (pire cas de `~/.claude` : 22 avant,
      22 après).
    - **−1 refus** — `CockpitV2`, commit `f316ff5b`, celui que le tableau « Compter
      les commits refusés » listait comme refus légitime : c'était un **faux
      positif**, deux constantes Laravel `Password::RESET_LINK_SENT` sans aucune
      valeur. Le filtre « une valeur qui commence par un séparateur » les retire.
    - **+2 détections en pire cas** — le vrai jeton du registre npm privé dans
      `af-scroll-counter-create-file/.npmrc` (**le secret que cette tâche visait**,
      cf. plus bas) et la ligne de documentation ci-dessus.
    - **−2 détections** — les deux constantes Laravel du même `f316ff5b`.

    **Les 34 autres dépôts : écart nul, comparaison ligne à ligne** (chemin +
    numéro + nom de règle).

    **Le correctif naïf de l'angle 1, mesuré plutôt que redouté.** Accepter *toute*
    valeur à espaces sous une clé sensible, sur ces mêmes 38 dépôts :

    | | Refus | Pire cas |
    | --- | --- | --- |
    | Retenu (gabarit ancré) | 26 | 261 |
    | **Naïf (toute valeur à espaces)** | **128** | **404** |

    **+103 commits refusés.** Ce n'est pas un détail de confort : un dépôt qui
    refuse un commit sur deux se fait contourner au `--no-verify` dans la semaine,
    et l'habitude ne revient jamais. C'est exactement pourquoi on n'accepte pas
    l'espace mais **un gabarit ancré en fin de ligne**.

    **Ce qui a été essayé puis écarté, avec son chiffre** (élargir est facile ; ne
    pas devenir bavard est le travail) :

    | Élargissement essayé | Mesure | Décision |
    | --- | --- | --- |
    | Balayage **chevauchant** (réexaminer l'intérieur d'une valeur déjà consommée) | +23 détections, **+2 refus** | **écarté** — que des paramètres de requête (`?token=<jeton-de-test>`, `?password-protected=<valeur>`) |
    | Accepter toute valeur à espaces | **+103 refus** | **écarté** (ci-dessus) |

### Re-mesurer après avoir touché une règle

Le fichier est importable (`module.exports = { analyser }`), et il faut **deux**
mesures — elles ne répondent pas à la même question :

| Mesure | Ce qu'elle dit | Quand s'y fier |
| --- | --- | --- |
| Rejeu des 60 derniers commits | ce que la garde **aurait** refusé | trouver des fuites passées |
| Pire cas sur les fichiers suivis | ce qu'elle **refusera demain** | décider d'élargir |

Le rejeu de l'historique ne suffit pas à trancher : l'historique est figé, et un
chemin fautif a pu être ignoré depuis (c'est le cas de `projects/**/tool-results/`).
La mesure qui engage est donc le **pire cas** — chaque fichier encore suivi
présenté comme entièrement ajouté :

```js
const { analyser } = require('./.githooks/detect-secrets.js');
// pour chaque fichier de `git ls-files` :
const lignes = fs.readFileSync(f, 'utf8').split('\n');
const diff = `+++ b/${f}\n@@ -0,0 +1,${lignes.length} @@\n`
           + lignes.map((l) => '+' + l).join('\n');
analyser(diff, { racine: depot });   // -> [{fichier, numero, r}]
```

`racine` n'est pas facultatif dans cette mesure : c'est le dépôt dont le registre
`.secrets-connus` doit être lu. Sans lui, `analyser` lirait celui du répertoire
courant — donc le mauvais — et le compte mentirait sans rien signaler.

Relevé du 2026-08-06 sur 2 962 fichiers, en faisant varier `CONTEXTE_LIGNES` :

| N | Détections | Nouvelles | Nature des nouvelles |
| --- | --- | --- | --- |
| 0 | 17 | — | (référence avant élargissement) |
| **1** | **24** | **+7** | 3 pages HTML archivées, figées — aucun fichier vivant |
| 2 | 29 | +12 | idem, plus nombreuses |
| 3 | 37 | +20 | **+ `scripts/backup-supabase.sh`, fichier vivant** |

C'est ce tableau qui a fait retenir 1 plutôt que les « 3 à 5 » envisagés au
départ : à N=3, le commentaire d'en-tête d'un script de sauvegarde suffit à faire
rougir sa ligne `CONTAINER=`. Une détection sur un fichier figé ne coûte rien ;
une détection sur un fichier vivant fait désinstaller la garde.

## L'échappatoire

Un jour un faux positif légitime surviendra — une fixture de test, un exemple de
documentation. Trois sorties, dans cet ordre de préférence :

### 1. Le marqueur `secret-ok` (à préférer)

Ajouter `secret-ok` en commentaire **sur la ligne concernée** :

```js
const jetonDeDemo = "faux-jeton-pour-le-test"; // secret-ok : fixture, pas un vrai jeton
```

La ligne est laissée passer. C'est **borné à cette ligne**, **visible en revue**
et **versionné** : dans six mois on saura pourquoi. Les alias `gitleaks:allow` et
`allow-secret` fonctionnent aussi.

### 2. Le registre `.secrets-connus` (quand le format n'a pas de commentaire)

`secret-ok` s'écrit dans un **commentaire**. JSON, CSV, un dump SQL, un fichier
minifié n'en ont pas : un faux positif y est **immarquable**. C'est le pire cas de
tous — il ne laisse aucune issue entre subir le bruit et désarmer la garde.

Le marqueur peut alors vivre **hors du fichier fautif**, dans `.secrets-connus` à
la racine du dépôt. Une entrée par ligne, `#` commence un commentaire :

```
<sha-256 en 64 hexadécimaux>  <nom-de-règle>  # <justification>
```

**Ce n'est pas une exemption de chemin, et surtout pas un `--no-verify` en
fichier.** Cinq propriétés le tiennent, chacune éprouvée par un cas de recette :

- il porte **une valeur**, désignée par son empreinte, **pas un fichier ni un
  dossier**. Une autre valeur dans le même fichier rougit toujours — y compris
  sur la même ligne ;
- il est **borné à une règle** : la même empreinte sous une autre règle n'exempte
  rien ;
- il exige une **justification écrite**, sans quoi la lecture échoue ;
- il se lit dans **l'index git**, pas sur le disque : une exemption non versionnée
  n'exempte rien, et un désaccord index/disque arrête le commit ;
- il ne cite **jamais** la valeur. Un sha-256 ne se remonte pas — le registre peut
  être publié, la valeur non.

C'est cette dernière propriété qui borne le mécanisme : il n'est ouvert qu'aux
règles marquées **`empreintable`**, celles dont le motif impose une valeur
structurellement longue (`AIza…`, `AKIA…`, `ghp_…`, `sk-…`, `xox…`, `sk_live_…`,
`whsec_…`). Le sha-256 d'un mot de passe court se retrouve par force brute :
l'exempter par empreinte reviendrait à le publier. `url-avec-identifiants`,
`aws_secret_access_key=` et `cle-privee-pem` en sont donc **exclus** — leur match
n'est d'ailleurs pas la valeur seule, mais l'URL ou l'assignation entière.

**Toute anomalie arrête le commit** plutôt que d'être lue « au mieux » : ligne
illisible, règle inconnue, règle non empreintable, justification vide, fichier
présent sur le disque mais absent de l'index. Un registre d'exemptions qui se lit
à moitié est pire que pas de registre — et c'est aussi ce qui empêche d'y coller
une vraie valeur : elle n'a pas la forme d'une entrée, donc elle **refuse** le
commit au lieu de s'y cacher.

Le fichier est exempté de l'analyse (il porte 64 hexadécimaux à côté du mot
« secret », soit exactement ce que la règle d'entropie cherche) — mais son
**format**, lui, est vérifié ligne à ligne.

### 3. `git commit --no-verify` (dernier recours)

```sh
git commit --no-verify -m "..."
```

Désactive **tous** les hooks pour **tout** le commit.

**Pourquoi il ne faut pas en faire une habitude.** Le marqueur `secret-ok`
neutralise une ligne, que quelqu'un relira ; `--no-verify` neutralise la garde
entière, et ne laisse **aucune trace** dans le dépôt — ni dans le message de
commit, ni dans le diff, ni dans un journal. Personne ne peut savoir après coup
qu'un commit est passé sans contrôle. Un `--no-verify` pris en réflexe redonne
exactement l'état d'avant ce hook, à ceci près qu'on se croira protégé. Si un
motif déclenche assez souvent pour donner envie de l'automatiser, ce n'est pas
`--no-verify` qu'il faut, c'est **corriger la règle** dans `detect-secrets.js` et
re-mesurer avec le calibrage ci-dessus.

`backup-claude.ps1` n'utilise **pas** `--no-verify` : le backup automatique de
20 h passe par la même garde que tout le monde. S'il se fait refuser, il
journalise `ECHEC - commit refuse` et sort en `exit 1` **sans envoyer le
heartbeat** — la surveillance n8n reste donc au rouge, au lieu d'afficher un vert
mensonger sur des modifications jamais sauvegardées.

## Les dépôts laissés nus, et les résidus assumés

Mesuré et arbitré le 2026-08-08 (tâche `5f0ecb80`). Le principe qui tranche est
toujours le même : **un dépôt qui refuserait ses propres commits légitimes ne doit
pas être branché en l'état** — il se fait désinstaller dans la semaine, et
l'habitude du contournement se propage ensuite aux autres. La mesure qui décide
est le **pire cas restreint aux fichiers vivants**, pas le pire cas brut : une
détection dans une archive figée ne coûte rien, une détection sur un fichier qu'on
rouvre chaque semaine coûte la garde entière.

### Branchés avec un résidu, écrit plutôt que caché

| Dépôt | Pire cas | Vivant | Ce qui reste, et pourquoi |
| --- | --- | --- | --- |
| `strategie-marketing-freelance` | 5 → 2 → **0** | **0** | 3 faux jetons de recette marqués `secret-ok`. **Les 2 derniers ont été supprimés à la source le 2026-08-09** — pas marqués, *corrigés* : voir « Le faux positif qu'on ne peut pas marquer » ci-dessous. Plus aucun résidu. |
| `automatisation-maintenance-wordpress` | 18 → **0** | **0** | 19 lignes marquées (13 jetons de fixture PHPUnit, 6 identifiants de ressources Google Drive). Aucun résidu. |
| `maj-divi5-zeller` | 102 → **10** | **0** | Les **92** de `perf/**/*.json` sont traitées le 2026-08-09 par une entrée de `.secrets-connus` — **une seule valeur**, une clé Google **navigateur** publique par construction : voir « Les 92 relevés PageSpeed » ci-dessous. Restent 10 `litteral-haute-entropie` dans `recette-p*/**.html`, familles figées depuis juin, sur des pages archivées. |
| `ChosenPath` | **47** | 47 | Instruit le 2026-08-09 (tâche `603c27fd`), **aucun vrai secret** : 38 mots de passe / jetons de **fixture** dans les tests, 9 DSN de développement `postgres:postgres@localhost`. Marquables mais **non marqués** — l'arbre est partagé avec une boucle autonome, et le coût réel est de **1 commit refusé sur 23**. Voir la section dédiée ci-dessous. |
| `ldveh-premium` | **62** | 47 | **Le même dépôt que `ChosenPath`** (même distant), avec 3 mois et demi de retard : 47 détections **identiques clé à clé**, plus 15 sur cinq faux `.ttf` déjà réparés en amont par `eb17e9c`. Rien à y corriger — le résidu tombe à 47 au premier `pull`, ou disparaît avec le dossier. Clone non suivi, **lecture seule** tant que son sort n'est pas tranché. |

**La leçon de mesure du 19e marqueur** (`automatisation-maintenance-wordpress`) :
le détecteur **regroupe les détections voisines à une ligne près**. Exempter une
ligne fait donc **surgir** sa voisine, qui portait le même motif et se trouvait
masquée par le regroupement. Il faut mesurer **jusqu'à 0**, en boucle, pas jusqu'à
la première passe — sinon on croit avoir fini avec une détection encore debout.

### Le faux positif qu'on ne peut pas marquer (2026-08-09, tâche `7bdeca91`)

Les deux résidus de `strategie-marketing-freelance` n'ont pas été marqués : ils ne
**pouvaient** pas l'être. Ce sont deux dumps d'exécution n8n **mono-ligne**, et JSON
n'a pas de commentaire — il n'existe aucun endroit où poser un `secret-ok`. C'est le
pire cas de tous : un faux positif marquable coûte une ligne, **celui-là laisse le
dépôt nu pour toujours, ou pousse au `--no-verify`**.

**Ce que la règle faisait.** Ses trois classes étaient écrites en **négatif** —
`[^\s/:@]`, « tout sauf quatre caractères ». Le guillemet double et la virgule y
étaient donc admis. Dans un JSON minifié, où le document entier tient sur une ligne,
la règle lisait un **nom d'hôte** comme utilisateur, le `:` de **la clé JSON
suivante** comme séparateur, et une **adresse e-mail** comme `motdepasse@hôte`. Elle
voyait `user:pass@hôte` en **enjambant trois valeurs** :

```
… "lien":"https://www-abc.exemple.fr","email":"contact@exemple.fr","actif":true …
                    └─────── userinfo ────────┘ │└─ mdp ─┘│└──────── host ───────
                                                :         @
```

**Ce n'est pas un assouplissement, c'est une définition corrigée.** La RFC 3986
exclut ces caractères de `userinfo` et de `host` : une URI ne peut **pas** en
contenir. Les classes sont donc désormais écrites en **positif**, depuis la RFC —
`unreserved` + `sub-delims` + `pct-encoded`, plus `[ ]` et `:` du côté hôte pour les
IPv6 et le port. La règle ne perd rien ; elle cesse de voir des URI là où il ne peut
pas y en avoir.

**Classer plutôt qu'énumérer, mais mesurer l'exception.** Retirer le seul guillemet
double aurait laissé le trou voisin ouvert (`<`, `` ` ``, `\`, `#`, `?`, `|`) — le
mode d'échec que ce détecteur a déjà payé trois fois. À l'inverse, appliquer la RFC
**à la lettre** faisait disparaître une détection réelle : `${DB_USER}:${DB_PASSWORD}`
dans le `docker-compose.prod.yml` de deux dépôts, l'accolade n'étant pas admise par
la RFC. **L'accolade est donc la seule exception, et elle est comptée, pas supposée** :
240 détections en RFC stricte, **242** avec elle, 245 avant. Cf.
[[classer-plutot-qu-enumerer-les-cas]].

**La contre-épreuve**, sur les 38 dépôts armés, en pire cas (chaque fichier présenté
comme entièrement ajouté) :

| | Avant | RFC stricte | **Retenu (RFC + accolades)** |
| --- | --- | --- | --- |
| Détections, tout le parc | 245 | 240 | **242** |
| Perdues | — | 5 | **3** |
| Apparues | — | 0 | **0** |

Les **trois** perdues sont les trois faux positifs visés : les deux témoins JSON, et
un gabarit de documentation `postgres://<user>:<motdepasse>@<hôte>` — les chevrons
étant eux aussi exclus par la RFC. Ce troisième a été vérifié **en le cassant** :
valeurs d'allure réelle à la place des chevrons, la règle le revoit aussitôt. Ce
n'est donc pas de la protection qui disparaît, c'est un gabarit.
Cf. [[un-controle-se-prouve-en-cassant-ce-qu-il-protege]].

**Neuf cas de recette ont été écrits AVANT de toucher à la règle**, et devaient être
verts avant comme après : `postgres://`, `mysql://` sur IPv4, `mongodb://` avec
chaîne de requête, `http://`, mot de passe encodé en pourcentage, mot de passe à
sous-délimiteurs, hôte IPv6 entre crochets, interpolation `${VAR}`, et DSN
légitimement **entre guillemets** dans du JSON. Sans eux, le resserrement se serait
mesuré sur la seule chose qu'il devait supprimer.

**Et la recette sait maintenant QUI a refusé.** Ses cas portent un champ facultatif
`regle` : le code de sortie seul ne dit pas quelle règle a tiré, et un cas « refuse »
serait resté vert si une **autre** règle avait pris le relais — la règle visée
pouvant alors être cassée sans que rien ne rougisse. Cf.
[[preuve-doit-exercer-critere-acceptation]].

### Les 92 relevés PageSpeed de `maj-divi5-zeller` (2026-08-09, tâche `8ce1d6b9`)

Le plus gros résidu du parc — **102 détections en pire cas**, dont **92** sur la
règle `cle-api-google`, dans quatre rapports PageSpeed en JSON. Immarquables : JSON
n'a pas de commentaire.

**La question qui décidait de tout n'était pas « comment faire taire », c'était
« qu'est-ce qui est réellement attrapé ».** Les deux réponses possibles menaient à
des chemins opposés : une vraie clé secrète en fait un **incident** (rotation), une
chaîne qui en a seulement la forme en fait du **bruit**. La réponse mesurée est une
troisième, et c'est elle qui commande le traitement retenu.

**Ce que c'est, établi et pas déduit :**

- **une seule valeur**, répétée 92 fois dans 4 fichiers (empreintes sha-256
  comparées ; balayage des 38 dépôts armés : elle n'existe nulle part ailleurs) ;
- **toutes ses occurrences sont des URL de requêtes réseau du navigateur** —
  chemins JSON `audits.network-requests`, `third-parties-insight`, `cache-insight`,
  `image-delivery-insight`, `script-treemap-data` — sur `maps.googleapis.com` (28)
  et `www.google.com/maps` (64). C'est ce que le navigateur a chargé en affichant
  la page publique `/contact/` : la clé est donc **transmise à chaque visiteur du
  site**, exactement comme une `pk_live_` Stripe. Publiable par construction ;
- **ce n'est pas la clé PageSpeed d'Aymeric.** PageSpeed ne renvoie pas la clé de la
  requête dans sa réponse ; aucune URL du rapport ne pointe vers
  `pagespeedonline.googleapis.com` (la seule occurrence du mot est le champ
  `"kind": "pagespeedonline#result"`) ; et la valeur n'apparaît dans aucun script
  du parc.

**Trois chemins étaient ouverts. Deux sont écartés, et il faut dire pourquoi :**

1. **Resserrer `cle-api-google`** — écarté. `AIza`+35 *est* la forme canonique d'une
   clé Google : rien dans la chaîne ne distingue une clé navigateur d'une clé
   serveur. Le seul signal est le contexte (`key=` dans une URL Maps), et l'exempter
   perdrait une vraie fuite : une clé **Geocoding**, **Places** ou **PageSpeed**
   côté serveur s'écrit exactement pareil. C'est précisément la forme sous laquelle
   les dumps n8n de `~/.claude` portaient des clés réelles. Un cas de recette
   verrouille ce raccourci (`clé AIza en paramètre key= d'une URL Google` →
   **refuse**).
2. **`.gitignore` sur `perf/**`** — écarté, sur le critère **écrit** du `.gitignore`
   de `~/.claude` plutôt qu'un critère inventé pour l'occasion : *on ignore les
   fichiers dont l'objet **même** est de porter un identifiant ; on n'ignore pas ce
   qui **pourrait** en contenir un — c'est le travail du détecteur.* Des relevés
   PageSpeed sont dans la seconde catégorie. Deux raisons de plus, chacune
   suffisante : un `.gitignore` **ne désuit rien**, donc le pire cas serait resté à
   102 ; et ces quatre fichiers sont **les preuves avant/après de la migration
   Divi 5**, relues par `_parse.js` / `_compare.js`.
3. **Retenu : une entrée dans `.secrets-connus`.** La règle n'est pas touchée, le
   chemin n'est pas exempté, la valeur est jugée **une fois**, par écrit, et
   l'exemption est bornée à cette valeur et à cette règle.

**La contre-épreuve — deux niveaux, parce qu'ils ne prouvent pas la même chose.**

| | Avant | Après |
| --- | --- | --- |
| Parc entier, **sans aucun registre** | 233 | **233** (0 perdue, 0 apparue, comparaison clé à clé) |
| `maj-divi5-zeller`, **avec** son entrée | 102 | **10** (92 disparues, **0 apparue**, mesure stable au second passage) |

La première ligne est celle qui compte pour les 37 autres dépôts : le mécanisme
ajouté ne change **rien** là où personne n'a rien inscrit.

**Et le témoin mord toujours — vérifié en cassant ce que le registre protège**
(cf. [[un-controle-se-prouve-en-cassant-ce-qu-il-protege]]). Cinq essais, tous
verts :

- une **autre** clé Google dans le dossier `perf/` → **détectée** ;
- une **autre** clé Google dans le fichier exact déjà exempté → **détectée** ;
- la valeur inscrite **et** une autre sur la même ligne → **détectée** ;
- la valeur inscrite, dans un dépôt **sans** registre → **détectée** ;
- la valeur inscrite, ailleurs dans le dépôt qui l'a jugée → muette (c'est le but).

**Quatre cas de recette `cle-api-google` ont été écrits AVANT de toucher au
détecteur**, verts avant comme après : clé nue, clé en paramètre `key=` d'une URL
Google, clé dans du JSON minifié, et la borne du préfixe seul. Sans eux, le
mécanisme se serait mesuré sur la seule chose qu'il devait faire disparaître.

**Ce qui reste, et n'est pas traité ici** : les 10 `litteral-haute-entropie` des
pages HTML archivées de `recette-p*/`. Elles sont **marquables** (HTML a des
commentaires) et vivent dans des fichiers figés — elles ne relèvent pas de cette
échappatoire.

### `ldveh-premium` (62) et `ChosenPath` (47), instruits (2026-08-09, tâche `603c27fd`)

Une fois `maj-divi5-zeller` traité, ces deux-là devenaient les deux plus gros
résidus du parc — **62 + 47 sur 141**, soit **77 %** du total. Ils n'avaient
jamais été comptés qu'en **commits refusés** (1 sur 23 pour `ChosenPath`, l'import
initial). Personne n'avait regardé **ce qui est attrapé**. Un résidu élevé toléré
depuis des semaines est indiscernable d'un résidu élevé qui cache une fuite : le
motif exact que ce parc traque.

**Le premier résultat rend le second inutile : ce n'est pas deux dépôts, c'en est
un.** `ldveh-premium` et `ChosenPath` pointent sur le **même distant**
(`AymericAF/ChosenPath`). Comparaison **clé à clé** (règle × fichier × ligne) des
deux relevés de pire cas : les **47** de `ChosenPath` sont **exactement** les 47
non-polices de `ldveh-premium` — zéro écart dans les deux sens. Les **62** ne sont
donc pas un second gisement à instruire, mais **47 + 15**, et les 15 ont une cause
unique, décrite plus bas.

**Ce qui est réellement attrapé** — trois familles, aucune valeur secrète :

| Dépôt | Règle | Nb | Où | Verdict |
| --- | --- | --- | --- | --- |
| les deux | `assignation-sensible` | 35 | `*.test.ts` de `apps/api`, `apps/mobile`, `packages/shared` | **forme seule** — mots de passe et jetons de fixture (`password:`, `token:`, `process.env.LLM_API_KEY`) dans des tests unitaires |
| les deux | `assignation-sensible` | 3 | `_bmad/tea/**/*.md` | **forme seule** — prose d'un **cadriciel tiers versionné** (gabarits BMAD), même famille que la documentation `ANTHROPIC_AUTH_TOKEN` de `~/.claude` |
| les deux | `assignation-sensible` | 1 | `packages/database/prisma/seed.ts:1348` | **règle trop large** — `h6_secret_room` est l'identifiant d'un **nœud de récit** (la pièce secrète du manoir), pas un secret. Voir ci-dessous. |
| les deux | `url-avec-identifiants` | 8 | `.env.example` ×2, `.github/workflows/ci.yml`, `docker-compose.prod.yml`, `docs/`, `packages/database/`, `scripts/` | **forme seule** — le DSN de développement **par défaut**, `postgres:postgres@localhost`, celui que docker-compose engendre |
| les deux | `url-avec-identifiants` | 1 | `docker-compose.prod.yml:27` | **forme seule** — l'interpolation `${POSTGRES_USER}:${POSTGRES_PASSWORD}`, exactement la détection que l'exception « accolade » de la correction RFC conserve **exprès** |
| `ldveh-premium` seul | `litteral-haute-entropie` | 15 | `apps/mobile/assets/fonts/*.ttf` | **forme seule**, et **artefact de clone périmé** — voir ci-dessous |

**Aucun vrai secret. Zéro rotation à déclencher.** C'est le résultat qu'on voulait
pouvoir écrire, et il n'a de valeur que parce qu'il a été **établi en lisant**,
pas déduit des noms de fichiers.

**Les 15 de `ldveh-premium` : cinq polices qui n'en sont pas.** Les cinq
`apps/mobile/assets/fonts/*.ttf` de ce clone ne sont pas des polices : ce sont
cinq copies d'une page **`Page not found · GitHub`** en HTML, ~302 Ko chacune,
enregistrées sous une extension `.ttf` par un téléchargement qui a échoué sans le
dire. N'ayant aucun octet nul, elles sont lues comme du **texte** — d'où
3 `litteral-haute-entropie` par fichier, toutes sur l'`authenticity_token` (jeton
**anti-CSRF** Rails de 86 caractères) des formulaires de la page. Ce jeton n'ouvre
rien seul : il n'est valable qu'avec le cookie de session qui l'accompagne, absent
ici — la page est d'ailleurs à l'état **déconnecté** (`logged-out`, aucun marqueur
`user-session` ni `octolytics-actor-login`).

Et **il n'y a rien à corriger** : le défaut a été réparé en amont le jour même par
`eb17e9c` (« les cinq .ttf etaient des pages d'erreur GitHub, pas des polices »),
que ce clone, en retard de 3 mois et demi, n'a pas encore. Ces 15 détections
**disparaissent d'elles-mêmes** au premier `git pull` — ou avec le dossier, si la
décision en cours sur son sort tranche pour l'archivage. C'est aussi une remarque
sur la mesure : **compter le pire cas d'un clone périmé, c'est compter deux fois
le même dépôt**, plus la dette qu'il traîne.

**Rien n'a été marqué, et c'est un choix, pas un abandon.** Les 47 sont
marquables (`.ts`, `.md`, `.yml`, `.sh` ont tous des commentaires), sauf les deux
lignes de `.env.example` — un `#` après une valeur **non quotée** y est avalé par
certains lecteurs `dotenv`, et ces fichiers sont faits pour être copiés (point 8
du calibrage). Trois raisons de ne pas poser les 45 autres dans ce run :

- **L'arbre de travail est partagé avec une boucle autonome qui tourne.** Poser
  47 marqueurs, c'est toucher 15 fichiers dont les deux tests d'authentification
  les plus actifs. Un dépôt à moitié marqué est pire qu'un dépôt inventorié.
- **Le coût réel est déjà connu et il est bas** : 1 commit refusé sur 23, l'import
  initial, déjà passé. Ce n'est pas le profil qui fait taper `--no-verify`.
- **Le registre `.secrets-connus` ne s'applique pas.** Il est borné aux règles
  **`empreintable`** ; `assignation-sensible`, `litteral-haute-entropie` et
  `url-avec-identifiants` en sont exclues par construction. Le mécanisme posé pour
  les 92 relevés PageSpeed ne couvre donc **aucune** de ces 47 — vérifié avant
  d'inventer autre chose.

**Un élargissement a été envisagé puis écarté, et il vaut mieux dire pourquoi.**
Une dizaine des 38 `assignation-sensible` portent une valeur faite de **mots
anglais séparés par des tirets** (`valid-token`, `jwt-login-token`,
`sk-secondary`). Le filtre existant — « valeur **uniquement alphabétique** de
moins de 16 caractères » — les rate à cause du tiret. L'étendre aux mots
tiretés supprimerait ces détections **et ouvrirait un trou franc** : un mot de
passe **choisi par un humain** a exactement cette forme. On échangerait du bruit
de fixture contre la cécité sur la fuite la plus banale qui soit. Écarté.

**Ce qui reste ouvert, nommé plutôt qu'enjolivé** : `h6_secret_room` est une
détection sur laquelle la règle de composition a raison **en syntaxe** (`secret`
est un porteur fort) et tort **en fait** (c'est un nom de lieu dans une fiction).
Aucun resserrement raisonnable ne distingue les deux — `room` ne peut pas devenir
un qualificatif. Cette ligne relève du marqueur `secret-ok`, pas de la règle.

### Laissés nus, et pourquoi

- **`ChosenPath` et `le-rucher-seo` ne le sont plus** — décision inversée le
  2026-08-08 (tâche `31eb92d7`), sur une mesure que la première n'avait pas faite.
  Voir la sous-section suivante : elle nomme ce qui a changé, et pourquoi la
  première mesure comptait la mauvaise chose.

### Compter les commits refusés, pas les signalements

Le coût d'une garde ne se lit pas en signalements. Il se lit en **commits qui
auraient été refusés**, parce que c'est le refus qui use, pas le total. 62
signalements concentrés dans un import initial coûtent **une** gêne, une fois ;
6 signalements répartis sur 6 commits coûtent six refus, et c'est ce profil-là
qui fait taper `--no-verify`.

Rejoué commit par commit, en n'analysant que les lignes **ajoutées** par chacun —
c'est-à-dire exactement ce que le hook voit :

| Dépôt | Commits examinés | Refusés | Où |
| --- | --- | --- | --- |
| `ChosenPath` | 23 | **1** (4,3 %) | l'import initial du 2026-04-03, à lui seul les 62 |
| `le-rucher-seo` | 15 | **2** (13,3 %) | `ba9fff18` — le commit qui a **introduit la clé Stripe live**, et `7dc72035`, la fausse clé d'illustration du dossier de rotation |
| `CockpitV2` | 60 | ~~1~~ → **0** | `f316ff5b`, deux constantes de réinitialisation Laravel, sans aucune valeur : **c'était un faux positif**, fermé le 2026-08-08 (point 13 du calibrage) |

Ce que ce tableau corrige, dans les deux cas :

- **`ChosenPath`** avait été laissé nu sur la crainte qu'un monorepo « refuse
  chaque nouveau test d'authentification ». Les 22 commits qui ont suivi l'import
  — tests tRPC, mobile et schemas compris — n'auraient produit **aucun** refus.
  La crainte portait sur un profil que ce dépôt n'a pas.
- **`le-rucher-seo`** avait été écarté au motif que « brancher la garde ne
  changerait rien à un secret déjà écrit ». C'est vrai, et hors sujet : la garde
  ne protège pas le secret d'hier, elle protège celui de demain — et ici, elle
  aurait arrêté **celui-là même**. Un dépôt où un secret réel est déjà entré est
  le dernier qu'il faut laisser nu.

**Le résidu de `le-rucher-seo`, écrit plutôt que caché.** Deux fichiers versionnés
déclenchent la garde s'ils sont remis en scène :
`lot2/stripe-settings-rollback-20260718.json` (la clé `sk_live_` et le
`whsec_` réels — refus **légitime**, à traiter par la rotation, tâche `e0df662d`,
pas par un marqueur) et `securite/rotation-stripe-preparation.md` ligne 323 (une
fausse clé d'illustration dans un script de recette — `secret-ok` la lève, si
quelqu'un rouvre ce fichier). Aucun des deux n'est touché par le travail courant.

### Les 4 dépôts publics : examinés, rien à corriger

`cockpit-api`, `my-api`, `nuxtjs_course`, `Obsidian` n'ont pas de clone sur ce
poste et n'avaient jamais été regardés. Passés au détecteur le 2026-08-08 sur
**l'arbre courant ET tous les blobs atteignables depuis toutes les refs** (branches
dependabot comprises) : **aucun secret réel**. `cockpit-api` et `my-api` sont deux
squelettes API Platform non modifiés, dont le `api/.env` est **versionné** — mais
n'y portant que les placeholders amont (`!ChangeMe!`, le secret Mercure de
démonstration) et un `APP_SECRET` vide ou placeholder. Aucune rotation nécessaire.
La pratique, elle, reste mauvaise : le jour où quelqu'un remplit ce `.env`, il part
sur un dépôt **public**.

## Le parc n'est pas un répertoire

Écrit le 2026-08-08 (tâche `31eb92d7`), après qu'une campagne d'armement entière
a manqué **`CockpitV2`** — le dépôt du Cockpit, développé activement, privé, donc
sans aucun filet côté serveur. Ce n'était pas un oubli : c'était la **définition**.
Tous les balayages prenaient `~/projects` pour le parc, et `CockpitV2` est cloné
dans `C:\Entreprise\Projets personnels\`. `clubwpress-agent`, dans le même cas,
n'avait été rattrapé que par hasard.

> **Le parc est l'ensemble des clones ACTIFS, où qu'ils soient.** Un dépôt en fait
> partie si (1) il peut encore recevoir un commit et (2) ce commit partirait de ce
> poste. **Son emplacement n'entre pas dans le critère** — ni pour l'y faire
> entrer, ni pour l'en exclure.

Tant qu'on inventorie par le disque **à un endroit convenu**, on trouve ce qu'on y
a rangé. Le recensement se fait donc en cherchant les répertoires `.git` sur les
volumes, pas en listant un dossier :

```sh
cmd //c "dir /s /b /ad C:\\.git"      # puis les autres volumes montés
```

Mesure du 2026-08-08 : **2 084** répertoires `.git` sur `C:`, dont **42 dépôts
réels** une fois écartés `node_modules/`, `vendor/`, la corbeille, les modules git
et les dossiers temporaires — dont **11 chemins hors de `~/projects`** (10 clones
distincts, l'un des chemins étant un lien symbolique). Deux dépôts **à l'intérieur**
de `~/projects` étaient également désarmés : l'emplacement convenu ne garantissait
même pas sa propre couverture.

### Le critère est tenu par un fichier, pas par une intention

`verifier-alignement.mjs` découvrait ses copies en listant quatre racines à plat
(le home, son `projects/`, le voisinage de la source et son `projects/`). Il ne
pouvait structurellement pas voir un clone rangé ailleurs — et une consigne écrite
ici n'y aurait rien changé au prochain balayage.

**`.githooks/DEPOTS-DU-PARC.txt`** nomme donc, un par un, les clones hors des
emplacements convenus. Ils sont vérifiés comme les autres. Le fichier porte aussi
les dépôts **délibérément laissés nus** avec leur motif, en commentaire.

Ce que le registre garantit, prouvé en le cassant :

| Mutation | Effet observé |
| --- | --- |
| Retirer une ligne | le dépôt **sort du compte** (37 → 36 copies) — c'est bien le registre qui l'amène |
| Inscrire un chemin qui n'est plus un dépôt | **code 2**, « vérification impossible », en nommant le chemin |
| Déclarer `NON-SUIVI` un dépôt dont le lot est versionné | **6 dérives `DECLARATION`** — une déclaration périmée ne peut plus sauter les contrôles d'index en silence |
| Désarmer un dépôt inscrit (le lot disparaît) | **6 dérives `ABSENT`**, code 1 |

### Les copies `NON-SUIVI`

Trois dépôts portent le lot dans `.githooks/` **sans le versionner**, masqué par
`.git/info/exclude` (fichier local). Le montage est réservé aux cas où déposer six
fichiers en commit serait déplacé : **distant appartenant à un tiers**
(`af-scroll-counter-create-file`, cloné d'`elegantthemes`), **copie de travail
dépassée** dont le clone vivant porte déjà le lot (`ldveh-premium`, ancêtre strict
de `ChosenPath`), **dépôt sans aucun commit** (`eden-terrasse`).

Contrepartie à connaître : le lot n'y suit pas les mises à jour du dépôt, et les
trois contrôles d'index (présence, mode, blob) n'ont **rien à comparer**. Le
vérificateur ne les maquille pas en vert : il les remplace par le bit d'exécution
du disque — et sous Windows, où NTFS n'en porte pas, il l'écrit sous
**`NON VERIFIABLE DEPUIS CE POSTE`** plutôt que de le compter comme conforme.

## Source de vérité et alignement des copies

Le détecteur n'existe pas en un exemplaire : il vit dans **38 copies** — la source
et les 37 dépôts du parc, tel que le recense  — et chacune porte
**6 fichiers**, soit **228 fichiers copiés** à garder identiques. La copie est volontaire : la garde voyage avec le
code plutôt que de dépendre d'une configuration locale. Ce qui ne l'est pas, c'est
qu'elles puissent diverger sans que rien ne le dise.

### La règle, écrite une fois pour toutes

> **`~/.claude/.githooks/` fait foi.** En cas de divergence, c'est la copie du
> dépôt qui est réécrite depuis la source. **Jamais l'inverse**, même si la
> correction est manifestement meilleure dans le dépôt : dans ce cas on la
> reporte d'abord à la source, on régénère les empreintes, puis on propage.

Sans réponse écrite, une divergence se résout un jour dans le mauvais sens — et
26 dépôts repartent avec l'ancienne version en donnant la même impression de
protection.

### Le lot déployé

| Fichier | Mode attendu dans l'index |
| --- | --- |
| `README.md` | `100644` |
| `detect-secrets.js` | `100644` |
| `detect-secrets.recette.mjs` | `100644` |
| `package.json` | `100644` |
| `pre-commit` | **`100755`** |

Vivent à la source **sans être copiés** : `verifier-alignement.mjs`,
`EMPREINTES.txt`, `pre-push`, et le modèle de dépôt `~/.claude/.git-template/`.
Le lot est **explicite** dans le vérificateur, précisément pour qu'une propagation
ne se fasse plus par « je copie tout le dossier ». Ces fichiers hors lot ne sont
pas pour autant sans surveillance : ils sont couverts par l'audit de la source
(section « Vérifier »).

### Vérifier

```sh
node ~/.claude/.githooks/verifier-alignement.mjs            # le parc entier
node ~/.claude/.githooks/verifier-alignement.mjs --depot ~/projects/echo-code
node ~/.claude/.githooks/verifier-alignement.mjs --corriger # recopie la source
node ~/.claude/.githooks/verifier-alignement.mjs --generer  # après avoir touché la source
```

Il compare le **contenu** (sha-256), jamais la taille ni la date : deux fichiers
différents de même taille sont exactement le cas où une garde de taille ment. Il
compare aussi le **mode de l'index git** — un `pre-commit` en `100644` est sauté
**en silence** hors Windows, donc un bon contenu au mauvais mode est une dérive.
Il signale enfin les dépôts **présents et inertes** : ni `core.hooksPath`, ni
amorceur déposé dans `.git/hooks/` — les deux voies d'armement décrites plus haut,
dont une seule suffit.

Et **il s'audite lui-même**. `~/.claude` s'exclut de son propre balayage : son
armement, le mode `100755` de son `pre-push` et l'existence même du modèle de
dépôt n'étaient vérifiés par **rien**. Le vérificateur contrôle désormais, à
chaque passage : que la source est armée, que `.githooks/pre-push` est versionné
exécutable, que `.git-template/hooks/*` est versionné exécutable et porte sa ligne
de marquage, que son contenu versionné correspond au disque, et que
`init.templateDir` pointe bien dessus. Chacun de ces six contrôles a été prouvé en
le cassant : le dispositif rougit, puis redevient vert une fois réparé.

Chaque anomalie **nomme le dépôt et le fichier**. Une garde qui dit « ça ne
correspond pas » envoie chercher dans 228 fichiers.

`EMPREINTES.txt` est **généré**, pas édité. Le vérificateur contrôle d'abord la
**source contre son propre manifeste** : si la source a bougé sans que les
empreintes suivent, il rougit là plutôt que de juger 27 dépôts contre une
référence périmée — un vert obtenu contre une mauvaise référence est un mensonge.

### Où la vérification se déclenche, et pourquoi pas ailleurs

Elle est accrochée au **`pre-push` de `~/.claude` uniquement**, et **seulement si
le push emporte une modification de `.githooks/`**.

- **Pas dans `pre-commit`.** Une garde d'alignement au pre-commit refuserait les
  commits des 27 dépôts dès que la source bouge — **y compris pendant la
  propagation elle-même**. Une garde qui se déclenche pendant qu'on la met à jour
  est un piège circulaire ; elle se fait désinstaller le jour même.
- **Pas dans les copies.** La dérive n'est jamais créée dans un dépôt : elle est
  créée à la source, puis oubliée. Bloquer 27 dépôts pour une faute commise dans
  le 28e punit ceux qui n'ont rien fait, et arrête les boucles autonomes qui y
  poussent.
- **Pas en tâche périodique seule.** Elle détecterait la dérive des heures après,
  quand celui qui l'a créée n'a plus le contexte. (Elle reste un bon *complément*,
  pas un substitut.)
- **Au `pre-push` de la source** : le seul push retenu est celui qui vient de
  créer la divergence, au moment où l'on a encore en main la correction qu'on
  vient d'écrire. Tout autre push de `~/.claude` passe sans rien vérifier.

Échappatoire assumée et documentée : `git push --no-verify`.

### Propager une correction

1. Corriger dans `~/.claude/.githooks/`.
2. `node ~/.claude/.githooks/verifier-alignement.mjs --generer`.
3. `node ~/.claude/.githooks/verifier-alignement.mjs --corriger` — recopie le
   contenu dans les copies qui ont dérivé, et **affiche** les commandes
   `git update-index` pour les modes (elles ne sont pas jouées d'office).
4. Commiter dépôt par dépôt, **chemin par chemin** (l'arbre de travail est partagé
   avec d'autres boucles : jamais `git add -A`).
5. Pour un fichier qui doit rester exécutable, commiter **par l'index** : sous
   Windows `core.fileMode=false` fait que `git commit -- <chemin>` reconstruit
   l'entrée depuis le disque et **annule** le `--chmod=+x`. Vérifier avec
   `git ls-files -s`.

## Ce que ce hook ne fait pas

- Il ne regarde **que ce qui est mis en scène**. Un secret déjà dans HEAD ou dans
  l'historique lui est invisible — c'est le périmètre de la décision `5ebd908f`
  (rotation et réécriture d'historique).
- Il ne remplace pas le `.gitignore` : ne pas versionner un fichier reste plus
  sûr que de compter sur la détection de son contenu.
- Il ne voit **que ce qui passe par un poste**. Ce qui est écrit directement chez
  GitHub — édition dans le navigateur, suggestion de revue acceptée, fusion de PR,
  correctif Dependabot — ne déclenche aucun hook, par construction. Cette limite
  est mesurée et tranchée dans « Le troisième chemin », en fin de document.

### Trois angles morts mesurés, **fermés le 2026-08-08** (tâche `b01265b7`)

Reproduits avec des valeurs **fictives** de même gabarit **avant** d'être corrigés,
puis fixés par la recette (12 cas neufs, dont 7 contre-exemples). Ils n'étaient pas
théoriques : chacun a été trouvé sur un secret réel, ou sur la forme exacte d'un
secret réel présent sur ce poste.

**Leur cause commune, et c'est elle qui compte.** Ce n'étaient pas trois règles trop
étroites : c'étaient trois **filtres d'exclusion appliqués sans regarder le
voisinage**. Le détecteur croise déjà « littéral » et « clé parlante » — le correctif
consiste donc à *payer chaque élargissement par un resserrement du contexte*, jamais
par un assouplissement. Généraliser plutôt qu'énumérer, comme pour le vocabulaire au
point 12 : l'angle 2 n'est pas « le cas du sha », l'angle 3 n'est pas « le cas de
npm ».

1. **Les valeurs à espaces.** `valeurPlausible()` rejetait toute valeur en contenant
   une. Or Google **affiche** ses mots de passe d'application en 4 groupes de 4
   séparés par des espaces, et c'est sous cette forme qu'ils sont collés. C'est par
   ce trou qu'un accès à la boîte Gmail principale est resté 15 mois exposé
   (`Test-Greenfit-Paiement`, cf. `INVENTAIRE-PARC.md` §1).
   → **Fermé par `RE_MDP_APPLICATION`** : le **gabarit** « 4 groupes de 4 lettres
   minuscules », **ancré en fin de ligne** (tolérance d'un commentaire `#`), et
   seulement sous une clé qui nomme un secret. Ce n'est pas l'espace qui est
   accepté. Le correctif naïf est mesuré à **+103 commits refusés** (point 13).
2. **Le filtre sha, le plus large des trois.** Une valeur de 7 à 40 caractères
   hexadécimaux minuscules était lue comme un **sha git** et écartée, **quelle que
   soit la clé** : `password=<40 hex>` n'était **pas vu**, quand `password=<40
   alphanumériques mixtes>` l'était. Le `_authToken` du registre npm privé Divi fait
   exactement 40 hexadécimaux minuscules.
   → **Fermé en contextualisant, pas en supprimant** : la règle du sha reste (un
   dépôt en est plein), mais elle ne s'applique plus quand la clé nomme un secret —
   un sha ne s'écrit pas sous `password` ni sous `_authToken`.
3. **La clé précédée d'un chemin.** `//npm.<hôte>/:_authToken=<valeur>` n'était pas
   reconnue alors que `authToken=<même valeur>` l'était : le `:` du chemin de
   registre se laissait lire comme le séparateur d'une assignation **à clé vide**, et
   la valeur avalait le reste de la ligne sans qu'il soit réexaminé.
   → **Fermé en exigeant une clé d'au moins un caractère.** Le balayage reste
   **non chevauchant** : la variante chevauchante coûtait **+2 refus** de bruit d'URL
   (point 13).

Chacune des trois causes suffisait **à elle seule** à rendre le jeton npm invisible :
armer le dépôt qui le porte ne le protégeait pas. Les trois ont donc été corrigées
**en une passe**, avec une recette commune — les traiter une par une aurait fait trois
contre-épreuves et trois propagations aux 37 copies là où une suffit.

**Ce que ces correctifs ne font pas, et il faut le redire.** Le seul secret réel
trouvé dans le parc n'était dans **aucun** signalement : il a été trouvé **en
lisant**. Un détecteur prouve ce qu'il cherche, pas ce qu'il ignore. Fermer trois
trous en laisse d'autres, par construction — la section suivante en nomme quelques-uns
qui restent ouverts **en connaissance de cause**.

### Ce qui reste ouvert, et pourquoi c'est écrit plutôt que corrigé

Cherché en même temps que les trois ci-dessus, sur le principe « quels **autres**
filtres jugent la valeur sans regarder la clé, et quels **autres** formats de
configuration écrivent une clé autrement ». Aucun de ces cas n'est un oubli : chacun
est une **décision**, et le chiffre qui la porte est dans le point 13.

**Deux filtres voisins ont été corrigés en même temps**, parce qu'ils vivaient dans la
même fonction, à une ligne d'écart, avec exactement le même défaut — corriger « le cas
du sha » sans eux, c'était énumérer :

- **L'UUID sous une clé qui nomme un secret** est désormais examiné. Un identifiant de
  tâche ne s'écrit pas sous `client_secret`, et un secret d'application Azure AD *est*
  un GUID. L'exemption reste **entière** pour la règle du littéral à haute entropie,
  qui n'a aucune clé à regarder. Coût mesuré : **0 refus, 0 détection**.
- **L'hexadécimal MAJUSCULE sous une clé qui nomme un secret** ne passe plus pour une
  référence à une variable. Sans cela, l'angle 2 n'était fermé qu'à moitié : le même
  jeton passait ou non selon la **casse** dans laquelle son fournisseur l'affiche, ce
  qui n'est pas une propriété de sécurité. La règle reste étroite — *uniquement* de
  l'hexadécimal pur, donc `token: N8N_DRIFT_HEARTBEAT_TOKEN` reste une référence. Coût
  mesuré : **0 refus, 0 détection**.

Restent ouverts, comme **décisions écrites** :

- **Les valeurs purement numériques sous une clé sensible.** Lever le filtre coûte 0
  aujourd'hui — mais le pire cas ne mesure que les fichiers **existants**, et
  une clé `TOKEN_EXPIRES` portant un horodatage en millisecondes est la forme la plus
  banale d'un nombre sous une clé parlante. Un secret purement numérique est rare ;
  l'horodatage sous une clé nommée `token`, non.
- **`.netrc` et les formats à séparateur ESPACE** (`password <valeur>`) : accepter
  l'espace comme séparateur, c'est le correctif naïf de l'angle 1 par une autre porte.
- **`Authorization: Bearer <jeton>`** n'est pas vu (`authorization` n'est pas dans le
  vocabulaire, et la valeur s'arrête au premier blanc). Une règle nommée a été écrite et
  mesurée : **0 refus, 0 détection ajoutée — mais 0 trouvaille aussi**, aucun dépôt du
  parc ne porte cette forme. Non retenue : une règle que rien ne prouve utile est une
  surface de plus à entretenir. Le chiffre est ici pour qu'un futur passage n'ait pas à
  le remesurer.
- **`_auth=` d'un `.npmrc`** (base64 de `user:pass`) n'est pas vu : `auth` est un
  **marqueur**, pas un porteur. En faire un porteur fort a été mesuré : **+8 détections**
  en pire cas (fixtures `auth.test.ts`, `trpc.test.ts`, documentation BMAD de
  `ChosenPath`) pour zéro secret réel. Écarté.
- **La flèche PHP `=>`** n'est pas un séparateur reconnu : `'password' => 'valeur'`
  échappe à `RE_ASSIGNATION`. C'est la forme d'un tableau PHP, donc de `wp-config.php`
  et de toute fixture WordPress.

Chacun se ferme de la même façon que les trois précédents — un gabarit précis payé par
un resserrement du contexte, mesuré sur le parc avant d'être retenu. Aucun n'a été
tenté ici : la tâche portait sur trois angles morts, et un élargissement non mesuré
vaut moins que pas d'élargissement.

## Le second filet : la protection de push GitHub

Mesuré le 2026-08-08 (tâche `d262c622`). Le constat de départ est un **accident** :
en poussant la recette du détecteur (run `6437c6d3`), GitHub a refusé le push sur
`l-echo-des-hauts` — sa protection lisait les valeurs **fabriquées** du banc de
test comme de vraies clés Stripe restreintes de production. Une valeur inventée
pour un test est indistinguable d'une vraie : c'est la **forme** qui est lue, pas
la validité.

Ce refus dit surtout autre chose. Cette protection est un **second filet, côté
serveur** : elle ne dépend ni de `core.hooksPath`, ni de ce qu'un clone a bien
voulu armer, ni de la bonne volonté de celui qui pousse. C'est exactement le
périmètre des trois limites assumées plus haut.

| Trou du hook local | Couvert par la protection de push |
| --- | --- |
| `git commit --no-verify` / `git push --no-verify` | **Oui** — le refus est prononcé par le serveur |
| Clone frais sans `core.hooksPath` | **Oui** — rien à armer côté client |
| Autre machine, autre poste | **Oui** — le contrôle ne vit pas sur le poste |
| Secret déjà dans HEAD | **Oui**, si le commit fautif fait partie du push |

### Ce qui est réellement disponible — mesuré, pas supposé

Le run d'origine avait **inféré** que la protection était éteinte sur les autres
dépôts, parce qu'un contenu identique y était passé. L'inférence était juste,
mais ce n'était pas une mesure. Relevé dépôt par dépôt via l'API :

| Visibilité | Dépôts | Analyse de secrets | Protection de push |
| --- | ---: | --- | --- |
| Publics | 5 | active sur les 5 | **active sur les 5** |
| Privés | 67 | **indisponible** | **indisponible** |

Sur un dépôt privé, l'API refuse en clair, en `HTTP 422` : *Secret scanning is
not available for this repository*.

**Ce n'est pas un réglage oublié, c'est structurel.** La protection est offerte
d'office sur les dépôts publics ; sur les dépôts privés elle exige le produit
**GitHub Secret Protection**, qui ne se vend qu'aux plans **Team** et
**Enterprise**. Un **compte personnel ne peut pas l'acheter** — il n'y a donc
rien à activer, et rien à payer non plus : il faudrait déplacer les dépôts dans
une organisation.

### Le piège : un 200 qui n'écrit rien

À ne pas refaire, parce que la sortie ment. Sur un dépôt privé :

- demander l'analyse de secrets rend un **422** franc, qui se voit ;
- demander la **protection de push** seule rend un **200**, avec l'objet du dépôt
  en réponse — mais le champ y vaut toujours `disabled`, et une relecture
  indépendante le confirme resté indisponible. **L'écriture n'a pas eu lieu.**

Un run qui se serait fié au code HTTP aurait conclu « activée sur les 67 dépôts
privés » et rangé le sujet. La règle vaut au-delà de ce cas : **une écriture se
prouve par la ligne renvoyée, puis par une relecture séparée**, jamais par le
fait que l'appel n'a pas échoué.

### Ce que ça implique, et qu'il vaut mieux savoir

Sur les **67 dépôts privés — c'est-à-dire la quasi-totalité du travail client —
ce hook est le seul filet**, avec ses trois trous intacts. Le second filet ne
couvre que les 5 dépôts publics. C'est une raison de plus de ne pas prendre
`--no-verify` en réflexe : sur un dépôt privé, personne derrière ne rattrapera.

### La preuve qu'elle mord

Un réglage activé qui ne refuse rien est **pire qu'aucun réglage**, parce qu'on
cesse de regarder. Vérifié le 2026-08-08 sur `nuxtjs_course` — un dépôt public
dormant **dont la protection venait d'être activée** : le test prouve donc à la
fois le mécanisme et l'activation.

Sur une branche jetable, un commit portant une chaîne **fabriquée à l'exécution**
ayant la forme d'une clé restreinte de production Stripe (jamais une vraie
valeur, jamais un littéral écrit dans un fichier de la garde) :

```
remote: - GITHUB PUSH PROTECTION
remote:     - Push cannot contain secrets
remote:       —— Stripe Live API Restricted Key ——
 ! [remote rejected] (push declined due to repository rule violations)
```

Code de sortie **1**. Contrôlé ensuite : la branche distante **n'existe pas**
(404 sur la référence), le dépôt ne porte **aucune** alerte. Un push refusé ne
laisse rien derrière lui — c'est ce qui rend le test rejouable sans salir le
dépôt.

### Débloquer un faux positif légitime

À lire **avant** d'en avoir besoin. Le premier blocage légitime découvert dans
l'urgence se résout par une désactivation — et une protection éteinte un mardi
soir ne se rallume jamais.

**1. Retirer la valeur du commit (à préférer, de loin).** Le refus porte sur le
contenu des commits poussés, pas sur l'état final des fichiers : effacer la ligne
dans un nouveau commit **ne suffit pas**, la valeur reste dans l'historique
poussé. Il faut réécrire le commit fautif.

```sh
git commit --amend --all      # si la valeur est dans le dernier commit
git rebase -i <sha-fautif>~1  # plus ancienne : « edit », corriger, --continue
```

Pour une fixture de test, la bonne correction n'est pas de faire passer la
valeur : c'est de **l'assembler à l'exécution** pour qu'aucun littéral ne soit
jamais commité. C'est ce que fait le banc de recette.

**2. L'autoriser, en connaissance de cause.** Le message de refus contient une
adresse `/security/secret-scanning/unblock-secret/` propre au blocage. Elle est
**nominative** : seul celui qui a poussé peut l'ouvrir, tout autre compte reçoit
un 404. On y choisit un motif, et **le motif décide de la suite** :

| Motif | Ce qu'il laisse derrière |
| --- | --- |
| C'est un faux positif | alerte créée puis **fermée** en faux positif |
| C'est utilisé dans des tests | alerte créée puis **fermée** en usage de test |
| Je corrigerai plus tard | alerte **laissée ouverte** |

Puis **repousser dans les trois heures** ; au-delà il faut refaire la démarche.

**Ce contournement n'est pas silencieux, et c'est voulu** : il crée une alerte
dans l'onglet sécurité, il est inscrit au journal d'audit, et il déclenche une
notification aux administrateurs du dépôt. C'est la différence de fond avec
`--no-verify`, qui ne laisse **aucune trace** — ici, passer outre reste un geste
que quelqu'un peut relire après coup.

**3. Ce qu'il ne faut pas faire : éteindre la protection.** Elle est offerte,
côté serveur, et couvre les trois trous que ce hook ne bouchera jamais. L'éteindre
pour débloquer un push, c'est échanger un incident de dix minutes contre un angle
mort permanent.

## Le troisième chemin : ce qui s'écrit chez GitHub sans passer par un poste

Mesuré le 2026-08-08 (tâche `9dcd7db5`). Le constat de départ est là aussi un
accident de lecture : sur `Test-Greenfit-Paiement` — le dépôt qui portait le mot
de passe Gmail — **11 des 13 commits ont été faits depuis l'interface web**. Seul
le commit initial venait d'un poste.

**Un hook de pré-commit ne voit que ce qui passe par un poste.** Éditer un fichier
dans le navigateur, accepter une suggestion de revue, fusionner une PR, appliquer
un correctif Dependabot : tout cela écrit dans le dépôt **sans qu'aucun hook local
ne s'exécute**. Armer 37 copies n'y change rien — ce n'est pas un défaut de
l'armement, c'est une limite de l'endroit où la garde est posée.

Et le second filet ne comble pas ce trou là où il compte : la protection de push
couvre l'interface web, mais elle est **indisponible sur les 67 dépôts privés**
(section précédente). Sur le travail client, ce chemin n'a aucun contrôle serveur.

### La mesure, plutôt que la supposition

Avant de construire quoi que ce soit. Critère : un commit web porte le committer
`GitHub <noreply@github.com>` et la signature web-flow de GitHub. Relevé sur la
branche par défaut de chaque dépôt, 100 commits au plus par dépôt (aucun n'a été
tronqué).

| | |
| --- | ---: |
| Dépôts analysés | **69** (sur 72 ; 3 sont vides) |
| Commits examinés | **2 854** |
| Commits venus du chemin web | **76** — soit **2,7 %** |
| Dépôts portant au moins un commit web | **10** |

Les dix, par proportion :

| Part web | Commits web | Dépôt |
| ---: | ---: | --- |
| 100 % | 1/1 | `cockpit-api`, `Cockpit`, `my-api`, `webforce3-v2`, `Paorn` (commit initial seul) |
| 85 % | 11/13 | `Test-Greenfit-Paiement` |
| 67 % | 2/3 | `test` |
| 52 % | 14/27 | `Creer-un-blog-pour-ecrivain` |
| **23 %** | **43/190** | **`CockpitV2`** |
| 2 % | 1/44 | `l-echo-des-hauts` |

### Ce qui passe réellement par ce chemin — et c'est ça qui décide

Le chiffre brut ne dit rien tant qu'on n'a pas regardé **la nature** des 76 :

| Nature | Nombre | Ce que ça vaut |
| --- | ---: | --- |
| Fusion de PR (`Merge pull request`) | 41 (54 %) | contenu **déjà commité localement** |
| Fusion écrasée (`... (#42)`) | 14 (18 %) | contenu **déjà commité localement** |
| Commit initial (échafaudage GitHub) | 7 (9 %) | `README`/`.gitignore` générés par GitHub |
| **Rédaction web réelle** | **14 (18 %)** | **contenu qu'aucun hook n'a jamais vu** |

Seule la dernière ligne est un risque. Or ces 14 commits sont tous concentrés sur
**deux dépôts dormants** — `Creer-un-blog-pour-ecrivain` (2018-2022) et
`Test-Greenfit-Paiement` (2025). Le dernier date du **2025-08-27**.

Sur une fenêtre de **90 jours** : 44 commits web, dont **43 fusions de PR** sur
`CockpitV2` et **1 commit initial**. **Rédaction web réelle : zéro.**
Sur **365 jours** : **un seul** commit, sur un dépôt dormant.

Deux vérifications de plus, parce qu'une fusion pourrait transporter du contenu
écrit dans le navigateur :

- **Les 43 PR de `CockpitV2` ont été inspectées commit par commit : aucun commit
  web sur aucune branche.** Aucune suggestion de revue n'a jamais été acceptée
  depuis le navigateur. Le contenu fusionné a donc intégralement été commité
  depuis un poste — et vu par le hook.
- **Aucun commit de Dependabot ni de robot** sur l'ensemble du parc. Le chemin
  « correctif automatique fusionné » n'existe pas ici ; il est cité dans les
  documentations, il n'est pas dans les faits.

**Conclusion de la mesure : le chemin web est réel, mais sur 90 jours il n'a
transporté aucun octet qu'un hook local n'avait pas déjà lu.**

### Une limite de la mesure elle-même, à connaître

Le critère « committer `GitHub` » identifie **l'interface web**, pas l'ensemble
des écritures côté serveur. Vérifié en écrivant par l'API :

- la mutation GraphQL `createCommitOnBranch` (celle qu'emploie l'interface web)
  produit bien un commit `GitHub <noreply@github.com>`, **signé et vérifié** ;
- l'API REST `contents` produit un commit au nom de **l'utilisateur**, **non
  signé** — indistinguable d'un commit local pour ce critère.

Donc : une automatisation qui écrirait au jeton passerait pour un commit de poste
et **manquerait au comptage**. Aucune n'a été trouvée sur le parc (zéro commit de
robot), mais le jour où il en existera une, ce chiffre la sous-estimera. Le critère
mesure le navigateur, pas « tout ce qui échappe au hook ».

### La décision : un seul dépôt armé, et pourquoi pas les 37

**Ce qui a été posé** : un workflow GitHub Actions sur **`CockpitV2` uniquement**
(`.github/workflows/detection-secrets.yml`), déclenché à chaque `push` et à chaque
`pull_request`.

**Pourquoi lui.** C'est le seul dépôt où le chemin web est vivant : 23 % de ses
commits, 43 des 44 commits web des 90 derniers jours. C'est aussi le seul dépôt du
parc qui travaille par PR, donc le seul où ce contrôle a un sens.

**Pourquoi pas les autres, et c'est une décision, pas un renoncement.** La
rédaction web réelle sur tout le reste du parc est de **zéro commit sur 90 jours**
et **un sur 365**, sur un dépôt dormant. Propager ce workflow à 37 dépôts, ce
serait créer 37 fichiers à maintenir et à réaligner pour couvrir un chemin qui ne
transporte rien — exactement le mode de dérive que ce dossier documente partout
ailleurs. Une garde qu'on entretient sans qu'elle serve finit par mentir.

**Il ne duplique pas le détecteur.** Le workflow appelle
`.githooks/detect-secrets.js` **déjà versionné dans le dépôt**, via son export
`analyser(diff)`. Il hérite donc des 64 cas de recette et des trois angles morts
fermés, et il n'y a **pas de quatrième copie à aligner** — seulement un fichier
d'appel, hors du lot déployé. C'était le compromis central : une action qui
embarquerait son propre détecteur aurait divergé du hook au premier correctif.

### Ce que ça couvre, et ce que ça ne couvre pas

**Ce contrôle ALERTE APRÈS COUP. Ce n'est pas une garde.** La distinction n'est pas
un détail de vocabulaire :

| | Hook `pre-commit` | Ce workflow |
| --- | --- | --- |
| Quand | **avant** l'écriture du commit | **après** l'arrivée sur le distant |
| Effet | le commit **n'existe pas** | le commit **existe et est publié** |
| Remède si ça rougit | corriger la ligne, recommencer | **rotation de la valeur** |

Quand ce workflow rougit, il est **trop tard** : si la valeur est un vrai secret,
elle est exposée, et retirer la ligne ne la désexpose pas. Il prévient, il ne
protège pas. Quiconque lit « le dépôt est couvert » doit comprendre **surveillé**,
jamais **fermé**.

En contrepartie, comme il tourne côté serveur, il voit ce que le hook ne peut pas
voir : l'interface web, `--no-verify`, un clone non armé, une autre machine.

**Sur les 36 autres dépôts armés, le chemin web reste sans aucun contrôle** — ni
garde, ni alerte. C'est assumé au vu de la mesure. **Quand ne pas faire confiance
au dispositif** : si un jour un fichier est édité dans le navigateur sur un dépôt
privé autre que `CockpitV2`, rien ne le regardera. Le signal qui doit faire
rouvrir cette décision est le retour d'une rédaction web réelle — la mesure se
rejoue avec le script de la tâche, ou en filtrant sur le committer `GitHub`.

### La preuve qu'il mord

Un contrôle qui ne rougit jamais ne prouve rien. Vérifié le 2026-08-08 sur une
branche jetable, avec des valeurs **assemblées à l'exécution** (jamais un littéral
écrit dans un fichier), par les deux chemins serveur :

1. **Chemin web fidèle** — commit créé par `createCommitOnBranch`, committer
   `GitHub <noreply@github.com>`, signature **vérifiée** : donc un commit que la
   mesure ci-dessus classe bien comme « web ».
2. **Chemin API REST** — commit créé par l'API `contents`.

Dans les deux cas le contrôle est passé au **rouge**, en nommant le fichier et la
ligne sans afficher la valeur :

```
 ALERTE : 1 secret(s) potentiel(s) DEJA POUSSE(S)
   verification-chemin-web.txt:2  [assignation-sensible]
       assignation "MAILER_SECRET_KEY=" avec une valeur d allure secrete
 CE CONTROLE N A RIEN BLOQUE : le commit est deja sur le distant.
```

Nettoyage contrôlé ensuite : branche distante supprimée (**404** sur la
référence), exécutions de test supprimées, **aucune alerte de sécurité** laissée
ouverte, seule l'exécution verte de `master` subsiste.

**Et il ne crie pas au loup.** Le détecteur a été rejoué sur les **120 derniers
commits réels** de `CockpitV2` : **0 passage au rouge**. Un contrôle qui rougirait
une fois sur dix serait ignoré en trois semaines — c'est la raison pour laquelle
ce chiffre est ici plutôt qu'une promesse.

### Ce que ça coûte

Une exécution dure **7 à 10 secondes**, facturée à la minute entamée.
`CockpitV2` reçoit environ **76 commits par 30 jours**, soit de l'ordre de
**80 minutes par mois** sur les 2 000 minutes offertes du plan gratuit pour les
dépôts privés — moins de 5 %. Le coût n'a donc jamais été l'argument contre la
propagation : **c'est l'entretien de 37 fichiers de plus qui l'était.**

### Ce qui a été écarté, et pourquoi

- **La protection de branche exigeant un contrôle vert avant fusion.** Elle
  *bloque* vraiment, mais seulement à la fusion d'une PR : elle ne voit pas un
  push direct sur `master`, qui est le mode de travail majoritaire sur ce dépôt
  (147 des 190 commits). L'activer supposerait d'interdire aussi le push direct —
  un changement de méthode de travail, qui appartient à Aymeric, pas à un run.
- **Un outil tiers** (`gitleaks`, `trufflehog`) plutôt que le détecteur du dépôt.
  Il aurait fallu recalibrer un second jeu de règles, et vivre avec deux verdicts
  différents sur la même ligne selon qu'on commite ou qu'on pousse.
