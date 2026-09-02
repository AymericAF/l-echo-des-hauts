#!/usr/bin/env node
// AUCUN INSTRUMENT DE CE DÉPÔT NE S'ADOSSE À LA RÉFÉRENCE **LOCALE** `main`.
//
// ── D'OÙ ELLE VIENT ───────────────────────────────────────────────────────────────────────
// Portée du dépôt de DOCUMENTATION (`docs/check-lecteurs-ref-locale.js`, commit 88c2ba7 du
// 2026-08-23), où elle a été prouvée EN CASSANT et où son périmètre a été décidé par une mesure.
// Le corps est repris tel quel ; l'en-tête est réécrit parce que les faits qui la justifient ne
// sont pas les mêmes ici, et qu'un en-tête qui recopierait les chiffres de l'autre dépôt
// mentirait sur celui-ci.
//
// ── LE DÉFAUT QU'ELLE FERME, MESURÉ SUR CE DÉPÔT-CI ───────────────────────────────────────
// La référence locale `main` d'echo-code est DÉTENUE par le worktree `_wt/code-main-instr`. Tant
// qu'un worktree tient une branche, aucune autre commande ne peut la faire avancer : elle se
// périme donc toute seule, sans que personne ne fasse rien de mal. Constaté le 2026-08-24
// (tâche `c65d3ad2`) : `main` local plusieurs commits en arrière sur `origin/main`, et le
// worktree portait ce `main` périmé EN CHECKOUT. Un run qui y teste « est-ce déjà dans main ? »
// conclut FAUX. Le parc compte 44 checkouts de ce dépôt : `code-main-instr` n'en est qu'un.
//
// Le remède jusqu'ici était une PHRASE recopiée dans les consignes de tâche. Ce dépôt a un nom
// pour ce mode d'échec — une convention ne tient pas — et c'est pourquoi la règle devient un
// programme.
//
// ── POURQUOI INTERDIRE LE LECTEUR PLUTÔT QUE RAFRAÎCHIR LA RÉFÉRENCE ──────────────────────
// L'autre voie existait : faire avancer `main` en avance rapide depuis le worktree qui la
// détient, à chaque fusion. Elle a été écartée, et pas par confort.
//
//   1. Elle écrit dans un checkout qu'elle ne possède pas. `code-main-instr` peut porter du
//      travail non commité, et l'index d'un dépôt est partagé entre session et run autonome.
//      Constater « propre » puis écrire n'est pas atomique.
//   2. Surtout, elle CONSERVE LA PRÉMISSE — que `main` local est une surface de lecture
//      légitime. Elle rétrécit la fenêtre de péremption, elle ne la ferme pas.
//
// ── L'ÉTAT DU DÉPÔT LE JOUR DE SON ARRIVÉE, ET C'EST CE QUI LA REND TENABLE ───────────────
// Mesuré le 2026-09-02 avant de l'installer, sur le corpus réel : 62 fichiers exécutables suivis,
// 93 argv git reconnus — 14 lectures de révision, 79 hors périmètre —, et ZÉRO lecteur de la
// référence locale. Elle ne demande donc aucune correction préalable : elle verrouille une
// propriété qui tient déjà. Une garde rouge le jour de son arrivée est une garde éteinte la
// semaine suivante.
//
// ── CE QU'ELLE JUGE ───────────────────────────────────────────────────────────────────────
// Un `main` écrit dans du texte n'est pas un lecteur. Ce qui périme un verdict est un `main`
// passé à git COMME RÉVISION. Elle ne juge donc QUE les ARGV : un tableau de littéraux dont le
// PREMIER élément est une sous-commande qui RÉSOUT une révision (`rev-parse`, `merge-base`,
// `rev-list`, `log`, `diff`, `show`, `merge`, `rebase`, `reset`…), et dont un élément ultérieur
// nomme la référence locale `main`. En shell, la même chose sur une ligne de commande `git …`.
//
// ⚠️ CE QU'ELLE NE JUGE PAS, ET C'EST ÉCRIT PLUTÔT QUE TU :
//   · les sous-commandes qui CRÉENT une référence locale — `init -b main`, `checkout -B main`,
//     `branch`, `worktree`, `update-ref`, `symbolic-ref`. Ce sont les bancs d'essai des recettes,
//     qui montent leur propre dépôt jetable : leur `main` à elles est légitime. Ce dépôt en compte
//     79, l'essentiel du hors-périmètre ;
//   · les sous-commandes qui nomment une référence DISTANTE — `push origin main`,
//     `fetch origin main`, `ls-remote --heads origin main`. Là, `main` désigne la branche du
//     distant, et c'est précisément la bonne pratique ;
//   · la PROSE. Les commentaires sont retirés avant toute lecture.
// Ces familles sont COMPTÉES et le rapport les annonce : un périmètre qu'on ne chiffre pas est un
// périmètre dont on ne sait pas qu'il s'est vidé.
//
// ⚠️ ELLE NE VOIT PAS un chemin d'exécution qui fabrique la révision à l'exécution
// (`['rev-parse', brancheChoisie]`). Nommé, pas comblé : le résoudre demanderait d'interpréter le
// programme, donc de deviner.
//
// ── L'AUTO-TEST EST LA MOITIÉ QUI COMPTE ──────────────────────────────────────────────────
// Son mode d'échec n'est pas de se tromper : c'est de NE RIEN TROUVER et d'appeler ça un succès.
// Elle exerce donc son propre extracteur à chaque exécution sur quatre témoins écrits ici — deux
// qui DOIVENT être refusés, deux qui NE DOIVENT PAS l'être — et rend `2` si l'un des quatre ment.
// Même exigence un cran plus bas : si le corpus ne livre AUCUN argv git reconnu, c'est `2`.
//
// ── TROIS CODES ───────────────────────────────────────────────────────────────────────────
//   0 — aucun lecteur de la référence locale `main`.
//   1 — ANOMALIE : un lecteur, NOMMÉ (fichier, ligne, argv), avec le geste attendu.
//   2 — INCAPACITÉ : `git ls-files` muet, corpus vide, aucun argv reconnu, auto-test en échec.
//
// Elle rend une SANTÉ, pas un verdict : son rouge est un défaut du dépôt à corriger.
//
// Usage : node outils/check-lecteurs-ref-locale.js

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const RACINE = path.dirname(__dirname);

