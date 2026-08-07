/**
 * Le sitemap se calcule sur le REGISTRE des routes reellement emises (T-04), le meme
 * que la bascule FR/EN. C est la seule chose qui garantisse qu il ne declare pas une
 * URL que le build n a pas produite : deux sources de verite sur « quelles pages
 * existent » divergent toujours, et l ecart ne se voit alors que dans la Search Console.
 *
 * Ce harnais exerce les trois regles qui produisent les defauts :
 *   - A-29 : une page `noindex` sort du sitemap ;
 *   - §10.3 : un index vide dans sa locale n est pas emis, donc pas dans le sitemap ;
 *   - T-06 : les alternates du sitemap sont ceux du `<head>` — contrepartie EXACTE
 *     seulement, jamais le repli de navigation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Configuration, Locale, Seo } from '../src/lib/domaine.ts';
import { construireRegistre } from '../src/lib/routes/registre.ts';
import {
  SEGMENTS_SITEMAP,
  cheminSegment,
  segmentsSitemap,
  xmlSitemapIndex,
  xmlUrlset,
} from '../src/lib/seo/sitemap.ts';
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
  tag,
} from './aides/corpus-factice.ts';

const ORIGINE = 'https://echo.test';

const SEO_NOINDEX: Seo = {
  metaTitre: null,
  metaDescription: null,
  imagePartage: null,
  noindex: true,
  canonique: null,
};

function configuration(locale: Locale, updatedAt: string): Configuration {
  return {
    documentId: 'conf',
    locale,
    nomSite: 'L Echo des Hauts',
    baseline: null,
    logo: { url: '/uploads/logo.svg', alternative: null, largeur: 10, hauteur: 10, mime: 'image/svg+xml' },
    logoSombre: null,
    favicon: null,
    descriptionDefaut: 'Magazine du plateau.',
    imagePartageDefaut: {
      url: '/uploads/partage.svg',
      alternative: null,
      largeur: null,
      hauteur: null,
      mime: 'image/svg+xml',
    },
    reseaux: [],
    texteFooter: null,
    mentionsLegales: [],
    updatedAt,
  };
}

const CONFIGURATIONS = new Map<Locale, Configuration | null>([
  ['fr', configuration('fr', '2026-02-01T00:00:00.000Z')],
  ['en', configuration('en', '2026-02-02T00:00:00.000Z')],
]);

/**
 * Un corpus bilingue minimal mais complet : une categorie traduite, un tag employe
 * dans les deux locales, un tag employe SEULEMENT en francais (donc index EN non emis),
 * un auteur, un dossier, deux articles dont un traduit.
 */
function corpus() {
  const catFr = categorie('cat-1', 'fr', 'Territoire', 'territoire', [localisation('cat-1', 'en', 'territory')]);
  const catEn = categorie('cat-1', 'en', 'Territory', 'territory', [localisation('cat-1', 'fr', 'territoire')]);
  const tagFr = tag('tag-1', 'fr', 'Forets', 'forets', [localisation('tag-1', 'en', 'forests')]);
  const tagEn = tag('tag-1', 'en', 'Forests', 'forests', [localisation('tag-1', 'fr', 'forets')]);
  const tagSeulFr = tag('tag-2', 'fr', 'Elevage', 'elevage', [localisation('tag-2', 'en', 'livestock')]);
  const tagSeulEn = tag('tag-2', 'en', 'Livestock', 'livestock', [localisation('tag-2', 'fr', 'elevage')]);
  const autFr = auteur('aut-1', 'fr', 'Noelle Vasseur', 'noelle-vasseur', [localisation('aut-1', 'en', 'noelle-vasseur')]);
  const autEn = auteur('aut-1', 'en', 'Noelle Vasseur', 'noelle-vasseur', [localisation('aut-1', 'fr', 'noelle-vasseur')]);

  const artFr = {
    ...article({
      documentId: 'art-1',
      locale: 'fr',
      titre: 'Le plateau se reboise',
      slug: 'le-plateau-se-reboise',
      categorie: referenceCategorie(catFr),
      auteur: referenceAuteur(autFr),
      tags: [referenceTag(tagFr), referenceTag(tagSeulFr)],
      localisations: [localisation('art-1', 'en', 'the-plateau-regrows')],
    }),
    updatedAt: '2026-03-10T12:00:00.000Z',
  };
  const artEn = {
    ...article({
      documentId: 'art-1',
      locale: 'en',
      titre: 'The plateau regrows',
      slug: 'the-plateau-regrows',
      categorie: referenceCategorie(catEn),
      auteur: referenceAuteur(autEn),
      tags: [referenceTag(tagEn)],
      localisations: [localisation('art-1', 'fr', 'le-plateau-se-reboise')],
    }),
    updatedAt: '2026-03-11T12:00:00.000Z',
  };

  const dosFr = dossier('dos-1', 'fr', 'L eau du plateau', 'l-eau-du-plateau', [
    { documentId: 'art-1', titre: 'Le plateau se reboise', slug: 'le-plateau-se-reboise', datePublication: '2026-01-01T00:00:00.000Z' },
  ]);
  const dosEn = dossier('dos-1', 'en', 'The plateau water', 'the-plateau-water', [
    { documentId: 'art-1', titre: 'The plateau regrows', slug: 'the-plateau-regrows', datePublication: '2026-01-01T00:00:00.000Z' },
  ]);

  return {
    articles: [artFr, artEn],
    categories: [catFr, catEn],
    tags: [tagFr, tagEn, tagSeulFr, tagSeulEn],
    auteurs: [autFr, autEn],
    dossiers: [dosFr, dosEn],
  };
}

