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
