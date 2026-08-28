/**
 * Tests de la garde §5.3 — dimensions explicites et chargement differe.
 *
 * Ce qui est teste ici, c est la DECISION de la garde sur du HTML fabrique : ce qu elle
 * refuse, ce qu elle laisse passer. Que le build echoue vraiment quand elle refuse se
 * prouve autrement — en cassant une page pour de vrai et en lisant le code de sortie.
 *
 * POURQUOI une garde plutot qu une relecture. Les six `<img>` du site ecrivent tous
 * `width={media.largeur ?? undefined}` : quand Strapi ne rend pas la dimension, Astro
 * OMET l attribut, silencieusement. La page reste valide, le build reste vert, et le CLS
 * revient — c est exactement la classe de defaut que le §5.3 demande de supprimer. Rien
 * dans le code source ne le montre : ca se voit dans `dist/`, et seulement si on regarde.
 *
 * Le troisieme controle (`loading` explicite) merite son motif : `loading="lazy"` sur
 * l image de la zone visible immediate RETARDE le LCP au lieu de l ameliorer. Un attribut
 * absent ne dit pas laquelle des deux intentions on avait ; l exiger explicite oblige a
 * trancher, image par image, au lieu de laisser le defaut du navigateur decider.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { inspecterImages } from '../scripts/verifier-images.mjs';
import { harnaisDeBacs } from '../../../outils/banc-jetable.mjs';

/* LE BAC JETABLE SE RETIRE, ET IL SE RETIRE MEME QUAND UN CAS CASSE.
   `after()` est le `finally` de `node:test` : il joue que les cas soient verts ou rouges — et
   une recette qui prouve en cassant a l echec pour regime normal, pas pour accident. Le filet
   `process.on('exit')` du harnais reprend la main sur ce qu `after()` ne voit pas : un
   `process.exit`, ou une erreur au chargement du module. Motif, mesure et perimetre du
   retrait : `outils/banc-jetable.mjs`. */
const bacs = harnaisDeBacs();
after(() => bacs.rendreCompte(bacs.nettoyer()));


/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = bacs.creer('garde-images-');
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

function page(corps: string): string {
  return `<!DOCTYPE html><html lang="fr"><body>${corps}</body></html>`;
}

const CONFORME =
  '<img src="/a.svg" alt="Le viaduc dans la brume" width="1600" height="900" loading="eager" fetchpriority="high">' +
  '<img src="/b.svg" alt="Le comptage des voitures" width="800" height="450" loading="lazy">';