/* Les sous-commandes qui RÉSOLVENT une révision. Un `main` qui leur est passé est lu dans le
   dépôt courant : c'est la référence LOCALE, et c'est elle qui se périme. */
const LECTURE = [
  'rev-parse', 'merge-base', 'rev-list', 'log', 'diff', 'show', 'describe', 'cat-file',
  'ls-tree', 'shortlog', 'name-rev', 'merge', 'rebase', 'reset', 'range-diff', 'cherry',
  'cherry-pick', 'revert', 'blame', 'archive', 'bisect',
];

/* Celles qui CRÉENT une référence locale (bancs d'essai) ou en nomment une DISTANTE. Hors
   périmètre, comptées, et la raison est écrite dans l'en-tête. */
const HORS_PERIMETRE = [
  'init', 'clone', 'checkout', 'switch', 'branch', 'push', 'fetch', 'pull', 'ls-remote',
  'remote', 'worktree', 'update-ref', 'symbolic-ref', 'commit', 'add', 'tag', 'config',
  'status', 'stash', 'clean', 'apply', 'ls-files', 'check-attr', 'check-ignore', 'hash-object',
];

const FAMILLES = /\.(js|mjs|cjs|sh)$/;

/* ── L'UNIQUE EXEMPTION, ET ELLE EST NOMINATIVE ────────────────────────────────────────────
   Cette garde et sa recette contiennent la forme interdite PAR NÉCESSITÉ : les quatre témoins de
   l'auto-test ci-dessous et les cas 1, 2 et 9 de la recette sont littéralement des argv fautifs,
   et c'est ce qui les rend capables de prouver quoi que ce soit. Sans exemption, la garde serait
   ROUGE le jour de son arrivée — six lecteurs, tous les siens —, donc éteinte la semaine suivante.

   ⚠️ ELLE EST NOMINATIVE, JAMAIS UN MOTIF. Exempter `*.recette.mjs` en général aurait suffi à
   contourner la garde : il aurait suffi de nommer un fichier ainsi. C'est l'arbitrage déjà rendu
   pour `docs/check-comptes-recette.js`, dont la propre recette porte aussi la forme qu'elle
   interdit — un autre `*.recette.mjs` y reste jugé, et le cas 14 de la recette l'établit ici.

   Ce que l'exemption coûte est COMPTÉ et imprimé : une exemption dont personne ne voit le prix
   grandit sans qu'on s'en aperçoive. */
const EXEMPTES = [
  'outils/check-lecteurs-ref-locale.js',
  'outils/check-lecteurs-ref-locale.recette.mjs',
];

function incapacite(raison) {
  process.stderr.write(
    "\n⛔ INCAPACITÉ — les lecteurs de la référence locale `main` n'ont PAS pu être jugés."
    + `\n  · ${raison}`
    + "\n\n  Ce n'est ni un succès ni un échec : rien n'a été vérifié. Un « conforme » rendu ici"
    + '\n  affirmerait quelque chose de personne — et c\'est exactement le faux vert par disette'
    + '\n  que cette garde existe pour refuser.\n',
  );
  process.exit(2);
}

