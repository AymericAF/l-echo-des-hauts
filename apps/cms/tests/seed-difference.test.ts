/**
 * LA COMPARAISON QUI DECIDE D'ECRIRE OU DE SE TAIRE — exercee en la cassant.
 *
 * Elle porte desormais la seule chose qui empeche un seed de republier 69 fois
 * ce qui n'a pas bouge. Une comparaison trop laxiste ne casserait rien de
 * visible : elle SAUTERAIT une ecriture necessaire, et le site sortirait faux
 * sans qu'une ligne rougisse. Chaque cas ci-dessous exerce donc un motif de
 * doute precis, et verifie qu'il rend « different » — jamais « identique ».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  comparerCorps,
  egalProfond,
  parametresPopulate,
  type Natures,
} from '../scripts/seed/difference.ts';

const AUCUN_SLUG = () => undefined;
const SLUGS = (table: Record<string, string>) => (id: string) => table[id];

/* ------------------------------------------------------------------ */
/* Scalaires                                                           */
/* ------------------------------------------------------------------ */

test('un corps identique ne provoque aucune ecriture', () => {
  const natures: Natures = { titre: 'scalaire', aLaUne: 'scalaire' };
  const verdict = comparerCorps(
    { titre: 'Le col des Trois-Vents', aLaUne: true },
    { titre: 'Le col des Trois-Vents', aLaUne: true, publishedAt: '2026-08-10' },
    natures,
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, true);
});

test('un champ scalaire different fait reecrire, et le motif le nomme', () => {
  const verdict = comparerCorps(
    { titre: 'Titre revu' },
    { titre: 'Titre' },
    { titre: 'scalaire' },
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /titre/);
});

test('un champ ECRIT mais NON DECLARE fait reecrire — l oubli se paie en bruit', () => {
  const verdict = comparerCorps({ nouveau: 'x' }, { nouveau: 'x' }, {}, AUCUN_SLUG);
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /sans nature declaree/);
});

test('un champ que le seed n ECRIT PAS n est jamais juge', () => {
  const verdict = comparerCorps(
    { titre: 'A' },
    { titre: 'A', seo: { metaTitre: 'saisi a la main' } },
    { titre: 'scalaire' },
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, true);
});

test('l ordre des cles ne compte pas — PostgreSQL reordonne le jsonb', () => {
  assert.equal(
    egalProfond({ type: 'paragraph', children: [] }, { children: [], type: 'paragraph' }),
    true
  );
  const bloc = [{ type: 'paragraph', children: [{ text: 'x', type: 'text' }] }];
  const relu = [{ children: [{ type: 'text', text: 'x' }], type: 'paragraph' }];
  assert.equal(
    comparerCorps({ bio: bloc }, { bio: relu }, { bio: 'scalaire' }, AUCUN_SLUG).identique,
    true
  );
});

test('absent, null et tableau vide decrivent le meme etat', () => {
  const natures: Natures = { legende: 'scalaire', tags: 'relations' };
  assert.equal(
    comparerCorps({ legende: undefined, tags: [] }, { legende: null }, natures, AUCUN_SLUG)
      .identique,
    true
  );
});

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

test('deux ecritures du meme instant sont identiques', () => {
  const verdict = comparerCorps(
    { datePublication: '2026-07-21T06:00:00.000Z' },
    { datePublication: '2026-07-21T06:00:00Z' },
    { datePublication: 'date' },
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, true);
});

test('un autre instant fait reecrire', () => {
  const verdict = comparerCorps(
    { datePublication: '2026-07-21T06:00:00.000Z' },
    { datePublication: '2026-07-22T06:00:00.000Z' },
    { datePublication: 'date' },
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, false);
});

/* ------------------------------------------------------------------ */
/* Medias                                                              */
/* ------------------------------------------------------------------ */