function segments() {
  return segmentsSitemap(construireRegistre(corpus()), CONFIGURATIONS);
}

function cheminsDe(nom: string): string[] {
  return (segments().find((s) => s.nom === nom)?.entrees ?? []).map((e) => e.chemin).sort();
}

function tousLesChemins(): string[] {
  return segments().flatMap((s) => s.entrees.map((e) => e.chemin)).sort();
}

// --- segmentation par type de contenu (§5.2) ------------------------------------

test('les segments sont nommes par type de contenu, jamais par locale', () => {
  assert.deepEqual([...SEGMENTS_SITEMAP], ['pages', 'articles', 'categories', 'tags', 'auteurs', 'dossiers']);
  assert.equal(cheminSegment('articles'), '/sitemap-articles.xml');
});

test('un segment melange les deux locales — la segmentation est par TYPE', () => {
  assert.deepEqual(cheminsDe('articles'), ['/article/le-plateau-se-reboise', '/en/article/the-plateau-regrows']);
});

test('un segment vide n est pas emis du tout', () => {
  const sansRien = segmentsSitemap(
    construireRegistre({ articles: [], categories: [], tags: [], auteurs: [], dossiers: [] }),
    CONFIGURATIONS,
  );
  assert.deepEqual(sansRien.map((s) => s.nom), ['pages']); // accueil + /a-propos, toujours emis
  assert.deepEqual(
    sansRien[0].entrees.map((e) => e.chemin).sort(),
    ['/', '/a-propos', '/en', '/en/a-propos'],
  );
});

// --- A-29 : noindex sort du sitemap ---------------------------------------------

test('les pages noindex sont absentes : ni /404, ni /mentions-legales', () => {
  const chemins = tousLesChemins();
  for (const absent of ['/404', '/en/404', '/mentions-legales', '/en/mentions-legales']) {
    assert.ok(!chemins.includes(absent), `${absent} ne doit pas etre au sitemap (A-29)`);
  }
  assert.ok(chemins.includes('/a-propos'));
  assert.ok(chemins.includes('/en/a-propos'));
});

test('un article marque noindex par la redaction sort du sitemap', () => {
  const source = corpus();
  const avec = {
    ...source,
    articles: [{ ...source.articles[0], seo: SEO_NOINDEX }, source.articles[1]],
  };
  const chemins = segmentsSitemap(construireRegistre(avec), CONFIGURATIONS)
    .flatMap((s) => s.entrees.map((e) => e.chemin));
  assert.ok(!chemins.includes('/article/le-plateau-se-reboise'));
  assert.ok(chemins.includes('/en/article/the-plateau-regrows'));
});

test('une categorie marquee noindex sort du sitemap, ses articles y restent', () => {
  const source = corpus();
  const avec = {
    ...source,
    categories: [{ ...source.categories[0], seo: SEO_NOINDEX }, source.categories[1]],
  };
  const chemins = segmentsSitemap(construireRegistre(avec), CONFIGURATIONS)
    .flatMap((s) => s.entrees.map((e) => e.chemin));
  assert.ok(!chemins.includes('/categorie/territoire'));
  assert.ok(chemins.includes('/en/categorie/territory'));
  assert.ok(chemins.includes('/article/le-plateau-se-reboise'));
});

// --- §10.3 : un index vide dans sa locale n existe pas ---------------------------

test('un tag sans article dans sa locale n a pas d entree de sitemap', () => {
  const tags = cheminsDe('tags');
  assert.deepEqual(tags, ['/en/tag/forests', '/tag/elevage', '/tag/forets']);
  assert.ok(!tags.includes('/en/tag/livestock'), '§10.3 : index EN vide, donc non emis');
});

// --- le sitemap ne cite QUE des routes du registre --------------------------------

test('chaque entree du sitemap est une route que le registre emet', () => {
  const registre = construireRegistre(corpus());
  for (const segment of segmentsSitemap(registre, CONFIGURATIONS)) {
    for (const entree of segment.entrees) {
      assert.ok(registre.contient(entree.chemin), `hors registre : ${entree.chemin}`);
      for (const alternate of entree.alternates) {
        assert.ok(registre.contient(alternate.chemin), `alternate hors registre : ${alternate.chemin}`);
      }
    }
  }
});

