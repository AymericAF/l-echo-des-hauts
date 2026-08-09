#!/usr/bin/env node
// Recette du détecteur de secrets. Il n'en avait AUCUNE avant le 2026-08-06 — c'est ce qui a
// permis à deux passages successifs de conclure de travers sur son comportement.
//
// POURQUOI UNE RECETTE D'INTÉGRATION ET PAS DES TESTS UNITAIRES : le détecteur n'exporte rien,
// il lit `git diff --cached`. Le tester par ses fonctions internes reviendrait à tester une
// copie de sa logique, pas le chemin qu'il emprunte réellement. Chaque cas construit donc un
// dépôt jetable, y met une sonde à l'index, et lit le CODE DE SORTIE.
//
// DEUX PIÈGES DE MÉTHODE, rencontrés pour de vrai, que cette recette évite par construction :
//  1. `.gitignore` de ~/.claude porte `_*` (ligne 55) : une sonde nommée `_s2.sh` n'atteint
//     JAMAIS l'index, et le code 0 obtenu mesure alors la méthode, pas le détecteur.
//  2. Un dépôt sans HEAD ne rend aucun diff. Le commit initial vide n'est pas décoratif.
//
// Usage : node .githooks/detect-secrets.recette.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DETECTEUR = join(ICI, 'detect-secrets.js');

// Valeur INVENTÉE, jamais un vrai secret : 48 caractères hexadécimaux.
// Le marqueur `secret-ok` est nécessaire depuis que le voisinage déborde la ligne (2026-08-06) :
// les lignes alentour parlent de secrets, donc cette constante se fait détecter par la garde
// qu'elle sert à tester. Marqueur de ligne plutôt qu'exemption du fichier : si un VRAI secret
// atterrissait ailleurs dans cette recette, il serait encore attrapé.
const FAUX = 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f7081'; // secret-ok

// --- Valeurs Stripe : la FORME du préfixe, jamais une valeur valide. ---------
//
// POURQUOI LES QUATRE PREMIÈRES SONT ASSEMBLÉES À L'EXÉCUTION, et pas écrites
// d'une pièce : parce que la première version l'était, et que **GitHub a refusé
// le push** — sa propre protection les a lues comme des clés Stripe réelles
// (« Stripe Live API Restricted Key », `remote rejected` sur `l-echo-des-hauts`).
// C'est une bonne nouvelle sur le fond — la FORME suffit à un détecteur sérieux,
// ce qui est exactement la thèse de ces règles — mais un fichier de recette qui
// ne peut pas être poussé, ou qui déclenche une alerte de sécurité sur 26 dépôts,
// est inutilisable.
//
// La concaténation résout les deux : le fichier SOURCE ne contient jamais la
// chaîne complète, donc ni GitHub ni la garde locale ne la voient ; mais à
// l'exécution la valeur assemblée est écrite en entier dans le dépôt jetable, et
// c'est bien la forme complète que le détecteur juge. Le test n'est pas affaibli.
// NE PAS « simplifier » en recollant les morceaux : le push casserait.
//
// Les deux clés PUBLIABLES, elles, sont écrites d'une pièce EXPRÈS : si
// l'exemption `RE_PUBLIABLE` régressait, ce fichier ne pourrait plus être
// commité. La recette est alors sa propre épreuve, dans le vrai dépôt.
const SK_LIVE = 'sk_live_' + 'B7k2Qm9Xt4Rw6Nz1Ha3Vd5Cy';
const RK_LIVE = 'rk_live_' + 'D3f8Jn5Lp2Sv7Bx4Gt6Kq9Mw';
const WHSEC   = 'whsec_'   + 'T5y8Uc2Ie4Op6As1Df3Gh7Jk9Lz';
const SK_TEST = 'sk_test_' + 'H6g4Fd2Sa8Zx5Cv3Bn1Mk7Jl9';
const PK_LIVE = 'pk_live_Z4x7Cv1Bn8Mq3Wr5Ty6Ui2Op0';
const PK_TEST = 'pk_test_Q1w2E3r4T5y6U7i8O9p0A1s2D3';

// --- Valeurs des TROIS ANGLES MORTS (2026-08-08, tâche b01265b7) --------------
// Inventées, assemblées à l'exécution pour la même raison que les valeurs Stripe
// ci-dessus : le fichier SOURCE ne porte jamais la chaîne complète.
//   HEX40   : 40 caractères hexadécimaux minuscules — la forme EXACTE du jeton du
//             registre npm privé, et celle d'un sha git. C'est toute la difficulté :
//             la valeur ne dit rien, seule la CLÉ distingue les deux.
//   MDP_APP : 4 groupes de 4 lettres minuscules — la forme sous laquelle Google
//             AFFICHE ses mots de passe d'application, donc celle sous laquelle ils
//             sont collés.
const HEX40 = 'b3f9' + 'a12c' + '7d54' + '0e6b' + '81aa' + '2f37' + 'c9d0' + '4e15' + '6a82' + 'bb7c';
const MDP_APP = 'wqzl' + ' ' + 'mnbv' + ' ' + 'trfe' + ' ' + 'hjkd';
const JETON_NPM = 'Kf7Q2' + 'mZt9Rw4Nx1Hb3Vd5Cy8Ju6Le0Ap2Sg';

// --- URL portant des identifiants (2026-08-09, tâche 7bdeca91) ----------------
// Mot de passe INVENTÉ, et surtout : la chaîne complète `schéma://user:mdp@hôte`
// est ASSEMBLÉE À L'EXÉCUTION, pour la même raison que les valeurs Stripe plus
// haut. Écrite d'une pièce, elle ferait refuser le commit de la recette par la
// règle que ces cas servent à éprouver — et ici aucun marqueur `secret-ok` ne
// sauverait les cas JSON, qui n'ont pas de commentaire.
const MDP_URL = 'Zt7Rq2' + 'Wm9Xb4';
const dsn = (schema, user, mdp, reste) => schema + '://' + user + ':' + mdp + '@' + reste;

// --- Clés d'API Google (2026-08-09, tâche 8ce1d6b9) ---------------------------
// INVENTÉES, assemblées à l'exécution — même raison que les valeurs Stripe : la
// protection de push de GitHub lit `AIza`+35 comme une clé Google réelle, et un
// fichier de recette qui ne peut pas être poussé sur 38 dépôts est inutilisable.
//
// LA LONGUEUR EST VÉRIFIÉE À L'EXÉCUTION, pas supposée : une valeur assemblée
// d'un caractère trop court ne serait plus reconnue par la règle, et TOUS les cas
// ci-dessous vireraient au vert sans rien éprouver. Un témoin qui ne mord plus
// doit s'effondrer bruyamment, pas passer.
const CLE_G_A = 'AIza' + 'Sy' + 'Bq7Xm2Td9Rw4Nz1Hb3Vd5Cy8Ju6Le0Ap2';
const CLE_G_B = 'AIza' + 'Sy' + 'Cx8Yn3Ue0Sv5Oa2Ic4We6Dz9Kv7Mf1Bq3';
for (const [nom, v] of [['CLE_G_A', CLE_G_A], ['CLE_G_B', CLE_G_B]]) {
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(v)) {
    throw new Error(`recette inutilisable : ${nom} n a pas la forme AIza+35 (longueur ${v.length}) — `
      + 'les cas cle-api-google ne prouveraient plus rien.');
  }
}
const empreinte = (v) => createHash('sha256').update(v).digest('hex');

