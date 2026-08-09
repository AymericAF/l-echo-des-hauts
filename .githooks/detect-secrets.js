#!/usr/bin/env node
/*
 * Detection de secrets AU POINT DE COMMIT.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Le .gitignore est une convention par MOTIF DE NOM. Il a echoue deux fois en
 * six semaines sur la meme famille de fichiers :
 *   - 2026-06 : un .env.bak de 6 Ko pousse sur GitHub (`*.bak` ne couvrait pas
 *     les suffixes dates, `.env.*` n'existait pas encore) ;
 *   - 2026-08 : 185 fichiers projects/**\/tool-results/*.txt versionnes dans
 *     HEAD (628 dans l'historique), dont des dumps d'executions n8n porteurs de
 *     cles d'API Google reelles. Aucun motif de nom ne regardait ce chemin.
 * Un motif de nom ne peut pas voir ce qu'il ne nomme pas. Ce hook regarde le
 * CONTENU, au seul endroit ou la contrainte mord : juste avant que git ecrive
 * l'objet commit. Cf. [[garantie-par-mecanisme-pas-convention]].
 *
 * CE QU'IL SCANNE
 * ---------------
 * Les LIGNES AJOUTEES de l'index (`git diff --cached -U0`), pas les fichiers
 * entiers. Consequence voulue : un fichier neuf est scanne integralement (c'est
 * le cas .env.bak), un fichier modifie ne l'est que sur ses ajouts -- sinon
 * chaque commit rejouerait tout le passe du depot et la garde serait desactivee
 * dans la semaine.
 *
 * CE QU'IL N'IMPRIME JAMAIS
 * -------------------------
 * Aucune valeur de secret, aucun extrait. Uniquement chemin, numero de ligne et
 * nom de regle. La sortie de ce hook finit dans backup-claude.log quand le
 * backup de 20h se fait refuser : un journal ne doit pas devenir un deversoir.
 *
 * SORTIE ASCII PURE : PowerShell 5.1 lit ce flux en cp1252, tout accent y
 * ressortirait en mojibake (meme raison que l'entete de backup-claude.ps1).
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Regles a MOTIF NOMME. Faible taux de faux positifs : ces prefixes ne se
// rencontrent pas par hasard.
//
// CE QUI LES DISTINGUE DU RESTE DU FICHIER : elles ne demandent AUCUN mot-cle au
// voisinage. Un `sk_live_` n a qu une seule signification au monde, il n a pas
// besoin qu on ecrive « secret » a cote de lui pour en etre un.
//
// POURQUOI C EST ECRIT ICI (2026-08-08, tache 6437c6d3). La cle secrete Stripe
// LIVE d un client — acces API complet a son compte de paiement — a bien ete
// trouvee par le balayage du 2026-08-07, mais par la SEULE regle d entropie, et
// seulement parce qu un mot parlant de secret se trouvait dans les 80 caracteres
// voisins. Deplacez la ligne, et la trouvaille la plus grave du balayage passait.
// Aucune regle ne reconnaissait `sk_live_` pour ce qu il est.
//
// CE QUI N EST DELIBEREMENT PAS ICI, et pourquoi :
//   - `pk_live_` / `pk_test_` (Stripe) : PUBLIABLES PAR CONSTRUCTION, ils sont
//     faits pour partir dans le navigateur. Les detecter serait un faux positif
//     garanti, et une regle nommee qui crie sur une cle publique se fait
//     desarmer. Ils ont l exemption explicite RE_PUBLIABLE plus bas.
//   - `sk_test_` / `rk_test_` (Stripe) : ARBITRAGE DU 2026-08-08 — ni regle
//     nommee, ni exemption. Une cle de test ne donne acces ni a de l argent ni a
//     des donnees reelles : ce n est pas une fuite, donc elle ne merite pas un
//     refus inconditionnel, qui rougirait sur toutes les fixtures d integration.
//     Mais elle n est pas non plus publiable par construction : elle ne merite
//     pas davantage une exemption. Elle reste donc soumise aux regles generiques
//     comme n importe quelle valeur — signalee si elle est posee sous un nom
//     parlant, muette si elle est isolee. C est la pratique qu on veut voir, pas
//     la valeur qu on veut bloquer.
// ---------------------------------------------------------------------------
const REGLES_MOTIF = [
  { nom: 'cle-privee-pem', desc: 'entete de cle privee PEM/OpenSSH',
    re: /-----BEGIN\s+(?:[A-Z]+\s+)?PRIVATE KEY-----/ },
  // `empreintable` : cette regle peut voir une de ses valeurs exemptee par
  // `.secrets-connus` (voir plus bas). Le drapeau n est pas decoratif — il ne
  // porte QUE sur les regles dont le motif impose une valeur STRUCTURELLEMENT a
  // haute entropie (un prefixe fixe suivi de 16 a 40 caracteres tires d un
  // alphabet large). Deux raisons, et les deux comptent :
  //   1. l empreinte publiee dans le depot doit etre irreversible. Le sha-256 d un
  //      mot de passe court se retrouve par force brute ; celui d une cle AIza+35
  //      ne se retrouve pas. Exempter par empreinte une valeur devinable
  //      reviendrait a la publier.
  //   2. la valeur exempter doit etre SANS AMBIGUITE. Ces motifs designent
  //      exactement la valeur ; `url-avec-identifiants` designe une URL entiere et
  //      `aws_secret_access_key=` inclut son assignation — l empreinte porterait
  //      alors sur autre chose que le secret, et changerait au moindre reformatage.
  { nom: 'aws-access-key-id', desc: 'identifiant de cle AWS (AKIA...)',
    re: /\bAKIA[0-9A-Z]{16}\b/, empreintable: true },
  { nom: 'aws-secret-access-key', desc: 'cle secrete AWS (aws_secret_access_key)',
    re: /\baws_secret_access_key\s*=\s*\S{20,}/i },
  { nom: 'jeton-github', desc: 'jeton GitHub (ghp_/gho_/ghu_/ghs_/ghr_)',
    re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, empreintable: true },
  { nom: 'jeton-github-pat', desc: 'jeton GitHub fine-grained (github_pat_)',
    re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/, empreintable: true },
  { nom: 'cle-openai-anthropic', desc: 'cle d API sk-... (OpenAI / Anthropic)',
    re: /\bsk-(?:ant-)?[A-Za-z0-9](?:[A-Za-z0-9_-]{18,})\b/, empreintable: true },
  { nom: 'cle-api-google', desc: 'cle d API Google (AIza...)',
    re: /\bAIza[0-9A-Za-z_-]{35}\b/, empreintable: true },
  { nom: 'jeton-slack', desc: 'jeton Slack (xox...)',
    re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, empreintable: true },
  // LES CLASSES SONT ECRITES EN POSITIF, DEPUIS LA RFC 3986 (2026-08-09, tache
  // 7bdeca91). Elles etaient ecrites en NEGATIF — `[^\s/:@]`, « tout sauf quatre
  // caracteres » — donc le guillemet double, la virgule et l accolade y etaient
  // ADMIS. Dans du JSON minifie, ou tout le document tient sur une ligne, la
  // regle lisait alors un nom d hote comme utilisateur, le `:` de LA CLE SUIVANTE
  // comme separateur, et une adresse e-mail comme `motdepasse@hote` : elle voyait
  // `user:pass@hote` en ENJAMBANT TROIS VALEURS JSON. Deux temoins n8n de
  // `strategie-marketing-freelance` rougissaient ainsi, et etaient IMPOSSIBLES a
  // marquer — JSON n a pas de commentaire, donc pas de `secret-ok` possible. Un
  // faux positif qu on ne peut pas marquer est le pire de tous : il laisse le
  // depot nu pour toujours, ou pousse au `--no-verify`.
  //
  // CE N EST PAS UN ASSOUPLISSEMENT, C EST UNE DEFINITION CORRIGEE. Une URI ne
  // peut PAS contenir ces caracteres : la RFC 3986 les exclut de `userinfo` et de
  // `host`. La regle ne perd donc rien — elle cesse de voir des URI la ou il ne
  // peut pas y en avoir. Les classes retenues :
  //     unreserved  = ALPHA / DIGIT / "-" / "." / "_" / "~"
  //     sub-delims  = "!" "$" "&" "'" "(" ")" "*" "+" "," ";" "="
  //     pct-encoded = "%" HEXDIG HEXDIG      (le `%` seul suffit ici)
  //     userinfo    = unreserved / pct-encoded / sub-delims / ":"
  //     host        = reg-name (memes classes) / IPv4 / IP-literal "[" IPv6 "]"
  //                   puis ":" port
  // Le `:` et le `@` restent hors des deux premieres classes : ce sont NOS
  // separateurs de segments, pas une restriction supplementaire.
  //
  // L ACCOLADE EST LA SEULE EXCEPTION, ET ELLE EST MESUREE. La RFC ne l admet pas,
  // mais la forme reelle d une chaine de connexion en fichier de configuration est
  // `postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/appli` — presente dans le
  // `docker-compose.prod.yml` de DEUX depots du parc. La RFC appliquee a la lettre
  // faisait disparaitre cette detection : 240 detections au lieu de 245, contre 242
  // avec l exception. On ne devine pas ce genre de chose, on le compte.
  //
  // CE QUI A ETE PROUVE, sur les 38 depots armes, en pire cas (chaque fichier
  // presente comme entierement ajoute) : 245 detections avant, 242 apres, ZERO
  // apparue, et les TROIS disparues sont les trois faux positifs vises — les deux
  // temoins JSON, et un gabarit de documentation `postgres://<user>:<mdp>@<hote>`
  // dont les chevrons sont eux aussi exclus par la RFC. Ce dernier a ete verifie
  // en le CASSANT : valeurs reelles a la place des chevrons, la regle le revoit.
  // Cf. [[un-controle-se-prouve-en-cassant-ce-qu-il-protege]].
  { nom: 'url-avec-identifiants', desc: 'URL portant user:motdepasse@hote',
    re: /\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9\-._~%!$&'()*+,;={}]+:[A-Za-z0-9\-._~%!$&'()*+,;={}]{6,}@[A-Za-z0-9\-._~%!$&'()*+,;={}:[\]]+/i },
  // ---------------------------------------------------------------------------
  // `url-webhook-a-chemin-opaque` — QUAND L URL EST ELLE-MEME LE MOT DE PASSE
  // (2026-08-09, tache 74ecea95)
  //
  // CE QUE LA MESURE A MONTRE. Un chemin de webhook n8n VIVANT a vecu du 25/03 au
  // 09/08 dans trois fichiers versionnes. Le detecteur a ete rejoue sur le contenu
  // EXACT de ces trois fichiers, a l etat ou le chemin etait encore vivant :
  // sortie vide, exit 0, ZERO detection. Aucune des regles ci-dessus ne pouvait
  // le voir, et ce n est pas un oubli — c est que la valeur n a AUCUNE des formes
  // qu elles cherchent. Une URL n a pas de prefixe reconnaissable, ne se pose pas
  // sous une cle parlante, et ne ressemble pas a un litteral a haute entropie.
  // Elle traverse donc les deux filets a la fois : le .gitignore ne l attrape pas
  // (elle vit dans un fichier au nom anodin), et le detecteur non plus.
  //
  // POURQUOI C EST UN SECRET. Un webhook n8n s authentifie PAR L OBSCURITE DE SON
  // CHEMIN : il n y a ni compte, ni jeton, ni en-tete. Qui detient le segment peut
  // declencher le traitement. Le segment EST le mot de passe — il se trouve juste
  // qu on l ecrit derriere un `https://`, la ou personne ne cherche un secret.
  //
  // LA DISTINCTION QUI FAIT TOUT LE TRAVAIL : CHEMIN OPAQUE != CHEMIN SEMANTIQUE.
  // L instance porte 277 points d entree de ce type ; DIX seulement ont un chemin
  // opaque. Tous les autres portent un nom lisible (`task-update`, `mail-draft`,
  // `audit-sante`, `coolify-backup-heartbeat`...), sont authentifies par EN-TETE,
  // et leur chemin n a jamais eu vocation a etre secret. Les signaler serait du
  // bruit pur sur des dizaines de fichiers legitimes — et une garde bruyante se
  // fait desarmer. Le motif doit donc attraper L OPAQUE ET LUI SEUL. C est un
  // exercice de DEFINITION, pas de largeur.
  //
  // LA DEFINITION, ECRITE EN POSITIF (comme les classes RFC ci-dessus). Un chemin
  // est opaque quand il se lit comme un IDENTIFIANT TIRE AU HASARD et non comme un
  // nom. Deux formes, et deux seulement :
  //
  //   1. UUID CANONIQUE, 8-4-4-4-12 hexadecimaux. C est la valeur que n8n engendre
  //      LUI-MEME quand personne ne nomme le point d entree — donc la forme de
  //      l accident, celle du temoin. Elle est ecrite a part, et non deduite de la
  //      regle 2, parce qu un groupe hexadecimal peut tomber tout en lettres
  //      (`abcd`, `dead`) : la deduire la rendrait vraie une fois sur vingt.
  //
  //   2. JETON NU d au moins 16 caracteres dont AUCUN MORCEAU N EST UN MOT. Les
  //      morceaux se decoupent sur `-` `_` `.`, et un morceau n est PAS un mot s il
  //      fait moins de 3 caracteres ou s il contient un chiffre. C est la
  //      formulation qui survit a l hexadecimal : `deadbeefcafe0123` contient bien
  //      des lettres consecutives, mais le morceau entier porte des chiffres, donc
  //      il ne se lit pas. Exiger « aucune suite de 3 lettres » aurait rate un
  //      jeton hexadecimal sur trois.
  //
  // CE QUE LA DEFINITION EXCLUT DELIBEREMENT, et pourquoi :
  //   - LE CHEMIN SEMANTIQUE, evidemment : des qu un morceau est un mot, le chemin
  //     NOMME quelque chose, donc il n a jamais ete un secret. Mesure sur les 38
  //     depots : 70 segments distincts suivent `/webhook*/`, 69 portent un mot,
  //     UN SEUL est opaque — et c est celui du temoin.
  //   - LE SEMANTIQUE A SUFFIXE TIRE (`mail-draft-<8 hexa>`, present 4 fois dans le
  //     parc). Le suffixe est bien un secret partiel, mais le mot de tete suffit a
  //     rendre la regle indecidable : il faudrait juger « ce nom est-il assez
  //     nomme ? », et c est la porte ouverte au bruit qu on vient de fermer. Ces
  //     chemins ne sont PAS couverts — c est un trou assume, pas un oubli.
  //   - `/form/` ET `/form-test/` (declencheur Formulaire n8n), qui s authentifient
  //     eux aussi par l obscurite. `/form/contact` est trop courant pour qu on
  //     ajoute ce prefixe sans une mesure a part.
  //   - LE SEGMENT DE MOINS DE 16 CARACTERES : trop court pour etre un tirage, et
  //     c est la longueur qui empeche `/webhook/v2` ou `/webhook/a1b2` de rougir.
  //
  // POURQUOI PAS `empreintable` : la meme raison que `url-avec-identifiants` juste
  // au-dessus. Le motif capture le PREFIXE `/webhook/` avec le segment ; l empreinte
  // porterait donc sur autre chose que le secret, et changerait selon qu on ecrit
  // `/webhook/` ou `/webhook-test/`. Un faux positif se marque ici au `secret-ok`.
  //
  // PREUVE DANS LES DEUX SENS (c est la seconde qui engage) : rejoue sur le contenu
  // REEL des trois fichiers du temoin (commit 33e4e70), le detecteur passe de 0 a
  // 11 detections — la configuration, son fichier d etat, et neuf lignes du
  // journal. Et sur les 38 depots, le pire cas passe de 141 a 143, compare CLE A
  // CLE (depot, fichier, ligne, regle) : ZERO detection disparue, et les 2 apparues
  // sont toutes deux la nouvelle regle sur le MEME artefact genere par le meme
  // pipeline, dans deux autres clones. Les 8 depots qui portent des chemins
  // SEMANTIQUES (69 des 70 segments du parc) sont restes a ZERO.
  // Cf. [[un-controle-se-prouve-en-cassant-ce-qu-il-protege]].
  // ---------------------------------------------------------------------------
  { nom: 'url-webhook-a-chemin-opaque', desc: 'URL de webhook n8n dont le chemin opaque EST le mot de passe',
    re: new RegExp(
      '\\/webhook(?:-test|-waiting)?\\/' +
      '(?:' +
        // Forme 1 : UUID canonique — la valeur engendree par defaut.
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' +
      '|' +
        // Forme 2 : jeton nu. Le lookahead impose la LONGUEUR sur le segment entier
        // (>= 16 caracteres) ; la suite de morceaux impose qu AUCUN ne soit un mot.
        '(?=[A-Za-z0-9_.~-]{16,}(?![A-Za-z0-9_.~-]))' +
        '(?:[A-Za-z0-9]{1,2}|[A-Za-z0-9]*[0-9][A-Za-z0-9]*)' +
        '(?:[-_.](?:[A-Za-z0-9]{1,2}|[A-Za-z0-9]*[0-9][A-Za-z0-9]*))*' +
      ')' +
      // Le segment doit s arreter ici : sans cette borne, la suite de morceaux
      // pourrait n avaler qu un prefixe de `/webhook/mail-draft-7f3a9c21`.
      '(?![A-Za-z0-9_.~-])',
      'i') },
  // Stripe, ajoutes le 2026-08-08. `sk_` = cle secrete, `rk_` = cle restreinte
  // (secrete elle aussi, seulement bornee en droits), `_live_` = compte reel.
  // Le suffixe est exige a 16 caracteres au moins pour que le PREFIXE SEUL, cite
  // dans de la documentation ou dans ce fichier, ne suffise pas a faire rougir.
  { nom: 'cle-secrete-stripe-live', desc: 'cle secrete Stripe LIVE (sk_live_/rk_live_)',
    re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/, empreintable: true },
  { nom: 'secret-webhook-stripe', desc: 'secret de signature de webhook Stripe (whsec_)',
    re: /\bwhsec_[A-Za-z0-9]{16,}\b/, empreintable: true },
];

// ---------------------------------------------------------------------------
// PUBLIABLE PAR CONSTRUCTION : la valeur est FAITE pour etre lue par n importe
// qui. Aucune regle, nommee ou heuristique, ne doit la signaler — meme posee
// sous un nom parlant (`STRIPE_API_KEY = "pk_live_..."` est l usage NORMAL).
// C est une exemption, donc elle ne peut que RETIRER des detections : le seul
// risque serait qu un vrai secret porte ce prefixe, ce que le prefixe interdit.
// ---------------------------------------------------------------------------
const RE_PUBLIABLE = /\bpk_(?:live|test)_[A-Za-z0-9]{8,}\b/;

// ---------------------------------------------------------------------------
// Regle generique : une ASSIGNATION dont la cle sent le secret.
// C'est la regle qui fabrique les faux positifs -- d'ou les filtres ci-dessous,
// tous calibres en REJOUANT la detection sur les 60 derniers commits reels du
// depot (voir la section "Calibrage" de .githooks/README.md). Sans ce calibrage
// la garde refusait 7 commits sur 60, dont trois backups automatiques : elle
// aurait ete desactivee en une semaine, ce qui est pire que pas de garde.
// ---------------------------------------------------------------------------
//
// LA CLE NE PEUT PAS ETRE VIDE (2026-08-08, tache b01265b7). Le quantificateur
// etait {0,40}. Consequence, sur la forme d un `.npmrc` :
//
//     //npm.<hote>/:_authToken=<valeur>
//              ^ ce `:` se laissait lire comme le separateur d une assignation
//                A CLE VIDE ; la valeur avalait alors tout le reste de la ligne,
//                et `_authToken=` n etait JAMAIS reexamine.
//
// `authToken=<meme valeur>` etait detecte ; la meme ligne precedee d un chemin de
// registre ne l etait pas. Ce n est pas « le cas de npm » : c est UNE CLE PRECEDEE
// D UN CHEMIN, forme que prend tout fichier de configuration adresse par URL.
//
// Exiger UN caractere de cle suffit — et c est le resserrement le moins couteux :
// le balayage reste NON CHEVAUCHANT. La variante chevauchante (reexaminer
// l interieur de chaque valeur, pour attraper aussi une cle sensible enfouie dans
// une valeur deja consommee) a ete MESUREE puis ECARTEE : +23 detections en pire
// cas et +2 commits refuses sur le parc, toutes des parametres de requete
// (`?token=unknown-token`, `?password-protected=login`, `&secret=…` dans une URL
// d exemple) — du bruit d URL, pas des secrets.
// ---------------------------------------------------------------------------
const RE_ASSIGNATION = new RegExp(
  '(?:^|[^A-Za-z0-9_])' +
  '([A-Za-z0-9_.\\-]{1,40})' +
  '\\s*[:=]\\s*' +
  '["\']?([^\\s"\'`,;)\\]}]{8,})["\']?',
  'g'
);

