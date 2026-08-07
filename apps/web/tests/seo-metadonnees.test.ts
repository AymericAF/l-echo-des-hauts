/**
 * Les valeurs SEO sont CALCULEES AU BUILD, jamais stockees (A-07).
 *
 * Le point de vigilance de la tache le dit : stockees, elles se figent au premier
 * enregistrement, et la surcharge par le component `partage.seo` devient un piege — on
 * ne sait plus si ce qu on lit en base est un choix editorial ou un defaut fossilise.
 * Ce harnais exerce donc la chaine de repli dans les deux sens : ce que la surcharge
 * remplace, et ce que le build recalcule quand elle est vide.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Seo } from '../src/lib/domaine.ts';
import {
  DIMENSION_OG,
  LONGUEUR_DESCRIPTION,
  LONGUEUR_TITRE,
  metadonneesSeo,
  type ContexteSeo,
} from '../src/lib/seo/metadonnees.ts';

const ORIGINE = 'https://echo.test';

function contexte(surcharge: Partial<ContexteSeo> = {}): ContexteSeo {
  return {
    locale: 'fr',
    titre: 'Le plateau se reboise',
    description: 'Trente ans de deprise agricole ont referme les pentes du plateau.',
    nomSite: 'L Echo des Hauts',
    descriptionDefaut: 'Magazine editorial du plateau des Hauts.',
    seo: null,
    origine: ORIGINE,
    chemin: '/article/le-plateau-se-reboise',
    contrepartie: null,
    imagePartage: null,
    article: null,
    noindex: false,
    ...surcharge,
  };
}

function valeurOg(meta: ReturnType<typeof metadonneesSeo>, property: string): string | undefined {
  return meta.og.find((balise) => balise.property === property)?.content;
}

function valeurTwitter(meta: ReturnType<typeof metadonneesSeo>, name: string): string | undefined {
  return meta.twitter.find((balise) => balise.name === name)?.content;
}

// --- canonique ------------------------------------------------------------------

test('la canonique est systematique et absolue, meme sur l accueil', () => {
  assert.equal(metadonneesSeo(contexte({ chemin: '/' })).canonique, 'https://echo.test/');
  assert.equal(
    metadonneesSeo(contexte({ chemin: '/en/categorie/territory' })).canonique,
    'https://echo.test/en/categorie/territory',
  );
});

test('une canonique surchargee remplace la calculee et ANNULE les alternates (A-27)', () => {
  const seo: Seo = {
    metaTitre: null,
    metaDescription: null,
    imagePartage: null,
    noindex: false,
    canonique: 'https://ailleurs.test/reprise',
  };
  const meta = metadonneesSeo(
    contexte({ seo, contrepartie: { chemin: '/en/article/x', locale: 'en', exact: true } }),
  );
  assert.equal(meta.canonique, 'https://ailleurs.test/reprise');
  assert.equal(meta.canoniqueSurchargee, true);
  assert.deepEqual(meta.alternates, []);
  assert.equal(meta.avertissements.length, 1);
  assert.match(meta.avertissements[0], /hreflang/);
});

test('une canonique surchargee IDENTIQUE a la calculee ne casse rien et n avertit pas', () => {
  const seo: Seo = {
    metaTitre: null,
    metaDescription: null,
    imagePartage: null,
    noindex: false,
    canonique: 'https://echo.test/article/le-plateau-se-reboise',
  };
  const meta = metadonneesSeo(
    contexte({ seo, contrepartie: { chemin: '/en/article/x', locale: 'en', exact: true } }),
  );
  assert.equal(meta.canoniqueSurchargee, false);
  assert.deepEqual(meta.avertissements, []);
  assert.equal(meta.alternates.length, 3);
});

// --- hreflang -------------------------------------------------------------------

test('les alternates ne sortent QUE sur une contrepartie exacte (T-06)', () => {
  const approximative = metadonneesSeo(
    contexte({ contrepartie: { chemin: '/en/categorie/territory', locale: 'en', exact: false } }),
  );
  assert.deepEqual(approximative.alternates, []);

  const exacte = metadonneesSeo(
    contexte({ contrepartie: { chemin: '/en/article/the-plateau', locale: 'en', exact: true } }),
  );
  assert.deepEqual(exacte.alternates, [
    { hreflang: 'fr', href: 'https://echo.test/article/le-plateau-se-reboise' },
    { hreflang: 'en', href: 'https://echo.test/en/article/the-plateau' },
    { hreflang: 'x-default', href: 'https://echo.test/article/le-plateau-se-reboise' },
  ]);
});

test('x-default pointe toujours le francais, meme lu depuis la page anglaise', () => {
  const meta = metadonneesSeo(
    contexte({
      locale: 'en',
      chemin: '/en/article/the-plateau',
      contrepartie: { chemin: '/article/le-plateau-se-reboise', locale: 'fr', exact: true },
    }),
  );
  assert.equal(
    meta.alternates.find((a) => a.hreflang === 'x-default')?.href,
    'https://echo.test/article/le-plateau-se-reboise',
  );
});

test('les alternates sont reciproques : la paire fr/en est la meme vue des deux cotes', () => {
  const cotéFr = metadonneesSeo(
    contexte({ contrepartie: { chemin: '/en/article/the-plateau', locale: 'en', exact: true } }),
  );
  const cotéEn = metadonneesSeo(
    contexte({
      locale: 'en',
      chemin: '/en/article/the-plateau',
      contrepartie: { chemin: '/article/le-plateau-se-reboise', locale: 'fr', exact: true },
    }),
  );
  const paire = (m: typeof cotéFr) =>
    m.alternates.filter((a) => a.hreflang !== 'x-default').map((a) => `${a.hreflang} ${a.href}`).sort();
  assert.deepEqual(paire(cotéFr), paire(cotéEn));
});

// --- titre et description : calcules au build ------------------------------------

test('le titre est tronque a 60 puis suffixe du nom du site', () => {
  const long = 'Ce titre depasse tres largement la limite de soixante caracteres imposee a la balise';
  const meta = metadonneesSeo(contexte({ titre: long }));
  assert.ok(meta.titre.endsWith(' — L Echo des Hauts'));
  const avantSuffixe = meta.titre.slice(0, -' — L Echo des Hauts'.length);
  assert.ok(avantSuffixe.length <= LONGUEUR_TITRE, `titre trop long : ${avantSuffixe.length}`);
  assert.ok(avantSuffixe.endsWith('…'));
});

test('metaTitre surcharge le titre, et reste tronque a la meme limite', () => {
  const seo: Seo = {
    metaTitre: 'Titre choisi par la redaction',
    metaDescription: null,
    imagePartage: null,
    noindex: false,
    canonique: null,
  };
  assert.equal(metadonneesSeo(contexte({ seo })).titre, 'Titre choisi par la redaction — L Echo des Hauts');
});

test('la description se replie sur celle du site quand la page n en a pas', () => {
  assert.equal(
    metadonneesSeo(contexte({ description: null })).description,
    'Magazine editorial du plateau des Hauts.',
  );
});

test('la description est tronquee a 160, surcharge comprise', () => {
  const long = 'a'.repeat(400);
  assert.ok((metadonneesSeo(contexte({ description: long })).description ?? '').length <= LONGUEUR_DESCRIPTION);
  const seo: Seo = {
    metaTitre: null,
    metaDescription: long,
    imagePartage: null,
    noindex: false,
    canonique: null,
  };
  assert.ok((metadonneesSeo(contexte({ seo })).description ?? '').length <= LONGUEUR_DESCRIPTION);
});

test('sans nom de site ni description de repli, rien n est invente', () => {
  const meta = metadonneesSeo(contexte({ nomSite: null, description: null, descriptionDefaut: null }));
  assert.equal(meta.titre, 'Le plateau se reboise');
  assert.equal(meta.description, null);
  assert.equal(valeurOg(meta, 'og:description'), undefined);
  assert.equal(valeurOg(meta, 'og:site_name'), undefined);
});

// --- Open Graph -----------------------------------------------------------------

test('og:url vaut la canonique, jamais un chemin relatif', () => {
  const meta = metadonneesSeo(contexte());
  assert.equal(valeurOg(meta, 'og:url'), meta.canonique);
});

test('og:type bascule sur article quand la page en est un', () => {
  assert.equal(valeurOg(metadonneesSeo(contexte()), 'og:type'), 'website');
  const meta = metadonneesSeo(
    contexte({
      article: {
        datePublication: '2026-03-04T08:00:00.000Z',
        dateModification: '2026-05-06T09:30:00.000Z',
        auteur: 'Noelle Vasseur',
        rubrique: 'Territoire',
        etiquettes: ['Forets', 'Climat'],
      },
    }),
  );
  assert.equal(valeurOg(meta, 'og:type'), 'article');
  assert.equal(valeurOg(meta, 'article:published_time'), '2026-03-04T08:00:00.000Z');
  assert.equal(valeurOg(meta, 'article:modified_time'), '2026-05-06T09:30:00.000Z');
  assert.equal(valeurOg(meta, 'article:author'), 'Noelle Vasseur');
  assert.equal(valeurOg(meta, 'article:section'), 'Territoire');
  assert.deepEqual(
    meta.og.filter((b) => b.property === 'article:tag').map((b) => b.content),
    ['Forets', 'Climat'],
  );
});

test('og:locale suit la page, og:locale:alternate ne sort qu avec un alternate reel', () => {
  assert.equal(valeurOg(metadonneesSeo(contexte()), 'og:locale'), 'fr_FR');
  assert.equal(valeurOg(metadonneesSeo(contexte()), 'og:locale:alternate'), undefined);
  const meta = metadonneesSeo(
    contexte({ contrepartie: { chemin: '/en/article/x', locale: 'en', exact: true } }),
  );
  assert.equal(valeurOg(meta, 'og:locale:alternate'), 'en_GB');
});

test("l image de partage sort absolue, avec ses dimensions et son texte de remplacement", () => {
  const meta = metadonneesSeo(
    contexte({
      imagePartage: {
        url: '/og/fr/le-plateau-se-reboise.png',
        largeur: DIMENSION_OG.largeur,
        hauteur: DIMENSION_OG.hauteur,
        alternative: 'Le plateau se reboise — Territoire',
        mime: 'image/png',
      },
    }),
  );
  assert.equal(valeurOg(meta, 'og:image'), 'https://echo.test/og/fr/le-plateau-se-reboise.png');
  assert.equal(valeurOg(meta, 'og:image:width'), '1200');
  assert.equal(valeurOg(meta, 'og:image:height'), '630');
  assert.equal(valeurOg(meta, 'og:image:type'), 'image/png');
  assert.equal(valeurOg(meta, 'og:image:alt'), 'Le plateau se reboise — Territoire');
});

test('une image de partage deja absolue (mediatheque Strapi) n est pas re-prefixee', () => {
  const meta = metadonneesSeo(
    contexte({
      imagePartage: {
        url: 'https://echoback.test/uploads/partage.svg',
        largeur: null,
        hauteur: null,
        alternative: null,
        mime: 'image/svg+xml',
      },
    }),
  );
  assert.equal(valeurOg(meta, 'og:image'), 'https://echoback.test/uploads/partage.svg');
  assert.equal(valeurOg(meta, 'og:image:width'), undefined);
  assert.equal(valeurOg(meta, 'og:image:height'), undefined);
});

// --- Twitter Card ---------------------------------------------------------------

test('la Twitter Card est complete et dit summary_large_image quand une image existe', () => {
  const meta = metadonneesSeo(
    contexte({
      imagePartage: {
        url: '/og/fr/x.png',
        largeur: 1200,
        hauteur: 630,
        alternative: 'Alt',
        mime: 'image/png',
      },
    }),
  );
  assert.equal(valeurTwitter(meta, 'twitter:card'), 'summary_large_image');
  assert.equal(valeurTwitter(meta, 'twitter:title'), meta.titre);
  assert.equal(valeurTwitter(meta, 'twitter:description'), meta.description ?? undefined);
  assert.equal(valeurTwitter(meta, 'twitter:image'), 'https://echo.test/og/fr/x.png');
  assert.equal(valeurTwitter(meta, 'twitter:image:alt'), 'Alt');
});

test('sans image, la carte retombe sur summary et n annonce aucune image', () => {
  const meta = metadonneesSeo(contexte({ imagePartage: null }));
  assert.equal(valeurTwitter(meta, 'twitter:card'), 'summary');
  assert.equal(valeurTwitter(meta, 'twitter:image'), undefined);
});

// --- noindex --------------------------------------------------------------------

test('noindex se repercute tel quel, sans reinterpretation', () => {
  assert.equal(metadonneesSeo(contexte({ noindex: true })).noindex, true);
  assert.equal(metadonneesSeo(contexte({ noindex: false })).noindex, false);
});

// --- non-regression de forme ----------------------------------------------------

test('aucune valeur de balise ne fuit une chaine vide', () => {
  const meta = metadonneesSeo(contexte({ description: '   ', nomSite: '  ' }));
  for (const balise of [...meta.og, ...meta.twitter]) {
    assert.notEqual(balise.content.trim(), '', `balise vide : ${JSON.stringify(balise)}`);
  }
});
