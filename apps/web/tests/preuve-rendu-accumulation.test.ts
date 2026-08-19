/**
 * LES VERDICTS DE `preuve-rendu.mjs` S ACCUMULENT, ILS NE S INTERROMPENT PLUS.
 *
 * CE QUE CE FICHIER FERME, mesure le 2026-08-20 sur la cible `--reel` en fabriquant
 * l ecart une famille a la fois (harnais greffe localement, aucune ecriture en
 * production). Le script portait NEUF `process.exit` apres son en-tete de rapport. Les
 * trois d amont — cible refusee, source injoignable, build echoue — portent sur le MEME
 * objet que tout l aval et restent. Les six autres jugeaient six objets INDEPENDANTS et
 * s interrompaient les uns les autres :
 *
 *   ecart fabrique sur `--reel`               ce que la sortie a CESSE d imprimer
 *   ---------------------------------------   ------------------------------------------
 *   `source.configuration` -> null             credit, reseaux, mentions, pied, blocs.*
 *   `.js` depose dans dist/ apres le build     reseaux, mentions, pied, credit, blocs.*
 *   aria-hidden retire d un glyphe social      mentions, pied, credit, blocs.*
 *   <main> vide sur /mentions-legales/         pied, credit, blocs.*
 *   href du pied detourne                      credit, blocs.*
 *   credit du portrait reecrit                 blocs.*
 *
 * LA DERNIERE COLONNE EST LA MEME PARTOUT, et c est ce qui tranche : les six supprimaient
 * `blocs.site` — « le site a cesse de rendre un type que la source lui pose ». C est la
 * SEULE famille du rapport qui n a aucune ligne de resume : les autres impriment leur
 * compte plus haut sans condition, celle-la n existe que dans le bloc final. Elle
 * disparaissait donc SANS TRACE. Mesure de reference : l ecart de rendu seul rend
 * « [fr] /article/14-juin-1983… : l instance pose bloc.citation, la page rendue ne le
 * porte pas » ; le meme ecart accompagne de n importe lequel des six ne rendait plus rien.
 *
 * PIRE POUR L UN D EUX : l absence de Configuration sortait en `2` alors qu un defaut de
 * RENDU etait deja constate. Une anomalie etablie devenait « je n ai pas pu juger ».
 *
 * CE QUI N EST PAS ACCUMULE, ET POURQUOI. `rapport.issue === VERIFICATION_IMPOSSIBLE`
 * — zero page HTML inspectee — est le seul des six a porter sur le meme objet que tout
 * l aval. Mesure : sur un `dist/` vide de HTML, les familles d aval rendent « Credit du
 * portrait : 10 ecart(s) », « Mentions legales : 2 manquement(s) sur 0 page(s) », « Pied
 * de page : 2 ecart(s) — 0 page(s) inspectees », et `blocs.site` accuserait les 48
 * articles. Accumuler produirait cinq blocs d erreur pour UNE cause, et rendrait `1` —
 * en accusant le site d un defaut de credit qui n existe pas. Cette porte-la reste, et
 * elle rend desormais `2` (elle rendait `1`, code du manquement du site).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { arbitrer, ISSUES } from '../scripts/issues.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FICHIER = fs.readFileSync(path.join(RACINE, 'scripts', 'preuve-rendu.mjs'), 'utf8');

/**
 * LE CODE SANS SES COMMENTAIRES — et pas par coquetterie.
 *
 * Ce fichier-ci est presque entierement fait de commentaires qui CITENT le code qu ils
 * expliquent : « elle rendait `process.exit(1)` » y voisine avec la ligne qui ne le rend
 * plus. Une garde structurelle qui lit la prose accuse la citation et rate la regression —
 * ou pire, interdit d ecrire pourquoi une chose a change.
 *
 * Elle retire les blocs delimites et les lignes de commentaire, en laissant les chaines
 * intactes : une ligne de code n est jamais reconnue comme commentaire ici, seules les
 * lignes qui COMMENCENT par deux barres obliques ou par une etoile le sont. Une URL
 * `https://…` au milieu d une chaine survit donc entiere.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !/^\s*(\/\/|\*)/.test(ligne))
    .join('\n');
}

const SOURCE = sansCommentaires(FICHIER);

// ---------------------------------------------------------------------------
// 1. L ARBITRAGE EST UNE FONCTION PURE, exercee dans les deux sens
//
// La regle « `1` prime sur `2` » vivait dans l ORDRE DES LIGNES de neuf `process.exit`.
// Un ordre de lignes ne se prouve pas : il se relit, et il se casse au premier
// deplacement. Ici elle s exerce en quelques microsecondes, sans construire le site.
// ---------------------------------------------------------------------------

test('aucun verdict rouge : la preuve est CONFORME', () => {
  assert.equal(arbitrer([]), ISSUES.CONFORME);
});

test('une anomalie seule rend 1, une incapacite seule rend 2', () => {
  assert.equal(arbitrer([ISSUES.ANOMALIE]), ISSUES.ANOMALIE);
  assert.equal(arbitrer([ISSUES.VERIFICATION_IMPOSSIBLE]), ISSUES.VERIFICATION_IMPOSSIBLE);
});

test('L ANOMALIE PRIME SUR L INCAPACITE, dans les deux ordres d arrivee', () => {
  /* LE CŒUR DE LA REGLE. Un defaut constate est un FAIT ETABLI ; l incapacite ne porte
     que sur ce qu on n a PAS PU juger. Rendre `2` quand une anomalie est etablie envoie
     corriger CE AVEC QUOI ON JUGE, donc a cote. L ordre d arrivee ne doit rien y faire —
     c est exactement ce qui a casse quand l absence de Configuration, rencontree AVANT
     l ecart de rendu, faisait sortir en `2` sur un site en faute. */
  assert.equal(arbitrer([ISSUES.VERIFICATION_IMPOSSIBLE, ISSUES.ANOMALIE]), ISSUES.ANOMALIE);
  assert.equal(arbitrer([ISSUES.ANOMALIE, ISSUES.VERIFICATION_IMPOSSIBLE]), ISSUES.ANOMALIE);
});

