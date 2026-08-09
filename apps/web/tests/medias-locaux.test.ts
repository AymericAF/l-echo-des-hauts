/**
 * Tests du telechargement des medias dans la sortie — le geste que T-01 demande.
 *
 * T-01 (`docs/arbitrages-techniques.md`) : « l image de vignette servie depuis notre
 * propre domaine, TELECHARGEE AU BUILD ». `src/lib/media.ts` tient la moitie du contrat
 * — le chemin ecrit dans la page — et ce module tient l autre : les octets deposes sous
 * ce chemin. Sans lui, la correction remplacerait une image interdite par une image
 * absente, ce qui donne exactement le meme ecran.
 *
 * CE QUE LES TESTS EXERCENT, et pourquoi chacun : la LISTE se derive de la sortie reelle
 * (aucun registre a tenir a jour, donc rien a oublier), le telechargement ECHOUE FORT
 * (un 404 silencieux rendrait le meme site sans images), et rien n est telecharge deux
 * fois (l accueil reference la meme couverture que la page de rubrique).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { localiserMedias, referencesMediasDe } from '../scripts/medias-locaux.mjs';

function dist(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'medias-locaux-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

/** Un `fetch` de substitution : { url: corps } ; toute autre URL rend 404. */
function recuperateur(reponses: Record<string, string>, journal: string[] = []) {
  return async (url: string) => {
    journal.push(url);
    const corps = reponses[url];
    if (corps === undefined) return { ok: false, status: 404, octets: null };
    return { ok: true, status: 200, octets: Buffer.from(corps) };
  };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const BASE = 'https://echoback.ayfiweb.fr';

// --- Famille 1 : la liste se derive de la sortie ---------------------------------------

test('les references sont relevees dans le HTML produit', () => {
  const arbre = dist({ 'index.html': '<img src="/medias/A01.svg"><img src="/medias/A02.svg">' });
  assert.deepEqual(referencesMediasDe(arbre), ['/medias/A01.svg', '/medias/A02.svg']);
});

test('une meme reference sur deux pages n est comptee qu une fois', () => {
  const arbre = dist({
    'index.html': '<img src="/medias/A01.svg">',
    'categorie/x/index.html': '<img src="/medias/A01.svg">',
  });
  assert.deepEqual(referencesMediasDe(arbre), ['/medias/A01.svg']);
});

test('les references des flux et des sitemaps comptent aussi', () => {
  // Un `og:image` vit dans le HTML, mais une enclosure RSS vit dans le XML : ne scanner
  // que le HTML laisserait un fichier reference sans octets.
  const arbre = dist({ 'rss.xml': '<enclosure url="https://echo.ayfiweb.fr/medias/A03.svg"/>' });
  assert.deepEqual(referencesMediasDe(arbre), ['/medias/A03.svg']);
});

test('les fichiers deja deposes sous medias/ ne se scannent pas eux-memes', () => {
  const arbre = dist({ 'medias/A01.svg': '<svg>/medias/piege.svg</svg>' });
  assert.deepEqual(referencesMediasDe(arbre), []);
});

test('un chemin qui ressemble a un media sans en etre un n est pas releve', () => {
  const arbre = dist({ 'index.html': '<a href="/mediastheque/x">x</a>' });
  assert.deepEqual(referencesMediasDe(arbre), []);
});

// --- Famille 2 : le telechargement ------------------------------------------------------

test('chaque reference est telechargee sous son chemin, depuis /uploads/', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/A01.svg">' });
  const journal: string[] = [];
  const rapport = await localiserMedias(arbre, BASE, {
    recuperer: recuperateur({ [`${BASE}/uploads/A01.svg`]: SVG }, journal),
  });

  assert.deepEqual(journal, [`${BASE}/uploads/A01.svg`]);
  assert.deepEqual(rapport.echecs, []);
  assert.equal(rapport.telecharges, 1);
  assert.equal(fs.readFileSync(path.join(arbre, 'medias', 'A01.svg'), 'utf8'), SVG);
});

test('un sous-chemin de la mediatheque est recree dans la sortie', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/2026/08/x.png">' });
  await localiserMedias(arbre, BASE, {
    recuperer: recuperateur({ [`${BASE}/uploads/2026/08/x.png`]: SVG }),
  });
  assert.ok(fs.existsSync(path.join(arbre, 'medias', '2026', '08', 'x.png')));
});

test('un media introuvable est un ECHEC nomme, jamais un silence', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/absent.svg">' });
  const rapport = await localiserMedias(arbre, BASE, { recuperer: recuperateur({}) });
  assert.equal(rapport.echecs.length, 1);
  assert.match(rapport.echecs[0], /absent\.svg/);
  assert.match(rapport.echecs[0], /404/);
});

test('une reponse vide est un echec : un fichier de zero octet est une image cassee', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/vide.svg">' });
  const rapport = await localiserMedias(arbre, BASE, {
    recuperer: async () => ({ ok: true, status: 200, octets: Buffer.alloc(0) }),
  });
  assert.equal(rapport.echecs.length, 1);
  assert.match(rapport.echecs[0], /vide/);
  assert.equal(fs.existsSync(path.join(arbre, 'medias', 'vide.svg')), false);
});

test('une sortie sans aucun media ne telecharge rien et ne se plaint pas', async () => {
  const arbre = dist({ 'index.html': '<p>Bonjour</p>' });
  const rapport = await localiserMedias(arbre, BASE, {
    recuperer: async () => {
      throw new Error('aucun appel ne devrait avoir lieu');
    },
  });
  assert.equal(rapport.telecharges, 0);
  assert.deepEqual(rapport.echecs, []);
});

test('une base absente est un echec explicite, pas une URL bancale', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/A01.svg">' });
  await assert.rejects(
    () => localiserMedias(arbre, '', { recuperer: recuperateur({}) }),
    /ECHO_STRAPI_URL/,
  );
});
