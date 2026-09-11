#!/usr/bin/env node
// Recette de `.githooks/check-eol-octets.js` — la garde prouvee EN LA CASSANT.
//
// POURQUOI ELLE EXISTE. Le defaut vise est SILENCIEUX : un fichier `-text` en CRLF ne casse
// rien, ne leve aucune erreur, et git ne signale strictement rien — il fait exactement ce
// qu'on lui a demande, ne rien convertir. Il ne se decouvre qu'au pire moment, a la fusion
// (une vasque de conflit sur tout le fichier) ou au recalcul d'une empreinte de provenance.
// Rien, dans un depot vert, ne distingue une garde qui surveille ca d'une garde qui ne voit
// rien : une garde qu'on n'a jamais vue rougir est une convention, pas une garantie
// ([[garantie-par-mecanisme-pas-convention]]).
//
// LES DEUX CAS CENTRAUX sont le 2 et le 5 : un fichier `-text` en CRLF doit faire echouer la
// garde EN LE NOMMANT, dans le mode complet comme dans le mode `--indexe` du crochet. Les cas
// 1 et 4 sont leurs contre-epreuves — sans eux, le rouge pourrait venir d'une garde qui refuse
// tout, ce qui ne prouverait rien.
//
// LE CAS 3 EST CELUI QUI A MOTIVE LE RESTE. `.gitattributes` absent : l'ensemble examine se
// vide, et une garde ecrite naivement rend `0` en imprimant un vert — indiscernable du vert
// d'un depot sain. Le piege s'est produit dans ce depot le 2026-08-20 sur une AUTRE garde, qui
// annoncait « TOUS FRAIS » avec 2 entrees sur 5 ; seul le COMPTE l'attrapait. Ici il rend 2.
//
// LE CAS 6 tient la frontiere entre les deux modes, et c'est elle qui rend le crochet
// supportable : un CRLF PREEXISTANT que le commit ne touche pas ne doit PAS bloquer ce commit.
// Sans cette propriete, le crochet refuserait tous les commits du depot tant que le defaut du
// 2026-08-12 n'est pas arbitre — et un crochet qui bloque tout finit desarme par `--no-verify`.
//
// LE CAS 7 ferme la porte inverse : un binaire `-text` (les 66 captures PNG du depot) contient
// la sequence `0d 0a` comme DONNEE. Le compter serait un faux rouge permanent sur des fichiers
// qu'on ne peut pas « corriger », et un faux rouge permanent eteint une garde aussi surement
// qu'un faux vert.
//
// METHODE, reprise des recettes du depot : chaque cas construit un vrai depot git jetable, y
// introduit UNE perturbation, lance la garde avec ce dossier pour `cwd`, et lit le code de
// sortie et la sortie. Un depot reel plutot qu'un git simule : la garde interroge `git ls-files`,
// `git check-attr` et `git cat-file`, dont le comportement EST ce qu'on verifie.
//
// ── LE DÉPÔT JETABLE EST BORNÉ, ET IL SE NETTOIE (2026-08-23, tâche `f0d77466`) ────────────
// Cette recette créait ses dépôts jetables sous un préfixe commun à TOUTES les exécutions, et
// elle n'en effaçait AUCUN. Ce n'est pas une gêne de disque : le répertoire temporaire est celui
// de l'utilisateur, partagé avec tout ce qui tourne sur le poste, et un banc qui y laisse ses
// traces finit par juger sur celles des autres. La FORME appliquée ici est RECOPIÉE de
// `.githooks/detect-secrets.recette.mjs` (commit `2dad990`), elle n'est pas réinventée : deux
// recettes qui nettoient de deux façons sont une convention de plus à tenir.
//
// Quatre bornes, et aucune ne remplace les trois autres :
//
//   · LE NOM. `mkdtemp` tirait six caractères au sort sous un préfixe commun à TOUTES les
//     exécutions. Le nom porte désormais le PID de la course, son instant de départ et le rang
//     du dépôt dans la course : deux exécutions concurrentes ne peuvent plus se disputer un nom,
//     et un reliquat se rattache au processus qui l'a laissé.
//   · LA CRÉATION. Un `mkdtemp` qui échoue faisait remonter une exception nue ; elle NOMME
//     maintenant le chemin qu'elle n'a pas pu créer, et dit de quel côté est le défaut — c'est
//     le banc qui n'a pas tenu, ce n'est pas la garde qui a mal jugé.
//   · LE NETTOYAGE, DANS UN `finally`. Il ne suffit pas qu'il soit écrit : il faut qu'il tourne
//     quand la recette casse au milieu, qui est précisément le moment où personne ne le fera à
//     la main. Un nettoyage sur le chemin nominal ne nettoie que les jours où tout va bien. Il
//     rend en outre la liste de ce qu'il n'a pas pu effacer, et cette liste ROUGIT la recette :
//     c'est la seule position d'où son échec pèse encore sur le code de sortie.
//   · CE QU'IL NE NETTOIE PAS. Le dépôt d'un cas EN ÉCHEC est CONSERVÉ, et son chemin imprimé
//     avec SA RAISON. Un nettoyage qui emporte tout emporte aussi la seule matière qui explique
//     le rouge. Tout conserver est un défaut ; conserver le fautif est le contraire d'un défaut.
//
// ⚠️ CE QUE CETTE PASSE NE FAIT PAS, écrit plutôt que laissé à croire : elle n'efface rien de ce
// que les exécutions passées ont laissé dans le répertoire temporaire. Une suppression par MOTIF
// dans le répertoire temporaire de l'utilisateur ne serait pas un nettoyage mais un balayage sur
// les fichiers des autres. Ce qui est effacé ici, et rien d'autre, ce sont les chemins que CETTE
// course a construits et gardés en mémoire.
//
// Usage : node .githooks/check-eol-octets.recette.mjs   (rend 0 au vert)

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── LE DÉPÔT JETABLE ─────────────────────────────────────────────────────────────────────
   Le nom d'un dépôt appartient à SA course, et à elle seule : le PID, l'instant de départ, et le
   rang du dépôt dans la course. Cf. l'en-tête, puce « LE NOM ». Le rang est écrit sur une largeur
   de trois chiffres pour qu'un listing se trie dans l'ordre des cas — c'est un format d'affichage,
   pas un compte de cas. */