test('un CONFORME accumule par megarde ne rougit pas la preuve', () => {
  assert.equal(arbitrer([ISSUES.CONFORME]), ISSUES.CONFORME);
  assert.equal(arbitrer([ISSUES.CONFORME, ISSUES.VERIFICATION_IMPOSSIBLE]), ISSUES.VERIFICATION_IMPOSSIBLE);
});

test('les codes rendus sont ceux de la convention, jamais des entiers inventes', () => {
  for (const rendu of [arbitrer([]), arbitrer([ISSUES.ANOMALIE]), arbitrer([ISSUES.VERIFICATION_IMPOSSIBLE])]) {
    assert.ok(Object.values(ISSUES).includes(rendu), `code hors convention : ${rendu}`);
  }
});

// ---------------------------------------------------------------------------
// 2. AUCUNE SORTIE PRECOCE NE PEUT REVENIR DANS LA ZONE D ACCUMULATION
//
// MECANIQUE, PAS CONVENTIONNELLE. Une consigne de commentaire n a rien empeche : la
// zone avait DEJA ete purgee de son `process.exit` du controle 13 le 2026-08-16, et cinq
// autres, situes un cran plus haut, refermaient le meme trou par une autre porte.
// ---------------------------------------------------------------------------

const DEBUT_ACCUMULATION = 'const issues = [];';

test('la zone d accumulation existe, et elle est unique', () => {
  const occurrences = SOURCE.split(DEBUT_ACCUMULATION).length - 1;
  assert.equal(occurrences, 1, `« ${DEBUT_ACCUMULATION} » attendu une seule fois, vu ${occurrences} fois`);
});

