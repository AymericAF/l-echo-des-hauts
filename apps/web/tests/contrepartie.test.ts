/**
 * Bascule FR/EN — arbitrage 2 (T-04, T-05, T-06).
 *
 * Ce que ce fichier exerce, et que rien d autre ne peut exercer :
 *
 *   - T-04 : l URL de contrepartie n est JAMAIS fabriquee par prefixage. Elle sort du
 *     registre des routes reellement emises. Un test qui se contenterait de comparer
 *     `/en` + chemin FR passerait au vert sur un site entierement casse.
 *   - T-06 : le lien de bascule est TOUJOURS rendu — il remonte d un cran quand la
 *     contrepartie exacte n existe pas. Le `hreflang`, lui, n est emis QUE si elle
 *     existe. Ce sont deux listes differentes, et les confondre est une erreur SEO
 *     franche.
 *   - T-05, piege 2 : la pagination n a pas la meme profondeur dans les deux langues ;
 *     `/categorie/x/page/3` replie sur la DERNIERE page existante de la contrepartie.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  auteur,
  categorie,
  localisation,
  referenceAuteur,
  referenceCategorie,
  referenceTag,
  serieArticles,
  tag,
} from './aides/corpus-factice.ts';
import { construireRegistre, type CorpusRoutes } from '../src/lib/routes/registre.ts';
import { contrepartie } from '../src/lib/routes/contrepartie.ts';

const catFr = categorie('cat-1', 'fr', 'Territoire', 'territoire', [
  localisation('cat-1', 'en', 'territory'),
]);
const catEn = categorie('cat-1', 'en', 'Territory', 'territory', [
  localisation('cat-1', 'fr', 'territoire'),
]);
const catSeule = categorie('cat-2', 'fr', 'Vies d ici', 'vies-d-ici', []);

const tagFr = tag('tag-1', 'fr', 'Eau', 'eau', [localisation('tag-1', 'en', 'water')]);
const tagEn = tag('tag-1', 'en', 'Water', 'water', [localisation('tag-1', 'fr', 'eau')]);

const autFr = auteur('aut-1', 'fr', 'Hakim Zerrouki', 'hakim-zerrouki', [
  localisation('aut-1', 'en', 'hakim-zerrouki'),
]);
const autEn = auteur('aut-1', 'en', 'Hakim Zerrouki', 'hakim-zerrouki', [
  localisation('aut-1', 'fr', 'hakim-zerrouki'),
]);

/** 30 articles FR dans `territoire` : 3 pages FR. */
const articlesFr = serieArticles(30, {
  prefixe: 'fr-t',
  locale: 'fr',
  categorie: referenceCategorie(catFr),
  auteur: referenceAuteur(autFr),
  tags: [referenceTag(tagFr)],
});

/** 2 articles EN dans `territory` : 1 seule page EN — la profondeur differe (T-05, piege 2). */
const articlesEn = serieArticles(2, {
  prefixe: 'en-t',
  locale: 'en',
  categorie: referenceCategorie(catEn),
  auteur: referenceAuteur(autEn),
  tags: [referenceTag(tagEn)],
});

/** 3 articles FR dans une categorie sans contrepartie anglaise du tout. */
const articlesSeuls = serieArticles(3, {
  prefixe: 'fr-v',
  locale: 'fr',
  categorie: referenceCategorie(catSeule),
  auteur: referenceAuteur(autFr),
});

/** Le premier article FR est traduit ; les autres ne le sont pas. */
const articleTraduit = {
  ...articlesFr[0],
  localisations: [localisation(articlesFr[0].documentId, 'en', 'en-t-1')],
};
const articleTraduitEn = {
  ...articlesEn[0],
  documentId: articlesFr[0].documentId,
  localisations: [localisation(articlesFr[0].documentId, 'fr', articlesFr[0].slug)],
};