// ---------------------------------------------------------------------------
// LES VALEURS A ESPACES (2026-08-08, tache b01265b7).
//
// `valeurPlausible()` ne voit jamais une valeur contenant une espace : la classe
// de caracteres de RE_ASSIGNATION s arrete au premier blanc. Or Google AFFICHE
// ses mots de passe d application en 4 GROUPES DE 4 LETTRES separes par des
// espaces, et c est sous cette forme qu on les colle. C est par ce trou qu un
// acces SMTP/IMAP a la boite Gmail principale est reste 15 MOIS expose : le
// format le plus courant du secret le plus courant.
//
// CE QU ON N A PAS FAIT, et pourquoi. Accepter les valeurs a espaces sous une cle
// sensible est le correctif naif ; il est MESURE dans le README (section
// « Calibrage », point 13) et il fabrique des milliers de signalements de prose —
// toute phrase posee apres un `:` sous une cle parlant de mot de passe. On
// n accepte donc pas l espace, on accepte UN GABARIT : exactement 4 groupes de 4
// lettres minuscules, seuls sur leur fin de ligne, sous une cle qui nomme un
// secret. Cout mesure sur le parc : UNE detection, la ligne de documentation qui
// decrit ce meme angle mort.
//
// L ancrage de fin de ligne n est pas decoratif : c est lui qui separe le secret
// de la prose. « Il faut dire tout cela bien vite ici » porte le gabarit, mais la
// phrase CONTINUE ; un mot de passe colle, non.
// ---------------------------------------------------------------------------
const RE_MDP_APPLICATION = new RegExp(
  '(?:^|[^A-Za-z0-9_])([A-Za-z0-9_.\\-]{1,40})\\s*[:=]\\s*' +
  '["\']?([a-z]{4}(?: [a-z]{4}){3})["\']?\\s*[,;]?\\s*(?:#.*)?$'
);

