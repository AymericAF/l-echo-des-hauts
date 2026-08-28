/**
 * LE HARNAIS DE BACS JETABLES, PROUVE EN LE CASSANT.
 *
 * ── LE DEFAUT QU IL FERME, MESURE ET NON SUPPOSE (2026-08-28) ────────────────────────────
 * Le repertoire temporaire de ce poste portait 199 592 entrees. Six des douze familles les
 * plus nombreuses venaient de ce depot, et AUCUNE n etait retiree nulle part : `garde-t09-`
 * (20 535), `echo-corpus-` (13 700), `garde-styles-en-ligne-` (10 406), `garde-images-`
 * (9 091), `garde-origine-medias-` (8 160), `echo-voies-` (7 722). Une passe des huit
 * fichiers concernes en laissait 250 de plus, VERTE COMME ROUGE.
 *
 * ── POURQUOI UNE MESURE SUR LE VERT SEUL NE PROUVERAIT RIEN ─────────────────────────────
 * Un retrait ecrit apres la boucle de cas est vert tant que rien ne casse — et une recette de
 * ce depot a l echec pour REGIME NORMAL. Les quatre regimes ci-dessous se lisent donc
 * ensemble, jamais separement :
 *
 *   sans-harnais   — la MESURE voit-elle un residu ? Sans ce cas, une racine vide ne
 *                    prouverait rien : elle pourrait l etre parce que rien n a ete cree.
 *                    C est le cas qui empeche ce fichier de rendre zero partout.
 *   vert           — le retrait ordinaire, par `after()`.
 *   rouge          — un cas casse. `after()` joue quand meme : c est ce qui separe un retrait
 *                    en `finally` d un retrait ecrit apres la boucle.
 *   sortie-brutale — un cas appelle `process.exit`. `after()` n est JAMAIS joue ; seul le
 *                    filet `process.on('exit')` reste, et c est lui qui est juge ici.
 *
 * ── POURQUOI EN PROCESSUS FILS ──────────────────────────────────────────────────────────
 * On ne peut pas eprouver depuis l interieur d un processus ce qu il fait EN MOURANT. Chaque
 * regime tourne donc dans un `node --test` a lui, avec `ECHO_BANCS` pointant une racine qui
 * n appartient qu a cette execution — ce qui rend le compte lisible et met le poste hors de
 * portee, quoi qu il arrive.
 *
 * ── CE QU IL NE PROUVE PAS, ecrit plutot que laisse a croire ────────────────────────────
 *   1. `SIGKILL` et `process.abort()` ne deroulent rien, filet compris. Aucun mecanisme ne
 *      les rattrape, et ce fichier ne pretend pas le contraire.
 *   2. Il juge le HARNAIS, pas les huit fichiers qui s en servent. Qu ils l appellent bien se
 *      lit dans leur diff et se mesure en comptant le temporaire ; ici on tient la mecanique.
 *   3. Un bac qu un tiers verrouille (un handle ouvert par un antivirus) n a pas ete
 *      reproduit. Le `maxRetries` du harnais est un pari assume, pas un mecanisme constate.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { spawnSync } from 'node:child_process';

import { harnaisDeBacs, RACINE_DES_BANCS, TEMPORAIRE } from '../../../outils/banc-jetable.mjs';

/* Ce fichier monte lui aussi des bacs — un par regime, pour servir de racine au fils. Il se
   retire par les memes moyens que ce qu il juge : une recette qui fuit pendant qu elle prouve
   qu on ne fuit plus serait sa propre refutation. */
const bacs = harnaisDeBacs();
after(() => bacs.rendreCompte(bacs.nettoyer()));

const BANC_D_ESSAI = path.join(import.meta.dirname, 'aides', 'banc-d-essai.mjs');
const PREFIXE_ESSAI = 'essai-banc-';

/** Les entrees d une racine qui portent le prefixe du banc d essai. */
function bacsRestants(racine: string): string[] {
  if (!fs.existsSync(racine)) return [];
  return fs.readdirSync(racine).filter((e) => e.startsWith(PREFIXE_ESSAI));
}