const corpus: CorpusRoutes = {
  articles: [
    articleTraduit,
    ...articlesFr.slice(1),
    ...articlesSeuls,
    articleTraduitEn,
    ...articlesEn.slice(1),
  ],
  categories: [catFr, catEn, catSeule],
  tags: [tagFr, tagEn],
  auteurs: [autFr, autEn],
  dossiers: [],
};

const registre = construireRegistre(corpus);

// --- accueil et pages statiques : contrepartie derivable ------------------------

test('l accueil bascule vers l accueil de l autre locale', () => {
  assert.deepEqual(contrepartie(registre, { genre: 'accueil', locale: 'fr' }), {
    chemin: '/en',
    locale: 'en',
    exact: true,
  });
  assert.deepEqual(contrepartie(registre, { genre: 'accueil', locale: 'en' }), {
    chemin: '/',
    locale: 'fr',
    exact: true,
  });
});

test('a-propos et mentions-legales ont une contrepartie exacte', () => {
  assert.deepEqual(contrepartie(registre, { genre: 'statique', locale: 'fr', nom: 'a-propos' }), {
    chemin: '/en/a-propos',
    locale: 'en',
    exact: true,
  });
  assert.deepEqual(
    contrepartie(registre, { genre: 'statique', locale: 'en', nom: 'mentions-legales' }),
    { chemin: '/mentions-legales', locale: 'fr', exact: true },
  );
});

test('la 404 ne sait pas quelle URL a ete demandee : sa bascule pointe l accueil (T-05, piege 3)', () => {
  const resultat = contrepartie(registre, { genre: 'statique', locale: 'fr', nom: '404' });
  assert.equal(resultat.chemin, '/en');
  assert.equal(resultat.exact, false, 'une 404 n a pas de contrepartie exacte : aucun hreflang');
});

// --- article : le coeur du critere « FINI QUAND » -------------------------------

test('un article TRADUIT atterrit sur sa traduction, avec le slug ANGLAIS', () => {
  const resultat = contrepartie(registre, {
    genre: 'article',
    locale: 'fr',
    article: articleTraduit,
  });
  assert.equal(resultat.chemin, '/en/article/en-t-1');
  assert.equal(resultat.exact, true);
  assert.ok(registre.contient(resultat.chemin), 'la cible doit etre une route reellement emise');
});

test('la bascule inverse depuis la traduction revient sur l article francais', () => {
  const resultat = contrepartie(registre, {
    genre: 'article',
    locale: 'en',
    article: articleTraduitEn,
  });
  assert.equal(resultat.chemin, `/article/${articlesFr[0].slug}`);
  assert.equal(resultat.exact, true);
});

test('un article NON traduit remonte d un cran : la page anglaise de sa rubrique', () => {
  const resultat = contrepartie(registre, {
    genre: 'article',
    locale: 'fr',
    article: articlesFr[5],
  });
  assert.equal(resultat.chemin, '/en/categorie/territory');
  assert.equal(resultat.exact, false, 'pas de contrepartie exacte : aucun hreflang');
  assert.ok(registre.contient(resultat.chemin));
});

test('un article non traduit dont la rubrique n existe pas en anglais tombe sur /en', () => {
  const resultat = contrepartie(registre, {
    genre: 'article',
    locale: 'fr',
    article: articlesSeuls[0],
  });
  assert.equal(resultat.chemin, '/en');
  assert.equal(resultat.exact, false);
});

test('une localisation declaree mais dont la route n est pas emise ne fait PAS un lien mort', () => {
  const menteur = {
    ...articlesFr[7],
    localisations: [localisation(articlesFr[7].documentId, 'en', 'slug-qui-n-existe-pas')],
  };
  const resultat = contrepartie(registre, { genre: 'article', locale: 'fr', article: menteur });
  assert.ok(registre.contient(resultat.chemin), 'la cible sort du registre, jamais d une chaine');
  assert.equal(resultat.chemin, '/en/categorie/territory');
  assert.equal(resultat.exact, false);
});

// --- index : profondeur de pagination differente (T-05, piege 2) ----------------