// ---------------------------------------------------------------------------
// LA REGLE DE COMPOSITION D UN NOM DE VARIABLE (2026-08-08, tache 249fdfd5).
//
// POURQUOI UNE REGLE ET PLUS UNE LISTE. En une nuit, deux runs independants ont
// trouve, chacun par hasard, un mot manquant dans le vocabulaire : `api_key`
// (commit e3d9a0e) puis `secretkey` (commit 02a0cee). Deux fois le meme mode
// d echec — un vocabulaire ENUMERE grandit par accident et se troue en silence.
// La cause commune tient en une phrase : le desamorcage demandait a la liste des
// mots secrets si `<avant-dernier><dernier>` en faisait partie. Il fallait donc y
// avoir ecrit D AVANCE chaque forme collee — `apikey`, `secretkey`, `servicekey`,
// `authkey`... — et tout nom non prevu passait sans bruit. On ne demande plus
// « ce mot est-il dans la liste ? » mais « quel ROLE joue chaque mot ? ».
//
// UN NOM DE VARIABLE SE LIT COMME UNE PHRASE :
//
//     [fournisseur]  [marqueur ...]   PORTEUR   [qualificatif]
//       STRIPE_          SECRET_        KEY
//      SUPABASE_      SERVICE_ROLE_     KEY
//                        API_           KEY        _HEADER   -> reference
//
//   1. DECOUPAGE en mots (sur _ - . et les bascules de casse), puis DECOLLAGE :
//      un mot inconnu qui se decompose exactement en <marqueur><porteur> est
//      rendu a ses deux mots. C est lui qui remplace l enumeration des formes
//      collees : `apikey`, `secretkey`, `accesskey`, `privatekey`, `authkey`,
//      `clientsecret`, `servicekey`, `apitoken`... ne sont plus ecrits nulle
//      part, ils se DERIVENT. Le decollage n accepte QUE des mots des
//      vocabulaires ci-dessous : sans cette borne, `bypass` deviendrait
//      `by` + `pass` et l on ferait revenir les faux positifs PASSE/PASSAGE que
//      le point 1 du calibrage avait fermes.
//
//   2. LE PORTEUR DECIDE DE LA MATIERE. Trois classes, et non une liste plate :
//      - PORTEURS_FORTS    : le mot seul est deja un secret (password, secret,
//                            token, credential, passphrase...) ;
//      - PORTEURS_COMPOSES : fort seulement ACCOMPAGNE. `pwd` en est le seul
//                            membre et la raison est nette — `PWD` tout seul est
//                            la variable Unix du repertoire courant, presente
//                            dans tout script shell, quand `DB_PWD` est un mot
//                            de passe ;
//      - PORTEURS_ARMES    : `key` et `salt`. Le mot seul ne dit RIEN
//                            (`cache_key`, `sort_key`, `primary_key`,
//                            `public_key`) ; il ne devient un secret que si un
//                            MARQUEUR le precede.
//
//   3. LE MARQUEUR ARME UN PORTEUR situe APRES lui, adjacent ou non. C est ce
//      qui fait marcher `SUPABASE_SERVICE_ROLE_KEY` : `service` arme `key` a
//      travers `role`. Exiger l adjacence aurait rate la cle qui, chez Supabase,
//      contourne toutes les regles de securite au niveau ligne.
//
//   4. LE QUALIFICATIF FINAL DESAMORCE, toujours : quand le DERNIER mot est
//      `name`, `path`, `type`, `url`, `header`, `id`... le nom DESIGNE un secret,
//      il n en est pas un (`tokenName`, `secretPath`, `API_KEY_HEADER`).
//
//   5. L ORDRE, qui est le point ou l on s est trompe deux fois : le desamorcage
//      se lit sur le dernier mot APRES decollage, et `key` N EST PLUS UN
//      QUALIFICATIF — c est un porteur. C est sa presence parmi les qualificatifs
//      qui exemptait `api_key`, puis `SECRET_KEY`, sans aucune condition.
//
// CE QUI N EST DELIBEREMENT PAS COUVERT, et pourquoi. Ces decisions ont ete
// prises sur les 3 055 combinaisons ENGENDREES a partir de la regle et passees au
// detecteur, pas au jugement. Elargir est facile ; ne pas devenir bavard est le
// travail, et un depot qui refuse des commits legitimes se fait contourner au
// --no-verify sur les 28 d un coup.
//   - `signature` / `sig` : une signature est le PRODUIT d un secret, publiee
//     dans la requete. La divulguer n ouvre rien, et `webhook_signature` peuple
//     les fixtures. Le secret de signature, lui, est couvert (`whsec_`,
//     `signing_key`).
//   - `hash`, `digest` : concus pour etre stockes ; `hash` est deja une EXEMPTION
//     plus bas (RE_CONTEXTE_EMPREINTE). Les detecter contredirait cette exemption.
//   - `id` : `client_id`, `app_id`, `session_id` sont publics par construction.
//     `id` reste un QUALIFICATIF, comme avant.
//   - `code` : `status_code`, `country_code`, `error_code` — bruit garanti. Un
//     code OAuth est a usage unique et expire en secondes.
//   - `cert` / `certificate` : un certificat est public ; c est sa CLE qui est
//     secrete, et elle a une regle nommee inconditionnelle (`cle-privee-pem`).
//   - `seed`, `string`, `value` : trop generiques. La chaine de connexion
//     porteuse d identifiants a deja sa regle (`url-avec-identifiants`).
//   - LES MARQUEURS `refresh`, `admin`, `role`, `bearer`, `webhook` : la forme
//     reelle du terrain est `REFRESH_TOKEN` et `BEARER_TOKEN` (porteurs forts,
//     deja couverts), pas `REFRESH_KEY` ni `BEARER_KEY` ; `SERVICE_ROLE_KEY` est
//     deja arme par `service`. Chacun elargirait la surface de `key` et de `salt`
//     sans qu aucun nom rencontre ne le demande.
//   - LES FORMES COLLEES SANS MARQUEUR (`dbpassword`, `stripetoken`) : les
//     attraper demanderait de decoller contre un ensemble OUVERT de prefixes, ce
//     qui rouvre exactement `bypass`. Et aucun `.env` du terrain ne les ecrit
//     ainsi : la forme reelle est `DB_PASSWORD`, deja couverte.
// ---------------------------------------------------------------------------