const COURSE = `${process.pid}-${Date.now().toString(36)}`;
let rangDuDepot = 0;
const depots = [];

function cheminJetable(prefixe) {
  const gabarit = join(tmpdir(), `${prefixe}${COURSE}-${String(++rangDuDepot).padStart(3, '0')}-`);
  let d;
  try {
    d = mkdtempSync(gabarit);
  } catch (e) {
    /* Une erreur EXPLICITE, jamais une trace de pile : elle nomme le chemin qu'elle n'a pas pu
       créer et dit de quel côté est le défaut. */
    throw new Error(`DÉPÔT JETABLE NON CRÉÉ — mkdtemp(\`${gabarit}*\`) a échoué : `
      + `${e.code || ''} ${String(e.message).split('\n')[0]}`
      + `\n→ le banc d'essai n'a pas pu être monté ; ce cas ne dit RIEN de la garde.`);
  }
  depots.push({ chemin: d, garder: null });
  return d;
}

/* `garder` porte la RAISON de la conservation, jamais un booléen nu : elle s'imprime telle quelle,
   pour qu'un dépôt survivant ne se lise jamais comme un oubli. */
function conserverLeDernierDepot(raison) {
  if (depots.length) depots[depots.length - 1].garder = raison;
}

/* ⚠️ LE PÉRIMÈTRE DE LA SUPPRESSION, ET IL N'EST PAS NÉGOCIABLE : ce nettoyage n'efface QUE les
   chemins de `depots`, c'est-à-dire ceux que `cheminJetable` a construits dans cette course et
   gardés en mémoire. Jamais un balayage par motif sur le répertoire temporaire — c'est celui de
   l'utilisateur, il porte les fichiers de tout ce qui tourne sur ce poste.

   Il REND la liste de ce qu'il n'a pas pu effacer, au lieu de l'avaler.

   ⚠️ NE PAS LIRE `maxRetries: 5, retryDelay: 120` COMME UNE REPRISE QUI A LIEU — sur cette
   plateforme elle n'a lieu sur AUCUN des verrous que ce banc sait fabriquer, et c'est MESURÉ,
   pas espéré. Sur un `EPERM` de DOSSIER — le seul verrou fabricable ici : faire du banc le
   répertoire courant d'un processus vivant — la fenêtre de reprise ne s'ouvre JAMAIS. La seule
   preuve qu'une reprise a eu lieu serait le temps passé dans l'appel de suppression, et il vaut
   ZÉRO MILLISECONDE dans les SEPT montages essayés : `maxRetries` à 0, à 5, à 20, à 3 avec un
   `retryDelay: 2000`, puis trois verrous transitoires lâchés à 600, 900 et 1 500 ms, tous à
   l'intérieur de la fenêtre que le réglage promet. Un `retryDelay` de deux secondes qui ne
   coûte RIEN est la preuve directe qu'aucune reprise n'est tentée : une seule aurait duré au
   moins ce délai. Mesuré le 2026-08-24 sous Windows, Node v24.14.0 —
   `docs/constat-branche-depot-non-effacable.md` §5 porte les sept montages et leurs verdicts.

   IL EST CONSERVÉ QUAND MÊME, et pour une seule raison : l'AUTRE classe de verrou, celle que ce
   banc ne sait PAS fabriquer — un handle tenu par un TIERS sur un FICHIER, cet analyseur qui
   n'a pas lâché ce qu'on vient d'écrire. Cette classe-là n'a PAS été reproduite ; le réglage
   n'y a donc jamais été vu servir non plus. Le conserver est un pari assumé, pas un mécanisme
   dont on aurait constaté le travail.

   Ce qui survit est un vrai reliquat. Ce qui est CONSERVÉ À DESSEIN n'en est pas un : il sort
   par l'autre liste. */