/**
 * L environnement d un `node --test` PETIT-FILS.
 *
 * ⚠️ `NODE_TEST_CONTEXT` DOIT ETRE RETIRE, et ce n est pas une precaution : le lanceur de tests
 * de node la pose dans ses processus fils. Heritee, elle fait croire au petit-fils qu il rend
 * compte a un lanceur par le canal de service — il SORT ALORS EN 0 quels que soient ses cas.
 * Mesure du 2026-08-28 : sans ce retrait, les regimes `rouge` et `sortie-brutale` rendaient
 * tous deux 0, c est-a-dire que la recette lisait le meme code de sortie pour un succes et
 * pour un echec. Un banc qui ne sait plus distinguer les deux ne prouve rien.
 */
function environnement(racine: string, regime: string): NodeJS.ProcessEnv {
  const env = { ...process.env, ECHO_BANCS: racine, BANC_ESSAI_REGIME: regime };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/**
 * Joue un regime dans un processus fils, et rend ce que la racine porte AVANT et APRES.
 * La racine est un bac de ce fichier : le fils ne peut donc rien ecrire ailleurs.
 */
function jouer(regime: string): { code: number | null; avant: number; apres: number } {
  const racine = bacs.creer(`racine-${regime}-`);
  const avant = bacsRestants(racine).length;
  const r = spawnSync(process.execPath, ['--test', BANC_D_ESSAI], {
    encoding: 'utf8',
    env: environnement(racine, regime),
  });
  assert.equal(r.error, undefined, `le banc d essai n a pas pu se lancer : ${r.error?.message}`);
  return { code: r.status, avant, apres: bacsRestants(racine).length };
}

// --- Famille 1 : la mesure voit-elle un residu ? ---------------------------------------
//
// A LIRE EN PREMIER. Les trois familles suivantes concluent d une racine VIDE ; celle-ci
// etablit qu une racine non vide se voit. Sans elle, ce fichier serait un comparateur qui
// rend zero partout, c est-a-dire un silence.

test('sans harnais, les trois bacs SURVIVENT — la mesure sait voir un residu', () => {
  const { avant, apres } = jouer('sans-harnais');
  assert.equal(avant, 0);
  assert.equal(
    apres,
    3,
    'les bacs montes a la main devaient rester : si ce compte tombe a 0, ce n est pas le ' +
      'harnais qui nettoie, c est la mesure qui ne voit rien — et les trois cas suivants ne ' +
      'prouvent alors plus rien.',
  );
});

// --- Famille 2 : les trois regimes du retrait ------------------------------------------

test('passe VERTE : la racine est vide apres coup', () => {
  const { code, avant, apres } = jouer('vert');
  assert.equal(code, 0, 'la passe verte devait sortir en 0');
  assert.equal(avant, 0);
  assert.equal(apres, 0, 'un bac survit a une passe verte');
});

test('passe ROUGE : un cas casse, et la racine est vide QUAND MEME', () => {
  const { code, avant, apres } = jouer('rouge');
  assert.notEqual(code, 0, 'la passe rouge devait sortir en non-zero — sinon elle ne casse pas');
  assert.equal(avant, 0);
  assert.equal(
    apres,
    0,
    "un bac survit a une passe rouge : le retrait n est pas dans le `after()`, il est ecrit " +
      'apres la boucle de cas — c est exactement la fuite que ce harnais tarit.',
  );
});

test('SORTIE BRUTALE : `after()` n est jamais joue, et le filet retire quand meme', () => {
  const { code, avant, apres } = jouer('sortie-brutale');
  /* Le code 3 du banc d essai N ARRIVE PAS jusqu ici, et c est normal : `node --test` lance
     un processus par fichier et rend SON propre code — 1 des qu un fichier a echoue. Ce qui
     est juge ici n est donc pas la valeur, c est qu elle ne soit pas 0 : le fils est bien
     mort en cours de route, et non arrive au bout. */
  assert.notEqual(code, 0, 'le fils devait mourir par `process.exit`, pas finir sa passe');
  assert.equal(avant, 0);
  assert.equal(
    apres,
    0,
    "un bac survit a un `process.exit` : le filet `process.on('exit')` du harnais est absent " +
      'ou desarme. Aucun `finally` ni `after()` ne se deroule sur cette sortie-la.',
  );
});

// --- Famille 3 : le perimetre du retrait -----------------------------------------------
//
// LE POINT LE PLUS DANGEREUX DE TOUT CE DISPOSITIF. Un retrait qui balaierait un MOTIF sur
// une racine effacerait ce qui ne lui appartient pas — et la racine par defaut peut etre le
// repertoire temporaire de l utilisateur, qui porte les fichiers de tout ce qui tourne sur ce
// poste. Le harnais n efface que les chemins qu il a lui-meme construits.

test('le retrait ne touche QUE les bacs de sa course, jamais un voisin de la meme racine', () => {
  const racine = bacs.creer('racine-voisinage-');
  const voisin = path.join(racine, `${PREFIXE_ESSAI}voisin-qui-ne-nous-appartient-pas`);
  fs.mkdirSync(voisin, { recursive: true });
  fs.writeFileSync(path.join(voisin, 'temoin.txt'), 'x');

  const r = spawnSync(process.execPath, ['--test', BANC_D_ESSAI], {
    encoding: 'utf8',
    env: environnement(racine, 'vert'),
  });
  assert.equal(r.status, 0);
  assert.ok(
    fs.existsSync(voisin),
    'le harnais a efface un dossier qu il n avait pas cree. Il ne doit JAMAIS balayer un ' +
      'motif : il retire les chemins nommes qu il a gardes en memoire, et rien d autre.',
  );
  assert.deepEqual(bacsRestants(racine), [path.basename(voisin)]);
});

// --- Famille 4 : le harnais vu de l interieur ------------------------------------------

test('`creer` monte sous le domicile demande, `nettoyer` le retire et le DIT', () => {
  const domicile = bacs.creer('racine-unitaire-');
  const h = harnaisDeBacs({ domicile, filet: false });
  const a = h.creer('a-');
  const b = h.creer('b-');
  assert.equal(path.dirname(a), path.resolve(domicile));
  assert.ok(fs.existsSync(a) && fs.existsSync(b));

  const compte = h.nettoyer();
  assert.deepEqual(compte, { restants: [], gardes: [] });
  assert.equal(fs.existsSync(a), false);
  assert.equal(fs.existsSync(b), false);
});

test('`conserverLeDernier` garde un bac AVEC SA RAISON — un survivant ne se lit jamais comme un oubli', () => {
  const domicile = bacs.creer('racine-conserve-');
  const h = harnaisDeBacs({ domicile, filet: false });
  h.creer('efface-');
  const garde = h.creer('garde-');
  h.conserverLeDernier('le bac du cas fautif, pour le diagnostic');

  const compte = h.nettoyer();
  assert.equal(compte.restants.length, 0);
  assert.equal(compte.gardes.length, 1);
  assert.match(compte.gardes[0], /le bac du cas fautif/);
  assert.ok(fs.existsSync(garde));
});

test('le nom d un bac porte la course qui l a monte — un reliquat est imputable', () => {
  const domicile = bacs.creer('racine-nommage-');
  const h = harnaisDeBacs({ domicile, filet: false });
  const bac = h.creer('prefixe-');
  assert.match(path.basename(bac), new RegExp(`^prefixe-${h.course}-001-`));
  assert.match(h.course, new RegExp(`^${process.pid}-`));
  h.nettoyer();
});

// --- Famille 5 : le demenagement hors du repertoire temporaire -------------------------

test('la racine par defaut est HORS du repertoire temporaire, et `TEMPORAIRE` reste offert', () => {
  assert.equal(TEMPORAIRE, os.tmpdir());
  assert.ok(
    !path.resolve(RACINE_DES_BANCS).startsWith(path.resolve(os.tmpdir()) + path.sep),
    `la racine des bancs (${RACINE_DES_BANCS}) est sous le repertoire temporaire ` +
      `(${os.tmpdir()}) : le demenagement qui met le poste hors de portee n a plus lieu.`,
  );
});