test('un media se compare par son id, qu il soit rendu peuple ou nu', () => {
  const natures: Natures = { imageCouverture: 'media', images: 'medias' };
  assert.equal(
    comparerCorps(
      { imageCouverture: 12, images: [3, 4] },
      { imageCouverture: { id: 12, name: 'a.svg' }, images: [{ id: 3 }, { id: 4 }] },
      natures,
      AUCUN_SLUG
    ).identique,
    true
  );
  assert.equal(
    comparerCorps(
      { imageCouverture: 12, images: [4, 3] },
      { imageCouverture: { id: 12 }, images: [{ id: 3 }, { id: 4 }] },
      natures,
      AUCUN_SLUG
    ).identique,
    false,
    'l ordre des images d une galerie est editorial : il compte'
  );
});

test('un media lu SANS id exploitable fait reecrire, il ne fait pas sauter', () => {
  const verdict = comparerCorps(
    { imageCouverture: 12 },
    { imageCouverture: { name: 'a.svg' } },
    { imageCouverture: 'media' },
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /sans id exploitable/);
});

/* ------------------------------------------------------------------ */
/* Relations — le cas qui compte                                        */
/* ------------------------------------------------------------------ */

test('une relation dont le SLUG lu est celui d une AUTRE LOCALE fait reecrire', () => {
  // Le cas fondateur : `documentId` est COMMUN a toutes les locales (A-06).
  // Comparer par lui aurait rendu « identique » une localisation EN dont la
  // rubrique pointe encore l entree FR — le site anglais aux rubriques
  // francaises que le controle 12 existe pour attraper, fige a jamais parce
  // que l ecriture qui l aurait corrige aurait ete sautee.
  const verdict = comparerCorps(
    { categorie: 'doc-7' },
    { categorie: { documentId: 'doc-7', slug: 'territoire', locale: 'fr' } },
    { categorie: 'relation' },
    SLUGS({ 'doc-7': 'territory' })
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /territory/);
});

test('une relation correctement localisee est identique', () => {
  const verdict = comparerCorps(
    { categorie: 'doc-7' },
    { categorie: { documentId: 'doc-7', slug: 'territory', locale: 'en' } },
    { categorie: 'relation' },
    SLUGS({ 'doc-7': 'territory' })
  );
  assert.equal(verdict.identique, true);
});

test('un slug attendu NON RESOLU est un doute, donc une reecriture', () => {
  const verdict = comparerCorps(
    { auteur: 'doc-3' },
    { auteur: { documentId: 'doc-3', slug: 'hakim-zerrouki', locale: 'fr' } },
    { auteur: 'relation' },
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /non resolu/);
});

test('une relation lue SANS slug est un doute, donc une reecriture', () => {
  const verdict = comparerCorps(
    { auteur: 'doc-3' },
    { auteur: { documentId: 'doc-3' } },
    { auteur: 'relation' },
    SLUGS({ 'doc-3': 'hakim-zerrouki' })
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /sans slug/);
});

test('une relation multiple se compare en ENSEMBLE — Strapi n en garantit pas l ordre', () => {
  const natures: Natures = { tags: 'relations' };
  const slugs = SLUGS({ 'doc-1': 'energie', 'doc-2': 'climat' });
  assert.equal(
    comparerCorps(
      { tags: ['doc-1', 'doc-2'] },
      { tags: [{ slug: 'climat' }, { slug: 'energie' }] },
      natures,
      slugs
    ).identique,
    true
  );
  assert.equal(
    comparerCorps({ tags: ['doc-1'] }, { tags: [{ slug: 'climat' }] }, natures, slugs).identique,
    false
  );
});

/* ------------------------------------------------------------------ */
/* Zone dynamique et composants repetables                             */
/* ------------------------------------------------------------------ */

const NATURES_ZONE: Natures = {
  contenu: {
    zone: {
      'bloc.texte': { contenu: 'scalaire' },
      'bloc.image-legendee': { image: 'media', legende: 'scalaire' },
    },
  },
};

