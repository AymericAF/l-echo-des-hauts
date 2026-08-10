/**
 * Tests de la garde « cascade des titres » — aucun niveau de titre ne saute dans la sortie.
 *
 * LE DEFAUT QU ELLE FERME, mesure et non suppose. La campagne axe-core du 2026-08-10
 * (117 URL x 2 vues, `docs/mesures/2026-08-10/M-06/axe-violations.csv`) n a trouve
 * qu UNE seule regle violee sur tout le site, et elle l a trouvee 68 fois : `heading-order`,
 * sur 34 URL (27 articles fr + 7 en), un noeud par page, toujours le meme —
 * `<h4 class="bloc-encadre__titre">` pose juste apres un `<h2>`. Un niveau saute.
 *
 * CE N EST PAS COSMETIQUE. La suite des titres EST le sommaire du document pour qui
 * navigue au lecteur d ecran ; un saut fait disparaitre la hierarchie. Et depuis que le
 * corpus est passe a 48 articles, l article que le §3 du protocole designe pour la porte
 * P2 porte lui aussi un encadre : la porte se joue dessus (98 au lieu de 100 en
 * accessibilite, dispersion nulle sur 9 runs).
 *
 * POURQUOI UNE GARDE, ET PAS SEULEMENT UN CORRECTIF. Le correctif vit dans un composant,
 * il tient tant que personne ne repose un titre trop bas. La campagne axe, elle, ne tourne
 * qu en recette — un defaut qui ne se voit qu a la campagne suivante a deja atteint la
 * production. Ce fichier fait ECHOUER le build, sur la sortie construite, a chaque build.
 *
 * ELLE NE RECOPIE PAS AXE-CORE : elle tient la regle que `heading-order` tient — un titre
 * ne descend jamais de plus d un niveau a la fois — et rien d autre. Le `h1` unique et la
 * presence d un `h1` sont deja tenus ailleurs (A-21, `page-has-heading-one`) ; les
 * dupliquer ici ferait rougir deux gardes sur un meme defaut, envoyant corriger deux fois.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ISSUES } from '../scripts/issues.mjs';
import {
  inspecterCascadeTitres,
  resumeCascadeTitres,
} from '../scripts/verifier-cascade-titres.mjs';

/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'garde-cascade-titres-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

function page(corps: string): string {
  return `<!doctype html><html lang="fr"><head><title>t</title></head><body>${corps}</body></html>`;
}

// --- Famille 1 : ce qui passe ----------------------------------------------------------

test('une cascade qui descend d un niveau a la fois ne reproche rien', () => {
  const html = page('<h1>Article</h1><h2>Sommaire</h2><h2>Section</h2><h3>Sous-section</h3><h4>Encadre</h4>');
  const rapport = inspecterCascadeTitres(dist({ 'index.html': html }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.pages, 1);
  assert.equal(rapport.titres, 5);
});

test('REMONTER de plusieurs niveaux est licite — seule la DESCENTE se compte', () => {
  const html = page('<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h2>e</h2>');
  const rapport = inspecterCascadeTitres(dist({ 'index.html': html }));
  assert.deepEqual(rapport.manquements, []);
});

test('une page sans aucun titre est conforme, pas incapable : zero titre juge, zero saut', () => {
  const rapport = inspecterCascadeTitres(dist({ 'index.html': page('<p>rien</p>') }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.pages, 1);
  assert.equal(rapport.titres, 0);
});

test('le PREMIER titre de la page n est compare a rien — un h2 en tete ne saute pas', () => {
  const rapport = inspecterCascadeTitres(dist({ 'index.html': page('<h2>seul</h2>') }));
  assert.deepEqual(rapport.manquements, []);
});

// --- Famille 2 : le defaut mesure le 2026-08-10 -----------------------------------------

test('le h4 de l encadre pose apres un h2 est un saut, et le message NOMME les deux niveaux', () => {
  const html = page(
    '<h1>Le viaduc rouvre</h1><h2>Sommaire</h2><h2>Ce que dit le rapport</h2>' +
      '<aside class="bloc-encadre"><h4 class="bloc-encadre__titre">Ce qu il faut retenir</h4></aside>',
  );
  const rapport = inspecterCascadeTitres(dist({ 'article/index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const manquement = rapport.manquements[0];
  assert.match(manquement, /article[/\\]index\.html/);
  assert.match(manquement, /h2/);
  assert.match(manquement, /h4/);
  // Le texte du titre fautif : sans lui, il faut ouvrir la page pour savoir lequel.
  assert.match(manquement, /Ce qu il faut retenir/);
});

test('un saut par page, sur plusieurs pages : chacune est nommee', () => {
  const fautive = page('<h1>a</h1><h2>b</h2><h4>c</h4>');
  const rapport = inspecterCascadeTitres(
    dist({
      'article/un/index.html': fautive,
      'en/article/one/index.html': fautive,
      'saine/index.html': page('<h1>a</h1><h2>b</h2><h3>c</h3>'),
    }),
  );
  assert.equal(rapport.manquements.length, 2);
  assert.equal(rapport.pages, 3);
  assert.ok(rapport.manquements.some((m) => /article[/\\]un/.test(m)));
  assert.ok(rapport.manquements.some((m) => /en[/\\]article[/\\]one/.test(m)));
});

test('h1 puis h3 saute aussi : la garde ne connait pas de niveau privilegie', () => {
  const rapport = inspecterCascadeTitres(dist({ 'index.html': page('<h1>a</h1><h3>b</h3>') }));
  assert.equal(rapport.manquements.length, 1);
});

// --- Famille 3 : ce que la garde ne doit pas prendre pour un titre ----------------------

test('un titre dans un commentaire HTML n est pas un titre', () => {
  const html = page('<h1>a</h1><h2>b</h2><!-- <h4>faux</h4> --><h3>c</h3>');
  const rapport = inspecterCascadeTitres(dist({ 'index.html': html }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.titres, 3);
});

test('un titre ecrit dans un <script> ou un <template> n est pas rendu, donc pas juge', () => {
  const html = page(
    '<h1>a</h1><h2>b</h2><script>document.write("<h6>x</h6>")</script>' +
      '<template><h6>y</h6></template><h3>c</h3>',
  );
  const rapport = inspecterCascadeTitres(dist({ 'index.html': html }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.titres, 3);
});

test('un fichier qui n est pas du HTML n est pas inspecte', () => {
  const rapport = inspecterCascadeTitres(
    dist({ 'index.html': page('<h1>a</h1>'), 'flux.xml': '<h1>a</h1><h4>b</h4>' }),
  );
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.pages, 1);
});

// --- Famille 4 : incapacite -------------------------------------------------------------

test('une sortie ABSENTE est une VERIFICATION IMPOSSIBLE, pas un vert', () => {
  const nullePart = path.join(os.tmpdir(), 'echo-dist-inexistant-cascade-titres');
  assert.equal(fs.existsSync(nullePart), false);
  const rapport = inspecterCascadeTitres(nullePart);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(rapport.pages, 0);
  assert.match(rapport.manquements.join('\n'), /sortie absente/i);
});

test('une sortie SANS page HTML est une VERIFICATION IMPOSSIBLE : zero page jugee', () => {
  const rapport = inspecterCascadeTitres(dist({ 'flux.xml': '<rss/>' }));
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join('\n'), /aucune page HTML/i);
});

// --- Famille 5 : le compte rendu au vert ------------------------------------------------

test('le resume au vert dit ce qui a ete juge — un vert muet ne prouve rien', () => {
  const rapport = inspecterCascadeTitres(
    dist({ 'index.html': page('<h1>a</h1><h2>b</h2><h3>c</h3>') }),
  );
  const resume = resumeCascadeTitres(rapport);
  assert.match(resume, /1 page/);
  assert.match(resume, /3 titre/);
});