// Le mot seul designe un secret, quel que soit son entourage.
const PORTEURS_FORTS = new Set([
  'password', 'passwd', 'pass', 'motdepasse', 'mdp', 'passphrase',
  'secret', 'token', 'credential', 'credentials',
]);

// Fort seulement ACCOMPAGNE d un autre mot : `PWD` seul est le repertoire
// courant Unix (`PWD=/c/Users/...`), `DB_PWD` est un mot de passe.
const PORTEURS_COMPOSES = new Set(['pwd']);

// Le mot seul ne dit rien ; il devient un secret quand un MARQUEUR le precede.
const PORTEURS_ARMES = new Set(['key', 'salt']);

// Arment un porteur situe APRES eux, adjacent ou non.
const MARQUEURS = new Set([
  'api', 'secret', 'private', 'access', 'auth', 'signing', 'encryption',
  'master', 'service', 'client', 'app', 'application', 'session', 'consumer',
  'shared', 'licence', 'license', 'secure', 'logged', 'nonce',
]);

// Transforment le nom en REFERENCE a un secret : nodeCredentialType, tokenName,
// secretPath, API_KEY_HEADER. `key` n y figure plus — c est un PORTEUR (point 5).
const QUALIFICATIFS = new Set([
  'type', 'types', 'name', 'names', 'id', 'ids', 'path', 'file', 'url', 'uri',
  'header', 'headers', 'field', 'var', 'env', 'label', 'kind', 'format',
  'option', 'options',
  'prefix', 'suffix', 'regex', 'pattern', 'placeholder', 'hint', 'desc',
]);

// Un mot connu n est JAMAIS decolle : `secret`, `application`, `session` doivent
// rester entiers, sinon le decollage se mettrait a inventer des decoupages.
const MOTS_CONNUS = new Set([
  ...PORTEURS_FORTS, ...PORTEURS_COMPOSES, ...PORTEURS_ARMES,
  ...MARQUEURS, ...QUALIFICATIFS,
]);

function motsDeLaCle(cle) {
  return cle
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter(Boolean)
    .map((m) => m.toLowerCase());
}

// Rend `apikey` -> [api, key], `secretkey` -> [secret, key], `clientsecret` ->
// [client, secret]. Les DEUX moities doivent appartenir aux vocabulaires : c est
// la borne qui empeche `bypass` de devenir `by` + `pass`.
function decoller(mot) {
  if (MOTS_CONNUS.has(mot)) return [mot];
  for (const m of MARQUEURS) {
    if (mot.length <= m.length || !mot.startsWith(m)) continue;
    const reste = mot.slice(m.length);
    if (PORTEURS_FORTS.has(reste) || PORTEURS_ARMES.has(reste) ||
        PORTEURS_COMPOSES.has(reste)) {
      return [m, reste];
    }
  }
  return [mot];
}

function cleSensible(cle) {
  const bruts = motsDeLaCle(cle);
  if (!bruts.length) return false;
  const mots = [];
  for (const b of bruts) mots.push(...decoller(b));

  // Point 4 : le qualificatif FINAL desamorce, avant toute autre lecture.
  if (QUALIFICATIFS.has(mots[mots.length - 1])) return false;

  // "MOT_DE_PASSE" se decoupe en mot/de/passe : aucun des trois n est un porteur,
  // et ajouter "passe" seul ferait revenir les faux positifs sur les mots
  // francais PASSE et PASSAGE. On reconnait donc la SUITE des trois.
  for (let i = 0; i + 2 < mots.length; i++) {
    if (/^mots?$/.test(mots[i]) && mots[i + 1] === 'de' && mots[i + 2] === 'passe') return true;
  }

  // Points 2 et 3 : lecture de gauche a droite ; un marqueur deja rencontre arme
  // les porteurs qui le suivent.
  let marqueurVu = false;
  for (const m of mots) {
    if (PORTEURS_FORTS.has(m)) return true;
    if (PORTEURS_COMPOSES.has(m) && mots.length > 1) return true;
    if (PORTEURS_ARMES.has(m) && marqueurVu) return true;
    if (MARQUEURS.has(m)) marqueurVu = true;
  }
  return false;
}