test('la zone dynamique se compare bloc a bloc, dans l ORDRE', () => {
  const voulu = [
    { __component: 'bloc.texte', contenu: [{ type: 'paragraph' }] },
    { __component: 'bloc.image-legendee', image: 5, legende: 'La crete' },
  ];
  assert.equal(
    comparerCorps(
      { contenu: voulu },
      {
        contenu: [
          { __component: 'bloc.texte', contenu: [{ type: 'paragraph' }], id: 1 },
          { __component: 'bloc.image-legendee', image: { id: 5 }, legende: 'La crete', id: 2 },
        ],
      },
      NATURES_ZONE,
      AUCUN_SLUG
    ).identique,
    true
  );
  assert.equal(
    comparerCorps(
      { contenu: voulu },
      {
        contenu: [
          { __component: 'bloc.image-legendee', image: { id: 5 }, legende: 'La crete' },
          { __component: 'bloc.texte', contenu: [{ type: 'paragraph' }] },
        ],
      },
      NATURES_ZONE,
      AUCUN_SLUG
    ).identique,
    false,
    'deux blocs permutes ne sont pas le meme article'
  );
});

test('un bloc de zone SANS natures declarees fait reecrire', () => {
  const verdict = comparerCorps(
    { contenu: [{ __component: 'bloc.citation', texte: 'x' }] },
    { contenu: [{ __component: 'bloc.citation', texte: 'x' }] },
    NATURES_ZONE,
    AUCUN_SLUG
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /sans natures declarees/);
});

test('un composant repetable se compare entree par entree', () => {
  const natures: Natures = { reseaux: { repete: { plateforme: 'scalaire', url: 'scalaire' } } };
  assert.equal(
    comparerCorps(
      { reseaux: [{ plateforme: 'linkedin', url: 'https://x' }] },
      { reseaux: [{ plateforme: 'linkedin', url: 'https://x', id: 9 }] },
      natures,
      AUCUN_SLUG
    ).identique,
    true
  );
  assert.equal(
    comparerCorps(
      { reseaux: [{ plateforme: 'linkedin', url: 'https://x' }] },
      { reseaux: [] },
      natures,
      AUCUN_SLUG
    ).identique,
    false
  );
});

test('une entree jamais lue n est jamais « identique »', () => {
  assert.equal(comparerCorps({ titre: 'A' }, null, { titre: 'scalaire' }, AUCUN_SLUG).identique, false);
  assert.equal(
    comparerCorps({ titre: 'A' }, undefined, { titre: 'scalaire' }, AUCUN_SLUG).identique,
    false
  );
});

/* ------------------------------------------------------------------ */
/* Le populate se DERIVE des memes natures                              */
/* ------------------------------------------------------------------ */

test('le populate demande tout ce que la comparaison juge, et rien d autre', () => {
  const parametres = parametresPopulate({
    titre: 'scalaire',
    datePublication: 'date',
    imageCouverture: 'media',
    tags: 'relations',
    contenu: {
      zone: {
        'bloc.galerie': { images: 'medias', legende: 'scalaire' },
        'bloc.chiffres-cles': { entrees: { repete: { valeur: 'scalaire' } } },
      },
    },
  });

  // Les scalaires ne se populent pas : ils reviennent d office.
  assert.equal(parametres['populate[titre][fields][0]'], undefined);
  assert.equal(parametres['populate[datePublication][fields][0]'], undefined);

  assert.equal(parametres['populate[imageCouverture][fields][0]'], 'name');
  assert.equal(parametres['populate[tags][fields][0]'], 'slug');
  assert.equal(parametres['populate[contenu][on][bloc.galerie][fields][0]'], 'legende');
  assert.equal(
    parametres['populate[contenu][on][bloc.galerie][populate][images][fields][0]'],
    'name'
  );
  // Un composant sans champ scalaire demande le strict minimum plutot que de
  // laisser Strapi decider — jamais le joker, qui ne descend qu au 1er niveau.
  assert.equal(parametres['populate[contenu][on][bloc.chiffres-cles][fields][0]'], 'id');
  assert.equal(
    parametres['populate[contenu][on][bloc.chiffres-cles][populate][entrees][fields][0]'],
    'valeur'
  );
  assert.equal(
    Object.values(parametres).some((v) => v === '*'),
    false,
    'jamais le joker'
  );
});