test('une page dont chaque image porte ses dimensions et son loading ne remonte rien', () => {
  const rapport = inspecterImages(dist({ 'index.html': page(CONFORME) }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.images, 2);
});

test('une page sans aucune image ne remonte rien', () => {
  const rapport = inspecterImages(dist({ 'index.html': page('<p>Bonjour</p>') }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.images, 0);
});

// --- Famille 1 : dimensions explicites (§5.3, « sur toutes les balises ») -------------

test('un <img> sans width est refuse', () => {
  const html = page('<img src="/a.svg" alt="x" height="900" loading="lazy">');
  const rapport = inspecterImages(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /width/);
});

test('un <img> sans height est refuse', () => {
  const html = page('<img src="/a.svg" alt="x" width="1600" loading="lazy">');
  const rapport = inspecterImages(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /height/);
});

test('un width vide ou non numerique est refuse comme un width absent', () => {
  const vide = page('<img src="/a.svg" alt="x" width="" height="900" loading="lazy">');
  assert.equal(inspecterImages(dist({ 'index.html': vide })).manquements.length, 1);

  const mot = page('<img src="/a.svg" alt="x" width="auto" height="900" loading="lazy">');
  assert.equal(inspecterImages(dist({ 'index.html': mot })).manquements.length, 1);

  const zero = page('<img src="/a.svg" alt="x" width="0" height="900" loading="lazy">');
  assert.equal(inspecterImages(dist({ 'index.html': zero })).manquements.length, 1);
});

test('un pourcentage dans width est refuse : il ne fixe aucun rapport de forme', () => {
  const html = page('<img src="/a.svg" alt="x" width="100%" height="900" loading="lazy">');
  assert.equal(inspecterImages(dist({ 'index.html': html })).manquements.length, 1);
});

test('le manquement nomme la page ET l image, sinon il est inexploitable a 119 pages', () => {
  const html = page('<img src="/uploads/A17.svg" alt="x" height="900" loading="lazy">');
  const rapport = inspecterImages(dist({ 'article/x/index.html': html }));
  assert.match(rapport.manquements[0], /article\/x\/index\.html/);
  assert.match(rapport.manquements[0], /\/uploads\/A17\.svg/);
});

// --- Famille 2 : chargement differe (§5.3, « hors zone visible immediate ») -----------

test('un <img> sans attribut loading est refuse : l intention n est pas ecrite', () => {
  const html = page('<img src="/a.svg" alt="x" width="1600" height="900">');
  const rapport = inspecterImages(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /loading/);
});

test('un loading d une autre valeur que lazy ou eager est refuse', () => {
  const html = page('<img src="/a.svg" alt="x" width="1600" height="900" loading="auto">');
  assert.equal(inspecterImages(dist({ 'index.html': html })).manquements.length, 1);
});

test('loading="lazy" avec fetchpriority="high" est refuse : les deux se contredisent', () => {
  const html = page(
    '<img src="/a.svg" alt="x" width="1600" height="900" loading="lazy" fetchpriority="high">',
  );
  const rapport = inspecterImages(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /fetchpriority/);
});

test('deux fetchpriority="high" sur la meme page sont refuses : prioriser deux images n en priorise aucune', () => {
  const html = page(
    '<img src="/a.svg" alt="x" width="16" height="9" loading="eager" fetchpriority="high">' +
      '<img src="/b.svg" alt="y" width="16" height="9" loading="eager" fetchpriority="high">',
  );
  const rapport = inspecterImages(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /fetchpriority="high"/);
});

test('plusieurs images eager sont permises : la zone visible immediate en contient legitimement plusieurs', () => {
  const html = page(
    '<img src="/logo.svg" alt="x" width="240" height="48" loading="eager">' +
      '<img src="/couv.svg" alt="y" width="1600" height="900" loading="eager" fetchpriority="high">',
  );
  assert.deepEqual(inspecterImages(dist({ 'index.html': html })).manquements, []);
});

// --- Famille 3 : la portee de l inspection --------------------------------------------

test('les <img> de TOUTES les pages sont inspectes, /recherche comprise', () => {
  const fautif = page('<img src="/a.svg" alt="x">');
  const rapport = inspecterImages(
    dist({ 'index.html': fautif, 'recherche/index.html': fautif, 'en/index.html': fautif }),
  );
  // 3 pages x 2 manquements (dimensions + loading) : l exception /recherche du T-09
  // porte sur le JavaScript, jamais sur le CLS.
  assert.equal(rapport.manquements.length, 6);
  assert.equal(rapport.images, 3);
});

test('un <source> de <picture> qui pointe une autre image est refuse sans width/height', () => {
  // Un `<source>` qui sert un fichier de rapport de forme different remplace celui de
  // l `<img>` : sans ses propres dimensions, le rapport de forme retenu est celui du
  // `<img>`, et l image arrive dans une boite qui n est pas la sienne.
  const html = page(
    '<picture><source srcset="/sombre.svg" media="(prefers-color-scheme: dark)">' +
      '<img src="/clair.svg" alt="x" width="240" height="48" loading="eager"></picture>',
  );
  const rapport = inspecterImages(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /source/);
});

test('un <source> muni de ses dimensions passe', () => {
  const html = page(
    '<picture><source srcset="/sombre.svg" media="(prefers-color-scheme: dark)" width="240" height="48">' +
      '<img src="/clair.svg" alt="x" width="240" height="48" loading="eager"></picture>',
  );
  assert.deepEqual(inspecterImages(dist({ 'index.html': html })).manquements, []);
});

test('les fichiers qui ne sont pas du HTML sont ignores', () => {
  /* LA PAGE HTML DE CE JEU N EST PAS DECORATIVE. Jusqu au 2026-08-10 ce test n en portait
     aucune : il constatait « aucun manquement » sur un corpus de ZERO page, c est-a-dire
     le vert que ce depot corrige — un `rss.xml` ignore et une sortie entierement vide
     rendaient exactement le meme verdict, et le test ne pouvait pas les distinguer. La
     page ci-dessous rend le corpus reel ; l intention du test, elle, est inchangee : le
     `<img>` du flux et la regle de la feuille de style ne sont pas inspectes. */
  const rapport = inspecterImages(
    dist({
      'index.html': page('<p>une page reelle, sans image</p>'),
      'rss.xml': '<img src="/a.svg">',
      '_astro/style.css': 'img{}',
    }),
  );
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.images, 0);
  assert.equal(rapport.pages, 1);
});

test('une sortie absente est un manquement, pas un silence vert', () => {
  const rapport = inspecterImages(path.join(os.tmpdir(), 'garde-images-inexistant'));
  assert.equal(rapport.manquements.length, 1);
});
