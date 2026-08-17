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
const { existsSync, readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

// ---------------------------------------------------------------- verrou de campagne (R-09)
//
// POURQUOI CE DÉPÔT REGARDE UN FICHIER ÉCRIT PAR L AUTRE. R-09 de `docs/protocole-mesure.md`
// interdit tout build pendant une campagne de mesure. Or un push vers `main` ICI déclenche un
// déploiement Coolify, donc un build, donc occupe le budget de builds du serveur que la campagne
// exige au repos. Le 2026-08-17 au matin, `47d499e1` est parti pendant la campagne §10
// (déploiements 502 et 503) : la passe n a pas été refusée, elle a été FAUSSÉE ET ARCHIVÉE COMME
// VALIDE. Une règle écrite depuis juillet, que rien ne lisait de ce côté.
//
// LA DUPLICATION EST DÉLIBÉRÉE ET BORNÉE. `scripts/lib/verrou-campagne.mjs` du dépôt de mesure
// fait autorité sur le format ; il est ESM, dans un autre dépôt, et ce crochet ne doit dépendre
// d aucun des deux. On recopie donc la LECTURE (un JSON, une date), jamais la logique de pose.
// Si le format bouge, c est ici qu il faut suivre — et la recette le dit en cassant.
//
// EXPIRÉ = ON LAISSE PASSER. Un verrou sans expiration transformerait un `p3-chrono` tué en
// blocage définitif de ce dépôt, et le premier bloqué le supprimerait pour de bon.
// ILLISIBLE = ON REFUSE. « Je n ai pas pu lire » ne veut pas dire « il n y a pas de campagne ».

const CHEMIN_VERROU = process.env.ECHO_VERROU_CAMPAGNE
  || join(homedir(), '.claude', 'etat', 'echo-r09-campagne.json');

/**
 * Rend `null` si le push peut partir, ou le motif du refus. `lire` est injecté pour que la
 * recette exerce les cinq états sans poser un fichier sur le chemin de production — en poser un
 * y bloquerait un push réel, ou pire, masquerait une campagne en vol.
 */
function jugerCampagneEnVol({ lire = () => { try { return readFileSync(CHEMIN_VERROU, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }, maintenant = new Date() } = {}) {
  const brut = lire();
  if (brut === null || brut === undefined || String(brut).trim() === '') return null;

  let v;
  try {
    v = JSON.parse(brut);
  } catch (e) {
    return `verrou de campagne R-09 ILLISIBLE (${e.message}). On refuse plutôt que de deviner : `
      + 'ne pas savoir lire n est pas savoir qu il n y a pas de campagne.';
  }

  const campagne = (typeof v?.campagne === 'string' && v.campagne.trim()) || '(campagne non nommée)';
  if (typeof v?.expire_a !== 'string') {
    return `verrou de campagne R-09 sans \`expire_a\` (« ${campagne} ») : un bail ne se devine pas.`;
  }
  const expire = new Date(v.expire_a);
  if (Number.isNaN(+expire)) {
    return `verrou de campagne R-09 dont l \`expire_a\` (« ${v.expire_a} ») n est pas une date lisible.`;
  }
  if (maintenant.getTime() > expire.getTime()) return null; // bail dépassé : la campagne est finie.

  return `une CAMPAGNE DE MESURE est en vol — « ${campagne} », bail jusqu à ${expire.toISOString()}. `
    + 'R-09 interdit tout build pendant une campagne ; ce push déclencherait un déploiement Coolify, '
    + 'donc un build, et la passe serait faussée sans rien annoncer.';
}

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

  // R-09 EN PREMIER, avant les suites : refuser ici coûte une milliseconde, refuser après aurait
  // coûté les quinze minutes des deux suites — et surtout, pendant ce temps, rien n aurait empêché
  // le push de partir si la garde avait été placée plus loin.
  const campagne = jugerCampagneEnVol();
  if (campagne) {
    console.error('');
    console.error(`PUSH REFUSÉ — ${campagne}`);
    console.error('');
    console.error('  Ce n est pas un échec des tests : le code peut être parfait, c est le MOMENT qui');
    console.error('  ne va pas. Attends la fin de la campagne, le verrou se lève tout seul.');
    console.error(`  Pour lever à la main : vérifie qu aucune passe ne tourne (p3-chrono etat), puis`);
    console.error(`  supprime ${CHEMIN_VERROU}`);
    console.error('  En connaissance de cause seulement : git push --no-verify.');
    return 1;
  }

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

module.exports = {
  lignesAJuger, verifierQueLArbreEstLeCommitPousse, principal, jugerCampagneEnVol,
  APPLICATIONS, BRANCHE_GARDEE, CHEMIN_VERROU,
};

if (require.main === module) {
  let stdin = '';
  try {
    stdin = require('node:fs').readFileSync(0, 'utf8');
  } catch {
    stdin = '';
  }
  process.exit(principal(stdin));
}
