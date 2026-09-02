// RECETTE de `outils/check-lecteurs-ref-locale.js` — on ne la croit pas sur parole, on la fait MORDRE.
//
// Trois familles de cas, et la troisième est celle qui compte :
//   · 1 à 3   — elle MORD sur un lecteur de la référence locale `main`, et le NOMME ;
//   · 4 à 9   — elle se TAIT sur tout ce qui n'en est pas un. C'est la moitié qui décide de sa
//               survie : une garde qui rougit sur `push origin main` ou sur les bancs d'essai des
//               autres recettes serait retirée dans la semaine, et le dépôt reperdrait la règle ;
//   · 10 à 13 — elle rend INCAPACITÉ (2) plutôt que 0 quand elle n'a rien su lire. Son mode
//               d'échec n'est pas de se tromper : c'est de ne rien trouver et d'appeler ça un
//               succès.
//
// Chaque cas monte un DÉPÔT GIT JETABLE et y copie la garde. Le dépôt réel n'est jamais touché.
//
// ── SON RETRAIT N'ÉTAIT PAS DANS UN `finally` (2026-08-27, tâche `58526a07`) ─────────────────
// Il vivait à l'avant-dernière ligne de `lancer()` : un `git` qui refuse, une écriture qui casse,
// et le dépôt restait. Le retrait est passé dans un `finally`, et les dépôts se montent hors du
// répertoire temporaire, par `outils/banc-jetable.mjs`.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { harnaisDeBacs } from './banc-jetable.mjs';

/* LE HARNAIS DES DÉPÔTS JETABLES — `nettoyer()` dans le `finally` de `lancer()`, et un filet
   `process.on('exit')` pour ce qu'un `finally` ne voit pas. */
const BACS = harnaisDeBacs();

const ICI = dirname(fileURLToPath(import.meta.url));
const GARDE = readFileSync(join(ICI, 'check-lecteurs-ref-locale.js'), 'utf8');

let total = 0;
let echecs = 0;
const reussi = (n) => { total++; console.log(`  OK    ${n}`); };
const rate = (n, d) => { total++; echecs++; console.log(`  ÉCHEC ${n}\n        ${d}`); };

const g = (d, args) => execFileSync('git', args, { cwd: d, stdio: 'ignore' });

/**
 * Monte un dépôt git jetable, y indexe les fichiers demandés, et y lance la garde.
 * @param {object} o
 * @param {Record<string,string>} o.fichiers      chemin relatif → contenu, INDEXÉS
 * @param {Record<string,string>} [o.nonSuivis]   chemin relatif → contenu, NON indexés
 * @param {(s:string)=>string} [o.saboter]        transformation appliquée à la SOURCE de la garde
 */