// Valeurs qui ne sont pas des secrets : gabarits, references a une autre
// variable, marqueurs de redaction, litteraux de langage.
const RE_PLACEHOLDER = new RegExp(
  '\\$\\{|\\$\\(|\\$\\$|\\$[A-Za-z_]|\\$env:|%[A-Za-z_]|<[^>]*>|' +
  'process\\.env|os\\.environ|getenv|Get-EnvValeur|ENV\\[|secrets\\.|vault:|' +
  'x{3,}|\\*{3,}|\\.{3,}|_{4,}|-{4,}|={3,}|' +
  'redact|masqu|changeme|change-me|placeholder|your[_-]|example|exemple|' +
  'dummy|sample|fake|todo|tbd|null|none|undefined|^true$|^false$|' +
  // Vocabulaire de gabarit ajoute le 2026-08-08 (branchement sur les depots de l Echo).
  // MESURE, pas jugement : sur echo-code, 4 commits reels sur 32 etaient refuses, et les
  // 10 detections en pire cas etaient TOUTES des gabarits sur des fichiers VIVANTS
  // (`.env.example` de Strapi, jetons de fixture des tests). Un refus sur douze commits,
  // faux a 100 %, est le profil exact qui fait desinstaller la garde -- le README le dit.
  //   - `tobemodified` : la valeur que l echafaudage Strapi ecrit lui-meme dans .env.example.
  //     Un marqueur `secret-ok` y etait exclu : `# ...` apres une valeur non quotee est
  //     avale par certains lecteurs dotenv, on corrompait un fichier fait pour etre copie.
  //   - le reste : les equivalents FRANCAIS des mots deja presents au-dessus
  //     (dummy/sample/fake/example), qui manquaient a une base de code redigee en francais.
  // Le risque pris est un faux negatif sur un secret dont la VALEUR contiendrait
  // litteralement « fixture » ou « de-test » : hors de portee d un jeton engendre.
  'tobemodified|to[_-]be[_-]modified|a[_-]modifier|factice|bidon|fixture|' +
  'de[_-]test|de[_-]recette|' +
  '[_-]test\\b|\\btest[_-]|' +
  '^(?:same-origin|same-site|cross-origin|no-cors|no-referrer|' +
  'no-referrer-when-downgrade|strict-origin|strict-origin-when-cross-origin|' +
  'origin-when-cross-origin|unsafe-url)$',
  'i'
);

// Une valeur qui n'est qu'un NOM de variable en majuscules est une reference,
// pas un secret (ex. `token: N8N_DRIFT_HEARTBEAT_TOKEN`).
const RE_NOM_DE_VARIABLE = /^[A-Z][A-Z0-9_]{5,}$/;
// Une valeur qui est du CODE : acces membre, appel, indexation.
const RE_CODE = /[()[\]{}]|^[A-Za-z_$][\w$]*(?:\.[\w$?]+)+/;

// Une valeur qui n est qu une REFORMULATION du nom de la cle est un IDENTIFIANT,
// pas un secret. C est le SEUL faux positif qu ait coute la sortie de `key` des
// qualificatifs, mesure sur les 28 depots :
//     const INVALID_API_KEY_ERROR_COUNT_CACHE_KEY = 'invalid_api_key_error_count';
// La regle est generale et ne peut pas aveugler la garde sur un vrai mot de
// passe : `DB_PASSWORD=super_secret_pass` reste signale, ses mots n etant pas
// ceux de sa cle. Un secret ENGENDRE n a aucune raison de reprendre les mots de
// sa propre variable — c est ce qui distingue un nom d une valeur.
function valeurRepeteLaCle(cle, valeur) {
  const mots = motsDeLaCle(valeur);
  if (mots.length < 2) return false;              // un mot unique ne prouve rien
  const deLaCle = new Set(motsDeLaCle(cle));
  return mots.every((m) => deLaCle.has(m));
}

// `cleNommeUnSecret` : la cle qui porte cette valeur a passe `cleSensible()`.
// Ce n est PAS un detail d appel — c est ce qui distingue un filtre d exclusion
// qui regarde son voisinage d un filtre qui juge la valeur toute seule. Le sha
// git en est l exemple : la meme suite de 40 hexadecimaux est une empreinte sous
// `commit=`, et un jeton de registre npm sous `_authToken=`. Rien dans la VALEUR
// ne les distingue ; seule la CLE le fait.
function valeurPlausible(v, cleNommeUnSecret = false) {
  if (v.length < 8) return false;
  // Une valeur qui COMMENCE par un separateur : on a coupe dans un OPERATEUR, pas
  // dans une assignation — `Password::PASSWORD_RESET` (PHP), `a := b`, `x => y`.
  // Aucun secret ne commence par `:` ni par `=`. Ce filtre est arrive avec la cle
  // non vide ci-dessus, qui fait desormais voir ces coupes ; il retire au passage
  // les deux faux positifs Laravel de CockpitV2 (PasswordResetLinkController,
  // constantes sans aucune valeur) que le README listait comme refus legitime.
  if (/^[:=]/.test(v)) return false;
  if (RE_PUBLIABLE.test(v)) return false;
  if (RE_PLACEHOLDER.test(v)) return false;
  // Un nom de variable en majuscules est une REFERENCE (`token: N8N_HEARTBEAT_TOKEN`),
  // pas un secret. L exception : une valeur qui n est QUE de l hexadecimal majuscule
  // sous une cle qui nomme un secret. Sans elle, l angle mort du sha ci-dessous ne
  // serait ferme qu a moitie — le meme jeton passerait ou non selon la CASSE dans
  // laquelle le fournisseur l a rendu, ce qui n est pas une propriete de securite.
  // Cout mesure sur le parc : zero refus, zero detection ajoutee.
  if (RE_NOM_DE_VARIABLE.test(v) &&
      !(cleNommeUnSecret && /^[0-9A-F]{8,}$/.test(v))) return false;
  if (RE_CODE.test(v)) return false;
  // NON LEVE sous une cle sensible, et c est une decision, pas un oubli : `TOKEN_EXPIRES`
  // ou `SESSION_TOKEN_TTL` portent une date en millisecondes, forme la plus banale d une
  // valeur numerique sous une cle parlante. Un secret PUREMENT numerique est rare ; un
  // horodatage sous une cle nommee `token`, non. Mesure : la lever coute zero AUJOURD HUI,
  // mais le pire cas ne mesure que les fichiers existants.
  if (/^\d+$/.test(v)) return false;              // port, timestamp, identifiant
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) &&
      !cleNommeUnSecret) {
    // UUID nu : identifiant de tache/projet, omnipresent dans ce depot -- SAUF sous une
    // cle qui nomme un secret. C est le meme defaut que le sha ci-dessous, une ligne plus
    // haut : un identifiant de tache ne s ecrit pas sous `client_secret`, et un secret
    // d application Azure AD est justement un GUID. Cout mesure : zero refus, zero
    // detection ajoutee sur les 38 depots. L exemption reste ENTIERE pour la regle du
    // litteral a haute entropie, qui n a pas de cle a regarder.
    return false;
  }
  // LE SHA GIT REGARDE ENFIN LA CLE (2026-08-08, tache b01265b7). Ce filtre etait
  // le plus large des trois angles morts : 7 a 40 hexadecimaux minuscules etaient
  // ecartes SANS AUCUNE CONDITION DE NOM. `password=<40 hex>` n etait pas vu, quand
  // `password=<40 alphanumeriques mixtes>` l etait — et le jeton du registre npm
  // prive Divi fait exactement 40 hexadecimaux minuscules.
  // La regle n est pas supprimee, elle est CONTEXTUALISEE : un depot est plein de
  // sha, les detecter tous rendrait la garde inutilisable — mais un sha ne s ecrit
  // pas sous une cle nommee `password` ou `_authToken`. Cout mesure sur le parc :
  // zero detection ajoutee hors le vrai jeton npm.
  if (/^[0-9a-f]{7,40}$/i.test(v) && !cleNommeUnSecret) return false;  // sha git
  if (/^https?:\/\//i.test(v)) return false;      // URL nue (le user:pass a sa regle)
  if (/^[A-Za-z]+$/.test(v) && v.length < 16) return false;
  const classes =
    (/[a-z]/.test(v) ? 1 : 0) + (/[A-Z]/.test(v) ? 1 : 0) +
    (/[0-9]/.test(v) ? 1 : 0) + (/[^A-Za-z0-9]/.test(v) ? 1 : 0);
  // Assez melange, OU assez long pour qu'un mot de passe en minuscules compte.
  return classes >= 2 || v.length >= 12;
}