/* ── L'EXTRACTEUR ──────────────────────────────────────────────────────────────────────────
   Il ne lit pas la prose : il reconnaît un TABLEAU DE LITTÉRAUX, seule forme par laquelle un
   argv git est écrit dans ce dépôt (`execFileSync('git', [...])`), et une LIGNE DE COMMANDE
   shell `git …`. Toute autre forme lui est invisible, et l'en-tête le dit. */

function sansCommentaires(source, extension) {
  if (extension === 'sh') {
    return source.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
  }
  /* Les blocs `/* … *​/` sont remplacés par des blancs de MÊME LONGUEUR : les numéros de ligne
     doivent rester ceux du fichier réel, sans quoi un rouge enverrait le lecteur au mauvais
     endroit — et un rouge qu'on doit instruire se discute au lieu de se corriger. */
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .split('\n').map((l) => l.replace(/(^|[^:/])\/\/.*$/, '$1')).join('\n');
}

/* Un élément d'argv nomme-t-il la référence LOCALE `main` ? Les désignations DISTANTES sont
   neutralisées d'abord — `origin/main`, `upstream/main`, `refs/remotes/<nom>/main` —, sans quoi
   la bonne pratique rougirait et la garde serait retirée dans la semaine. */
function nommeLaRefLocale(element) {
  /* On DÉCOUPE sur les séparateurs de révision de git — `..`, `...`, `^`, `~`, `:`, `@` — puis on
     compare les jetons À L'EXACT. Une recherche de sous-chaîne ne saurait pas distinguer
     `main...HEAD` (un lecteur) de `origin/main` (la bonne pratique) ni de `main.js` (un chemin) :
     c'est la découpe qui porte la précision, pas le motif. */
  const jetons = String(element).split(/\.{2,3}|[\^~:@\s]+/).filter(Boolean);
  return jetons.some((j) => j === 'main' || j === 'refs/heads/main');
}

/* Reconnaît les tableaux de littéraux d'un source JS. Ancré sur `[` … `]` sans imbrication :
   un argv git est plat, et refuser l'imbrication vaut mieux que de la deviner. */
function argvJs(source) {
  const trouves = [];
  const motif = /\[((?:\s*(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)\s*,?)+)\s*\]/g;
  let m;
  while ((m = motif.exec(source)) !== null) {
    const elements = [];
    const litteral = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;
    let e;
    while ((e = litteral.exec(m[1])) !== null) {
      elements.push(e[1] !== undefined ? e[1] : (e[2] !== undefined ? e[2] : e[3]));
    }
    if (elements.length) {
      trouves.push({ elements, ligne: source.slice(0, m.index).split('\n').length });
    }
  }
  return trouves;
}

/* En shell, l'argv est la ligne de commande. On retire les options longues porteuses de valeur
   (`--git-dir=…`) avant de chercher la sous-commande, qui est le premier mot non-option. */
