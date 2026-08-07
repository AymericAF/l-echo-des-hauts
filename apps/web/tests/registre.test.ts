/**
 * Registre des routes REELLEMENT emises (T-04).
 *
 * C est la piece centrale du lot : la bascule FR/EN, les `hreflang` et la garde de liens
 * s y adossent tous. Deux regles y sont exercees ici, et ce sont les deux qu on ne voit
 * pas en regardant une page :
 *
 *   1. §10.3 du plan editorial — « une page d index dont la liste est vide dans la locale
 *      courante n est pas emise ». Sans elle, le miroir anglais publie des pages vides,
 *      indexables, et comptees comme « completes ».
 *   2. La pagination n a pas la meme profondeur dans les deux langues (T-05, piege 2) :
 *      le registre doit donc porter le NOMBRE de pages de chaque index, pas seulement son
 *      existence.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  article,
  auteur,
  categorie,
  dossier,
  localisation,
  referenceAuteur,
  referenceCategorie,
  referenceDossier,
  referenceTag,
  serieArticles,
  tag,
} from './aides/corpus-factice.ts';
import { construireRegistre, type CorpusRoutes } from '../src/lib/routes/registre.ts';

// --- un corpus minimal, bilingue, qui exerce les bornes -------------------------

const catFr = categorie('cat-1', 'fr', 'Territoire', 'territoire', [
  localisation('cat-1', 'en', 'territory'),
]);
const catEn = categorie('cat-1', 'en', 'Territory', 'territory', [
  localisation('cat-1', 'fr', 'territoire'),
]);
/** Une categorie francaise SANS contrepartie anglaise peuplee : sa page EN ne doit pas sortir. */
const catVide = categorie('cat-2', 'fr', 'Grand air', 'grand-air', [
  localisation('cat-2', 'en', 'outdoors'),
]);
const catVideEn = categorie('cat-2', 'en', 'Outdoors', 'outdoors', [
  localisation('cat-2', 'fr', 'grand-air'),
]);

const tagFr = tag('tag-1', 'fr', 'Eau', 'eau', [localisation('tag-1', 'en', 'water')]);
const tagEn = tag('tag-1', 'en', 'Water', 'water', [localisation('tag-1', 'fr', 'eau')]);
/** Un tag francais employe, dont la contrepartie anglaise ne l est par aucun article EN. */
const tagOrphelin = tag('tag-2', 'fr', 'Logement', 'logement', [
  localisation('tag-2', 'en', 'housing'),
]);
const tagOrphelinEn = tag('tag-2', 'en', 'Housing', 'housing', [
  localisation('tag-2', 'fr', 'logement'),
]);

const autFr = auteur('aut-1', 'fr', 'Hakim Zerrouki', 'hakim-zerrouki', [
  localisation('aut-1', 'en', 'hakim-zerrouki'),
]);
const autEn = auteur('aut-1', 'en', 'Hakim Zerrouki', 'hakim-zerrouki', [
  localisation('aut-1', 'fr', 'hakim-zerrouki'),
]);

/** 13 articles FR dans `territoire` : deux pages, la seconde n en porte qu un. */
const articlesFr = serieArticles(13, {
  prefixe: 'fr-territoire',
  locale: 'fr',
  categorie: referenceCategorie(catFr),
  auteur: referenceAuteur(autFr),
  tags: [referenceTag(tagFr)],
});

/** 12 articles FR EXACTEMENT dans `grand-air` : une seule page, jamais de page 2. */
const articlesFrDouze = serieArticles(12, {
  prefixe: 'fr-grand-air',
  locale: 'fr',
  categorie: referenceCategorie(catVide),
  auteur: referenceAuteur(autFr),
  tags: [referenceTag(tagOrphelin)],
});

/** 2 articles EN dans `territory` seulement : une page EN, aucune page EN pour `outdoors`. */
const articlesEn = serieArticles(2, {
  prefixe: 'en-territory',
  locale: 'en',
  categorie: referenceCategorie(catEn),
  auteur: referenceAuteur(autEn),
  tags: [referenceTag(tagEn)],
});

const dosFr = dossier(
  'dos-1',
  'fr',
  'L eau du plateau',
  'l-eau-du-plateau',
  articlesFr.slice(0, 3).map((a) => ({
    documentId: a.documentId,
    titre: a.titre,
    slug: a.slug,
    datePublication: a.datePublication,
  })),
  [localisation('dos-1', 'en', 'the-plateau-water')],
);
const dosEn = dossier('dos-1', 'en', 'The plateau water', 'the-plateau-water', [], [
  localisation('dos-1', 'fr', 'l-eau-du-plateau'),
]);

const corpus: CorpusRoutes = {
  articles: [...articlesFr, ...articlesFrDouze, ...articlesEn],
  categories: [catFr, catVide, catEn, catVideEn],
  tags: [tagFr, tagOrphelin, tagEn, tagOrphelinEn],
  auteurs: [autFr, autEn],
  dossiers: [dosFr, dosEn],
};

const registre = construireRegistre(corpus);

// --- les routes non negociables -------------------------------------------------