// ---------------------------------------------------------------------------
// LE VOISINAGE DEBORDE LA LIGNE — elargi le 2026-08-06 (tache 34663a22).
//
// Jusque-la, le detecteur analysait `git diff --cached` LIGNE A LIGNE, donc la fenetre de 80
// caracteres ne pouvait jamais atteindre la ligne d avant. Angle mort mesure sur depot jetable :
//
//     const token = "<48 hex>";                        -> REFUSE
//     const token = x;
//     const EXPECTED = "<48 hex>";                     -> PASSAIT   <-- le plus courant
//
// C est la forme habituelle en JavaScript, en JSON et en PHP : le nom parlant sur une ligne, la
// valeur sur une autre. La garde n attrapait donc que les formes compactes.
//
// CE QUI A ETE FAIT, et les deux bornes qui empechent la garde de devenir ininterpretable :
//   - le contexte est limite a CONTEXTE_LIGNES lignes de part et d autre, comptees sur le
//     NUMERO DE LIGNE : deux hunks eloignes du meme fichier ne se voient pas ;
//   - le contexte ne franchit JAMAIS la frontiere d un fichier. Sans cela, un « token » isole
//     dans n importe quel fichier de l index rendrait suspect tout litteral long des autres.
// Le LITTERAL, lui, reste cherche sur la SEULE ligne courante : seul le mot-cle a le droit de
// venir du voisinage. Sinon la meme valeur serait signalee autant de fois qu il y a de lignes
// dans la fenetre.
//
// POURQUOI CE N ETAIT PAS FAIT PLUS TOT : elargir fait rougir davantage, et une garde qui
// rougit trop est desactivee en une semaine — ce qui est pire que le trou. L elargissement
// exigeait donc sa propre contre-epreuve, faite ici : rejeu sur les 60 derniers commits reels
// du depot, zero detection. La recette porte en outre deux cas de BORNE (mot-cle trop loin,
// mot-cle dans un autre fichier) qui echoueraient si quelqu un elargissait sans mesurer.
//
// SECOND ELARGISSEMENT, 2026-08-08 : LE VOISINAGE DEBORDE AUSSI LE DIFF.
// Le correctif ci-dessus ne regardait que les lignes AJOUTEES, parce que le diff etait lu en
// -U0. Sur un fichier NEUF tout est ajoute, donc la recette passait au vert — mais sur un
// fichier MODIFIE, le mot-cle est presque toujours sur une ligne qui, elle, ne bouge pas :
//
//     const token = process.env.X;      <- ligne INCHANGEE, absente d un diff -U0
//     const EXPECTED = "<48 hex>";      <- seule ligne ajoutee -> PASSAIT
//
// C est la forme d une fuite ordinaire : on ajoute une valeur sous une declaration qui
// existe deja. Le diff est donc lu en -U<CONTEXTE_LIGNES>, et les lignes inchangees qu il
// rend alimentent le voisinage. Elles ne sont JAMAIS jugees : aucun litteral n y est
// cherche, sinon un secret deja commite ferait rougir chaque commit voisin a perpetuite.
// Contre-epreuve (la seule qui engage, cf. README) : rejeu des 60 derniers commits reels de
// ~/.claude, 7 refus avant, LES MEMES 7 apres — zero refus ajoute. Le pire cas sur les
// 3 204 fichiers suivis est inchange lui aussi (24 detections, liste identique).
// ---------------------------------------------------------------------------
// Regle "litteral a forte entropie au voisinage d'un mot-cle secret".
// Elle attrape ce que l'assignation rate : `const EXPECTED = '<48 hex>';` juste
// apres un `const token = ...`. Le nom de la variable ne dit rien, le VOISINAGE
// dit tout. Trouve reellement un jeton partage en dur dans un workflow n8n
// versionne (2026-08-04).
// ---------------------------------------------------------------------------
const RE_VOISINAGE = /token|secret|password|passwd|mot_de_passe|api_?key|passphrase|credential/i;
const RE_LITTERAL = /["'`]([A-Za-z0-9+/=_-]{32,})["'`]/g;
// Contextes ou un long litteral est une empreinte, pas un secret.
const RE_CONTEXTE_EMPREINTE = /sha1|sha256|sha512|md5|checksum|digest|hash|etag|integrity|base64 de|expected_sha/i;

// Le voisinage se mesure sur une FENETRE, pas sur la ligne entiere. Ce depot
// versionne des JSON d'une seule ligne de plusieurs milliers de caracteres : un
// "token" au caractere 200 et un identifiant au caractere 3600 n'ont rien a
// voir, et les rapprocher refusait des backups pour rien.
const FENETRE = 80;

// Nombre de lignes du meme fichier, de part et d autre, qui comptent comme voisinage — qu elles
// soient AJOUTEES ou INCHANGEES. C est aussi le -U passe a `git diff` : elargir ce nombre elargit
// mecaniquement les deux, il n y a donc qu un seul bouton a re-mesurer.
//
// 1 — MESURE, pas jugement. Compte des detections en PIRE CAS sur les 2 962 fichiers suivis du
// depot (chaque fichier presente comme entierement ajoute) :
//
//     N=0 (avant)  17 detections          N=2   29   (+12)
//     N=1 (retenu) 24 detections  (+7)    N=3   37   (+20)
//
// A N=1, les 7 nouvelles portent TOUTES sur trois pages HTML archivees et figees depuis le
// 2026-07-13 (hachages de bundle CSS, nonces Cloudflare publics) : aucun fichier vivant, donc
// aucun commit futur bloque. A N=3, `scripts/backup-supabase.sh` se met a rougir parce que son
// commentaire d en-tete parle de jeton — un faux positif sur un fichier qui, lui, change encore.
//
// N=1 ferme le cas que cette tache visait — « le nom parlant sur une ligne, la valeur sur la
// suivante » — pour un tiers du cout de N=3. Toute augmentation doit etre RE-MESUREE par la
// contre-epreuve du README, jamais decidee : la recette porte un cas de borne qui rougira.
const CONTEXTE_LIGNES = 1;

// Un secret n'a pas toujours de guillemet ADJACENT. Dans `VAR="${OVERRIDE:-<secret>}"`, les
// guillemets entourent l'expansion, pas la valeur : celle-ci est bordee par `:-` et `}`.
// RE_LITTERAL passe donc a cote — c'est ainsi que trois fichiers ont garde un jeton (tache
// 9f28ad4c). La regle soeur ci-dessous vise cette forme, et elle seule : `${V:-x}`, `${V-x}`,
// `${V:=x}`, `${V=x}`. Les filtres (sha, UUID, placeholder, mixite, voisinage) restent
// PARTAGES avec la regle principale — deux jeux de filtres finiraient par diverger.
const RE_EXPANSION_SHELL = /\$\{[A-Za-z_][A-Za-z0-9_]*:?[-=]([A-Za-z0-9+/=_-]{32,})\}/g;

// Filtres communs aux deux regles. `debut`/`fin` bornent la valeur dans le texte, pour que la
// fenetre de voisinage soit mesuree au meme endroit dans les deux cas.
// `voisinage` porte les lignes ajoutees alentour (meme fichier, +/- CONTEXTE_LIGNES). Il
// s ajoute a la fenetre de 80 caracteres SANS la remplacer : sur un JSON d une seule ligne de
// plusieurs milliers de caracteres, c est toujours la fenetre qui evite de rapprocher un
// « token » du caractere 200 d un identifiant du caractere 3600.
function valeurEstSuspecte(v, texte, debut, fin, voisinage = '') {
  if (/^[0-9a-f]{40}$/i.test(v)) return false;      // sha git
  if (/^[0-9a-f]{64}$/i.test(v)) return false;      // empreinte sha256
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return false;                                    // UUID (session, tache, projet)
  }
  if (RE_PUBLIABLE.test(v)) return false;
  if (RE_PLACEHOLDER.test(v)) return false;
  // Un secret melange chiffres et lettres ; un slug, un chemin ou une phrase
  // sans espace, non.
  if (!/[0-9]/.test(v) || !/[A-Za-z]/.test(v)) return false;
  const d = Math.max(0, debut - FENETRE);
  const contexte = texte.slice(d, fin + FENETRE) + '\n' + voisinage;
  if (!RE_VOISINAGE.test(contexte)) return false;
  // L exemption vaut sur le MEME perimetre que la detection : une empreinte annoncee une ligne
  // plus haut doit proteger son litteral, sinon elargir le voisinage fabriquerait un faux
  // positif sur chaque fichier de sommes de controle.
  if (RE_CONTEXTE_EMPREINTE.test(contexte)) return false;
  return true;
}

function litterauxSuspects(texte, voisinage = '') {
  // Le mot-cle peut venir du voisinage ; le LITTERAL, jamais — il est cherche dans `texte`
  // seul, sinon la meme valeur serait signalee une fois par ligne de la fenetre.
  if (!RE_VOISINAGE.test(texte + '\n' + voisinage)) return [];
  const out = [];
  let m;
  RE_LITTERAL.lastIndex = 0;
  while ((m = RE_LITTERAL.exec(texte)) !== null) {
    const v = m[1];
    if (valeurEstSuspecte(v, texte, m.index, m.index + v.length, voisinage)) out.push(v);
  }
  RE_EXPANSION_SHELL.lastIndex = 0;
  while ((m = RE_EXPANSION_SHELL.exec(texte)) !== null) {
    const v = m[1];
    const debut = m.index + m[0].indexOf(v);
    if (valeurEstSuspecte(v, texte, debut, debut + v.length, voisinage)) out.push(v);
  }
  return out;
}

