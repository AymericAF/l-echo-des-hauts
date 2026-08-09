/**
 * Tests de la localisation des URL de medias — l endroit UNIQUE ou elles se construisent.
 *
 * CE QUE CES TESTS EXISTENT POUR EMPECHER. Le 2026-08-08, la recette technique a constate
 * que le site en ligne n affichait AUCUNE image : `urlMedia` absolutisait les URL du
 * provider local de Strapi contre `ECHO_STRAPI_URL`, donc vers `echoback.ayfiweb.fr`,
 * quand la CSP du site sert `img-src 'self' data:`. Le navigateur refusait les 21 images
 * de l accueil. Les fichiers repondaient pourtant en 200 : ce n etait pas une image
 * manquante, c etait une image INTERDITE.
 *
 * L arbitrage T-01 (`docs/arbitrages-techniques.md`) pose que l image est « servie depuis
 * notre propre domaine, telechargee au build ». La CSP appliquait donc exactement le
 * cadrage ; c est le front qui avait devie. Ces tests fixent le sens de la correction :
 * `urlMedia` rend un chemin ENRACINE SUR LE SITE, jamais une URL vers le CMS.
 *
 * INDEPENDANT DU FORMAT. Localiser un fichier et choisir son format (SVG tel quel, ou
 * derive AVIF/WebP par Sharp — decision `129b7fc6`, en attente) sont deux questions
 * distinctes. Rien ici ne prejuge de la seconde : seul le CHEMIN est en cause.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PREFIXE_MEDIAS,
  cheminLocalMedia,
  sourceDistanteMedia,
  urlMedia,
} from '../src/lib/media.ts';
import type { Media } from '../src/lib/domaine.ts';

function media(url: string): Media {
  return { url, alternative: null, largeur: null, hauteur: null, mime: null };
}

// --- Famille 1 : ce que rend `urlMedia` -----------------------------------------------

test('une URL relative du provider local devient un chemin enracine sur le site', () => {
  assert.equal(urlMedia(media('/uploads/A01_2f12d41593.svg')), '/medias/A01_2f12d41593.svg');
});

test('le prefixe expose est bien celui qui est rendu', () => {
  assert.ok(urlMedia(media('/uploads/x.svg')).startsWith(PREFIXE_MEDIAS));
});

test('un sous-chemin de la mediatheque est conserve tel quel', () => {
  assert.equal(urlMedia(media('/uploads/2026/08/x_1a2b.png')), '/medias/2026/08/x_1a2b.png');
});

test('une URL ABSOLUE vers la mediatheque est localisee elle aussi', () => {
  // C est la forme que rend un provider configure avec une URL publique. La laisser
  // passer telle quelle reconstituerait exactement le defaut du 2026-08-08.
  assert.equal(
    urlMedia(media('https://echoback.ayfiweb.fr/uploads/A01_2f12d41593.svg')),
    '/medias/A01_2f12d41593.svg',
  );
});

test('une requete ou un fragment ne survivent pas a la localisation', () => {
  assert.equal(urlMedia(media('/uploads/x.svg?updated=1#z')), '/medias/x.svg');
});

test('le resultat ne depend PAS de ECHO_STRAPI_URL', () => {
  const avant = process.env.ECHO_STRAPI_URL;
  delete process.env.ECHO_STRAPI_URL;
  try {
    // Avant la correction, cet appel levait « ECHO_STRAPI_URL est absente ». Le chemin
    // d une image n a aucune raison de dependre de l adresse du CMS.
    assert.equal(urlMedia(media('/uploads/x.svg')), '/medias/x.svg');
  } finally {
    if (avant !== undefined) process.env.ECHO_STRAPI_URL = avant;
  }
});

// --- Famille 2 : ce qui est REFUSE, plutot que passe en silence ------------------------

test('une URL vers un hote tiers est REFUSEE, pas recopiee', () => {
  // Recopier ferait sortir une balise que la CSP refusera : le build doit s arreter la,
  // au lieu de produire une page dont l image ne s affichera jamais.
  assert.throws(() => urlMedia(media('https://cdn.exemple.invalid/photo.jpg')), /T-01/);
});

test('un chemin qui n est pas dans la mediatheque est refuse', () => {
  assert.throws(() => cheminLocalMedia('/autre/x.svg'), /T-01/);
});

test('une URL vide est refusee', () => {
  assert.throws(() => cheminLocalMedia(''), /T-01/);
});

// --- Famille 3 : le chemin inverse, dont le telechargement au build a besoin -----------

test('la source distante se reconstruit depuis le chemin local', () => {
  assert.equal(
    sourceDistanteMedia('/medias/A01_2f12d41593.svg', 'https://echoback.ayfiweb.fr'),
    'https://echoback.ayfiweb.fr/uploads/A01_2f12d41593.svg',
  );
});

test('un slash final sur la base ne double pas le separateur', () => {
  assert.equal(
    sourceDistanteMedia('/medias/x.svg', 'https://echoback.ayfiweb.fr/'),
    'https://echoback.ayfiweb.fr/uploads/x.svg',
  );
});

test('aller puis revenir rend la source d origine', () => {
  const source = 'https://echoback.ayfiweb.fr/uploads/2026/08/x_1a2b.png';
  assert.equal(sourceDistanteMedia(cheminLocalMedia(source), 'https://echoback.ayfiweb.fr'), source);
});

test('un chemin qui n est pas un media local est refuse par la reconstruction', () => {
  assert.throws(() => sourceDistanteMedia('/uploads/x.svg', 'https://exemple.invalid'), /medias/);
});