test('les deux accueils sont toujours emis — c est le dernier repli de la bascule', () => {
  assert.ok(registre.contient('/'));
  assert.ok(registre.contient('/en'));
});

test('les pages statiques du §4.2 sont emises dans les deux locales', () => {
  for (const chemin of [
    '/a-propos',
    '/mentions-legales',
    '/404',
    '/en/a-propos',
    '/en/mentions-legales',
    '/en/404',
  ]) {
    assert.ok(registre.contient(chemin), `${chemin} devrait etre emis`);
  }
});

test('chaque article emet sa route dans SA locale, avec SON slug', () => {
  assert.ok(registre.contient('/article/fr-territoire-1'));
  assert.ok(registre.contient('/en/article/en-territory-1'));
  assert.ok(!registre.contient('/en/article/fr-territoire-1'), 'le slug FR sous /en est une 404 (T-05, piege 1)');
});

// --- la regle §10.3 : un index vide n est pas emis -------------------------------

test('une categorie sans article dans sa locale N EST PAS emise', () => {
  assert.ok(registre.contient('/categorie/grand-air'), '12 articles FR : la page FR sort');
  assert.ok(
    !registre.contient('/en/categorie/outdoors'),
    'aucun article EN : la page EN ne doit pas sortir (§10.3)',
  );
});

test('un tag sans article dans sa locale n est pas emis', () => {
  assert.ok(registre.contient('/tag/logement'));
  assert.ok(!registre.contient('/en/tag/housing'));
});

test('un dossier sans article dans sa locale n est pas emis', () => {
  assert.ok(registre.contient('/dossier/l-eau-du-plateau'));
  assert.ok(!registre.contient('/en/dossier/the-plateau-water'));
});

test('un auteur qui ne signe rien dans une locale n y est pas emis', () => {
  const sansAuteurEn = construireRegistre({ ...corpus, articles: [...articlesFr] });
  assert.ok(sansAuteurEn.contient('/auteur/hakim-zerrouki'));
  assert.ok(!sansAuteurEn.contient('/en/auteur/hakim-zerrouki'));
});

// --- pagination : les bornes, sur le registre ------------------------------------

test('13 articles emettent la page 1 ET la page 2, jamais la page 3', () => {
  assert.ok(registre.contient('/categorie/territoire'));
  assert.ok(registre.contient('/categorie/territoire/page/2'));
  assert.ok(!registre.contient('/categorie/territoire/page/3'));
});

test('EXACTEMENT 12 articles n emettent aucune page 2', () => {
  assert.ok(registre.contient('/categorie/grand-air'));
  assert.ok(!registre.contient('/categorie/grand-air/page/2'));
});

test('la page 1 n est jamais emise sous la forme /page/1', () => {
  for (const chemin of registre.chemins) {
    assert.ok(!chemin.endsWith('/page/1'), `${chemin} : /page/1 fait doublon avec la page 1`);
  }
});

test('auteur et dossier ne sont jamais pagines (A-42)', () => {
  for (const chemin of registre.chemins) {
    if (chemin.includes('/auteur/') || chemin.includes('/dossier/')) {
      assert.ok(!chemin.includes('/page/'), `${chemin} : auteur et dossier ne sont pas pagines`);
    }
  }
});

// --- ce que le registre expose aux pages -----------------------------------------

test('chaque index emis porte ses pages, dans l ordre, avec ses articles', () => {
  const index = registre.index('fr', 'categorie', 'cat-1');
  assert.ok(index);
  assert.equal(index.pages.length, 2);
  assert.equal(index.pages[0].items.length, 12);
  assert.equal(index.pages[1].items.length, 1);
  assert.equal(index.titre, 'Territoire');
  assert.equal(index.slug, 'territoire');
});

test('un index non emis n est pas retrouvable — l absence est la reponse', () => {
  assert.equal(registre.index('en', 'categorie', 'cat-2'), null);
});

test('les articles d une categorie sont tries par date decroissante', () => {
  const index = registre.index('fr', 'categorie', 'cat-1');
  const dates = index.pages.flatMap((page) => page.items).map((a) => a.datePublication);
  assert.deepEqual([...dates].sort((a, b) => b.localeCompare(a)), dates);
});

test('un article n apparait qu une fois dans son index', () => {
  const index = registre.index('fr', 'categorie', 'cat-1');
  const ids = index.pages.flatMap((page) => page.items).map((a) => a.documentId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 13);
});

test('un dossier ordonne ses articles par datePublication CROISSANTE (A-18)', () => {
  const index = registre.index('fr', 'dossier', 'dos-1');
  const dates = index.pages[0].items.map((a) => a.datePublication);
  assert.deepEqual([...dates].sort((a, b) => a.localeCompare(b)), dates);
});

test('aucune route emise deux fois', () => {
  assert.equal(registre.chemins.size, [...registre.chemins].length);
});

test('toute route emise est normalisee : commence par /, ne finit pas par / (hors racine)', () => {
  for (const chemin of registre.chemins) {
    assert.ok(chemin.startsWith('/'), `${chemin} ne commence pas par /`);
    if (chemin !== '/') assert.ok(!chemin.endsWith('/'), `${chemin} finit par /`);
  }
});