// --- T-06 : les alternates du sitemap sont ceux du <head> ------------------------

test('un article traduit porte ses trois alternates, des deux cotes', () => {
  const entrees = segments().find((s) => s.nom === 'articles')!.entrees;
  const fr = entrees.find((e) => e.chemin === '/article/le-plateau-se-reboise')!;
  assert.deepEqual(fr.alternates, [
    { hreflang: 'fr', chemin: '/article/le-plateau-se-reboise' },
    { hreflang: 'en', chemin: '/en/article/the-plateau-regrows' },
    { hreflang: 'x-default', chemin: '/article/le-plateau-se-reboise' },
  ]);
  const en = entrees.find((e) => e.chemin === '/en/article/the-plateau-regrows')!;
  /* La RECIPROCITE porte sur l ensemble des alternates, pas sur leur ordre : chaque
     page se cite elle-meme en premier. On compare donc les deux groupes tries. */
  const groupe = (e: typeof fr) =>
    e.alternates.filter((a) => a.hreflang !== 'x-default').map((a) => `${a.hreflang} ${a.chemin}`).sort();
  assert.deepEqual(groupe(en), groupe(fr));
  assert.deepEqual(
    en.alternates.find((a) => a.hreflang === 'x-default'),
    { hreflang: 'x-default', chemin: '/article/le-plateau-se-reboise' },
  );
});

test('un index sans contrepartie exacte ne porte AUCUN alternate', () => {
  const tags = segments().find((s) => s.nom === 'tags')!.entrees;
  const elevage = tags.find((e) => e.chemin === '/tag/elevage')!;
  assert.deepEqual(elevage.alternates, [], 'le repli de navigation ne doit pas contaminer les alternates');
});

// --- lastmod ---------------------------------------------------------------------

test('le lastmod d un article est sa propre date de modification', () => {
  const entree = segments()
    .find((s) => s.nom === 'articles')!
    .entrees.find((e) => e.chemin === '/article/le-plateau-se-reboise')!;
  assert.equal(entree.lastmod, '2026-03-10T12:00:00.000Z');
});

test('le lastmod d un index suit le plus recent de ses articles, pas seulement l entite', () => {
  const entree = segments()
    .find((s) => s.nom === 'categories')!
    .entrees.find((e) => e.chemin === '/categorie/territoire')!;
  // L entite est datee du 2026-01-01 par la fabrique ; son article du 2026-03-10.
  assert.equal(entree.lastmod, '2026-03-10T12:00:00.000Z');
});

test('le lastmod d une page statique vient de la Configuration de SA locale', () => {
  const pages = segments().find((s) => s.nom === 'pages')!.entrees;
  assert.equal(pages.find((e) => e.chemin === '/a-propos')!.lastmod, '2026-02-01T00:00:00.000Z');
  assert.equal(pages.find((e) => e.chemin === '/en/a-propos')!.lastmod, '2026-02-02T00:00:00.000Z');
});

// --- serialisation XML -------------------------------------------------------------

test('xmlUrlset produit un urlset valide, avec le namespace xhtml des alternates', () => {
  const xml = xmlUrlset(segments().find((s) => s.nom === 'articles')!.entrees, ORIGINE);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /<loc>https:\/\/echo\.test\/article\/le-plateau-se-reboise<\/loc>/);
  assert.match(xml, /<lastmod>2026-03-10T12:00:00\.000Z<\/lastmod>/);
  assert.match(
    xml,
    /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/echo\.test\/en\/article\/the-plateau-regrows" \/>/,
  );
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});

test('xmlUrlset absolutise TOUTES les URL, y compris la racine', () => {
  const xml = xmlUrlset([{ chemin: '/', lastmod: null, alternates: [] }], ORIGINE);
  assert.match(xml, /<loc>https:\/\/echo\.test\/<\/loc>/);
  assert.ok(!xml.includes('<lastmod>'), 'aucun lastmod invente quand la source n en a pas');
});

test('les caracteres reserves XML sont echappes dans les URL', () => {
  const xml = xmlUrlset([{ chemin: '/tag/a&b', lastmod: null, alternates: [] }], ORIGINE);
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), `entite non echappee : ${xml}`);
});

test('xmlSitemapIndex ne liste que les segments reellement emis', () => {
  const xml = xmlSitemapIndex(segments(), ORIGINE);
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(xml, /<loc>https:\/\/echo\.test\/sitemap-articles\.xml<\/loc>/);
  assert.equal((xml.match(/<sitemap>/g) ?? []).length, segments().length);
  assert.ok(!xml.includes('sitemap-index.xml'), "l index ne se reference pas lui-meme");
});

test('le lastmod d un segment de l index est le plus recent de ses entrees', () => {
  const xml = xmlSitemapIndex(segments(), ORIGINE);
  const bloc = xml.slice(xml.indexOf('sitemap-articles.xml'));
  assert.match(bloc.slice(0, 200), /<lastmod>2026-03-11T12:00:00\.000Z<\/lastmod>/);
});