// Une ligne portant ce marqueur est laissee passer : fixture de test, exemple
// de documentation. C'est l'echappatoire fine, a preferer a --no-verify.
const RE_DEROGATION = /(?:secret-ok|gitleaks:allow|allow-secret)/i;

// Chemins ou un motif de secret est un ELEMENT DE CODE, pas un secret.
const CHEMINS_EXEMPTES = [
  /^\.githooks\/detect-secrets\.js$/,
  // Le registre d exemptions ne porte QUE des empreintes sha-256, jamais des
  // valeurs — et son format est verifie ligne a ligne juste en dessous. Sans
  // cette exemption il se condamnerait lui-meme : 64 caracteres hexadecimaux
  // poses a cote du mot « secret » sont exactement ce que la regle d entropie
  // cherche. L exemption de chemin ne cree pas de trou : une VALEUR collee dans
  // ce fichier n a pas la forme d une entree, donc elle fait ECHOUER la lecture
  // et refuse le commit, au lieu de s y cacher.
  /^\.secrets-connus$/,
];

// ---------------------------------------------------------------------------
// `.secrets-connus` — L ECHAPPATOIRE DES FORMATS SANS COMMENTAIRE
// (2026-08-09, tache 8ce1d6b9)
//
// LE PROBLEME QU IL RESOUT. `secret-ok` s ecrit dans un COMMENTAIRE. JSON, CSV,
// un dump SQL, un fichier minifie n en ont pas : un faux positif dans ces
// formats-la n a AUCUNE issue. Il ne se marque pas, donc il reste. Le depot
// devient bruyant en permanence, et un depot bruyant en permanence finit
// desarme ou contourne au `--no-verify` — c est-a-dire nu, en se croyant garde.
// Mesure fondatrice : `maj-divi5-zeller`, 102 detections en pire cas, dont 92
// sur UNE SEULE valeur, dans quatre releves PageSpeed en JSON. De loin le plus
// gros residu du parc, et le seul qu on ne pouvait pas traiter.
//
// CE QU IL N EST PAS. Ce n est ni une exemption de chemin, ni un assouplissement
// de regle, ni un `--no-verify` en fichier :
//   - il porte UNE VALEUR, designee par son empreinte sha-256, pas un fichier ni
//     un dossier. Une autre valeur dans le meme fichier rougit toujours ;
//   - il est BORNE A UNE REGLE. La meme empreinte sous une autre regle n exempte
//     rien ;
//   - il exige une JUSTIFICATION ECRITE, sans quoi la lecture echoue ;
//   - il est VERSIONNE : il se lit dans l INDEX git, pas sur le disque. Une
//     exemption non indexee n exempte rien — elle serait invisible en revue et
//     ne vaudrait que sur le poste qui l a posee ;
//   - il ne cite JAMAIS la valeur. Une empreinte sha-256 ne se remonte pas : le
//     registre peut donc etre publie, la valeur non. C est la raison du drapeau
//     `empreintable`, reserve aux regles a valeur structurellement longue.
//
// FORMAT, une entree par ligne, `#` commence un commentaire :
//     <sha-256 en 64 hexadecimaux minuscules>  <nom-de-regle>  # <justification>
//
// TOUTE ANOMALIE ARRETE LE COMMIT, elle n est jamais ignoree « au mieux » : une
// ligne illisible, une regle inconnue, une regle non empreintable, une
// justification vide, un fichier present sur le disque mais absent de l index.
// Un registre d exemptions qui se lit a moitie est pire que pas de registre.
// ---------------------------------------------------------------------------
const FICHIER_CONNUS = '.secrets-connus';
const RE_ENTREE_CONNUE = /^([0-9a-f]{64})\s+([a-z0-9-]+)\s+#\s*(\S.*)$/;

const empreinteDe = (v) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');

// Les regles sont ecrites sans `g` (elles servent a `test`). Pour lister TOUTES
// les valeurs d une ligne il faut une copie globale — memoisee, une par regle.
const GLOBALES = new Map();
function motifGlobal(r) {
  if (!GLOBALES.has(r.nom)) {
    GLOBALES.set(r.nom, new RegExp(r.re.source, r.re.flags.includes('g') ? r.re.flags : r.re.flags + 'g'));
  }
  const g = GLOBALES.get(r.nom);
  g.lastIndex = 0;
  return g;
}

function refuserRegistre(motif) {
  console.error('');
  console.error('COMMIT REFUSE : ' + FICHIER_CONNUS + ' est illisible.');
  console.error('  ' + motif);
  console.error('  Format attendu, une entree par ligne :');
  console.error('    <sha-256 en 64 hexadecimaux>  <nom-de-regle>  # <justification>');
  console.error('  Le fichier doit etre INDEXE (git add ' + FICHIER_CONNUS + ') : une');
  console.error('  exemption non versionnee n exempte rien.');
  console.error('');
  process.exit(1);
}

// Memoise par racine : le hook n analyse qu une fois, mais la MESURE en pire cas
// appelle `analyser` une fois par fichier suivi. Sans memo, chaque fichier
// relancerait un `git show` — la mesure du parc passait de secondes a des
// dizaines de minutes, et une mesure qu on n a pas le temps de rejouer ne se
// rejoue pas.
const CACHE_CONNUS = new Map();

// Rend un Set de cles « <empreinte>|<regle> ». Vide si le registre n existe pas.
function lireConnus(racine) {
  const cle = racine || '.';
  if (CACHE_CONNUS.has(cle)) return CACHE_CONNUS.get(cle);
  const r = calculerConnus(racine);
  CACHE_CONNUS.set(cle, r);
  return r;
}

function calculerConnus(racine) {
  const nomsEmpreintables = new Set(REGLES_MOTIF.filter((r) => r.empreintable).map((r) => r.nom));
  const nomsConnus = new Set(REGLES_MOTIF.map((r) => r.nom));

  let indexe = null;
  try {
    // stderr etouffe VOLONTAIREMENT : l absence du fichier est le cas NORMAL (la
    // quasi-totalite des depots n en a pas), et git ecrit alors un « fatal: »
    // sur stderr. Laisse tel quel, chaque commit du parc afficherait une erreur
    // fatale mensongere — et une garde qui a l air cassee se fait desinstaller.
    indexe = git(['show', ':' + FICHIER_CONNUS], racine, ['ignore', 'pipe', 'ignore']);
  } catch (e) {
    indexe = null;   // absent de l index : cas normal, la plupart des depots n en ont pas.
  }

  // Le disque ne fait pas foi, mais son DESACCORD avec l index doit se voir : sans
  // ce controle, une exemption ecrite et jamais indexee serait silencieusement sans
  // effet (ou, pire, une exemption retiree du disque resterait active).
  let surDisque = null;
  try {
    surDisque = fs.readFileSync(path.join(racine || '.', FICHIER_CONNUS), 'utf8');
  } catch (e) {
    surDisque = null;
  }
  // Comparaison a fins de ligne normalisees : sous Windows `core.autocrlf` rend le
  // disque en CRLF et l index en LF. Sans cette normalisation le controle rougirait
  // en permanence, et se ferait donc retirer.
  const sansCR = (s) => (s === null ? null : s.replace(/\r\n/g, '\n'));
  if (surDisque !== null && indexe === null) {
    refuserRegistre(FICHIER_CONNUS + ' existe sur le disque mais n est pas indexe.');
  }
  if (surDisque !== null && indexe !== null && sansCR(surDisque) !== sansCR(indexe)) {
    refuserRegistre('le contenu indexe de ' + FICHIER_CONNUS + ' differe de celui du disque'
      + ' — c est la version INDEXEE qui ferait foi, indexe tes modifications.');
  }
  if (indexe === null) return new Set();

  const connus = new Set();
  const lignes = sansCR(indexe).split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const brute = lignes[i];
    const l = brute.trim();
    if (l === '' || l.startsWith('#')) continue;
    const m = RE_ENTREE_CONNUE.exec(l);
    if (!m) {
      refuserRegistre('ligne ' + (i + 1) + ' : ni vide, ni commentaire, ni entree valide.');
    }
    const [, emp, regle] = m;
    if (!nomsConnus.has(regle)) {
      refuserRegistre('ligne ' + (i + 1) + ' : la regle "' + regle + '" n existe pas.');
    }
    if (!nomsEmpreintables.has(regle)) {
      refuserRegistre('ligne ' + (i + 1) + ' : la regle "' + regle + '" n est pas exemptable par'
        + ' empreinte (valeur trop courte ou trop ambigue pour qu une empreinte la designe sans'
        + ' la trahir). Utilise le marqueur secret-ok sur la ligne concernee.');
    }
    connus.add(emp + '|' + regle);
  }
  return connus;
}

