#!/usr/bin/env node
// GARDE AVANT PUSH — le résultat de FUSION est jugé AVANT d'atterrir sur `main`, pas après.
//
// ── LE TROU QU'ELLE FERME (établi le 2026-08-14, tâche `6efc9c7d`) ──────────────────────────
// Deux branches vertes séparément peuvent être rouges ENSEMBLE : c'est un mode d'échec
// structurel, pas un accident. La CI juge bien un résultat de fusion — mais seulement dans deux
// cas : sur `pull_request`, et sur le `push` du commit de fusion. Or **17 des 20 dernières
// fusions de ce dépôt sont des merges LOCAUX poussés** (mesuré, pas supposé). Le job tourne donc
// sur un commit de fusion DÉJÀ SUR MAIN : le rouge arrive sur la branche par défaut au lieu d'y
// être refusé. Le commit de tête d'`origin/main` s'est un jour intitulé « CI: rendre main
// verte » — ce qui prouve que main avait été rouge.
//
// ── POURQUOI UN CROCHET, ET PAS UNE RÈGLE DE BRANCHE ────────────────────────────────────────
// Une règle de branche exigeant la verte INTERDIT les pushes directs : les 17 fusions locales
// devraient passer par une PR. Sur un dépôt où des runs autonomes fusionnent plusieurs fois par
// jour, cela ne durcit pas la garde, cela déplace le travail vers un tour de circuit que rien ne
// garantit d'atteindre. Le crochet, lui, juge exactement ce que la CI jugerait — mais AVANT.
//
// ── CE QUI A DÉCIDÉ, ET C'EST UNE MESURE ────────────────────────────────────────────────────
// L'objection évidente est le coût : jouer deux suites complètes avant chaque push. Mesuré le
// 2026-08-14 sur ce dépôt : **apps/cms 8 s, apps/web 6 s — 14 s au total**. À ce prix, il n'y a
// aucune raison de restreindre aux seuls commits de fusion : TOUT push vers `main` est jugé.
//
// ── LES TROIS TROUS, ASSUMÉS ET ÉCRITS ──────────────────────────────────────────────────────
// Ce sont ceux de `pre-commit`, et les nommer vaut mieux que prétendre les fermer :
//   1. `git push --no-verify` le contourne ;
//   2. il est ABSENT d'un clone frais tant que `core.hooksPath = .githooks` n'y est pas posé ;
//   3. il juge ce que la copie de travail porte — d'où le refus explicite ci-dessous quand
//      `HEAD` n'est pas le commit poussé, ou quand l'arbre est sale.
// La CI ferme les deux premiers pour ce qu'elle peut : elle vérifie que ce crochet est versionné,
// exécutable, et qu'il appelle bien ce module. Elle ne peut rien contre un `--no-verify` assumé.
//
// ── AUCUN VERT PAR DÉFAUT ───────────────────────────────────────────────────────────────────
// « Je n'ai pas pu juger » et « c'est vert » sont deux phrases différentes. Un désaccord entre
// `HEAD` et le commit poussé, un arbre sale, une suite qu'on ne peut pas lancer : tout cela
// REFUSE le push en le disant, au lieu de laisser passer.
//
// Usage  : appelé par `.githooks/pre-push`, qui lui passe stdin tel que git le donne.
// Sortie : 0 = rien à juger, ou tout est vert · 1 = push REFUSÉ.
//
// Prouvé en le cassant : `.githooks/gardes-avant-push.recette.mjs`.

'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

/** Les deux suites, dans l'ordre où la CI les joue. Même liste que la matrice du workflow. */
const APPLICATIONS = ['apps/cms', 'apps/web'];

/** La branche protégée. Une seule : c'est celle qui déploie et celle que tout le monde relit. */
const BRANCHE_GARDEE = 'refs/heads/main';

const ZERO = /^0{40,}$/;

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim();
}

/**
 * Lit ce que git donne sur stdin : « <ref locale> <sha local> <ref distante> <sha distant> ».
 * Rend les seules lignes qui poussent QUELQUE CHOSE vers la branche gardée — une suppression
 * (sha local à zéro) n'introduit aucun code et n'a rien à faire juger.
 */
function lignesAJuger(stdin) {
  return stdin
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [refLocale, shaLocal, refDistante, shaDistant] = l.split(/\s+/);
      return { refLocale, shaLocal, refDistante, shaDistant };
    })
    .filter((e) => e.refDistante === BRANCHE_GARDEE && !ZERO.test(e.shaLocal || ''));
}

/**
 * Le crochet juge la COPIE DE TRAVAIL. Il ne peut donc rien affirmer sur un commit qui n'est pas
 * `HEAD`, ni sur un arbre qui porte des modifications non commitées : dans les deux cas ce qu'il
 * testerait ne serait pas ce qui partirait. C'est une INCAPACITÉ, et elle refuse.
 */