function lancer(o) {
  const banc = BACS.creer('lecteurs-ref-');
  /* ⚠️ LE RETRAIT EST DANS LE `finally` CI-DESSOUS, jamais sur le chemin nominal.
     Cf. `[[un-cas-qui-echoue-ne-remet-pas-son-banc-a-neuf]]`. */
  try {
    mkdirSync(join(banc, 'outils'), { recursive: true });
    g(banc, ['init', '-q', '-b', 'principale']);
    g(banc, ['config', 'user.email', 'banc@exemple.invalid']);
    g(banc, ['config', 'user.name', 'banc']);

    for (const [relatif, contenu] of Object.entries(o.fichiers ?? {})) {
      mkdirSync(dirname(join(banc, relatif)), { recursive: true });
      writeFileSync(join(banc, relatif), contenu);
      g(banc, ['add', '--', relatif]);
    }
    for (const [relatif, contenu] of Object.entries(o.nonSuivis ?? {})) {
      mkdirSync(dirname(join(banc, relatif)), { recursive: true });
      writeFileSync(join(banc, relatif), contenu);
    }

    writeFileSync(join(banc, 'outils', 'check-lecteurs-ref-locale.js'),
      o.saboter ? o.saboter(GARDE) : GARDE);

    let code = 0; let sortie = '';
    try {
      sortie = execFileSync(process.execPath, [join(banc, 'outils', 'check-lecteurs-ref-locale.js')],
        { cwd: banc, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      code = e.status; sortie = (e.stdout || '') + (e.stderr || '');
    }
    return { code, sortie };
  } finally {
    BACS.rendreCompte(BACS.nettoyer());
  }
}

/* Un instrument plausible, qui appelle git sans jamais nommer `main` : il sert de fond neutre à
   tous les cas, pour qu'aucun ne soit vert par simple absence d'argv. */
const FOND = `const { execFileSync } = require('node:child_process');\n`
  + `execFileSync('git', ['rev-parse', 'HEAD']);\n`
  + `execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);\n`;

console.log('Recette de outils/check-lecteurs-ref-locale.js');

/* ── 1. LE CAS FONDATEUR — une branche qui se mesure contre `main` local ──────────────────
   C'est très exactement le piège décrit dans l'en-tête de la garde : la référence est détenue
   par un worktree, donc périmée, et cet argv rend un écart faux. */
{
  const r = lancer({
    fichiers: {
      'ops/instrument.js': `${FOND}execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'main']);\n`,
    },
  });
  if (r.code === 1 && /ops\/instrument\.js:4/.test(r.sortie) && /'merge-base'/.test(r.sortie)) {
    reussi('1. `merge-base … HEAD main` dans un fichier suivi → ANOMALIE (1), fichier, LIGNE et argv NOMMÉS');
  } else rate('1. cas fondateur', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 2. la PLAGE, et c'est la forme par laquelle l'écart se mesure vraiment ───────────────
   `main..HEAD` ne contient pas le jeton `main` isolé par des espaces : seule une découpe sur les
   séparateurs de révision le voit. Ce cas a trouvé un vrai défaut de l'extracteur à l'écriture. */
{
  const r = lancer({
    fichiers: {
      'ops/instrument.js': `${FOND}execFileSync('git', ['rev-list', '--left-right', '--count', 'main...HEAD']);\n`,
    },
  });
  if (r.code === 1 && /main\.\.\.HEAD/.test(r.sortie)) {
    reussi('2. la PLAGE `main...HEAD` → ANOMALIE (1) : la découpe voit ce qu\'une sous-chaîne rate');
  } else rate('2. plage de révisions', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 3. le SHELL, où l'argv est la ligne de commande ──────────────────────────────────────*/
{
  const r = lancer({
    fichiers: { 'ops/veille.sh': '#!/bin/sh\ngit log --oneline main..HEAD\n' },
  });
  if (r.code === 1 && /ops\/veille\.sh:2/.test(r.sortie)) {
    reussi('3. `git log main..HEAD` dans un `.sh` → ANOMALIE (1), la ligne NOMMÉE');
  } else rate('3. shell', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 4. LE VERT QUI DÉCIDE DE SA SURVIE — la bonne pratique reste verte ───────────────────
   Si `origin/main` rougissait, il n'existerait plus AUCUNE façon correcte de se comparer au
   tronc, et la garde serait retirée le jour même. */
{
  const r = lancer({ fichiers: { 'ops/instrument.js': FOND } });
  if (r.code === 0 && /aucun instrument ne s'adosse/.test(r.sortie)) {
    reussi('4. `origin/main` → 0 : la seule façon correcte de se comparer au tronc reste verte');
  } else rate('4. origin/main vert', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 5. une ref DISTANTE nommée `main` n'est pas la ref LOCALE ────────────────────────────*/
{
  const r = lancer({
    fichiers: {
      'ops/instrument.js': `${FOND}execFileSync('git', ['push', '-q', 'origin', 'main']);\n`
        + `execFileSync('git', ['fetch', '--quiet', 'origin', 'main']);\n`
        + `execFileSync('git', ['ls-remote', '--heads', 'origin', 'main']);\n`,
    },
  });
  if (r.code === 0 && /hors périmètre/.test(r.sortie)) {
    reussi('5. `push`/`fetch`/`ls-remote origin main` → 0 : `main` y désigne la ref DISTANTE');
  } else rate('5. ref distante', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 6. LES BANCS D'ESSAI DES AUTRES RECETTES — sans ce vert, la moitié du dépôt rougirait ─
   Les recettes de ce dépôt montent toutes un dépôt jetable sur une branche `main`. Les refuser
   n'aurait rien gardé : cela aurait désarmé les gardes qui prouvent les autres gardes. */
{
  const r = lancer({
    fichiers: {
      'outils/autre.recette.mjs': `${FOND}execFileSync('git', ['init', '-q', '-b', 'main']);\n`
        + `execFileSync('git', ['checkout', '-q', '-B', 'main']);\n`
        + `execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main']);\n`,
    },
  });
  if (r.code === 0) {
    reussi('6. bancs d\'essai (`init -b main`, `checkout -B main`, `symbolic-ref`) → 0 : ils CRÉENT leur ref');
  } else rate('6. bancs d\'essai', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 7. LA PROSE N'EST PAS UN LECTEUR ─────────────────────────────────────────────────────
   Mesuré sur l'arbre réel le 2026-08-23 : 139 occurrences brutes d'un token `main` hors
   `origin/main`, la quasi-totalité en commentaire. Un balayage du corps aurait ramené 139 lignes
   à trier — et une garde qu'on trie est une garde qu'on éteint. */
{
  const r = lancer({
    fichiers: {
      'ops/instrument.js': '// Mesuré sur `main` le 2026-08-23 : la ref locale était à 84 commits de retard.\n'
        + '/* On aurait pu écrire ["rev-parse", "main"] ici, en exemple. */\n' + FOND,
    },
  });
  if (r.code === 0) {
    reussi('7. `main` en COMMENTAIRE, y compris un argv cité en exemple → 0 : la prose n\'appelle rien');
  } else rate('7. prose', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 8. UN CHEMIN N'EST PAS UNE RÉVISION ──────────────────────────────────────────────────
   `main.js` et `origin/main` doivent traverser la découpe sans la déclencher. */
{
  const r = lancer({
    fichiers: {
      'ops/instrument.js': `${FOND}execFileSync('git', ['show', 'origin/main:src/main.js']);\n`
        + `execFileSync('git', ['log', '--', 'src/main.js']);\n`,
    },
  });
  if (r.code === 0) {
    reussi('8. `origin/main:src/main.js` et le chemin `src/main.js` → 0 : un chemin n\'est pas une révision');
  } else rate('8. chemin', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 9. LA CONTREPARTIE, ÉCRITE PLUTÔT QUE TUE — un fichier HORS INDEX est invisible ──────
   Elle lit `git ls-files`, pas le dossier : ce qui doit être gardé est ce que le dépôt PORTE.
   Un brouillon local portant le défaut ne rougit donc pas, et ce cas l'établit au lieu de le
   laisser croire. Le raisonnement est celui, déjà arbitré, de `check-gardes-listees`. */
{
  const r = lancer({
    fichiers: { 'ops/instrument.js': FOND },
    nonSuivis: { 'ops/brouillon.js': `execFileSync('git', ['merge-base', 'HEAD', 'main']);\n` },
  });
  if (r.code === 0 && !/brouillon/.test(r.sortie)) {
    reussi('9. le défaut dans un fichier HORS INDEX → 0, et il n\'est pas nommé : contrepartie assumée');
  } else rate('9. hors index', `code ${r.code} — ${r.sortie.slice(0, 300)}`);
}

/* ── 10. AUTO-TEST — extracteur AMPUTÉ ────────────────────────────────────────────────────
   On retire `merge-base` des sous-commandes de lecture. Sans auto-test, la garde ne verrait plus
   le cas 1 et rendrait 0 sur un dépôt qui porte le défaut : le vert viendrait de son aveuglement. */
{
  const r = lancer({
    fichiers: {
      'ops/instrument.js': `${FOND}execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'main']);\n`,
    },
    saboter: (s) => s.replace("'rev-parse', 'merge-base',", "'rev-parse',"),
  });
  if (r.code === 2 && /AUTO-TEST EN ÉCHEC \(POSITIF 1/.test(r.sortie)) {
    reussi('10. sous-commande de lecture AMPUTÉE → INCAPACITÉ (2), et surtout PAS 0 alors que le défaut est là');
  } else rate('10. extracteur amputé', `code ${r.code} — attendu 2 — ${r.sortie.slice(0, 200)}`);
}

/* ── 11. AUTO-TEST — motif TROP LARGE, qui ferait rougir la bonne pratique ────────────────*/
{
  const r = lancer({
    fichiers: { 'ops/instrument.js': FOND },
    saboter: (s) => s.replace(
      "const jetons = String(element).split(/\\.{2,3}|[\\^~:@\\s]+/).filter(Boolean);",
      "const jetons = String(element).split(/\\.{2,3}|[\\^~:@\\s/]+/).filter(Boolean);",
    ),
  });
  if (r.code === 2 && /AUTO-TEST EN ÉCHEC \(NÉGATIF 1/.test(r.sortie)) {
    reussi('11. découpe ÉLARGIE jusqu\'à couper `origin/main` → INCAPACITÉ (2) : elle refuse de rougir sur la bonne pratique');
  } else rate('11. motif trop large', `code ${r.code} — attendu 2 — ${r.sortie.slice(0, 200)}`);
}

/* ── 12. LE TÉMOIN DE MUTISME — aucun argv reconnu ────────────────────────────────────────
   Un extracteur qui cesse de reconnaître les tableaux rendrait 0 pour toujours, et tous les
   autres verts ne prouveraient que son silence. Zéro argv examiné n'est pas « tout est conforme ». */
{
  const r = lancer({
    fichiers: { 'ops/instrument.js': "console.log('cet instrument n appelle jamais git');\n" },
  });
  if (r.code === 2 && /AUCUN argv git reconnu/.test(r.sortie)) {
    reussi('12. aucun argv git dans le corpus → INCAPACITÉ (2), jamais 0 : le vert par mutisme est refusé');
  } else rate('12. mutisme', `code ${r.code} — attendu 2 — ${r.sortie.slice(0, 200)}`);
}

/* ── 13. LE VERT PAR DISETTE — corpus vide ────────────────────────────────────────────────*/
{
  const r = lancer({ fichiers: { 'outils/un-document.md': 'aucun fichier exécutable ici\n' } });
  if (r.code === 2 && /le corpus est vide/.test(r.sortie)) {
    reussi('13. aucun fichier exécutable suivi → INCAPACITÉ (2) : un verdict rendu sur personne');
  } else rate('13. corpus vide', `code ${r.code} — attendu 2 — ${r.sortie.slice(0, 200)}`);
}

/* ── 14. L'EXEMPTION EST NOMINATIVE, ET CE CAS EST CE QUI L'EMPÊCHE D'ÊTRE UNE PORTE DÉROBÉE ─
   La garde et cette recette-ci portent la forme interdite par nécessité, et sont exemptées PAR
   LEUR CHEMIN. Si l'exemption avait été écrite en motif (`*.recette.mjs`), il aurait suffi de
   nommer un fichier ainsi pour passer dessous. On plante donc un lecteur RÉEL dans un AUTRE
   `*.recette.mjs` : il doit rougir. C'est l'arbitrage déjà rendu pour `check-comptes-recette`. */
{
  const r = lancer({
    fichiers: {
      'outils/une-autre.recette.mjs': `${FOND}execFileSync('git', ['rev-parse', 'main']);\n`,
    },
  });
  if (r.code === 1 && /une-autre\.recette\.mjs/.test(r.sortie)) {
    reussi('14. un AUTRE `*.recette.mjs` porteur d\'un vrai lecteur → ANOMALIE (1) : l\'exemption est nominative, pas un motif');
  } else rate('14. exemption nominative', `code ${r.code} — attendu 1 — ${r.sortie.slice(0, 200)}`);
}

console.log(`\n${total - echecs}/${total} cas passés.`);
if (echecs) {
  process.stderr.write(`\n✖ ${echecs} cas en échec : la garde ne prouve plus ce qu'elle prétend.\n`);
  process.exit(1);
}
console.log('Recette VERTE — la garde mord, se tait à bon escient, et refuse de rendre un vert sur rien.');