function nettoyerLesDepots() {
  const restants = [];
  const gardes = [];
  while (depots.length) {
    const b = depots.shift();
    if (b.garder) { gardes.push(`${b.chemin}  (${b.garder})`); continue; }
    try { rmSync(b.chemin, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }); }
    catch (e) { restants.push(`${b.chemin}  (${e.code || ''} ${String(e.message).split('\n')[0]})`); }
  }
  return { restants, gardes };
}

/* RENDRE COMPTE EST LA MOITIÉ DU DISPOSITIF, et cette fonction est appelée depuis le `finally`,
   jamais depuis le verdict : une panne forcée au milieu de la recette interrompt tout AVANT le
   verdict, et le dépôt conservé le serait alors EN SILENCE — le défaut d'origine en miniature. Un
   dépôt effacé sans un mot et un dépôt jamais créé se ressemblent exactement, vus de la sortie. */
function rendreCompteDesDepots(restants, gardes) {
  if (gardes.length) {
    console.log(`\n  CONSERVÉS À DESSEIN (${gardes.length}) — le banc des cas fautifs, pour le diagnostic :`);
    for (const g of gardes) console.log(`      ${g}`);
    console.log('        → à effacer une fois le rouge compris.');
  }
  if (restants.length) {
    console.log(`\n  ECHEC nettoyage — ${restants.length} dépôt(s) jetable(s) n'ont pas pu être effacés :`);
    for (const r of restants) console.log(`      ${r}`);
    console.log("        → ce n'est pas un défaut de la garde ; c'est le banc qui laisse des traces,");
    console.log('          et un banc qui laisse des traces finit par juger sur celles des autres.');
  }
}

/* Filet de dernier recours, pour les morts qui ne passent pas par le `finally` — et il y en a :
   `process.exit()` ne déroule AUCUN `finally`. Un gestionnaire d'`exit` ne peut plus peser sur le
   code de sortie ; ce qu'il peut encore faire, c'est ne pas mentir par omission. */
process.on('exit', () => {
  const { restants, gardes } = nettoyerLesDepots();
  rendreCompteDesDepots(restants, gardes);
});

/* Le `finally` de la boucle de cas remplit ces trois-là ; le verdict, en bas, les lit. */
let reliquats = [];
let conserves = [];
let finNormale = false;

const ICI = dirname(fileURLToPath(import.meta.url));
const GARDE = 'check-eol-octets.js';