function verifierQueLArbreEstLeCommitPousse(racine, shaPousse) {
  const tete = git(['rev-parse', 'HEAD'], { cwd: racine });
  if (tete !== shaPousse) {
    return `la copie de travail est sur ${tete.slice(0, 10)}, mais le push envoie ${shaPousse.slice(0, 10)}. `
      + 'Les suites jugeraient autre chose que ce qui partirait.';
  }
  const sale = git(['status', '--porcelain', '--untracked-files=no'], { cwd: racine });
  if (sale) {
    const n = sale.split(/\r?\n/).filter(Boolean).length;
    return `la copie de travail porte ${n} modification(s) non commitée(s). `
      + 'Les suites jugeraient un arbre que le push n emporte pas.';
  }
  return null;
}

/** Joue une suite. Rend son code et sa dernière ligne utile — pas tout le bruit. */
function jouerLaSuite(racine, application) {
  const dossier = join(racine, application);
  if (!existsSync(join(dossier, 'package.json'))) {
    return { code: -1, motif: `${application}/package.json est introuvable — la suite n a pas pu être lancée.` };
  }
  const commande = process.env.ECHO_PREPUSH_COMMANDE;
  if (commande) {
    // Seam de recette. Il est BRUYANT expres : une garde qu'on peut faire mentir en silence ne
    // garde rien, et celle-ci doit dire quand elle ne joue pas ce qu'elle prétend jouer.
    console.error(`⚠️  ECHO_PREPUSH_COMMANDE est posée : « ${commande} » est joué à la place de « npm test ».`);
    console.error('    Ce n est PAS la garde réelle. Cette variable existe pour sa recette.');
    const r = spawnSync(commande, { cwd: dossier, shell: true, encoding: 'utf8' });
    return { code: r.status === null ? -1 : r.status, sortie: (r.stdout || '') + (r.stderr || '') };
  }
  const r = spawnSync('npm', ['test'], { cwd: dossier, shell: true, encoding: 'utf8', timeout: 900000 });
  return { code: r.status === null ? -1 : r.status, sortie: (r.stdout || '') + (r.stderr || '') };
}

function derniereLigne(s) {
  return (s || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '(aucune sortie)';
}

function principal(stdin) {
  const entrees = lignesAJuger(stdin);
  if (entrees.length === 0) return 0; // rien ne part vers main : ce crochet n'a rien à dire.

  const racine = git(['rev-parse', '--show-toplevel']);
  const shaPousse = entrees[0].shaLocal;

  console.error('');
  console.error(`Garde avant push — ${shaPousse.slice(0, 10)} part vers main, les deux suites sont jouées d abord.`);

  const incapacite = verifierQueLArbreEstLeCommitPousse(racine, shaPousse);
  if (incapacite) {
    console.error('');
    console.error(`PUSH REFUSÉ — la garde n a PAS pu juger : ${incapacite}`);
    console.error('  Ce n est pas un échec des tests : c est un refus de prononcer sur autre chose que');
    console.error('  ce qui partirait. Commite ou remise, place-toi sur le commit poussé, et recommence.');
    return 1;
  }

  const rouges = [];
  for (const application of APPLICATIONS) {
    const debut = Date.now();
    const { code, motif, sortie } = jouerLaSuite(racine, application);
    const secondes = ((Date.now() - debut) / 1000).toFixed(0);
    if (code === 0) {
      console.error(`  OK    ${application} (${secondes} s)`);
    } else {
      rouges.push({ application, code, detail: motif || derniereLigne(sortie) });
      console.error(`  ROUGE ${application} (${secondes} s) — code ${code}`);
    }
  }

  if (rouges.length === 0) {
    console.error('Les deux suites passent sur le commit poussé.');
    console.error('');
    return 0;
  }

  console.error('');
  console.error('PUSH REFUSÉ — le résultat qui partirait vers main est ROUGE :');
  for (const r of rouges) console.error(`  · ${r.application} : ${r.detail}`);
  console.error('');
  console.error('  Deux branches vertes séparément peuvent être rouges ensemble — c est exactement');
  console.error('  ce que ce crochet existe pour attraper, et il vaut mieux le voir ici que sur main.');
  console.error('  Passer outre en connaissance de cause : git push --no-verify (voir .githooks/README.md).');
  return 1;
}

module.exports = { lignesAJuger, verifierQueLArbreEstLeCommitPousse, principal, APPLICATIONS, BRANCHE_GARDEE };

if (require.main === module) {
  let stdin = '';
  try {
    stdin = require('node:fs').readFileSync(0, 'utf8');
  } catch {
    stdin = '';
  }
  process.exit(principal(stdin));
}
