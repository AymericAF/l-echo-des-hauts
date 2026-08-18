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
const { homedir, hostname } = require('node:os');
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
//
// ── 2026-08-18 : LA FENÊTRE EST LA CAMPAGNE ENTIÈRE, PLUS SEULEMENT LA PASSE ────────────────
// Le verrou était posé au début d UNE passe et levé à sa fin. Une campagne §10 compte 12 passes,
// donc ONZE INTERVALLES pendant lesquels ce dépôt était ROUVERT — et un déploiement pris dans un
// intervalle déborde sur la passe suivante et la fausse. C est exactement par là que `47d499e1`
// est passé. Le verrou porte donc désormais une `portee` (`campagne` ou `passe`), et ce crochet
// doit la DIRE : quelqu un qui croit attendre dix minutes alors qu il en attend quatre-vingt-dix
// supprime le fichier, et la garde meurt.
//
// ── ET LE MORT, QU ON CONSTATE PLUTÔT QUE D ATTENDRE ────────────────────────────────────────
// Le bail d une campagne est COURT et RENOUVELÉ par le lanceur tant qu il vit : un mort ne
// renouvelle pas, donc le bail expire seul. On ajoute ici un raccourci — si le `pid` inscrit
// n existe plus SUR CET HÔTE, le verrou est orphelin et on laisse passer sans attendre la fin du
// bail. Faillible dans un seul sens (un `pid` recyclé se lit « vivant »), et c est le sens
// inoffensif : on bloque un peu trop longtemps, jusqu à une expiration que plus rien ne repousse.
// Un `pid` d une AUTRE machine ne se sonde pas : le lire « mort » rouvrirait le dépôt en vol.

const CHEMIN_VERROU = process.env.ECHO_VERROU_CAMPAGNE
  || join(homedir(), '.claude', 'etat', 'echo-r09-campagne.json');

/** Le processus existe-t-il ? `null` = on ne peut pas savoir, et alors on ne prononce pas. */
function processusVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return false;
    if (e.code === 'EPERM') return true;
    return null;
  }
}

/**
 * Rend `null` si le push peut partir, ou `{ motif, surLaCampagne }`. La PORTÉE ressort du verdict
 * plutôt que d'être relue dans la phrase : un appelant qui devrait chercher « CAMPAGNE ENTIÈRE »
 * dans le motif serait un parseur de prose, et un parseur de prose échoue en silence dès que la
 * phrase bouge.
 *
 * `lire`, `estVivant` et `hote` sont injectés pour que la recette exerce tous les états sans poser
 * un fichier sur le chemin de production — en poser un y bloquerait un push réel, ou pire,
 * masquerait une campagne en vol.
 */
function jugerCampagneEnVol({
  lire = () => { try { return readFileSync(CHEMIN_VERROU, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
  maintenant = new Date(), estVivant = processusVivant, hote = hostname(),
} = {}) {
  const brut = lire();
  if (brut === null || brut === undefined || String(brut).trim() === '') return null;

  let v;
  try {
    v = JSON.parse(brut);
  } catch (e) {
    return { surLaCampagne: false,
      motif: `verrou de campagne R-09 ILLISIBLE (${e.message}). On refuse plutôt que de deviner : `
        + 'ne pas savoir lire n est pas savoir qu il n y a pas de campagne.' };
  }

  const campagne = (typeof v?.campagne === 'string' && v.campagne.trim()) || '(campagne non nommée)';
  if (typeof v?.expire_a !== 'string') {
    return { surLaCampagne: v?.portee === 'campagne',
      motif: `verrou de campagne R-09 sans \`expire_a\` (« ${campagne} ») : un bail ne se devine pas.` };
  }
  const expire = new Date(v.expire_a);
  if (Number.isNaN(+expire)) {
    return { surLaCampagne: v.portee === 'campagne',
      motif: `verrou de campagne R-09 dont l \`expire_a\` (« ${v.expire_a} ») n est pas une date lisible.` };
  }
  if (maintenant.getTime() > expire.getTime()) return null; // bail dépassé : la campagne est finie.

  // Le bail court encore — mais celui qui le tient vit-il ? La question n a de sens que sur
  // l hôte qui a écrit le verrou, et un verrou d avant le 2026-08-18 ne porte pas ce champ.
  const memeHote = typeof v.hote === 'string' && v.hote === hote;
  if (memeHote && estVivant(v.pid) === false) return null; // orphelin : plus personne ne le renouvellera.

  // Un verrou d avant le 2026-08-18 ne porte pas de `portee` : c était forcément une passe.
  const surLaCampagne = v.portee === 'campagne';
  const fenetre = surLaCampagne
    ? 'La fenêtre couvre la CAMPAGNE ENTIÈRE — ses douze passes ET les intervalles entre deux '
      + 'passes, où ce dépôt était rouvert jusqu au 2026-08-18. Elle se lèvera à la fin de la '
      + 'campagne, pas à la fin de la passe en cours.'
    : 'La fenêtre couvre cette PASSE, et elle se lèvera à sa fin.';

  return { surLaCampagne,
    motif: `une CAMPAGNE DE MESURE est en vol — « ${campagne} », bail jusqu à ${expire.toISOString()}. `
      + `${fenetre} `
      + 'R-09 interdit tout build pendant une campagne ; ce push déclencherait un déploiement Coolify, '
      + 'donc un build, et la passe serait faussée sans rien annoncer.' };
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
    console.error(`PUSH REFUSÉ — ${campagne.motif}`);
    console.error('');
    console.error('  Ce n est pas un échec des tests : le code peut être parfait, c est le MOMENT qui');
    // CE QU IL FAUT ATTENDRE N EST PAS LA MÊME CHOSE SELON LA PORTÉE, et se tromper ici est ce qui
    // fait supprimer le fichier : annoncer « la fin de la passe » quand il reste une campagne
    // entière fait croire à dix minutes d attente là où il y en a quatre-vingt-dix.
    if (campagne.surLaCampagne) {
      console.error('  ne va pas. Attends la fin de la CAMPAGNE — pas la fin de la passe en cours. Le');
      console.error('  verrou se lève tout seul à la fin de la campagne, et son bail expire seul si son');
      console.error('  lanceur a été tué.');
    } else {
      console.error('  ne va pas. Attends la fin de la PASSE — le verrou se lève tout seul à sa sortie,');
      console.error('  et son bail expire seul si le chronomètre a été tué.');
    }
    console.error('  Pour lever à la main : vérifie qu aucune campagne ni aucune passe ne tourne');
    console.error('  (node scripts/p3-chrono.mjs etat, dans le dépôt de mesure), puis supprime');
    console.error(`  ${CHEMIN_VERROU}`);
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