// Vrai si la regle tire sur cette ligne UNIQUEMENT a cause de valeurs deja jugees
// et inscrites au registre. Une seule valeur non inscrite suffit a refuser : c est
// ce qui empeche une entree de degenerer en exemption de fichier.
function toutesValeursConnues(r, texte, connus) {
  if (!r.empreintable || connus.size === 0) return false;
  const g = motifGlobal(r);
  let m;
  let n = 0;
  while ((m = g.exec(texte)) !== null) {
    n++;
    if (!connus.has(empreinteDe(m[0]) + '|' + r.nom)) return false;
    if (m[0].length === 0) break;   // garde-fou : un motif vide bouclerait
  }
  return n > 0;
}

function git(args, cwd, stdio) {
  return execFileSync('git', args, {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, cwd, stdio,
  });
}

// `options.racine` : le depot a interroger. Indispensable a la mesure en pire cas,
// qui analyse un depot AUTRE que le repertoire courant — sans elle, le registre
// d exemptions lu serait celui du mauvais depot et le compte mentirait.
function analyser(diffFourni, options) {
  const racine = (options && options.racine) || undefined;
  // -U<CONTEXTE_LIGNES> et non -U0 : voir le bloc « LE VOISINAGE DEBORDE LE DIFF » plus bas.
  // On ne JUGE toujours que les lignes AJOUTEES ; les lignes inchangees rendues ici servent
  // uniquement de voisinage, jamais de source de litteral.
  // --no-color / --no-ext-diff : pas de pilote de diff externe qui masquerait
  // le contenu reel (un .gitattributes `diff=` rendrait la garde aveugle).
  let diff = diffFourni;
  if (diff === undefined) {
    try {
      diff = git(['diff', '--cached', '-U' + CONTEXTE_LIGNES, '--no-color', '--no-ext-diff',
                  '--diff-filter=ACMR'], racine);
    } catch (e) {
      console.error('pre-commit: impossible de lire l index git : ' + e.message);
      process.exit(1);
    }
  }

  // PREMIERE PASSE : extraire les lignes AJOUTEES (les seules jugees) et les lignes
  // INCHANGEES rendues par -U<CONTEXTE_LIGNES> (qui ne servent que de voisinage). Le
  // voisinage se calcule sur ces listes, il ne peut donc pas se lire au fil du parcours
  // — d ou les deux passes.
  const ajoutees = [];
  const inchangees = [];
  {
    let fichierCourant = null;
    let n = 0;
    for (const ligne of diff.split('\n')) {
      if (ligne.startsWith('+++ ')) {
        const p = ligne.slice(4);
        fichierCourant = p === '/dev/null' ? null : p.replace(/^b\//, '');
        continue;
      }
      if (ligne.startsWith('--- ')) continue;   // en-tete, pas une suppression
      if (ligne.startsWith('@@')) {
        const m = ligne.match(/^@@ -\S+ \+(\d+)/);
        n = m ? parseInt(m[1], 10) : 0;
        continue;
      }
      // Une ligne de contexte commence par UNE espace ; une ligne supprimee par '-' (elle
      // n existe pas dans le fichier d arrivee, donc elle n avance pas le compteur et ne
      // peut pas servir de voisinage) ; « \ No newline at end of file » par '\'. Tout le
      // reste (`diff --git`, `index`, `new file mode`...) est un en-tete a ignorer.
      const ajoutee = ligne.startsWith('+') && !ligne.startsWith('+++');
      const contexte = ligne.startsWith(' ');
      if (!ajoutee && !contexte) continue;
      const numero = n++;
      if (!fichierCourant) continue;
      (ajoutee ? ajoutees : inchangees).push({
        fichier: fichierCourant, numero, texte: ligne.slice(1),
      });
    }
  }

  // Index par fichier : le voisinage ne franchit jamais cette frontiere.
  const parFichier = new Map();
  const inchangeesParFichier = new Map();
  for (const [source, index] of [[ajoutees, parFichier], [inchangees, inchangeesParFichier]]) {
    for (const a of source) {
      if (!index.has(a.fichier)) index.set(a.fichier, []);
      index.get(a.fichier).push(a);
    }
  }

  // Voisinage d une ligne : les lignes du MEME fichier — ajoutees OU inchangees — dont le
  // numero est a CONTEXTE_LIGNES ou moins. Le critere est le numero de ligne, pas la
  // position dans le tableau : deux hunks distants de 400 lignes ne doivent pas se voir.
  const proches = (liste, a) =>
    (liste || [])
      .filter((o) => o !== a && Math.abs(o.numero - a.numero) <= CONTEXTE_LIGNES)
      .map((o) => o.texte);
  const voisinageDe = (a) =>
    proches(parFichier.get(a.fichier), a)
      .concat(proches(inchangeesParFichier.get(a.fichier), a))
      .join('\n');

  const trouvailles = [];
  // Lu UNE fois par analyse : chaque appel est un `git show`, et le pire cas en
  // rejoue un par fichier du depot.
  const connus = lireConnus(racine);

  for (const ajout of ajoutees) {
    const { fichier, numero, texte } = ajout;
    if (CHEMINS_EXEMPTES.some((re) => re.test(fichier))) continue;
    if (RE_DEROGATION.test(texte)) continue;

    for (const r of REGLES_MOTIF) {
      if (!r.re.test(texte)) continue;
      if (toutesValeursConnues(r, texte, connus)) continue;
      trouvailles.push({ fichier, numero, r });
    }

    // Le gabarit « 4 groupes de 4 » se cherche a part : RE_ASSIGNATION s arrete au
    // premier blanc, elle ne peut pas voir une valeur a espaces.
    const mg = RE_MDP_APPLICATION.exec(texte);
    if (mg && cleSensible(mg[1]) && !valeurRepeteLaCle(mg[1], mg[2])) {
      trouvailles.push({
        fichier, numero,
        r: { nom: 'assignation-sensible',
             desc: 'assignation "' + mg[1] + '=" avec une valeur d allure secrete' },
      });
    }

    RE_ASSIGNATION.lastIndex = 0;
    let m;
    while ((m = RE_ASSIGNATION.exec(texte)) !== null) {
      if (cleSensible(m[1]) && valeurPlausible(m[2], true) && !valeurRepeteLaCle(m[1], m[2])) {
        trouvailles.push({
          fichier, numero,
          r: { nom: 'assignation-sensible',
               desc: 'assignation "' + m[1] + '=" avec une valeur d allure secrete' },
        });
        break; // une trouvaille par ligne suffit a la refuser
      }
    }

    if (litterauxSuspects(texte, voisinageDe(ajout)).length) {
      trouvailles.push({
        fichier, numero,
        r: { nom: 'litteral-haute-entropie',
             desc: 'chaine longue et opaque pres d une ligne parlant de jeton/secret' },
      });
    }
  }
  return trouvailles;
}

// Utilisable comme module : c'est ainsi que le taux de faux positifs se mesure
// sur les commits deja faits, avant d'imposer la garde a tout le monde.
if (require.main !== module) {
  module.exports = { analyser };
  return;
}

const t = analyser();
if (t.length === 0) process.exit(0);

const L = console.error;
L('');
L('==============================================================');
L(' COMMIT REFUSE : ' + t.length + ' secret(s) potentiel(s) dans l index');
L('==============================================================');
for (const f of t) {
  L('  ' + f.fichier + ':' + f.numero + '  [' + f.r.nom + ']');
  L('      ' + f.r.desc);
}
L('');
L(' Aucune valeur n est affichee ici, volontairement : ouvre le fichier');
L(' a la ligne indiquee pour voir de quoi il s agit.');
L('');
L(' QUE FAIRE');
L('   1. Vraie fuite  -> sors la valeur du fichier, mets-la dans ~/.claude/.env');
L('                      puis lis-la depuis le .env (le .env n est pas versionne).');
L('      Si elle a deja ete poussee, la ROTATION est le seul remede.');
L('   2. Faux positif -> ajoute le marqueur  secret-ok  en commentaire SUR LA');
L('                      LIGNE concernee. C est trace, relisible, et borne a');
L('                      cette ligne.');
L('   3. En dernier recours : git commit --no-verify  (voir .githooks/README.md)');
L('');
process.exit(1);