function argvSh(source) {
  const trouves = [];
  source.split('\n').forEach((ligne, i) => {
    const commandes = ligne.split(/[;|&]{1,2}|\$\(|`/);
    for (const c of commandes) {
      const m = c.match(/(^|\s)git\s+(.+)$/);
      if (!m) continue;
      const mots = m[2].trim().split(/\s+/).filter((x) => x && !x.startsWith('-'));
      if (mots.length) trouves.push({ elements: mots, ligne: i + 1 });
    }
  });
  return trouves;
}

/* Le classement, et il est le cœur : le PREMIER élément décide. */
function classer(argv) {
  const tete = argv.elements.find((e) => !String(e).startsWith('-') && e !== 'git');
  if (!tete) return 'ignore';
  if (HORS_PERIMETRE.includes(tete)) return 'hors-perimetre';
  if (!LECTURE.includes(tete)) return 'ignore';
  const fautif = argv.elements.slice(1).find((e) => nommeLaRefLocale(e));
  return fautif ? 'lecteur' : 'lecture-saine';
}

/* ── 0. l'extracteur s'exerce sur lui-même AVANT de juger quoi que ce soit ───────────────── */
const TEMOINS = [
  { attendu: 'lecteur', argv: ['merge-base', '--is-ancestor', 'HEAD', 'main'], nom: 'POSITIF 1 — `merge-base … HEAD main`' },
  { attendu: 'lecteur', argv: ['rev-list', '--left-right', '--count', 'main...HEAD'], nom: 'POSITIF 2 — une plage `main...HEAD`' },
  { attendu: 'lecture-saine', argv: ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], nom: 'NÉGATIF 1 — la même contre `origin/main`' },
  { attendu: 'hors-perimetre', argv: ['push', '-q', 'origin', 'main'], nom: 'NÉGATIF 2 — `push origin main`, une ref DISTANTE' },
];
for (const t of TEMOINS) {
  const rendu = classer({ elements: t.argv, ligne: 0 });
  if (rendu !== t.attendu) {
    incapacite(
      `AUTO-TEST EN ÉCHEC (${t.nom}) : l'extracteur rend « ${rendu} » au lieu de « ${t.attendu} »\n`
      + `    argv exercé : [${t.argv.map((x) => `'${x}'`).join(', ')}]\n`
      + '    Il est cassé. Tout verdict vert rendu ensuite serait un verdict rendu sur rien.',
    );
  }
}

/* ── 1. le corpus ──────────────────────────────────────────────────────────────────────────
   `git ls-files`, jamais le dossier : ce qui doit être gardé est ce que le dépôt PORTE, donc ce
   qui voyage et ce que la CI lance. Un brouillon local n'est pas un lecteur du dépôt. */
let suivis;
try {
  suivis = execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' })
    .split('\n').filter((p) => p && FAMILLES.test(p));
} catch (e) {
  incapacite(`\`git ls-files\` a échoué : ${String(e.message).split('\n')[0]}`);
}
if (!suivis.length) {
  incapacite('AUCUN fichier exécutable suivi (`*.js`, `*.mjs`, `*.cjs`, `*.sh`) : le corpus est vide.');
}

/* ── 2. le verdict ─────────────────────────────────────────────────────────────────────────*/
const anomalies = [];
let argvReconnus = 0;
let horsPerimetre = 0;
let lecturesSaines = 0;
let exemptes = 0;

for (const relatif of suivis) {
  if (EXEMPTES.includes(relatif)) { exemptes++; continue; }
  const extension = relatif.split('.').pop();
  let source;
  try {
    source = readFileSync(path.join(RACINE, relatif), 'utf8');
  } catch {
    continue; // un fichier indexé mais absent du disque est le sujet de `docs/ci-gardes.js`
  }
  const net = sansCommentaires(source, extension);
  const argvs = extension === 'sh' ? argvSh(net) : argvJs(net);
  for (const argv of argvs) {
    const classe = classer(argv);
    if (classe === 'ignore') continue;
    argvReconnus++;
    if (classe === 'hors-perimetre') { horsPerimetre++; continue; }
    if (classe === 'lecture-saine') { lecturesSaines++; continue; }
    anomalies.push({
      relatif,
      ligne: argv.ligne,
      argv: argv.elements.map((x) => `'${x}'`).join(', '),
    });
  }
}

/* LE TÉMOIN DE MUTISME. Zéro argv reconnu ne veut pas dire « le dépôt est sain » : cela veut dire
   que l'extracteur n'a rien su lire. Les deux se ressemblent trait pour trait, et c'est le seul
   endroit où la différence se joue. */
if (!argvReconnus) {
  incapacite(
    `${suivis.length} fichier(s) exécutable(s) lu(s), mais AUCUN argv git reconnu.\n`
    + "    Un dépôt qui appelle git nulle part est possible ; ce dépôt-ci n'en est pas un.\n"
    + "    L'extracteur est donc muet, et un vert rendu ici ne prouverait que son mutisme.",
  );
}

console.log(
  `Lecteurs de la référence LOCALE \`main\` · ${suivis.length} fichier(s) exécutable(s) suivi(s) · `
  + `${argvReconnus} argv git reconnu(s) — ${lecturesSaines} lecture(s) de révision, `
  + `${horsPerimetre} hors périmètre (ref locale créée, ou ref DISTANTE nommée) · `
  + `${exemptes} fichier(s) EXEMPTÉ(S) nominativement sur ${EXEMPTES.length} déclaré(s)`,
);

if (!anomalies.length) {
  console.log('OK — aucun instrument ne s\'adosse à la référence locale `main`.');
  process.exit(0);
}

process.stderr.write(`\n✖ ${anomalies.length} LECTEUR(S) de la référence LOCALE \`main\` :\n`);
for (const a of anomalies) {
  process.stderr.write(
    `  · ${a.relatif}:${a.ligne} — argv [${a.argv}]\n`
    + '      La référence locale `main` de ce dépôt est détenue par le worktree\n'
    + '      `_wt/code-main-instr` ; tant qu\'un worktree la tient, elle ne peut être avancée\n'
    + '      depuis nulle part ailleurs. Elle est donc PÉRIMÉE par construction — constatée\n'
    + '      en retard sur `origin/main` le 2026-08-24 (tâche `c65d3ad2`), alors que ce\n'
    + '      worktree la portait EN CHECKOUT. Cet argv mesure un écart faux.\n'
    + '      → geste attendu : remplacer `main` par `origin/main`, après un `git fetch`.\n'
    + '        Pas rafraîchir la référence locale : elle se re-périmera dans l\'heure, et le\n'
    + '        prochain lecteur retombera dans le même trou.\n',
  );
}
process.exit(1);
