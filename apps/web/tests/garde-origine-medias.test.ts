/**
 * Tests de la garde T-01 — aucune image ne vient d un domaine que la CSP refuse.
 *
 * POURQUOI ELLE EXISTE, en une phrase : le defaut qu elle attrape est passe une premiere
 * fois sous des tests verts ET un build vert. Le 2026-08-08, la recette technique a
 * constate que le site en ligne n affichait AUCUNE image — la CSP servie porte
 * `img-src 'self' data:`, les 21 `<img>` de l accueil pointaient `echoback.ayfiweb.fr`,
 * et le navigateur les refusait toutes. Aucune des trois gardes en place ne pouvait le
 * voir : `garde-images` verifie les dimensions et le `loading`, jamais l origine ;
 * `verifier-liens` s interdit explicitement les `src` d images ; `verifier-seo` ignore un
 * `og:image` externe comme « hors garde ». Le trou etait exactement a l intersection.
 *
 * CE QU ELLE TIENT, ET SUR QUOI ELLE S APPUIE. La regle n est PAS une recopie de la CSP
 * — celle-ci vit dans les labels Traefik (`docs/runbook-provisionnement.md` etape 27) et
 * n a aucun domicile dans ce depot. La regle est l arbitrage T-01 lui-meme : « l image
 * servie depuis notre propre domaine ». Une image de meme origine, ou une `data:` URI,
 * satisfait `'self' data:` quelle que soit la formulation exacte de l en-tete ; tout le
 * reste est refuse. La garde reste donc juste si la CSP est reecrite, et fausse
 * seulement si T-01 est renverse — auquel cas c est ce fichier qu il faut changer, en le
 * sachant.
 *
 * DEUXIEME CLASSE, indissociable de la premiere : un media local REFERENCE mais ABSENT
 * de `dist/`. C est le mode d echec du telechargement de `medias-locaux.mjs`, et il
 * produit exactement le meme ecran — une page sans images — pour une cause opposee. Les
 * separer dans le message evite d envoyer chercher la mauvaise.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspecterOrigineMedias } from '../scripts/verifier-origine-medias.mjs';

const ORIGINE = 'https://echo.ayfiweb.fr';

/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'garde-origine-medias-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

function page(tete: string, corps = ''): string {
  return `<!DOCTYPE html><html lang="fr"><head>${tete}</head><body>${corps}</body></html>`;
}

const MEDIA = { 'medias/A01.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' };

// --- Famille 1 : ce qui passe ----------------------------------------------------------

test('une image enracinee sur le site, presente dans dist, ne remonte rien', () => {
  const arbre = dist({ 'index.html': page('', '<img src="/medias/A01.svg" alt="x">'), ...MEDIA });
  const rapport = inspecterOrigineMedias(arbre, ORIGINE);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.references, 1);
});

test('une URL absolue vers NOTRE origine passe : c est la meme origine', () => {
  const html = page('', `<img src="${ORIGINE}/medias/A01.svg" alt="x">`);
  const arbre = dist({ 'index.html': html, ...MEDIA });
  assert.deepEqual(inspecterOrigineMedias(arbre, ORIGINE).manquements, []);
});

test('une data: URI passe : la CSP l autorise explicitement', () => {
  const html = page('', '<img src="data:image/svg+xml;base64,PHN2Zy8+" alt="x">');
  assert.deepEqual(inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE).manquements, []);
});

test('une page sans aucune image ne remonte rien', () => {
  const rapport = inspecterOrigineMedias(dist({ 'index.html': page('', '<p>Bonjour</p>') }), ORIGINE);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.references, 0);
});

// --- Famille 2 : le defaut du 2026-08-08, dans chacune de ses portes -------------------

test('un <img> qui pointe le domaine du CMS est REFUSE', () => {
  const html = page('', '<img src="https://echoback.ayfiweb.fr/uploads/A01.svg" alt="x">');
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /echoback\.ayfiweb\.fr/);
  assert.match(rapport.manquements[0], /img-src/);
});

test('un <source srcset> qui pointe un autre domaine est REFUSE', () => {
  // Le logo sombre du header passe par un `<source srcset>` : sans cette porte, la garde
  // serait aveugle a la moitie du `<picture>`.
  const html = page(
    '',
    '<picture><source srcset="https://echoback.ayfiweb.fr/uploads/logo_sombre.svg" ' +
      'media="(prefers-color-scheme: dark)"><img src="/medias/A01.svg" alt="x"></picture>',
  );
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html, ...MEDIA }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /source/);
});

test('un og:image hors du site est REFUSE', () => {
  const html = page(
    '<meta property="og:image" content="https://echoback.ayfiweb.fr/uploads/partage.svg">',
  );
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /og:image/);
});

test('un twitter:image hors du site est REFUSE', () => {
  const html = page('<meta name="twitter:image" content="https://cdn.exemple.invalid/x.png">');
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /twitter:image/);
});

test('une favicon hors du site est REFUSEE : la CSP la traite comme une image', () => {
  const html = page('<link rel="icon" href="https://echoback.ayfiweb.fr/uploads/favicon.svg">');
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /icon/);
});

test('un srcset a plusieurs candidats est verifie candidat par candidat', () => {
  const html = page(
    '',
    '<img src="/medias/A01.svg" srcset="/medias/A01.svg 1x, https://cdn.exemple.invalid/A01@2x.svg 2x" alt="x">',
  );
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html, ...MEDIA }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /cdn\.exemple\.invalid/);
});

test('une URL a protocole implicite ne passe pas au travers', () => {
  const html = page('', '<img src="//echoback.ayfiweb.fr/uploads/A01.svg" alt="x">');
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /echoback\.ayfiweb\.fr/);
});

test('TOUTES les pages sont inspectees, /recherche comprise', () => {
  const fautif = page('', '<img src="https://echoback.ayfiweb.fr/uploads/A01.svg" alt="x">');
  const rapport = inspecterOrigineMedias(
    dist({ 'index.html': fautif, 'recherche/index.html': fautif, 'en/index.html': fautif }),
    ORIGINE,
  );
  assert.equal(rapport.manquements.length, 3);
});

// --- Famille 3 : le media local qui n a pas ete telecharge -----------------------------

test('un media local REFERENCE mais absent de dist est un manquement', () => {
  const html = page('', '<img src="/medias/absent.svg" alt="x">');
  const rapport = inspecterOrigineMedias(dist({ 'index.html': html }), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /absent\.svg/);
  // Le message ne doit PAS parler de CSP : la cause est le telechargement, pas l origine.
  assert.doesNotMatch(rapport.manquements[0], /img-src/);
});

test('une image relative se resout depuis la ROUTE de la page, pas depuis la racine', () => {
  const html = page('', '<img src="../medias/A01.svg" alt="x">');
  const arbre = dist({ 'article/x/index.html': html, ...MEDIA });
  // `/article/x` + `../medias/A01.svg` → `/article/medias/A01.svg`, qui n existe pas.
  const rapport = inspecterOrigineMedias(arbre, ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /article\/medias\/A01\.svg/);
});

// --- Famille 4 : les bords -------------------------------------------------------------

test('le manquement nomme la page ET la reference, sinon il est inexploitable a 119 pages', () => {
  const html = page('', '<img src="https://echoback.ayfiweb.fr/uploads/A17.svg" alt="x">');
  const rapport = inspecterOrigineMedias(dist({ 'article/x/index.html': html }), ORIGINE);
  assert.match(rapport.manquements[0], /article\/x\/index\.html/);
  assert.match(rapport.manquements[0], /A17\.svg/);
});

test('les fichiers qui ne sont pas du HTML sont ignores', () => {
  const rapport = inspecterOrigineMedias(
    dist({ 'rss.xml': '<img src="https://ailleurs.invalid/a.svg">' }),
    ORIGINE,
  );
  assert.deepEqual(rapport.manquements, []);
});

test('une sortie absente est un manquement, pas un silence vert', () => {
  const rapport = inspecterOrigineMedias(path.join(os.tmpdir(), 'garde-origine-inexistante'), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
});

test('un src vide est ignore plutot que remonte comme une origine etrangere', () => {
  const rapport = inspecterOrigineMedias(
    dist({ 'index.html': page('', '<img src="" alt="x">') }),
    ORIGINE,
  );
  assert.deepEqual(rapport.manquements, []);
});
