#!/usr/bin/env node
// UN FICHIER `-text` NE DOIT PAS CONTENIR DE CRLF — et c'est aux OCTETS qu'on le demande.
//
// ── LE TROU QUE CETTE GARDE FERME, ET POURQUOI IL N'ETAIT PAS DEJA FERME ────────────────────
// `docs/check-eol-archives.js` existe depuis le 2026-08-16 et garde LA PROMESSE : que tout
// fichier de `docs/mesures/` porte bien l'attribut `-text`. Elle le dit elle-meme, en toutes
// lettres : « Elle ne lit pas les octets ». C'est un choix juste POUR CE QU'ELLE GARDE — les
// octets de la copie de travail dependent de QUAND le fichier a ete ecrit, pas de ce que le
// depot promet.
//
// Mais `-text` ne promet pas « ce fichier est en LF ». Il promet « git ne convertira rien, dans
// aucun sens ». Les deux ne sont pas la meme chose, et l'ecart entre elles est EXACTEMENT le
// defaut qu'on garde ici :
//
//   · sans `-text`, un fichier ecrit en CRLF par un outil Windows est NORMALISE en LF au
//     `git add` par `core.autocrlf=true` (le reglage de ce poste). Git rattrapait l'outil ;
//   · avec `-text`, git ne touche plus a rien — donc il ne rattrape plus rien non plus. Les
//     CRLF de l'outil entrent TELS QUELS dans la base d'objets, et y restent.
//
// `-text` n'a donc pas seulement protege les octets : il a aussi retire le filet qui masquait
// les outils qui ecrivent en CRLF. C'est un effet de bord de la protection elle-meme, et rien
// dans le depot ne le surveillait.
//
// ── CE QUE CA A COUTE, DEUX FOIS ───────────────────────────────────────────────────────────
//   1. `docs/check-instruments-mesure.js` converti EN ENTIER en CRLF sur une branche (1453
//      lignes reecrites pour 219 reellement ajoutees). Le fichier est devenu INMERGEABLE : un
//      conflit d'une seule vasque couvrant les lignes 1 a 2716. Rattrape a la main au moment de
//      la fusion, par vigilance humaine — sans elle, la conversion entrait telle quelle.
//   2. `scripts/fenetre-nettoyage.recette.mjs`, NE EN CRLF le 2026-08-12 (commit `ec76462`) et
//      toujours en CRLF sur `main` neuf jours plus tard. Personne ne l'a vu. Son fichier frere
//      `scripts/lib/fenetre-nettoyage.mjs`, cree DANS LE MEME COMMIT, est en LF : la conversion
//      est venue de l'ecriture d'UN fichier, pas du commit.
//
// Pourquoi ce n'est pas cosmetique : ces fichiers portent des EMPREINTES. Chaque instrument
// depose un `provenance.json` avec le SHA-256 de son propre source, et
// `docs/check-instruments-mesure.js` le RECALCULE. Un passage en CRLF change les octets, donc
// les SHA, donc INVALIDE des declarations de provenance — sans que git ne signale quoi que ce
// soit, puisqu'il fait precisement ce qu'on lui a demande : ne rien toucher.
//
// ── LES DEUX MODES, ET LEQUEL SERT A QUOI ──────────────────────────────────────────────────
//   (defaut)   tout l'arbre indexe — le verdict complet. C'est celui de la CI.
//   --indexe   les seuls chemins que CE commit ajoute ou modifie. C'est celui du crochet de
//              pre-commit : il refuse un commit qui INTRODUIT des CRLF, sans punir un defaut
//              preexistant que personne ne touche. Sans cette distinction, le crochet bloquerait
//              tous les commits du depot tant que le defaut du 2026-08-12 n'est pas arbitre —
//              et un crochet qui bloque tout est un crochet qu'on desarme avec `--no-verify`.
//
// ── CE QU'ELLE LIT, ET CE QU'ELLE NE LIT PAS ───────────────────────────────────────────────
// Elle lit le BLOB DE L'INDEX (`git cat-file blob :<chemin>`), pas le fichier sur le disque.
// C'est ce que le commit enregistrera, et c'est la seule chose qui voyage. Le fichier de la
// copie de travail, lui, peut differer legitimement sur un fichier `text` ordinaire.
//
// Les blobs BINAIRES (contenant un octet nul) sont ecartes : 66 des 428 fichiers `-text` de ce
// depot sont des captures PNG, ou la sequence `0d 0a` est une donnee, pas une fin de ligne.
//
// ⚠️ SA LIMITE, NOMMEE PLUTOT QUE DECOUVERTE. Elle lit le `.gitattributes` DE CE CHECKOUT. Un
// checkout perime dont le `.gitattributes` couvre moins de chemins jugera donc un ensemble plus
// petit — et rendra vert sur un perimetre qu'il n'annonce pas. C'est pourquoi elle COMPTE
// toujours ce qu'elle a examine, dans les deux sens : un vert qui ne dit pas sur combien de
// fichiers il porte est indiscernable d'un vert sur rien.
//
// ── LES TROIS CODES ────────────────────────────────────────────────────────────────────────
//   0 — conforme : aucun fichier `-text` textuel ne porte de CRLF.
//   1 — ANOMALIE : au moins un en porte. Ils sont NOMMES, avec leur compte de CRLF.
//   2 — INCAPACITE : git n'a pas repondu, ou (mode complet) l'ensemble examine est VIDE. Zero
//       fichier examine n'est pas « tout va bien » : c'est un verdict rendu sur personne.
//
// Usage : node .githooks/check-eol-octets.js [--indexe]

