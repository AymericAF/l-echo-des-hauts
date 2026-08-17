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
  CARACTERES_MEDIA,
} from '../src/lib/media.ts';
import { REFERENCE } from '../scripts/medias-locaux.mjs';
import type { Media } from '../src/lib/domaine.ts';

function media(url: string): Media {
  return { url, alternative: null, legende: null, largeur: null, hauteur: null, mime: null };
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

// ── LA CLASSE DE CARACTÈRES DES MÉDIAS, RENDUE OPPOSABLE ──────────────────────────────────────
//
// LE TROU QUE CECI FERME, et il n'a qu'une forme silencieuse. `medias-locaux.mjs` relit les
// chemins de la sortie avec une classe de caractères ; `cheminLocalMedia` les ÉCRIT sans en
// filtrer aucun. Les deux littéraux étaient DUPLIQUÉS, et la garantie qu'ils coïncident n'était
// qu'une CONVENTION écrite dans un docblock.
//
// Si un caractère hors classe apparaissait :
//   · AU MILIEU du nom → la référence est tronquée, le téléchargement part sur un chemin coupé,
//     Strapi rend 404, et le build ROUGIT déjà. Rien à ajouter.
//   · EN PREMIÈRE POSITION après `/medias/` → la regex ne matche RIEN. Aucun téléchargement
//     n'est tenté, la page pointe un fichier jamais déposé, le build est VERT et l'image morte.
//     **C'est le seul cas silencieux, et c'est celui que ces tests ferment.**
//
// ON LÈVE, ON NE RÉPARE PAS. Filtrer, normaliser ou échapper masquerait un changement du
// producteur — c'est-à-dire exactement l'événement qu'on veut voir.

test('cheminLocalMedia LÈVE sur le cas SILENCIEUX : caractère hors classe en PREMIÈRE position', () => {
  // Le cas qui ne rougirait nulle part ailleurs : la regex de relecture ne matcherait rien du
  // tout, donc aucun 404, donc aucun échec de build — juste une image absente en ligne.
  assert.throws(
    () => cheminLocalMedia('/uploads/été_a1b2c3d4e5.svg'),
    /hors de la classe|caractère/i,
  );
});

test('cheminLocalMedia lève aussi sur un caractère hors classe AU MILIEU', () => {
  for (const nom of ['photo 1_a1b2c3d4e5.svg', "c'est_a1b2c3d4e5.svg", 'vue(2)_a1b2c3d4e5.svg']) {
    assert.throws(
      () => cheminLocalMedia(`/uploads/${nom}`),
      /hors de la classe|caractère/i,
      `« ${nom} » aurait dû lever`,
    );
  }
});

test('NON-RÉGRESSION : les trois sorties RÉELLES de @strapi/upload passent sans lever', () => {
  // Mesurées sur le producteur réel (contrôle 9181da31) : `nameToSlug` + 10 hexadécimaux.
  // Si l'une d'elles levait, l'assertion serait plus stricte que le producteur — elle casserait
  // le build sur des noms légitimes, ce qui est pire que le trou qu'elle ferme.
  for (const nom of ['ete_a1b2c3d4e5.svg', 'photo_1_a1b2c3d4e5.svg', 'c_est_a1b2c3d4e5.svg']) {
    const chemin = cheminLocalMedia(`https://echoback.ayfiweb.fr/uploads/${nom}`);
    assert.equal(chemin, `/medias/${nom}`);
  }
});

test('LA NON-DIVERGENCE EST PROUVÉE : ce qui est ÉCRIT est relu INTÉGRALEMENT par le LECTEUR', () => {
  // ⚠️ LA PREMIÈRE VERSION DE CE TEST ÉTAIT INERTE, et seule la cassure l'a montré : elle
  // construisait sa propre regex à partir de `CARACTERES_MEDIA`, donc elle comparait la classe
  // ÉCRITE à ELLE-MÊME. On pouvait faire diverger le lecteur sans qu'elle bronche — exactement le
  // défaut qu'elle prétendait fermer. Elle confronte maintenant la sortie de `cheminLocalMedia`
  // à `REFERENCE`, la regex que `medias-locaux.mjs` utilise VRAIMENT pour relire la sortie.
  for (const nom of ['ete_a1b2c3d4e5.svg', 'photo_1_a1b2c3d4e5.svg', 'c_est_a1b2c3d4e5.svg',
    '2026/08/x_1a2b.png', 'x.svg']) {
    const chemin = cheminLocalMedia(`/uploads/${nom}`);
    const relu = chemin.match(new RegExp(REFERENCE.source, 'g'));
    assert.ok(
      relu && relu.length === 1 && relu[0] === chemin,
      `« ${chemin} » est ÉCRIT par cheminLocalMedia mais n'est PAS relu intégralement par la regex `
      + `du lecteur (relu : ${JSON.stringify(relu)}). Les deux côtés ont divergé, et le média ne `
      + 'serait jamais déposé — build vert, image morte.',
    );
  }
});

test('MESURÉ : une URL ABSOLUE est percent-encodée AVANT le contrôle, donc elle ne peut pas lever', () => {
  // Ce test n'est pas une redondance : il FIGE la raison pour laquelle l'assertion ci-dessus vise
  // la forme relative. `sousCheminMediatheque` passe les URL absolues par `new URL().pathname`,
  // qui encode — et `%` appartient à la classe. Un lecteur pressé qui essaierait un `é` dans une
  // URL absolue verrait la garde « ne pas marcher » et serait tenté de la corriger ; elle marche,
  // c'est l'entrée qui a déjà été normalisée.
  assert.equal(
    cheminLocalMedia('https://echoback.ayfiweb.fr/uploads/été_a1b2c3d4e5.svg'),
    '/medias/%C3%A9t%C3%A9_a1b2c3d4e5.svg',
  );
  // Et la forme RELATIVE, elle, n'est pas encodée : c'est celle que le provider local émet,
  // et c'est là que l'assertion travaille.
  assert.throws(() => cheminLocalMedia('/uploads/été_a1b2c3d4e5.svg'), /hors de la classe/);
});