const CAS = [
  { nom: 'mot-clé et littéral sur la MÊME ligne', fichier: 'a.js',
    contenu: `const token = "${FAUX}";\n`, attendu: 'refuse' },

  { nom: 'expansion shell ${VAR:-<secret>}', fichier: 'b.sh',
    contenu: `TOKEN="\${RD_TOKEN:-${FAUX}}"\n`, attendu: 'refuse' },

  { nom: 'expansion shell ${VAR=<secret>}', fichier: 'c.sh',
    contenu: `PASSWORD="\${P=${FAUX}}"\n`, attendu: 'refuse' },

  // L'ANGLE MORT EST FERMÉ (2026-08-06, tâche 34663a22). Ce cas attendait « passe » : le
  // voisinage se mesurait sur la LIGNE PHYSIQUE, donc un mot-clé une ligne plus haut était
  // invisible — la forme la plus courante en JS, JSON et PHP. Le détecteur regarde désormais
  // un contexte de quelques lignes AJOUTÉES du même fichier.
  { nom: 'mot-clé une ligne plus haut', fichier: 'd.js',
    contenu: `const token = process.env.X;\nconst EXPECTED = "${FAUX}";\n`, attendu: 'refuse' },

  // BORNE HAUTE : au-delà d'UNE ligne, le mot-clé ne porte plus. Ce n'est pas une valeur
  // choisie au jugé — elle a été MESURÉE sur les 2 962 fichiers suivis du dépôt, en pire cas
  // (chaque fichier présenté comme entièrement ajouté) :
  //     N=0 (avant) : 17 détections      N=2 : 29  (+12)
  //     N=1 (retenu): 24 détections (+7) N=3 : 37  (+20)
  // À N=1, les 7 nouvelles portent TOUTES sur trois pages HTML archivées et figées
  // (hachages de bundle CSS, nonces Cloudflare publics) : aucun fichier vivant. À N=3,
  // `scripts/backup-supabase.sh` se met à rougir parce que son commentaire d'en-tête parle
  // de jeton — un faux positif sur un fichier qui, lui, change encore.
  // Sans ce cas de borne, rien n'empêcherait d'élargir jusqu'au fichier entier, et tout
  // fichier parlant de « token » quelque part condamnerait chacun de ses littéraux longs.
  { nom: 'BORNE : mot-clé 3 lignes plus haut → hors de portée', fichier: 'd3.js',
    contenu: `const token = process.env.X;\nconst a = 1;\nconst b = 2;\nconst EXPECTED = "${FAUX}";\n`,
    attendu: 'passe' },

  // Le contexte étendu doit valoir dans LES DEUX SENS pour les exemptions : une empreinte
  // annoncée une ligne plus haut protège le littéral, sinon élargir le voisinage
  // fabriquerait des faux positifs sur tous les fichiers de sommes de contrôle.
  { nom: 'faux positif : « sha256 » une ligne plus haut protège le littéral', fichier: 'i.js',
    contenu: `// token attendu, empreinte sha256 du paquet\nconst EXPECTED = "${FAUX}";\n`,
    attendu: 'passe' },

  // Un fichier d'un autre nom ne doit pas contaminer : le contexte est borné AU FICHIER.
  { nom: 'faux positif : mot-clé dans un AUTRE fichier du même commit', fichier: 'j.js',
    contenu: `const EXPECTED = "${FAUX}";\n`, fichierAnnexe: 'k.js',
    contenuAnnexe: 'const token = process.env.X;\n', attendu: 'passe' },

  { nom: 'faux positif : expansion à valeur vide', fichier: 'e.sh',
    contenu: 'TOKEN="${RD_TOKEN:-}"\n', attendu: 'passe' },

  { nom: 'faux positif : URL longue en valeur par défaut', fichier: 'f.sh',
    contenu: 'URL="${BASE:-https://exemple.fr/api/v1/endpoint-assez-long-pour-32}"\n', attendu: 'passe' },

  { nom: 'faux positif : sha git de 40 caractères', fichier: 'g.sh',
    contenu: 'SHA="${ATTENDU:-a1b2c3d4e5f6071829304152637485960718293a}"\n', attendu: 'passe' },

  { nom: 'faux positif : ligne sans mot-clé de secret', fichier: 'h.js',
    contenu: `const identifiant = "${FAUX}";\n`, attendu: 'passe' },

  // LE VOISINAGE DÉBORDE AUSSI LE DIFF (2026-08-08). Les quatre cas ci-dessous sont les seuls
  // à porter un `base` : le fichier PRÉEXISTE et n'est que modifié, donc le mot-clé vit sur une
  // ligne INCHANGÉE. Un diff `-U0` ne la rend pas — c'est ainsi que la garde, verte sur tous les
  // cas ci-dessus (des fichiers neufs, où tout est « ajouté »), laissait passer la forme la plus
  // banale d'une fuite : ajouter une valeur sous une déclaration qui existe déjà.
  { nom: 'CONTEXTE : mot-clé sur une ligne EXISTANTE au-dessus', fichier: 'l.js',
    base: `const token = process.env.X;\nconst autre = 1;\n`,
    contenu: `const token = process.env.X;\nconst EXPECTED = "${FAUX}";\nconst autre = 1;\n`,
    attendu: 'refuse' },

  { nom: 'CONTEXTE : mot-clé sur une ligne EXISTANTE en dessous', fichier: 'm.js',
    base: `const autre = 1;\nconst token = process.env.X;\n`,
    contenu: `const autre = 1;\nconst EXPECTED = "${FAUX}";\nconst token = process.env.X;\n`,
    attendu: 'refuse' },

  // BORNE, côté lignes inchangées : le même élargissement ne doit pas porter plus loin que
  // CONTEXTE_LIGNES. Sans ce cas, on pourrait passer à `-U5` sans que rien ne rougisse.
  { nom: 'BORNE : mot-clé EXISTANT 3 lignes plus haut → hors de portée', fichier: 'n.js',
    base: `const token = process.env.X;\nconst a = 1;\nconst b = 2;\nconst c = 3;\n`,
    contenu: `const token = process.env.X;\nconst a = 1;\nconst b = 2;\nconst EXPECTED = "${FAUX}";\nconst c = 3;\n`,
    attendu: 'passe' },

  // Une ligne SUPPRIMÉE n'est pas un voisinage : elle n'existe plus dans le fichier d'arrivée.
  // Si elle comptait, retirer un `token` d'un fichier rendrait suspecte la ligne qui le remplace.
  { nom: 'BORNE : mot-clé sur une ligne SUPPRIMÉE ne compte pas', fichier: 'o.js',
    base: `const token = process.env.X;\n`,
    contenu: `const EXPECTED = "${FAUX}";\n`, attendu: 'passe' },

  // --- Calibrage du 2026-08-08 (balayage des dépôts de ~/projects). ---------------------
  // `api_key` se découpe en [api, key] : `key` étant un qualificatif, la clé la plus
  // répandue au monde était désamorcée SANS CONDITION, et sa valeur non quotée échappe
  // aussi au littéral (qui exige des guillemets). Deux règles côte à côte, deux angles
  // morts qui se recouvraient : `api_key=<valeur>` dans un `.env` passait entièrement.
  { nom: 'api_key= non quoté (le trou du qualificatif « key »)', fichier: 'p.env',
    contenu: `api_key=${FAUX}\n`, attendu: 'refuse' },
  { nom: 'access_key / private_key suivent la même règle', fichier: 'q.sh',
    contenu: `access_key=${FAUX}\n`, attendu: 'refuse' },
  // Le qualificatif doit continuer de désamorcer quand il NOMME le secret sans l'être.
  // La valeur n'est PAS un littéral à haute entropie : sinon la seconde règle refuserait la
  // ligne pour une autre raison, et le cas ne mesurerait plus le désamorçage qu'il vise.
  { nom: 'BORNE : tokenName reste désamorcé', fichier: 'r.js',
    contenu: `const tokenName = "jeton-de-service-principal";\n`, attendu: 'passe' },

  // Faux positifs mesurés sur les dépôts, corrigés par le vocabulaire de gabarit.
  { nom: 'faux positif : credentials fetch « same-origin »', fichier: 's.js',
    contenu: `fetch(u, { credentials: 'same-origin' });\n`, attendu: 'passe' },
  { nom: 'faux positif : TOKEN_OPTION nomme un réglage', fichier: 't.php',
    contenu: `<?php const TOKEN_OPTION = 'maint_backup_token';\n`, attendu: 'passe' },
  { nom: 'faux positif : valeur « jeton-test » d une fixture', fichier: 'u.js',
    contenu: `const env = { N8N_TOKEN: 'jeton-test' };\n`, attendu: 'passe' },
  { nom: 'faux positif : « If tests pass: Continue » dans une doc', fichier: 'v.md',
    contenu: `- If tests pass: Continue\n`, attendu: 'passe' }, // secret-ok : la sonde EST le faux positif

  // --- Règles à MOTIF NOMMÉ (2026-08-08, tâche 6437c6d3). ------------------------------
  // LE CAS DÉCISIF EST LE PREMIER. La clé secrète Stripe LIVE d'un client n'avait été
  // trouvée par le balayage que grâce à la règle d'ENTROPIE, et seulement parce qu'un mot
  // parlant de secret traînait dans les 80 caractères voisins. Le contenu de ce cas est
  // donc la clé SEULE, sur une ligne seule, dans un fichier qui ne dit rien d'autre : c'est
  // exactement la situation où elle passait, et rien ne doit plus la sauver.
  { nom: 'NOMMÉ : sk_live_ SEUL, aucun mot parlant de secret alentour', fichier: 'w1.txt',
    contenu: `${SK_LIVE}\n`, attendu: 'refuse' },
  { nom: 'NOMMÉ : rk_live_ (clé restreinte, secrète elle aussi) SEUL', fichier: 'w2.txt',
    contenu: `${RK_LIVE}\n`, attendu: 'refuse' },
  { nom: 'NOMMÉ : whsec_ SEUL (signature de webhook Stripe)', fichier: 'w3.txt',
    contenu: `${WHSEC}\n`, attendu: 'refuse' },

  // BORNE : sans cette exigence de longueur, le PRÉFIXE cité dans de la documentation
  // suffirait à refuser le commit — y compris celui de ce README. Une règle nommée qui
  // rougit sur sa propre notice se fait désinstaller.
  { nom: 'BORNE : le préfixe sk_live_ cité seul en doc ne suffit pas', fichier: 'w4.md',
    contenu: `Les clés commencant par sk_live_ sont des secrets.\n`, attendu: 'passe' },

  // L'AUTRE SENS, obligatoire : une clé PUBLIABLE doit passer. Une règle nommée qui crie
  // sur une clé destinée au navigateur se fait désarmer, et c'est toute la garde qui tombe.
  { nom: 'PUBLIABLE : pk_live_ seul passe', fichier: 'x1.txt',
    contenu: `${PK_LIVE}\n`, attendu: 'passe' },
  { nom: 'PUBLIABLE : pk_test_ seul passe', fichier: 'x2.txt',
    contenu: `${PK_TEST}\n`, attendu: 'passe' },
  // Le cas qui compte vraiment : la clé publiable posée sous un nom PARLANT. C'est l'usage
  // NORMAL de Stripe côté front, et c'est là que les règles génériques la signaleraient.
  { nom: 'PUBLIABLE : pk_live_ sous un nom parlant reste muet', fichier: 'x3.js',
    contenu: `const stripe_api_key = "${PK_LIVE}";\n`, attendu: 'passe' },

  // ARBITRAGE sk_test_ (2026-08-08) : ni règle nommée, ni exemption. Une clé de test
  // n'ouvre ni argent ni données réelles — ce n'est pas une fuite, donc pas de refus
  // inconditionnel qui rougirait sur toutes les fixtures d'intégration. Mais elle n'est pas
  // publiable par construction — donc pas d'exemption non plus. Elle reste soumise aux
  // règles génériques : MUETTE isolée, SIGNALÉE sous un nom parlant. Les deux cas ci-dessous
  // fixent cet arbitrage ; s'ils changent, c'est que quelqu'un a tranché autrement.
  { nom: 'ARBITRAGE : sk_test_ isolé passe (pas de règle nommée)', fichier: 'y1.txt',
    contenu: `${SK_TEST}\n`, attendu: 'passe' },
  { nom: 'ARBITRAGE : sk_test_ sous un nom parlant est signalé (pas d exemption)',
    fichier: 'y2.env', contenu: `STRIPE_SECRET_KEY=${SK_TEST}\n`, attendu: 'refuse' },

  // Le trou frère de celui d'`api_key` (commit e3d9a0e) : `secret_key` se découpe en
  // [secret, key], `key` est un qualificatif, et `secretkey` manquait à MOTS_SECRET alors
  // qu'`accesskey` et `privatekey` y étaient. Le nom le plus canonique qui soit n'était
  // donc JAMAIS examiné.
  { nom: 'SECRET_KEY= non quoté (le trou frère de api_key)', fichier: 'z1.env',
    contenu: `SECRET_KEY=${FAUX}\n`, attendu: 'refuse' },
  // Le qualificatif doit continuer de désamorcer quand il NOMME le secret sans l'être.
  { nom: 'BORNE : secretKeyName reste désamorcé', fichier: 'z2.js',
    contenu: `const secretKeyName = "nom-de-la-cle-stripe";\n`, attendu: 'passe' },

  // --- RÈGLE DE COMPOSITION (2026-08-08, tâche 249fdfd5) -------------------------------
  // Les deux trous ci-dessus (`api_key`, `SECRET_KEY`) avaient la MÊME cause : le
  // vocabulaire était une ÉNUMÉRATION, et le désamorçage lui demandait si la forme collée
  // `<avant-dernier><dernier>` y figurait. Chaque nom non prévu passait donc en silence.
  // Les cas ci-dessous ne fixent plus des mots, ils fixent la RÈGLE — chacun a été prouvé
  // par mutation : neutraliser la clause visée le fait virer au rouge, et lui seul.

  // MARQUEUR NON ADJACENT. `service` arme `key` À TRAVERS `role`. Exiger l'adjacence
  // aurait raté la clé qui, chez Supabase, contourne toutes les règles de sécurité au
  // niveau ligne — et elle est nommée telle quelle dans tous les `.env` du terrain.
  { nom: 'COMPOSITION : SUPABASE_SERVICE_ROLE_KEY (marqueur non adjacent)', fichier: 'c1.env',
    contenu: `SUPABASE_SERVICE_ROLE_KEY=${FAUX}\n`, attendu: 'refuse' },

  // PORTEUR ARMÉ : `key` seul ne dit RIEN. C'est la contrepartie exacte de sa sortie des
  // qualificatifs — sans ces trois bornes, faire entrer `api_key` reviendrait à faire
  // rougir toute clé de cache, tout index de base et toute clé PUBLIQUE.
  { nom: 'BORNE : CACHE_KEY sans marqueur reste muet', fichier: 'c2.env',
    contenu: `CACHE_KEY=${FAUX}\n`, attendu: 'passe' },
  { nom: 'BORNE : PRIMARY_KEY sans marqueur reste muet', fichier: 'c3.env',
    contenu: `PRIMARY_KEY=${FAUX}\n`, attendu: 'passe' },
  // `public` n'est PAS un marqueur, et ne doit jamais le devenir : une clé publique est
  // faite pour être lue. Même logique que l'exemption `pk_live_` plus haut.
  { nom: 'BORNE : PUBLIC_KEY reste muet, PRIVATE_KEY non', fichier: 'c4.env',
    contenu: `PUBLIC_KEY=${FAUX}\n`, attendu: 'passe' },
  { nom: 'COMPOSITION : PRIVATE_KEY est signalé', fichier: 'c5.env',
    contenu: `PRIVATE_KEY=${FAUX}\n`, attendu: 'refuse' },

  // DÉCOLLAGE : la forme collée se DÉRIVE, elle n'est plus énumérée. `servicekey` n'a
  // jamais été écrit nulle part — c'est `service` + `key` qui le rendent lisible. C'est
  // ce mécanisme qui remplace la liste qui s'est trouée deux fois.
  { nom: 'COMPOSITION : servicekey collé (dérivé, jamais énuméré)', fichier: 'c6.env',
    contenu: `servicekey=${FAUX}\n`, attendu: 'refuse' },
  // BORNE du décollage : les deux moitiés doivent être des mots CONNUS. Sans elle,
  // `bypass` deviendrait `by` + `pass` et l'on ferait revenir les faux positifs
  // PASSE/PASSAGE que le point 1 du calibrage avait fermés.
  { nom: 'BORNE : bypass ne se décolle pas en by + pass', fichier: 'c7.env',
    contenu: `bypass=${FAUX}\n`, attendu: 'passe' },

  // PORTEUR COMPOSÉ : `PWD` seul est le répertoire courant Unix, présent dans tout script
  // shell ; `DB_PWD` est un mot de passe. Le même mot, deux natures, tranchées par la
  // présence d'un second mot — et non par une exception écrite à la main.
  { nom: 'COMPOSITION : DB_PWD est un mot de passe', fichier: 'c8.env',
    contenu: `DB_PWD=${FAUX}\n`, attendu: 'refuse' },
  { nom: 'BORNE : PWD seul est le répertoire courant Unix', fichier: 'c9.sh',
    contenu: `PWD=/c/Users/aymer/projects/un-chemin-assez-long-pour-passer\n`, attendu: 'passe' },

  // PORTEUR ARMÉ `salt` : les sels de wp-config.php sont de vrais secrets, et cette
  // pratique versionne des dépôts WordPress. `auth` et `nonce` les arment.
  { nom: 'COMPOSITION : AUTH_SALT (sel wp-config) est signalé', fichier: 'ca.env',
    contenu: `AUTH_SALT=${FAUX}\n`, attendu: 'refuse' },

  // LE QUALIFICATIF FINAL DÉSAMORCE TOUJOURS, y compris par-dessus un porteur armé :
  // `API_KEY_HEADER` nomme un en-tête, il n'est pas la clé.
  { nom: 'BORNE : API_KEY_HEADER nomme un en-tête', fichier: 'cb.env',
    contenu: `API_KEY_HEADER=${FAUX}\n`, attendu: 'passe' },

  // VALEUR QUI REFORMULE SA CLÉ. Seul faux positif qu'ait coûté la sortie de `key` des
  // qualificatifs, mesuré sur les 27 dépôts (fichier vendorisé WooCommerce Stripe). Un
  // secret engendré ne reprend jamais les mots de sa propre variable.
  { nom: 'BORNE : la valeur n est qu une reformulation du nom de la clé', fichier: 'cc.php',
    contenu: `<?php const INVALID_API_KEY_ERROR_COUNT_CACHE_KEY = 'invalid_api_key_error_count';\n`,
    attendu: 'passe' },
  // L'AUTRE SENS, obligatoire : cette exemption ne doit PAS aveugler la garde sur un mot
  // de passe choisi par un humain, qui est lui aussi fait de mots.
  { nom: 'BORNE : un mot de passe en clair reste signalé malgré la règle ci-dessus',
    // La sonde EST le cas qu'elle mesure : sans le marqueur de dérogation SUR SA LIGNE,
    // elle se ferait refuser par la garde qu'elle sert à tester, sur les 27 dépôts.
    fichier: 'cd.env', contenu: `DB_PASSWORD=super_secret_pass\n`, attendu: 'refuse' }, // secret-ok

  // --- LES TROIS ANGLES MORTS (2026-08-08, tâche b01265b7) -----------------------------
  // Ils avaient la MÊME cause : un FILTRE D'EXCLUSION appliqué sans regarder le voisinage.
  // Le détecteur croise déjà « littéral » et « clé parlante » ; ces trois trous venaient de
  // ce que trois filtres jugeaient la valeur SEULE, en ignorant la clé qui la porte.

  // 1. VALEURS À ESPACES. `valeurPlausible()` rejetait toute valeur en contenant une, or
  // Google AFFICHE ses mots de passe d'application en 4 groupes de 4 lettres séparés par
  // des espaces — c'est sous cette forme qu'on les colle. C'est par ce trou qu'un accès
  // SMTP/IMAP à la boîte Gmail principale est resté 15 mois exposé.
  // Le correctif naïf (accepter les espaces) est MESURÉ à 10 318 signalements de prose :
  // ce n'est donc pas l'espace qu'on accepte, c'est LE GABARIT, et seulement sous une clé
  // qui nomme un secret.
  { nom: 'ESPACES : mot de passe d application Google sous une clé sensible', fichier: 'e1.env',
    contenu: `GMAIL_APP_PASSWORD=${MDP_APP}\n`, attendu: 'refuse' },
  // Un `.env` porte des commentaires de fin de ligne. Sans cette tolérance, l'ancrage de
  // fin de ligne se laisse défaire par un simple `# boîte pro` — et c'est le genre de
  // détail qui rend une règle vraie en recette et fausse sur le terrain.
  { nom: 'ESPACES : le gabarit suivi d un commentaire de fin de ligne', fichier: 'e1b.env',
    contenu: `SMTP_PASS=${MDP_APP}  # boite pro\n`, attendu: 'refuse' },
  // BORNE : le gabarit se rencontre en prose française. Sans cette borne, on accepte
  // les 10 318 signalements que la mesure a écartés.
  { nom: 'BORNE : phrase ordinaire de quatre mots de quatre lettres', fichier: 'e2.md',
    contenu: `Il faut dire tout cela bien vite ici\n`, attendu: 'passe' },
  { nom: 'BORNE : le gabarit en prose, à côté du mot « password »', fichier: 'e3.md',
    contenu: `Le password sera dans cela dire tout bien note plus bas\n`, attendu: 'passe' },
  // BORNE, l'autre sens : on n'a PAS accepté « toute valeur à espaces sous une clé
  // sensible ». Une phrase reste une phrase, même sous `PASSWORD_POLICY`.
  { nom: 'BORNE : une phrase sous une clé sensible n est pas un secret', fichier: 'e4.env',
    contenu: `PASSWORD_POLICY=au moins douze caracteres dont un chiffre\n`, attendu: 'passe' },

  // 2. LE FILTRE SHA, LE PLUS LARGE DES TROIS. Une valeur de 7 à 40 hexadécimaux
  // minuscules était lue comme un sha git et écartée, SANS REGARDER LA CLÉ. Le jeton du
  // registre npm privé Divi fait exactement 40 hexadécimaux minuscules : il était donc
  // invisible même sous `_authToken`. La règle du sha ne disparaît pas — elle se met à
  // regarder la clé, parce qu'un sha ne s'écrit pas sous un nom de mot de passe.
  { nom: 'SHA : password=<40 hex> (le filtre ignorait la clé)', fichier: 'e5.env',
    contenu: `password=${HEX40}\n`, attendu: 'refuse' },
  { nom: 'BORNE : un vrai sha git isolé passe', fichier: 'e6.sh',
    contenu: `SHA=${HEX40}\n`, attendu: 'passe' },
  { nom: 'BORNE : commit=<40 hex> passe', fichier: 'e7.sh',
    contenu: `commit=${HEX40}\n`, attendu: 'passe' },
  { nom: 'BORNE : un sha cité dans de la prose passe', fichier: 'e8.md',
    contenu: `Le commit ${HEX40} corrige la garde.\n`, attendu: 'passe' },
  // LA MÊME LEÇON, APPLIQUÉE AUX FILTRES VOISINS — c'est la différence entre corriger
  // « le cas du sha » et corriger « un filtre d'exclusion qui ignore la clé ». Les deux
  // ci-dessous vivent dans la même fonction, à une ligne d'écart, et avaient le même
  // défaut. Chacun est mesuré à zéro refus et zéro détection ajoutée sur les 38 dépôts.
  { nom: 'CASSE : password=<40 hex MAJUSCULES> (l angle 2 ne dépend pas de la casse)',
    fichier: 'e8b.env', contenu: `password=${HEX40.toUpperCase()}\n`, attendu: 'refuse' },
  // BORNE : une valeur en majuscules qui n'est PAS de l'hexadécimal reste une référence
  // à une autre variable. C'est la forme normale d'un fichier de configuration propre.
  { nom: 'BORNE : token: N8N_DRIFT_HEARTBEAT_TOKEN reste une référence', fichier: 'e8c.env',
    // secret-ok : dans le SOURCE, le `\n` littéral colle à la valeur et lui ôte sa forme
    // de référence — la sonde se ferait refuser par la garde qu'elle sert à tester.
    contenu: `token: N8N_DRIFT_HEARTBEAT_TOKEN\n`, attendu: 'passe' }, // secret-ok
  { nom: 'UUID : un secret client Azure AD est un GUID', fichier: 'e8d.env',
    // secret-ok : GUID inventé. La sonde EST le cas qu'elle mesure — sans ce marqueur,
    // ajouter cette recette ferait refuser son propre commit sur les 37 copies.
    contenu: `AZURE_CLIENT_SECRET=3f6a2b18-4c7d-4e91-9a02-5d8c71b3ef40\n`, attendu: 'refuse' }, // secret-ok
  // BORNE : les UUID sont omniprésents ici (identifiants de tâche et de projet). Sans
  // clé qui nomme un secret, rien ne change.
  { nom: 'BORNE : un UUID sous une clé quelconque reste muet', fichier: 'e8e.env',
    contenu: `EXECUTION=3f6a2b18-4c7d-4e91-9a02-5d8c71b3ef40\n`, attendu: 'passe' },
  // BORNE : la règle du littéral à haute entropie n'a AUCUNE clé à regarder — son
  // exemption UUID reste donc entière, sinon chaque identifiant cité près du mot
  // « token » ferait rougir un commit.
  { nom: 'BORNE : un UUID près d une ligne parlant de jeton reste muet', fichier: 'e8f.js',
    contenu: `const token = process.env.X;\nconst EXPECTED = "3f6a2b18-4c7d-4e91-9a02-5d8c71b3ef40";\n`,
    attendu: 'passe' },

  // 3. LA CLÉ PRÉFIXÉE D'UN CHEMIN. `//npm.<hôte>/:_authToken=<valeur>` n'était pas vu
  // alors que `authToken=<valeur>` l'était : le `:` du chemin de registre était lu comme
  // le séparateur d'assignation, la clé capturée était VIDE, et le reste de la ligne
  // consommé sans être réexaminé. Ce n'est pas « le cas de npm » : c'est une clé précédée
  // d'un chemin, forme qu'on retrouve dans tout fichier de configuration adressé par URL.
  { nom: 'CHEMIN : //hôte/:_authToken=<valeur> dans un .npmrc', fichier: 'e9.npmrc',
    contenu: `//npm.registre-divi.net/:_authToken=${JETON_NPM}\n`, attendu: 'refuse' },
  // LE CAS RÉEL cumule les angles 2 et 3 : chacun suffisait à lui seul à le rendre
  // invisible. Fermer un seul des deux n'aurait rien changé, et l'aurait fait croire.
  { nom: 'CUMUL : //hôte/:_authToken=<40 hex> (angles 2 et 3 ensemble)', fichier: 'e10.npmrc',
    contenu: `//npm.registre-divi.net/:_authToken=${HEX40}\n`, attendu: 'refuse' },
  { nom: 'BORNE : chemin de registre sans jeton', fichier: 'e11.npmrc',
    contenu: `registry=https://npm.registre-divi.net/\n`, attendu: 'passe' },
  { nom: 'BORNE : //hôte/:always-auth=true ne porte aucune valeur secrète', fichier: 'e12.npmrc',
    contenu: `//npm.registre-divi.net/:always-auth=true\n`, attendu: 'passe' },

  // =========================================================================
  // `url-avec-identifiants` — LA RÈGLE TRAVERSAIT LES GUILLEMETS (2026-08-09,
  // tâche 7bdeca91).
  //
  // Ses trois classes étaient écrites en NÉGATIF (`[^\s/:@]`), c'est-à-dire
  // « tout sauf quatre caractères ». Le guillemet double, la virgule et
  // l'accolade y étaient donc AUTORISÉS — et dans du JSON minifié, où tout le
  // document tient sur une ligne, la règle lisait un nom d'hôte comme
  // utilisateur, le `:` de la CLÉ SUIVANTE comme séparateur, et une adresse
  // e-mail comme `motdepasse@hôte`. Elle voyait `user:pass@hôte` en enjambant
  // TROIS valeurs JSON.
  //
  // Ce n'est pas un assouplissement, c'est une définition corrigée : la
  // RFC 3986 exclut ces caractères de `userinfo` et de `host`. Une URI ne peut
  // PAS en contenir. Les classes sont donc écrites en POSITIF, depuis la RFC :
  //     unreserved  = ALPHA / DIGIT / "-" / "." / "_" / "~"
  //     sub-delims  = "!" "$" "&" "'" "(" ")" "*" "+" "," ";" "="
  //     pct-encoded = "%" HEXDIG HEXDIG
  //     host        = reg-name / IPv4 / IP-literal ("[" IPv6 "]"), puis ":" port
  // plus UNE exception mesurée : les accolades, parce que la forme réelle d'une
  // chaîne de connexion en fichier de configuration est `${DB_PASSWORD}` (cas
  // `INTERPOLATION` ci-dessous, réel, `docker-compose.prod.yml` de deux dépôts).
  // Sans elle le resserrement perdait une détection — mesuré, pas supposé.
  //
  // POURQUOI CES CAS PORTENT UN CHAMP `regle` : le code de sortie ne dit pas QUI
  // a refusé. Un cas « refuse » resterait vert si une autre règle tirait à sa
  // place, et le resserrement pourrait tout casser sans que rien ne rougisse.
  // =========================================================================

  // Détection — ces neuf cas doivent être verts AVANT comme APRÈS. C'est eux qui
  // prouvent que le resserrement ne retire RIEN.
  { nom: 'URL-ID : postgres:// avec mot de passe et port', fichier: 'u1.env',
    contenu: `DATABASE_URL=${dsn('postgres', 'svc_appli', MDP_URL, 'db.exemple.fr:5432/appli')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  { nom: 'URL-ID : mysql:// sur une adresse IPv4', fichier: 'u2.env',
    contenu: `WP_DB=${dsn('mysql', 'root', MDP_URL, '127.0.0.1:3306/wordpress')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  { nom: 'URL-ID : mongodb:// avec chaîne de requête', fichier: 'u3.env',
    contenu: `MONGO=${dsn('mongodb', 'admin', MDP_URL, 'grappe.exemple.net:27017/base?authSource=admin')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  { nom: 'URL-ID : http:// avec mot de passe', fichier: 'u4.md',
    contenu: `Acces intranet : ${dsn('http', 'admin', MDP_URL, 'intranet.exemple.fr/')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  // Un mot de passe correct EST encodé en pourcentage dès qu'il porte un `@` ou
  // un `#`. Une classe RFC qui oublierait `%` laisserait passer la forme la plus
  // propre, donc la plus probable dans une vraie chaîne de connexion.
  { nom: 'URL-ID : mot de passe encodé en pourcentage (%40, %23)', fichier: 'u5.env',
    contenu: `DSN=${dsn('postgres', 'svc', 'Zt7%40Rq2%23Wm9Xb4', 'db.exemple.fr/appli')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  // Les sub-delims sont VALIDES en `userinfo`. Un resserrement qui les couperait
  // manquerait les mots de passe à ponctuation — les plus solides.
  { nom: 'URL-ID : mot de passe à sous-délimiteurs RFC', fichier: 'u6.env',
    contenu: `DSN=${dsn('postgres', 'svc', "a!$&'()*+,;=bZ", 'db.exemple.fr/appli')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  // `host` accepte aussi une IP-literal entre crochets. Sans `[` et `]` dans la
  // classe d'hôte, toute base joignable en IPv6 sortirait du champ.
  { nom: 'URL-ID : hôte IPv6 entre crochets', fichier: 'u7.env',
    contenu: `DSN=${dsn('postgres', 'svc', MDP_URL, '[2001:db8::1]:5432/appli')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  // CAS RÉEL, présent dans `docker-compose.prod.yml` de deux dépôts du parc.
  // C'est lui qui interdit d'appliquer la RFC à la lettre : les accolades n'y
  // sont pas admises, et sans exception explicite cette ligne cessait d'être vue.
  { nom: 'URL-ID : INTERPOLATION ${VAR} dans un docker-compose', fichier: 'u8.yml',
    contenu: `      DATABASE_URL: ${dsn('postgresql', '${DB_USER}', '${DB_PASSWORD}', 'db:5432/appli')}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },
  // Le resserrement ne doit pas rendre la règle aveugle DANS du JSON : une URL
  // légitimement entre guillemets reste une URL. C'est la contre-épreuve directe
  // du correctif — il retire le guillemet du DEDANS de l'URI, pas de son pourtour.
  { nom: 'URL-ID : DSN entre guillemets dans du JSON', fichier: 'u9.json',
    contenu: `{"dsn":"${dsn('postgres', 'svc', MDP_URL, 'db.exemple.fr:5432/appli')}"}\n`,
    attendu: 'refuse', regle: 'url-avec-identifiants' },

  // LE CAS FONDATEUR — rouge avant le correctif, vert après. Reproduit la forme
  // exacte des témoins n8n de `strategie-marketing-freelance` : un document JSON
  // MINIFIÉ, donc mono-ligne, où trois valeurs voisines se lisaient comme une
  // URL à identifiants. Aucun marqueur `secret-ok` n'est possible ici : JSON n'a
  // pas de commentaire. C'est ce qui rend ce faux positif pire que les autres —
  // il laisse le dépôt nu pour toujours, ou pousse au `--no-verify`.
  { nom: 'URL-ID : FONDATEUR — JSON minifié, la règle enjambait la frontière', fichier: 'u10.json',
    contenu: '{"lien":"https://www-abc.exemple.fr","email":"contact@exemple.fr",'
      + '"actif":true,"suite":"https://www-abc.exemple.fr/chemin/page"}\n',
    attendu: 'passe', regle: 'url-avec-identifiants' },
  // Même famille : un gabarit de documentation. Les chevrons sont exclus de la
  // RFC, donc `<motdepasse>` n'est pas un mot de passe — c'est un trou à remplir.
  { nom: 'URL-ID : gabarit de documentation à chevrons', fichier: 'u11.md',
    contenu: 'Forme attendue : postgres://<user>:<motdepasse>@<hote>/<base>\n',
    attendu: 'passe', regle: 'url-avec-identifiants' },
  { nom: 'URL-ID : BORNE — URL sans identifiants', fichier: 'u12.md',
    contenu: 'Voir https://www.exemple.fr/documentation/chapitre-3 pour la suite.\n',
    attendu: 'passe', regle: 'url-avec-identifiants' },
  { nom: 'URL-ID : BORNE — utilisateur sans mot de passe', fichier: 'u13.md',
    contenu: 'Depot : https://svc-lecture@git.exemple.fr/groupe/projet.git\n',
    attendu: 'passe', regle: 'url-avec-identifiants' },
  // Le seuil de 6 caractères existe pour que `redis://h:1234@x` (un port, un
  // identifiant court) ne rougisse pas. Il ne doit pas disparaitre au passage.
  { nom: 'URL-ID : BORNE — mot de passe de moins de 6 caractères', fichier: 'u14.md',
    contenu: 'Sonde locale : redis://u:abc@cache.exemple.fr/0\n',
    attendu: 'passe', regle: 'url-avec-identifiants' },

  // =========================================================================
  // CLÉ D'API GOOGLE — LES TÉMOINS (2026-08-09, tâche 8ce1d6b9)
  //
  // Écrits AVANT que quoi que ce soit bouge, et VERTS AVANT COMME APRÈS. Ce sont
  // eux qui prouvent que l'exemption par empreinte ajoutée ensuite ne retire
  // RIEN à la règle `cle-api-google` : elle continue de mordre sur toute clé
  // Google, y compris dans les formes exactes où le faux positif se produisait
  // (URL `?key=`, JSON minifié). La règle elle-même n'est pas touchée.
  // =========================================================================
  { nom: 'CLE-GOOGLE : clé AIza nue', fichier: 'g1.env',
    contenu: `GOOGLE_API_KEY=${CLE_G_A}\n`,
    attendu: 'refuse', regle: 'cle-api-google' },
  // LE CAS QUI INTERDIT LE RACCOURCI : une clé Google portée par le paramètre
  // `key=` d'une URL Google reste refusée. C'est la forme sous laquelle les 92
  // faux positifs de `maj-divi5-zeller` se présentaient — et c'est exactement
  // pourquoi on n'a PAS exempté ce contexte : une clé serveur (Geocoding,
  // Places, PageSpeed) s'écrit de la même façon.
  { nom: 'CLE-GOOGLE : clé AIza en paramètre `key=` d une URL Google', fichier: 'g2.md',
    contenu: `Appel : https://maps.googleapis.com/maps/api/geocode/json?address=x&key=${CLE_G_A}\n`,
    attendu: 'refuse', regle: 'cle-api-google' },
  { nom: 'CLE-GOOGLE : clé AIza dans du JSON minifié', fichier: 'g3.json',
    contenu: `{"a":1,"url":"https://exemple.fr/x?key=${CLE_G_A}","b":2}\n`,
    attendu: 'refuse', regle: 'cle-api-google' },
  // BORNE : le préfixe seul, cité en documentation, ne doit pas rougir.
  { nom: 'CLE-GOOGLE : BORNE — préfixe AIza trop court', fichier: 'g4.md',
    contenu: 'Les cles Google commencent par AIzaSy suivi de 33 caracteres.\n',
    attendu: 'passe', regle: 'cle-api-google' },

  // =========================================================================
  // `.secrets-connus` — L'ÉCHAPPATOIRE DES FORMATS SANS COMMENTAIRE
  //
  // Pourquoi elle existe : `secret-ok` s'écrit dans un COMMENTAIRE. JSON, CSV,
  // un dump SQL, un fichier minifié n'en ont pas. Un faux positif dans ces
  // formats-là n'a AUCUNE issue — il laisse le dépôt bruyant en permanence, et
  // un dépôt bruyant finit désarmé. Le marqueur devait donc pouvoir vivre HORS
  // du fichier fautif.
  //
  // Ce qui la distingue d'une exemption de chemin (et de `--no-verify`) : elle
  // ne porte ni un fichier ni un dossier, mais UNE VALEUR PRÉCISE, désignée par
  // son empreinte sha-256 et bornée à UNE règle. Une autre valeur dans le même
  // fichier rougit toujours. C'est ce que les cas ci-dessous éprouvent.
  // =========================================================================
  { nom: 'CONNUS : empreinte listée → la clé passe', fichier: 'c1.json',
    contenu: `{"url":"https://exemple.fr/x?key=${CLE_G_A}"}\n`,
    fichierAnnexe: '.secrets-connus',
    contenuAnnexe: `${empreinte(CLE_G_A)}  cle-api-google  # cle navigateur publique, cas de recette\n`,
    attendu: 'passe', regle: 'cle-api-google' },
  // LE CAS QUI EMPÊCHE L'EXEMPTION DE DEVENIR UNE EXEMPTION DE FICHIER : deux
  // clés sur la MÊME ligne, une seule listée. La ligne doit rester refusée.
  { nom: 'CONNUS : une seconde clé NON listée sur la même ligne → refuse', fichier: 'c2.json',
    contenu: `{"a":"${CLE_G_A}","b":"${CLE_G_B}"}\n`,
    fichierAnnexe: '.secrets-connus',
    contenuAnnexe: `${empreinte(CLE_G_A)}  cle-api-google  # une seule des deux\n`,
    attendu: 'refuse', regle: 'cle-api-google' },
  { nom: 'CONNUS : empreinte listée sous une AUTRE règle → refuse', fichier: 'c3.json',
    contenu: `{"url":"https://exemple.fr/x?key=${CLE_G_A}"}\n`,
    fichierAnnexe: '.secrets-connus',
    contenuAnnexe: `${empreinte(CLE_G_A)}  jeton-slack  # mauvaise regle : ne doit rien exempter\n`,
    attendu: 'refuse', regle: 'cle-api-google' },
  // Les quatre cas suivants prouvent que le dispositif ÉCHOUE BRUYAMMENT plutôt
  // que de laisser passer. Un fichier d'exemptions qu'on ne comprend pas ne doit
  // jamais être lu « au mieux » : il doit arrêter le commit.
  { nom: 'CONNUS : règle non empreintable → échec bruyant', fichier: 'c4.md',
    contenu: 'Rien de sensible ici.\n',
    fichierAnnexe: '.secrets-connus',
    contenuAnnexe: `${empreinte(CLE_G_A)}  url-avec-identifiants  # regle a valeur devinable\n`,
    attendu: 'refuse', sortieContient: '.secrets-connus' },
  { nom: 'CONNUS : ligne malformée → échec bruyant', fichier: 'c5.md',
    contenu: 'Rien de sensible ici.\n',
    fichierAnnexe: '.secrets-connus',
    contenuAnnexe: 'perf/**  cle-api-google  # un chemin n est pas une empreinte\n',
    attendu: 'refuse', sortieContient: '.secrets-connus' },
  { nom: 'CONNUS : justification absente → échec bruyant', fichier: 'c6.md',
    contenu: 'Rien de sensible ici.\n',
    fichierAnnexe: '.secrets-connus',
    contenuAnnexe: `${empreinte(CLE_G_A)}  cle-api-google\n`,
    attendu: 'refuse', sortieContient: '.secrets-connus' },
  // UNE EXEMPTION NON VERSIONNÉE N'EXEMPTE RIEN. Sinon le fichier pourrait vivre
  // à côté de git, invisible en revue, et taire la garde sur ce poste seulement.
  { nom: 'CONNUS : fichier présent sur le disque mais non indexé → échec bruyant',
    fichier: 'c7.json',
    contenu: `{"url":"https://exemple.fr/x?key=${CLE_G_A}"}\n`,
    fichierLibre: '.secrets-connus',
    contenuLibre: `${empreinte(CLE_G_A)}  cle-api-google  # jamais indexe\n`,
    attendu: 'refuse', sortieContient: '.secrets-connus' },
  // Le fichier d'exemptions porte des empreintes, jamais des valeurs : il ne doit
  // pas se faire juger par les règles (64 caractères hexadécimaux à côté du mot
  // « secret » sont exactement ce que la règle d'entropie cherche).
  { nom: 'CONNUS : le fichier d exemptions ne se juge pas lui-même', fichier: '.secrets-connus',
    contenu: `${empreinte(CLE_G_A)}  cle-api-google  # secret connu, publie par construction\n`,
    attendu: 'passe' },
];

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

let echecs = 0;
for (const cas of CAS) {
  const d = mkdtempSync(join(tmpdir(), 'recette-detect-'));
  git(d, ['init', '-q']);
  git(d, ['config', 'user.email', 'recette@local']);
  git(d, ['config', 'user.name', 'recette']);
  // Sans HEAD, `git diff --cached` ne rend rien et le détecteur sort 0 sans avoir rien lu.
  git(d, ['commit', '-q', '--allow-empty', '-m', 'initial']);
  copyFileSync(DETECTEUR, join(d, 'detect-secrets.js'));
  // `base` : le fichier est d'abord COMMITÉ, puis modifié. Le diff est alors partiel, et le
  // mot-clé peut vivre sur une ligne inchangée — ce qu'un fichier neuf ne sait pas reproduire.
  if (cas.base !== undefined) {
    writeFileSync(join(d, cas.fichier), cas.base, 'utf8');
    git(d, ['add', cas.fichier]);
    git(d, ['commit', '-q', '-m', 'base']);
  }
  writeFileSync(join(d, cas.fichier), cas.contenu, 'utf8');
  git(d, ['add', cas.fichier]);
  // Second fichier du MÊME commit : sert à prouver que le contexte ne franchit pas la
  // frontière d'un fichier. Sans lui, un `token` isolé dans n'importe quel fichier de
  // l'index rendrait suspect tout littéral long des autres.
  if (cas.fichierAnnexe) {
    writeFileSync(join(d, cas.fichierAnnexe), cas.contenuAnnexe, 'utf8');
    git(d, ['add', cas.fichierAnnexe]);
  }
  // `fichierLibre` : ÉCRIT SUR LE DISQUE ET JAMAIS INDEXÉ. Sert au seul cas qu'un
  // fichier annexe ne sait pas reproduire — une exemption posée à côté de git,
  // qui ne doit PAS s'appliquer en silence.
  if (cas.fichierLibre) {
    writeFileSync(join(d, cas.fichierLibre), cas.contenuLibre, 'utf8');
  }

  let code = 0;
  let sortie = '';
  try {
    execFileSync(process.execPath, ['detect-secrets.js'], { cwd: d, stdio: 'pipe' });
  } catch (e) {
    code = e.status ?? 1;
    sortie = String(e.stderr ?? '');
  }
  const obtenu = code === 0 ? 'passe' : 'refuse';

  // `regle` (facultatif) : LE CODE DE SORTIE NE DIT PAS QUI A REFUSÉ. Un cas
  // « refuse » resterait vert alors qu'une AUTRE règle a tiré à la place de celle
  // qu'on éprouve — et un resserrement pourrait alors casser la règle visée sans
  // rien faire rougir. Quand le champ est présent, on exige que ce soit bien elle
  // (ou, pour un cas « passe », qu'elle soit absente de la sortie).
  // Cf. [[preuve-doit-exercer-critere-acceptation]].
  const marqueur = `[${cas.regle}]`;
  const bonneRegle = cas.regle === undefined
    || (cas.attendu === 'refuse' ? sortie.includes(marqueur) : !sortie.includes(marqueur));
  // `sortieContient` (facultatif) : pour les refus qui ne viennent PAS d'une règle
  // mais d'un échec bruyant du détecteur (fichier d'exemptions malformé, non
  // indexé...). Sans lui, ces cas resteraient verts si le refus venait d'une tout
  // autre cause — un `exit 1` ne dit pas pourquoi.
  const bonMotif = cas.sortieContient === undefined || sortie.includes(cas.sortieContient);
  const ok = obtenu === cas.attendu && bonneRegle && bonMotif;
  if (!ok) echecs++;
  const pourquoi = !bonneRegle
    ? ` — regle ${cas.regle} ${cas.attendu === 'refuse' ? 'ABSENTE de' : 'PRESENTE dans'} la sortie`
    : (!bonMotif ? ` — motif attendu absent de la sortie : ${JSON.stringify(cas.sortieContient)}` : '');
  console.log(`  ${ok ? 'ok    ' : 'ECHEC '} ${cas.nom} — attendu ${cas.attendu}, obtenu ${obtenu}${pourquoi}`);
}

console.log(`\n${CAS.length - echecs}/${CAS.length} cas conformes`);
process.exit(echecs ? 1 : 0);