test('la zone d accumulation ne porte AUCUN process.exit hors l arbitrage final', () => {
  const zone = SOURCE.slice(SOURCE.indexOf(DEBUT_ACCUMULATION));
  const sorties = zone.match(/process\.exit\(/g) ?? [];
  assert.equal(
    sorties.length,
    1,
    `${sorties.length} process.exit apres « ${DEBUT_ACCUMULATION} » : chacun tronque la liste ` +
      'des verdicts qui le suivent. Un verdict s accumule dans `issues`, il ne sort pas.',
  );
  assert.match(
    zone,
    /if \(issues\.length > 0\) \{\s*process\.exit\(\s*arbitrer\(issues\)/,
    'l unique sortie de la zone doit etre l arbitrage, et il doit passer par `arbitrer`',
  );
});

test('chaque famille de verdict accumule : au moins huit poussees dans `issues`', () => {
  /* Les huit : manquements de la sortie, reseaux, mentions, pied, credit du portrait,
     `blocs.banc`, `blocs.site`, controle 13. Une famille qui cesserait de pousser
     redeviendrait muette — le mode d echec exact de `blocs.site`, qui n a aucune ligne
     de resume pour trahir son absence. */
  const poussees = (SOURCE.match(/issues\.push\(/g) ?? []).length;
  assert.ok(poussees >= 8, `${poussees} appel(s) a issues.push — huit familles sont attendues`);
});

// ---------------------------------------------------------------------------
// 3. LE MESSAGE DE SUCCES EST GARDE PAR UN `else`
//
// C est le defaut qui s est glisse dans la correction du controle 13 le 2026-08-16 : le
// `process.exit` retire tenait AUSSI lieu de garde pour le vert final, et la sortie a
// imprime « AUCUNE page » puis « TENU — 0 page(s) » sept lignes plus bas.
// ---------------------------------------------------------------------------

test('le vert final est dans le `else` de l arbitrage, jamais a la suite', () => {
  const zone = SOURCE.slice(SOURCE.indexOf(DEBUT_ACCUMULATION));
  const arbitrage = zone.indexOf('if (issues.length > 0) {');
  const vert = zone.indexOf('✔');
  assert.ok(arbitrage !== -1, 'arbitrage introuvable');
  assert.ok(vert !== -1, 'message de succes introuvable');
  assert.ok(vert > arbitrage, 'le vert final precede l arbitrage : il peut coexister avec un rouge');
  assert.match(
    zone.slice(arbitrage, vert),
    /\}\s*else\s*\{/,
    'le vert final n est pas dans le `else` de l arbitrage : un rouge et un vert peuvent ' +
      'etre imprimes dans le meme souffle',
  );
});

// ---------------------------------------------------------------------------
// 4. AUCUN CODE DE SORTIE ECRIT EN CHIFFRE
//
// `process.exit(1)` sur un `rapport.issue` qui vaut `2` est ce qui a rendu ANOMALIE une
// incapacite mesuree : `dist/` vide de HTML sortait en `1`, code qui envoie corriger LE
// SITE, pour un etat ou aucune page n avait ete lue.
// ---------------------------------------------------------------------------

test('aucun process.exit ne porte un chiffre en dur — les codes viennent de la convention', () => {
  const enDur = SOURCE.match(/process\.exit\(\s*\d/g) ?? [];
  assert.deepEqual(
    enDur,
    [],
    'un code de sortie ecrit en chiffre finit par contredire la valeur qu il transporte : ' +
      '`process.exit(1)` sur un `rapport.issue` valant 2 rend ANOMALIE une incapacite.',
  );
});

test('la porte du corpus vide survit, et elle rend ce que la sortie a juge', () => {
  /* La SEULE des six sorties precoces qui reste, et la raison est mesuree : sur un
     `dist/` sans page HTML, toutes les familles d aval rendent du bruit derive de la
     MEME cause. L accumuler en fabriquerait cinq blocs d erreur, et un `1`. */
  assert.match(
    SOURCE,
    /if \(rapport\.issue === ISSUES\.VERIFICATION_IMPOSSIBLE\) \{[\s\S]*?process\.exit\(rapport\.issue\)/,
    'la porte du corpus vide doit tester `rapport.issue` et rendre `rapport.issue`',
  );
  const porte = SOURCE.indexOf('if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {');
  assert.ok(
    porte !== -1 && porte < SOURCE.indexOf(DEBUT_ACCUMULATION),
    'la porte du corpus vide doit preceder la zone d accumulation',
  );
});
