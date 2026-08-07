/**
 * La politique d indexation vit a UN seul endroit.
 *
 * A-29 : « `noindex: true` -> la page porte `<meta name="robots" content="noindex">`
 * ET sort du sitemap ». Deux points de lecture, une seule decision. Avant ce module,
 * le `noindex` de `/mentions-legales` etait ecrit en dur dans le fichier de page : le
 * sitemap n avait alors aucun moyen de le connaitre sans le recopier — et deux copies
 * d une meme decision finissent toujours par diverger.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Seo } from '../src/lib/domaine.ts';
import { STATIQUES_NOINDEX, noindexDe, seoDeFamille } from '../src/lib/seo/indexation.ts';
import { categorie, dossier, tag, auteur } from './aides/corpus-factice.ts';
import { article, referenceCategorie } from './aides/corpus-factice.ts';

const SEO_NOINDEX: Seo = {
  metaTitre: null,
  metaDescription: null,
  imagePartage: null,
  noindex: true,
  canonique: null,
};

test('les deux pages statiques hors index sont /404 et /mentions-legales, et elles seules', () => {
  assert.deepEqual([...STATIQUES_NOINDEX].sort(), ['404', 'mentions-legales']);
});

test('une page statique de la liste est noindex dans les deux locales', () => {
  for (const locale of ['fr', 'en'] as const) {
    assert.equal(noindexDe({ genre: 'statique', locale, nom: '404' }, null), true);
    assert.equal(noindexDe({ genre: 'statique', locale, nom: 'mentions-legales' }, null), true);
    assert.equal(noindexDe({ genre: 'statique', locale, nom: 'a-propos' }, null), false);
  }
});

test("l accueil est toujours indexable — c est le seul repli de la bascule", () => {
  assert.equal(noindexDe({ genre: 'accueil', locale: 'fr' }, SEO_NOINDEX), false);
  assert.equal(noindexDe({ genre: 'accueil', locale: 'en' }, null), false);
});

test('un article suit la surcharge editoriale de son component partage.seo', () => {
  const cat = categorie('cat-1', 'fr', 'Territoire', 'territoire');
  const page = {
    genre: 'article' as const,
    locale: 'fr' as const,
    article: article({ documentId: 'a1', locale: 'fr', titre: 'T', slug: 't', categorie: referenceCategorie(cat) }),
  };
  assert.equal(noindexDe(page, null), false);
  assert.equal(noindexDe(page, SEO_NOINDEX), true);
});

test('un index suit la surcharge de son entite quand elle en porte une', () => {
  const page = {
    genre: 'index' as const,
    locale: 'fr' as const,
    famille: 'categorie' as const,
    documentId: 'cat-1',
    numero: 1,
  };
  assert.equal(noindexDe(page, SEO_NOINDEX), true);
  assert.equal(noindexDe(page, null), false);
});

test('seoDeFamille ne rend un Seo que pour les familles qui en portent un', () => {
  const cat = categorie('cat-1', 'fr', 'Territoire', 'territoire');
  const dos = dossier('dos-1', 'fr', 'L eau', 'l-eau');
  assert.equal(seoDeFamille('categorie', cat), null); // aucune surcharge posee
  assert.equal(seoDeFamille('dossier', dos), null);
  // Tag et Auteur n ont AUCUN champ seo au modele : la fonction ne doit pas en inventer.
  assert.equal(seoDeFamille('tag', tag('t-1', 'fr', 'Eau', 'eau')), null);
  assert.equal(seoDeFamille('auteur', auteur('au-1', 'fr', 'Noelle', 'noelle')), null);
});

test('seoDeFamille rend la surcharge posee sur une categorie ou un dossier', () => {
  const cat = { ...categorie('cat-1', 'fr', 'Territoire', 'territoire'), seo: SEO_NOINDEX };
  const dos = { ...dossier('dos-1', 'fr', 'L eau', 'l-eau'), seo: SEO_NOINDEX };
  assert.equal(seoDeFamille('categorie', cat), SEO_NOINDEX);
  assert.equal(seoDeFamille('dossier', dos), SEO_NOINDEX);
});