'use strict';

const { execFileSync } = require('node:child_process');

const MODE_INDEXE = process.argv.includes('--indexe');

/* Le depot juge, c'est celui dont depend le commit en cours : la racine de la copie de travail.
   Un run qui lance la garde depuis un sous-dossier jugerait sinon un perimetre tronque. */
let RACINE;
try {
  RACINE = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (e) {
  incapacite(`\`git rev-parse --show-toplevel\` a echoue : ${premiereLigne(e)}`);
}

function premiereLigne(e) {
  return String((e && e.message) || e).split('\n')[0];
}

function incapacite(raison) {
  process.stderr.write(
    `\n⛔ VERIFICATION IMPOSSIBLE — les fins de ligne des fichiers \`-text\` n'ont PAS ete jugees.` +
      `\n  · ${raison}` +
      `\n\n  Ce n'est ni un succes ni un echec. Un « conforme » rendu ici affirmerait quelque chose` +
      `\n  de personne, et c'est exactement ce que les gardes de ce depot refusent de faire.\n`,
  );
  process.exit(2);
}

function git(args, options) {
  return execFileSync('git', args, {
    cwd: RACINE,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
}

// ------------------------------------------------------------------ 1. les chemins a examiner
let chemins;
try {
  const brut = MODE_INDEXE
    ? /* `--diff-filter=ACMR` : ce que ce commit AJOUTE ou MODIFIE. Une suppression n'introduit
         aucun octet, et la juger ferait echouer sur un fichier qui s'en va. */
      git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { encoding: 'utf8' })
    : git(['ls-files', '-z'], { encoding: 'utf8' });
  chemins = brut.split('\0').filter(Boolean);
} catch (e) {
  incapacite(`git n'a pas rendu la liste des chemins : ${premiereLigne(e)}`);
}

const TOTAL_CHEMINS = chemins.length;

if (TOTAL_CHEMINS === 0) {
  if (MODE_INDEXE) {
    /* Un commit vide (ou qui ne fait que supprimer) n'introduit aucun octet. Rien a juger, et
       le dire est honnete : ce n'est pas un vert sur un perimetre qu'on aurait rate. */
    process.stderr.write('✔ aucun chemin ajoute ni modifie dans ce commit : aucun octet a juger.\n');
    process.exit(0);
  }
  incapacite('`git ls-files` ne rend AUCUN fichier suivi.');
}

// ------------------------------------------------------ 2. lesquels portent l'attribut `-text`
/* Un seul appel a `check-attr` : 659 processus git seraient lents pour rien, et le crochet de
   pre-commit doit rester assez rapide pour qu'on ne cherche pas a le contourner. */
let reponse;
try {
  reponse = git(['check-attr', '--stdin', '-z', 'text'], {
    input: chemins.join('\0'),
    encoding: 'utf8',
  });
} catch (e) {
  incapacite(`\`git check-attr\` a echoue : ${premiereLigne(e)}`);
}

/* Sortie `-z` : des triplets NUL-separes <chemin> <attribut> <valeur>. `unset` est ce que rend
   `-text` — l'attribut RETIRE, aucune conversion dans aucun sens. */
const champs = reponse.split('\0').filter((c) => c !== '');
const sousText = [];
for (let i = 0; i + 2 < champs.length; i += 3) {
  if (champs[i + 2] === 'unset') sousText.push(champs[i]);
}

// --------------------------------------------------------------- 3. LES OCTETS, un a un
/* `git cat-file --batch` : un seul processus pour tous les blobs. La sortie est BINAIRE et se
   parse en octets — la decoder en texte reintroduirait exactement le genre de conversion que
   cette garde existe pour attraper. Format par entree :
     <sha> SP <type> SP <taille> LF <contenu> LF
   ou bien `<objet> SP missing LF` si l'entree n'existe pas dans l'index. */
let flux;
try {
  flux = sousText.length === 0
    ? Buffer.alloc(0)
    : git(['cat-file', '--batch'], { input: sousText.map((p) => `:${p}`).join('\n') + '\n' });
} catch (e) {
  incapacite(`\`git cat-file --batch\` a echoue : ${premiereLigne(e)}`);
}

const fautifs = [];
const manquants = [];
let binaires = 0;
let textuels = 0;

{
  let pos = 0;
  for (const chemin of sousText) {
    const finEntete = flux.indexOf(0x0a, pos);
    if (finEntete === -1) {
      incapacite(
        `\`git cat-file --batch\` s'est arrete avant \`${chemin}\` : ` +
          `${sousText.length} blobs demandes, la sortie est tronquee.`,
      );
    }
    const entete = flux.toString('latin1', pos, finEntete);
    const morceaux = entete.split(' ');

    if (morceaux[1] === 'missing' || morceaux[1] === undefined) {
      /* Le chemin est suivi mais n'a pas de blob a l'etage 0 : conflit de fusion non resolu,
         ou index en cours de reecriture. On ne devine pas — on le NOMME. */
      manquants.push(chemin);
      pos = finEntete + 1;
      continue;
    }

    const taille = Number(morceaux[2]);
    if (!Number.isFinite(taille)) {
      incapacite(`entete illisible rendue par \`git cat-file --batch\` pour \`${chemin}\` : "${entete}"`);
    }

    const debut = finEntete + 1;
    const contenu = flux.subarray(debut, debut + taille);
    pos = debut + taille + 1; /* le LF de separation */

    /* Un octet nul = binaire. La meme heuristique que git lui-meme, et la seule qui compte ici :
       dans un PNG, `0d 0a` est une donnee, pas une fin de ligne. */
    if (contenu.includes(0)) {
      binaires++;
      continue;
    }
    textuels++;

    let crlf = 0;
    let i = -1;
    while ((i = contenu.indexOf('\r\n', i + 1)) !== -1) crlf++;
    if (crlf === 0) continue;

    let lf = 0;
    let j = -1;
    while ((j = contenu.indexOf('\n', j + 1)) !== -1) lf++;
    fautifs.push({ chemin, crlf, lfSeuls: lf - crlf });
  }
}

if (manquants.length > 0) {
  incapacite(
    `${manquants.length} chemin(s) suivis n'ont pas de blob a l'etage 0 de l'index ` +
      `(fusion non resolue ?) : ${manquants.slice(0, 5).join(', ')}` +
      (manquants.length > 5 ? ` … et ${manquants.length - 5} autre(s)` : ''),
  );
}

// ------------------------------------------------------------------------- 4. le verdict
const PORTEE = MODE_INDEXE ? 'ajoutes ou modifies par ce commit' : 'suivis';

if (!MODE_INDEXE && textuels === 0) {
  /* Le trou le plus vicieux, et il est arrive dans ce depot : une extraction qui se vide rend
     `0` et imprime un vert, indiscernable du vert d'un depot sain. En mode complet, ce depot a
     des centaines de fichiers `-text` : zero signifie que l'extraction est cassee, pas que tout
     va bien. */
  incapacite(
    `sur ${TOTAL_CHEMINS} chemin(s) ${PORTEE}, ${sousText.length} portent \`-text\` et AUCUN ` +
      `n'est textuel.\n  · Un vert rendu sur zero fichier ressemble trait pour trait au vert ` +
      `d'un depot sain.\n  · Verifie que \`.gitattributes\` est bien present dans ce checkout.`,
  );
}

if (fautifs.length > 0) {
  const lignes = fautifs
    .map((f) => `${f.chemin} — ${f.crlf} fin(s) de ligne CRLF` + (f.lfSeuls > 0 ? `, ${f.lfSeuls} LF seul(s)` : ' (fichier ENTIEREMENT en CRLF)'))
    .join('\n  ');
  process.stderr.write(
    `\n✖ ${fautifs.length} fichier(s) \`-text\` portent des CRLF DANS L'INDEX :\n  ` +
      lignes +
      `\n\n  Examine : ${textuels} fichier(s) \`-text\` textuel(s) sur ${sousText.length} ` +
      `\`-text\` et ${TOTAL_CHEMINS} chemin(s) ${PORTEE}.` +
      `\n\n  POURQUOI C'EST REFUSE. \`-text\` promet que git ne convertira rien — il ne promet PAS` +
      `\n  que le fichier est en LF. Sans \`-text\`, \`core.autocrlf=true\` aurait normalise ces` +
      `\n  octets au \`git add\` ; avec lui, git ne rattrape plus l'outil qui a ecrit en CRLF, et` +
      `\n  les CRLF entrent tels quels dans la base d'objets.` +
      `\n\n  CE QUE CA CASSE. Ces fichiers portent des EMPREINTES : changer leurs octets change` +
      `\n  leur SHA-256, donc invalide des declarations de provenance, en silence. Et un fichier` +
      `\n  converti en bloc devient INMERGEABLE — une seule vasque de conflit sur tout le fichier.` +
      `\n\n  → geste attendu : reecrire ces fichiers en LF AVANT de les indexer. Depuis git bash,` +
      `\n    \`printf '%s' "$(cat <fichier>)" > <fichier>\` ne suffit pas (il mange la derniere` +
      `\n    ligne) ; utilise un outil qui remplace \`\\r\\n\` par \`\\n\` en lisant les octets.` +
      `\n    N'utilise PAS \`git add --renormalize\` : sur un chemin \`-text\` il ne fait rien, et` +
      `\n    ailleurs ce serait une REECRITURE D'ARCHIVE qui demande un arbitrage.\n`,
  );
  process.exit(1);
}

if (MODE_INDEXE && textuels === 0) {
  process.stderr.write(
    `✔ ${TOTAL_CHEMINS} chemin(s) ${PORTEE}, dont ${sousText.length} sous \`-text\` et ` +
      `${binaires} binaire(s) : aucun octet de fin de ligne a juger.\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `✔ ${textuels} fichier(s) \`-text\` textuel(s) sans un seul CRLF ` +
    `(${binaires} binaire(s) ecarte(s), sur ${TOTAL_CHEMINS} chemin(s) ${PORTEE}).\n`,
);
