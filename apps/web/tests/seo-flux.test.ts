/**
 * Le flux RSS (§2.1, route `/rss.xml` du §4.2) et le `robots.txt` genere (§5.2).
 *
 * Les deux se calculent sur le REGISTRE, comme le sitemap et la bascule FR/EN. Le flux
 * a en plus une contrainte que le sitemap n a pas : il doit rester un XML VALIDE quoi
 * qu ecrive la redaction. Un flux mal forme est rejete en bloc par les agregateurs —
 * pas entree par entree — et un flux rejete ressemble beaucoup a un flux absent.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Seo } from '../src/lib/domaine.ts';
import { construireRegistre } from '../src/lib/routes/registre.ts';
import { CHEMIN_FLUX, dateRfc822, entreesFlux, xmlRss } from '../src/lib/seo/flux.ts';
import { robotsTxt } from '../src/lib/seo/robots.ts';
import { CHEMIN_SITEMAP_INDEX } from '../src/lib/seo/sitemap.ts';
import {
  article,
  auteur,
  categorie,
  localisation,
  referenceAuteur,
  referenceCategorie,
} from './aides/corpus-factice.ts';

const ORIGINE = 'https://echo.test';

const SEO_NOINDEX: Seo = {
  metaTitre: null,
  metaDescription: null,
  imagePartage: null,
  noindex: true,
  canonique: null,
};

function corpus(surcharges: Partial<Record<'premier' | 'second', Partial<{ seo: Seo | null; titre: string; chapo: string }>>> = {}) {
  const catFr = categorie('cat-1', 'fr', 'Territoire', 'territoire', [localisation('cat-1', 'en', 'territory')]);
  const catEn = categorie('cat-1', 'en', 'Territory', 'territory', [localisation('cat-1', 'fr', 'territoire')]);
  const autFr = auteur('aut-1', 'fr', 'Noelle Vasseur', 'noelle-vasseur');
  const autEn = auteur('aut-1', 'en', 'Noelle Vasseur', 'noelle-vasseur');

  const premier = {
    ...article({
      documentId: 'art-1',
      locale: 'fr',
      titre: 'Le plateau se reboise',
      slug: 'le-plateau-se-reboise',
      categorie: referenceCategorie(catFr),
      auteur: referenceAuteur(autFr),
      datePublication: '2026-03-10T08:00:00.000Z',
    }),
    ...surcharges.premier,
  };
  const second = {
    ...article({
      documentId: 'art-2',
      locale: 'fr',
      titre: 'Sous la filature',
      slug: 'sous-la-filature',
      categorie: referenceCategorie(catFr),
      auteur: referenceAuteur(autFr),
      datePublication: '2026-05-20T08:00:00.000Z',
    }),
    ...surcharges.second,
  };
  const anglais = article({
    documentId: 'art-3',
    locale: 'en',
    titre: 'Under the mill',
    slug: 'under-the-mill',
    categorie: referenceCategorie(catEn),
    auteur: referenceAuteur(autEn),
    datePublication: '2026-04-01T08:00:00.000Z',
  });

  return {
    articles: [premier, second, anglais],
    categories: [catFr, catEn],
    tags: [],
    auteurs: [autFr, autEn],
    dossiers: [],
  };
}

// --- RFC 822 --------------------------------------------------------------------

test('les dates du flux sont en RFC 822, pas en ISO', () => {
  assert.equal(dateRfc822('2026-03-10T08:00:00.000Z'), 'Tue, 10 Mar 2026 08:00:00 GMT');
});

test('une date illisible ne casse pas le flux : elle est simplement absente', () => {
  assert.equal(dateRfc822('pas une date'), null);
  assert.equal(dateRfc822(''), null);
});

// --- entrees --------------------------------------------------------------------

test('le flux d une locale ne porte QUE ses articles, du plus recent au plus ancien', () => {
  const registre = construireRegistre(corpus());
  assert.deepEqual(
    entreesFlux(registre, 'fr').map((e) => e.chemin),
    ['/article/sous-la-filature', '/article/le-plateau-se-reboise'],
  );
  assert.deepEqual(entreesFlux(registre, 'en').map((e) => e.chemin), ['/en/article/under-the-mill']);
});

test('un article noindex sort du flux comme il sort du sitemap', () => {
  const registre = construireRegistre(corpus({ premier: { seo: SEO_NOINDEX } }));
  assert.deepEqual(entreesFlux(registre, 'fr').map((e) => e.chemin), ['/article/sous-la-filature']);
});

test('chaque entree du flux designe une route que le registre emet', () => {
  const registre = construireRegistre(corpus());
  for (const locale of ['fr', 'en'] as const) {
    for (const entree of entreesFlux(registre, locale)) {
      assert.ok(registre.contient(entree.chemin), `hors registre : ${entree.chemin}`);
    }
  }
});

// --- serialisation ----------------------------------------------------------------

function flux(locale: 'fr' | 'en' = 'fr', source = corpus()) {
  return xmlRss({
    locale,
    origine: ORIGINE,
    nomSite: "L'Echo des Hauts",
    description: 'Magazine editorial du plateau des Hauts.',
    entrees: entreesFlux(construireRegistre(source), locale),
    genereLe: '2026-06-01T00:00:00.000Z',
  });
}

test('le flux est un RSS 2.0 complet, avec son lien atom autoreferent', () => {
  const xml = flux();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom"/);
  assert.match(xml, /xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/"/);
  assert.match(xml, /<atom:link href="https:\/\/echo\.test\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(xml, /<link>https:\/\/echo\.test\/<\/link>/);
  assert.match(xml, /<language>fr<\/language>/);
  assert.match(xml, /<lastBuildDate>Mon, 01 Jun 2026 00:00:00 GMT<\/lastBuildDate>/);
});

test('le flux anglais pointe son propre chemin et son propre accueil', () => {
  const xml = flux('en');
  assert.match(xml, /<atom:link href="https:\/\/echo\.test\/en\/rss\.xml" rel="self"/);
  assert.match(xml, /<link>https:\/\/echo\.test\/en<\/link>/);
  assert.match(xml, /<language>en<\/language>/);
  assert.equal(CHEMIN_FLUX.en, '/en/rss.xml');
  assert.equal(CHEMIN_FLUX.fr, '/rss.xml');
});

test('chaque item porte titre, lien absolu, guid permalien, date, auteur et rubrique', () => {
  const xml = flux();
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.match(xml, /<title>Sous la filature<\/title>/);
  assert.match(xml, /<link>https:\/\/echo\.test\/article\/sous-la-filature<\/link>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/echo\.test\/article\/sous-la-filature<\/guid>/);
  assert.match(xml, /<pubDate>Wed, 20 May 2026 08:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<dc:creator>Noelle Vasseur<\/dc:creator>/);
  assert.match(xml, /<category>Territoire<\/category>/);
  assert.match(xml, /<description>Chapo de Sous la filature\.<\/description>/);
});

test('les items sortent dans l ordre antichronologique du registre', () => {
  const xml = flux();
  assert.ok(
    xml.indexOf('sous-la-filature') < xml.indexOf('le-plateau-se-reboise'),
    'le plus recent doit sortir en premier',
  );
});

test('un titre qui contient des caracteres reserves ne casse pas le flux', () => {
  const xml = flux('fr', corpus({ second: { titre: 'Eau & foret <ici>', chapo: "L'« amont » & l aval" } }));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), 'entite XML non echappee');
  assert.match(xml, /<title>Eau &amp; foret &lt;ici&gt;<\/title>/);
  assert.ok(!xml.includes('<ici>'), 'la balise du titre ne doit jamais atteindre le document');
});

test('un flux sans aucun article reste un document valide', () => {
  const vide = xmlRss({
    locale: 'fr',
    origine: ORIGINE,
    nomSite: 'X',
    description: 'Y',
    entrees: [],
    genereLe: '2026-06-01T00:00:00.000Z',
  });
  assert.match(vide, /<channel>[\s\S]*<\/channel>/);
  assert.ok(!vide.includes('<item>'));
});

// --- robots.txt --------------------------------------------------------------------

test('le robots.txt declare le sitemap index en URL absolue', () => {
  const texte = robotsTxt(ORIGINE);
  assert.match(texte, /^Sitemap: https:\/\/echo\.test\/sitemap-index\.xml$/m);
  assert.ok(texte.includes(CHEMIN_SITEMAP_INDEX.slice(1)));
});

test('le robots.txt autorise tout le site', () => {
  const texte = robotsTxt(ORIGINE);
  assert.match(texte, /^User-agent: \*$/m);
  assert.match(texte, /^Allow: \/$/m);
});

test("aucune page noindex n est Disallow — un crawler bloque ne LIT jamais le noindex", () => {
  const texte = robotsTxt(ORIGINE);
  assert.ok(!/^Disallow: \S/m.test(texte), `un Disallow sur une page noindex l empeche d etre desindexee :\n${texte}`);
});

test('le robots.txt finit par un saut de ligne et n a pas de ligne en double', () => {
  const texte = robotsTxt(ORIGINE);
  assert.ok(texte.endsWith('\n'));
  const directives = texte.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
  assert.equal(new Set(directives).size, directives.length);
});
