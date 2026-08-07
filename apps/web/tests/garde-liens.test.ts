/**
 * Garde des liens internes — « un lien emis qui pointe vers une URL absente de `dist/`
 * est un defaut ».
 *
 * T-06 l exige nommement : « Le build echoue si l une des URL produites — lien de
 * bascule ou `hreflang` — n appartient pas au registre des routes reellement emises.
 * Sans cette assertion, la classe entiere des liens morts de bascule ne se decouvre
 * qu en cliquant, c est-a-dire jamais en test automatise. »
 *
 * Le point important : cette garde ne lit PAS le registre. Elle lit `dist/` — les
 * fichiers reellement ecrits — et les `href` reellement emis. Confronter le registre a
 * lui-meme prouverait qu il est coherent avec lui-meme ; ce qu on veut savoir, c est
 * s il decrit le site produit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { inspecterLiens } from '../scripts/verifier-liens.mjs';

const ORIGINE = 'https://echo.ayfiweb.fr';

function distFactice(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-liens-'));
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

test('un site dont tous les liens aboutissent ne remonte aucun manquement', () => {
  const dist = distFactice({
    'index.html': page('<a href="/categorie/territoire">Territoire</a><a href="/en">EN</a>'),
    'categorie/territoire/index.html': page('<a href="/">Accueil</a>'),
    'en/index.html': page('<a href="/">FR</a>'),
  });
  const rapport = inspecterLiens(dist, ORIGINE);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.routes, 3);
  assert.ok(rapport.liens >= 4);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un lien vers une page absente de dist/ est un manquement, nomme avec sa source', () => {
  const dist = distFactice({
    'index.html': page('<a href="/categorie/territoire/page/2">Page 2</a>'),
    'categorie/territoire/index.html': page('x'),
  });
  const rapport = inspecterLiens(dist, ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /categorie\/territoire\/page\/2/);
  assert.match(rapport.manquements[0], /index\.html/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('le slash final ne fabrique pas de faux manquement', () => {
  const dist = distFactice({
    'index.html': page('<a href="/categorie/territoire/">Avec slash</a>'),
    'categorie/territoire/index.html': page('x'),
  });
  assert.deepEqual(inspecterLiens(dist, ORIGINE).manquements, []);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un hreflang mort est un manquement au meme titre qu un <a>', () => {
  const dist = distFactice({
    'index.html':
      '<!doctype html><html><head><link rel="alternate" hreflang="en" href="https://echo.ayfiweb.fr/en/inexistant" /></head><body></body></html>',
    'en/index.html': page('x'),
  });
  const rapport = inspecterLiens(dist, ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /hreflang|alternate|\/en\/inexistant/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un canonique qui ne designe aucune page emise est un manquement', () => {
  const dist = distFactice({
    'index.html':
      '<!doctype html><html><head><link rel="canonical" href="https://echo.ayfiweb.fr/pas-emise" /></head><body></body></html>',
  });
  assert.equal(inspecterLiens(dist, ORIGINE).manquements.length, 1);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un fichier servi qui n est pas une page (favicon, flux) est une cible valide', () => {
  const dist = distFactice({
    'index.html': page('<a href="/rss.xml">Flux</a><link rel="icon" href="/favicon.svg" />'),
    'rss.xml': '<rss></rss>',
    'favicon.svg': '<svg></svg>',
  });
  assert.deepEqual(inspecterLiens(dist, ORIGINE).manquements, []);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('404.html est une route emise, sous le chemin /404', () => {
  const dist = distFactice({
    'index.html': page('<a href="/404">Erreur</a><a href="/en/404">Error</a>'),
    '404.html': page('x'),
    'en/404.html': page('x'),
  });
  assert.deepEqual(inspecterLiens(dist, ORIGINE).manquements, []);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('les liens externes, mailto, tel et ancres ne sont pas verifies', () => {
  const dist = distFactice({
    'index.html': page(
      '<a href="https://exemple.invalid/x">Externe</a>' +
        '<a href="mailto:contact@exemple.invalid">Mail</a>' +
        '<a href="tel:+33100000000">Tel</a>' +
        '<a href="#contenu">Ancre</a>' +
        '<img src="https://media.invalid/u.jpg" />',
    ),
  });
  const rapport = inspecterLiens(dist, ORIGINE);
  assert.deepEqual(rapport.manquements, []);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un lien relatif est resolu depuis la page qui le porte, pas depuis la racine', () => {
  const dist = distFactice({
    'categorie/territoire/index.html': page('<a href="page/2">Suite</a>'),
    'categorie/territoire/page/2/index.html': page('x'),
  });
  assert.deepEqual(inspecterLiens(dist, ORIGINE).manquements, []);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('une sortie absente est signalee, jamais rendue verte sur zero lien lu', () => {
  const rapport = inspecterLiens(path.join(os.tmpdir(), 'echo-liens-inexistant-xyz'), ORIGINE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /absente/i);
});