const g = (d, args) =>
  execFileSync('git', args, { cwd: d, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

/* Les octets sont le sujet : on les ecrit en Buffer, jamais via une chaine que l'environnement
   pourrait normaliser. Ce poste a deja fait disparaitre un `\r` en le faisant transiter par le
   shell — une recette sur les fins de ligne ne peut pas dependre de ce chemin-la. */
const LF = (lignes) => Buffer.from(lignes.map((l) => l + '\n').join(''), 'utf8');
const CRLF = (lignes) => Buffer.from(lignes.map((l) => l + '\r\n').join(''), 'utf8');

/** Un PNG minimal VALIDE au sens de la garde : il contient un octet nul, donc il est binaire. */
const PNG_AVEC_CRLF = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature PNG — elle contient `0d 0a`
  0x00, 0x00, 0x00, 0x0d, // octets nuls : c'est ce qui le rend binaire
  0x49, 0x48, 0x44, 0x52, 0x0d, 0x0a, // et un second `0d 0a`, en donnee
]);

function initDepot(prefixe) {
  const d = cheminJetable(prefixe);
  copyFileSync(join(ICI, GARDE), join(d, GARDE));
  g(d, ['init', '-q']);
  g(d, ['config', 'user.email', 'recette@local']);
  g(d, ['config', 'user.name', 'recette']);
  g(d, ['config', 'commit.gpgsign', 'false']);
  /* Le reglage qui CAUSE le defaut sur le poste de mesure. Sans lui la recette verifierait une
     situation qui n'est pas celle qu'on garde : c'est `core.autocrlf=true` qui normalisait les
     fichiers ORDINAIRES, et `-text` qui retire ce filet aux fichiers proteges. */
  g(d, ['config', 'core.autocrlf', 'true']);
  return d;
}

/**
 * @param {object} o
 * @param {string|null} o.attributs contenu de `.gitattributes` (null = pas de fichier)
 * @param {Record<string, Buffer>} o.commits fichiers ecrits ET commites
 * @param {Record<string, Buffer>} o.indexes fichiers ecrits ET indexes, sans commit
 */
function depotJetable({ attributs, commits = {}, indexes = {} }) {
  const d = initDepot('recette-eol-octets-');
  const ecrire = (rel, buf) => {
    mkdirSync(join(d, dirname(rel)), { recursive: true });
    writeFileSync(join(d, rel), buf);
  };
  if (attributs !== null) ecrire('.gitattributes', Buffer.from(attributs, 'utf8'));
  for (const [rel, buf] of Object.entries(commits)) ecrire(rel, buf);
  g(d, ['add', '-A']);
  g(d, ['commit', '-q', '-m', 'temoin']);
  for (const [rel, buf] of Object.entries(indexes)) {
    ecrire(rel, buf);
    g(d, ['add', '--', rel]);
  }
  return d;
}

/* `spawnSync` et non `execFileSync` : la garde ecrit son VERT sur `stderr`, comme toutes les
   gardes de ce depot, et `execFileSync` ne rend que `stdout` quand le code est 0. */
function lancer(d, args = []) {
  const r = spawnSync(process.execPath, [GARDE, ...args], { cwd: d, encoding: 'utf8' });
  return { code: r.status ?? 'aucun', sortie: (r.stdout || '') + (r.stderr || '') };
}

let echecs = 0;
let joues = 0;
const cas = (nom, { args = [], attendu, motifs = [], interdits = [] }, construire) => {
  joues++;
  let r;
  try {
    r = lancer(construire(), args);
  } catch (e) {
    r = { code: 'exception', sortie: String((e && e.stack) || e) };
  }
  const codeOk = r.code === attendu;
  const manquants = motifs.filter((m) => !new RegExp(m).test(r.sortie));
  const presents = interdits.filter((m) => new RegExp(m).test(r.sortie));
  if (codeOk && manquants.length === 0 && presents.length === 0) {
    console.log(`  OK    ${nom}`);
    return;
  }
  echecs++;
  /* LE DÉPÔT DU CAS FAUTIF SURVIT, et lui seul : c'est là que vit tout ce qui permet de
     comprendre le rouge. Un nettoyage qui emporte tout emporte aussi le diagnostic. */
  conserverLeDernierDepot(`cas en échec : ${nom}`);
  console.error(`  ECHEC ${nom}`);
  if (!codeOk) console.error(`        code attendu ${attendu}, obtenu ${r.code}`);
  for (const m of manquants) console.error(`        motif ABSENT de la sortie : ${m}`);
  for (const m of presents) console.error(`        motif INTERDIT present    : ${m}`);
  console.error(`        --- sortie ---\n${r.sortie.split('\n').map((l) => '        ' + l).join('\n')}`);
};