test('la page 1 d une categorie bascule sur la page 1 de sa contrepartie', () => {
  const resultat = contrepartie(registre, {
    genre: 'index',
    locale: 'fr',
    famille: 'categorie',
    documentId: 'cat-1',
    numero: 1,
  });
  assert.equal(resultat.chemin, '/en/categorie/territory');
  assert.equal(resultat.exact, true);
});

test('une page 3 francaise, quand l anglais n en a qu une, replie sur la DERNIERE existante', () => {
  assert.ok(registre.contient('/categorie/territoire/page/3'));
  assert.ok(!registre.contient('/en/categorie/territory/page/3'));

  const resultat = contrepartie(registre, {
    genre: 'index',
    locale: 'fr',
    famille: 'categorie',
    documentId: 'cat-1',
    numero: 3,
  });
  assert.equal(resultat.chemin, '/en/categorie/territory');
  assert.equal(resultat.exact, false, 'ce n est pas la meme page : aucun hreflang');
});

test('une categorie sans contrepartie emise bascule sur l accueil anglais', () => {
  const resultat = contrepartie(registre, {
    genre: 'index',
    locale: 'fr',
    famille: 'categorie',
    documentId: 'cat-2',
    numero: 1,
  });
  assert.equal(resultat.chemin, '/en');
  assert.equal(resultat.exact, false);
});

test('un tag et un auteur suivent la meme regle que la categorie', () => {
  assert.equal(
    contrepartie(registre, { genre: 'index', locale: 'fr', famille: 'tag', documentId: 'tag-1', numero: 1 })
      .chemin,
    '/en/tag/water',
  );
  assert.equal(
    contrepartie(registre, {
      genre: 'index',
      locale: 'fr',
      famille: 'auteur',
      documentId: 'aut-1',
      numero: 1,
    }).chemin,
    '/en/auteur/hakim-zerrouki',
  );
});

// --- garantie par mecanisme ------------------------------------------------------

test('AUCUNE contrepartie ne sort du registre — sur toutes les routes du corpus', () => {
  const descripteurs = [
    { genre: 'accueil', locale: 'fr' },
    { genre: 'accueil', locale: 'en' },
    ...(['a-propos', 'mentions-legales', '404'] as const).flatMap((nom) => [
      { genre: 'statique', locale: 'fr', nom },
      { genre: 'statique', locale: 'en', nom },
    ]),
    ...corpus.articles.map((a) => ({ genre: 'article', locale: a.locale, article: a })),
    ...registre.indexes.flatMap((index) =>
      index.pages.map((page) => ({
        genre: 'index',
        locale: index.locale,
        famille: index.famille,
        documentId: index.documentId,
        numero: page.numero,
      })),
    ),
  ];

  assert.ok(descripteurs.length > 40, 'le corpus de test doit couvrir un vrai volume de routes');
  for (const descripteur of descripteurs) {
    const resultat = contrepartie(registre, descripteur as never);
    assert.ok(
      registre.contient(resultat.chemin),
      `${JSON.stringify(descripteur)} → ${resultat.chemin} n est pas une route emise`,
    );
  }
});

test('un registre sans accueil de l autre locale echoue bruyamment plutot que de rendre un lien mort', () => {
  const ampute = {
    ...registre,
    chemins: new Set([...registre.chemins].filter((c) => c !== '/en')),
    contient: (chemin: string) => chemin !== '/en' && registre.contient(chemin),
  };
  assert.throws(
    () => contrepartie(ampute as never, { genre: 'statique', locale: 'fr', nom: '404' }),
    /registre/i,
  );
});

test('exact implique que la cible est bien la contrepartie, jamais un repli', () => {
  const resultat = contrepartie(registre, {
    genre: 'article',
    locale: 'fr',
    article: articlesFr[9],
  });
  assert.equal(resultat.exact, false);
  assert.notEqual(resultat.chemin, '/en/article/' + articlesFr[9].slug);
});
