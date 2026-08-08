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

  let code = 0;
  try {
    execFileSync(process.execPath, ['detect-secrets.js'], { cwd: d, stdio: 'pipe' });
  } catch (e) {
    code = e.status ?? 1;
  }
  const obtenu = code === 0 ? 'passe' : 'refuse';
  const ok = obtenu === cas.attendu;
  if (!ok) echecs++;
  console.log(`  ${ok ? 'ok    ' : 'ECHEC '} ${cas.nom} — attendu ${cas.attendu}, obtenu ${obtenu}`);
}

console.log(`\n${CAS.length - echecs}/${CAS.length} cas conformes`);
process.exit(echecs ? 1 : 0);