try {
  console.log('Recette de check-eol-octets.js — la garde prouvee en la cassant\n');

  // ─────────────────────────────────────────────────────────── mode complet (celui de la CI)
  cas(
    '1  tout en LF -> 0, et le vert COMPTE ce qu il a examine',
    /* Les 4 chemins suivis sont `.gitattributes`, les deux `scripts/*.mjs`, et la garde elle-meme
       que `depotJetable` copie a la racine du depot temoin. Le compte est verifie EXPLICITEMENT :
       c est lui, et lui seul, qui distingue un vert rendu sur le bon perimetre d un vert rendu
       sur un ensemble qui s est vide en silence. */
    { attendu: 0, motifs: ['2 fichier\\(s\\) `-text` textuel\\(s\\) sans un seul CRLF', 'sur 4 chemin\\(s\\) suivis'] },
    () =>
      depotJetable({
        attributs: 'scripts/** -text\n',
        commits: {
          'scripts/a.mjs': LF(['const a = 1;', 'export default a;']),
          'scripts/b.mjs': LF(['const b = 2;']),
        },
      }),
  );

  cas(
    '2  LE CAS CENTRAL — un fichier `-text` en CRLF -> 1, et il est NOMME',
    {
      attendu: 1,
      motifs: ['1 fichier\\(s\\) `-text` portent des CRLF', 'scripts/b\\.mjs — 2 fin\\(s\\) de ligne CRLF', 'ENTIEREMENT en CRLF'],
      /* Le fichier SAIN ne doit pas etre nomme : une garde qui liste tout ne fait trier personne. */
      interdits: ['scripts/a\\.mjs —'],
    },
    () =>
      depotJetable({
        attributs: 'scripts/** -text\n',
        commits: {
          'scripts/a.mjs': LF(['const a = 1;']),
          'scripts/b.mjs': CRLF(['const b = 2;', 'export default b;']),
        },
      }),
  );

  cas(
    '3  LA PORTE DEROBEE — `.gitattributes` absent : l ensemble examine se vide -> 2, JAMAIS 0',
    {
      attendu: 2,
      motifs: ['VERIFICATION IMPOSSIBLE', 'AUCUN\\s+n.est textuel|AUCUN', 'ressemble trait pour trait'],
      /* Le fichier EST en CRLF. Sans attribut il n est pas juge — mais se taire en vert serait
         affirmer qu on a regarde. Le compte est la seule chose qui distingue les deux. */
      interdits: ['sans un seul CRLF'],
    },
    () =>
      depotJetable({
        attributs: null,
        commits: { 'scripts/b.mjs': CRLF(['const b = 2;']) },
      }),
  );

  cas(
    '4  contre-epreuve du 2 — les MEMES octets CRLF, mais hors `-text` : la garde se tait',
    {
      attendu: 0,
      motifs: ['sans un seul CRLF'],
      interdits: ['scripts/b\\.mjs'],
    },
    /* `docs/** -text` couvre un autre dossier : `scripts/b.mjs` reste un fichier `text` ordinaire,
       que `core.autocrlf=true` normalise de lui-meme au `git add`. C est le filet dont `-text`
       prive les fichiers proteges — et la raison d etre de cette garde. */
    () =>
      depotJetable({
        attributs: 'docs/** -text\n',
        commits: {
          'docs/x.csv': LF(['a,b', '1,2']),
          'scripts/b.mjs': CRLF(['const b = 2;']),
        },
      }),
  );

  // ──────────────────────────────────────────── mode `--indexe` (celui du crochet de pre-commit)
  cas(
    '5  LE SECOND CAS CENTRAL — `--indexe` : un CRLF que CE commit introduit -> 1, et il est NOMME',
    {
      args: ['--indexe'],
      attendu: 1,
      motifs: ['scripts/neuf\\.mjs — 2 fin\\(s\\) de ligne CRLF', 'ajoutes ou modifies par ce commit'],
    },
    () =>
      depotJetable({
        attributs: 'scripts/** -text\n',
        commits: { 'scripts/a.mjs': LF(['const a = 1;']) },
        indexes: { 'scripts/neuf.mjs': CRLF(['const n = 3;', 'export default n;']) },
      }),
  );

  cas(
    '6  LA FRONTIERE DES DEUX MODES — `--indexe` ne punit PAS un CRLF preexistant non touche',
    {
      args: ['--indexe'],
      attendu: 0,
      /* `scripts/vieux.mjs` est en CRLF depuis le commit temoin, et le reste. Le commit en cours
         n ajoute qu un fichier sain : il doit passer. Le mode complet, lui, le voit toujours —
         c est le cas 2 qui le prouve. */
      interdits: ['vieux\\.mjs'],
      motifs: ['sans un seul CRLF'],
    },
    () =>
      depotJetable({
        attributs: 'scripts/** -text\n',
        commits: { 'scripts/vieux.mjs': CRLF(['const v = 0;']) },
        indexes: { 'scripts/sain.mjs': LF(['const s = 1;']) },
      }),
  );

  cas(
    '7  un BINAIRE `-text` dont les octets contiennent `0d 0a` n est PAS un fautif',
    {
      attendu: 0,
      motifs: ['1 binaire\\(s\\) ecarte\\(s\\)', '1 fichier\\(s\\) `-text` textuel\\(s\\) sans un seul CRLF'],
      interdits: ['capture\\.png —'],
    },
    () =>
      depotJetable({
        attributs: 'docs/** -text\n',
        commits: {
          'docs/capture.png': PNG_AVEC_CRLF,
          'docs/notes.csv': LF(['a,b', '1,2']),
        },
      }),
  );

  cas(
    "8  `--indexe` sur un commit qui ne touche AUCUN `-text` -> 0, en disant sur quoi il a porte",
    {
      args: ['--indexe'],
      attendu: 0,
      motifs: ['1 chemin\\(s\\) ajoutes ou modifies par ce commit', '0 sous `-text`', 'aucun octet de fin de ligne a juger'],
    },
    /* Le cas ordinaire : on commite un document. Le vert doit dire QUE le perimetre etait vide,
       pas laisser croire qu il a inspecte quelque chose. */
    () =>
      depotJetable({
        attributs: 'scripts/** -text\n',
        commits: { 'scripts/a.mjs': LF(['const a = 1;']) },
        indexes: { 'LISEZMOI.md': LF(['# titre', 'du texte']) },
      }),
  );
  finNormale = true;
} finally {
  /* LE NETTOYAGE EST ICI, ET DANS UN `finally` — jamais sur le chemin nominal. Une recette
     qui casse au milieu est exactement le moment où personne ne nettoiera à la main, et
     c'est ainsi que le répertoire temporaire s'est rempli. */
  if (!finNormale) conserverLeDernierDepot("cas en cours quand la recette s'est interrompue");
  ({ restants: reliquats, gardes: conserves } = nettoyerLesDepots());
  rendreCompteDesDepots(reliquats, conserves);
}

console.log('');
if (echecs > 0) {
  console.error(`${echecs} cas en echec sur ${joues} — la garde ne prouve pas ce qu elle annonce.`);
  process.exitCode = 1;
} else {
  console.log(`${joues} cas, tous verts : la garde nomme un fichier \`-text\` en CRLF dans ses deux`);
  console.log('modes, se tait sur les octets qu elle ne garde pas, ecarte les binaires, et refuse');
  console.log('de rendre un vert quand l ensemble qu elle examine s est vide.');
}

/* Le nettoyage a eu lieu dans le `finally` ci-dessus, et il a RENDU COMPTE lui-même. Ce qui
   reste ici est l'arithmétique du code de sortie — un dépôt qu'on n'a pas pu effacer ROUGIT,
   et c'est la seule position d'où son échec pèse encore dessus. */
if (reliquats.length) {
  console.error(`RECETTE ROUGE — ${reliquats.length} dépôt(s) jetable(s) non nettoyé(s).`);
  process.exitCode = 1;
}
