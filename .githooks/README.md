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

Activation (locale au dépôt, **à refaire après un nouveau clone**) :

```sh
git config core.hooksPath .githooks
```

Vérifier qu'elle est en place : `git config core.hooksPath` doit rendre
`.githooks`. Sans cela, les fichiers sont là mais **ne protègent rien**.

> `gitleaks` n'est pas installé sur ce poste. Le détecteur est maison (Node, zéro
> dépendance) pour ne pas introduire un binaire tiers sans arbitrage. Si
> `gitleaks` est adopté un jour, remplacer l'appel dans `.githooks/pre-commit`
> suffit — le reste du dispositif ne bouge pas.

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
  par construction, qui produiraient une centaine de détections. **Ce dépôt n'est
  pas branché** sur la garde ; l'y brancher demandera de traiter ce cas d'abord.

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
analyser(diff);   // -> [{fichier, numero, r}]
```

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
documentation. Deux sorties, dans cet ordre de préférence :

### 1. Le marqueur `secret-ok` (à préférer)

Ajouter `secret-ok` en commentaire **sur la ligne concernée** :

```js
const jetonDeDemo = "faux-jeton-pour-le-test"; // secret-ok : fixture, pas un vrai jeton
```

La ligne est laissée passer. C'est **borné à cette ligne**, **visible en revue**
et **versionné** : dans six mois on saura pourquoi. Les alias `gitleaks:allow` et
`allow-secret` fonctionnent aussi.

### 2. `git commit --no-verify` (dernier recours)

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

## Ce que ce hook ne fait pas

- Il ne regarde **que ce qui est mis en scène**. Un secret déjà dans HEAD ou dans
  l'historique lui est invisible — c'est le périmètre de la décision `5ebd908f`
  (rotation et réécriture d'historique).
- Il ne remplace pas le `.gitignore` : ne pas versionner un fichier reste plus
  sûr que de compter sur la détection de son contenu.
