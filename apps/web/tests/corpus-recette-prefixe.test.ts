/**
 * LA PAGINATION SOUS PREFIXE DE LANGUE EST-ELLE ENCORE EXERCEE ?
 *
 * LE DEFAUT MESURE LE 2026-08-10 (releve pendant la tache 9bb9b707, corrige le
 * 2026-08-14 par f1f1f7ac). Les bornes de pagination — lien precedent et suivant,
 * absence de `/page/1`, comportement en derniere page — n etaient exercees QUE sur des
 * adresses SANS prefixe. Les adresses paginees anglaises ne figuraient que dans
 * `ROUTES_ATTENDUES.interdites` : verifiees ABSENTES, jamais correctes.
 *
 * La cause etait structurelle et non un oubli : le corpus anglais comptait deux
 * articles, trop peu pour paginer. Une erreur dans la composition d une adresse
 * prefixee serait donc restee invisible hors ligne jusqu au jour ou le corpus anglais
 * grossit — c est-a-dire quand plus personne n y pense.
 *
 * CE QUE CE FICHIER TIENT, et que la preuve construite ne peut pas tenir seule : la
 * preuve, elle, juge une SORTIE. Si le banc cessait un jour de porter de quoi paginer en
 * anglais, cette sortie n aurait plus de page 2 anglaise a juger — et la preuve
 * redeviendrait verte en n ayant plus rien vu, exactement comme avant le 2026-08-14. Ce
 * qui est garde ici est donc la CONDITION de la preuve, pas son verdict :
 *
 *   1. le corpus porte de quoi paginer sous `/en/` ;
 *   2. le nombre de traductions ne suit PAS le nombre d articles anglais ;
 *   3. l attendu ecrit a la main reclame bien une route paginee sous prefixe.
 *
 * Le point 2 n est pas theorique : la boucle d appariement allait jusqu a
 * `articles.en.length`. Porter `section-twelve` a 13 articles anglais aurait apparie les
 * quinze premiers articles francais, et `fr-treize-5` — celui dont une borne dit qu il
 * n est PAS traduit — serait devenu traduit en silence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ROUTES_ATTENDUES, corpusRecette } from '../scripts/corpus-recette.mjs';

const corpus = corpusRecette();

/** Les articles d une locale rattaches au slug de categorie donne. */
function articlesDeCategorie(locale: 'fr' | 'en', slugCategorie: string) {
  return corpus.articles[locale].filter((article) => article.categorie.slug === slugCategorie);
}

/** §4.2 — « 12 par page ». Recopier le nombre ici en ferait une seconde source. */
const PAR_PAGE = 12;

// ── 1. Le corpus porte de quoi paginer SOUS PREFIXE ───────────────────────────────────

test('une categorie anglaise depasse la taille d une page — sans quoi rien n est paginable sous /en/', () => {
  const anglais = articlesDeCategorie('en', 'section-twelve');
  assert.ok(
    anglais.length > PAR_PAGE,
    `section-twelve porte ${anglais.length} article(s) anglais : il en faut plus de ${PAR_PAGE} ` +
      'pour qu une page 2 existe sous prefixe. En dessous, la preuve construite redevient verte ' +
      'en n ayant plus aucune adresse prefixee a juger.',
  );
});

test('la page 2 anglaise ne porte qu un article — la borne du reste, sous prefixe', () => {
  const anglais = articlesDeCategorie('en', 'section-twelve');
  assert.equal(anglais.length % PAR_PAGE, 1, `${anglais.length} articles : le reste doit valoir 1`);
});

test('sa contrepartie francaise tient sur UNE page — c est le miroir du repli T-05', () => {
  const francais = articlesDeCategorie('fr', 'rubrique-douze');
  assert.ok(
    francais.length <= PAR_PAGE,
    `rubrique-douze porte ${francais.length} article(s) : au-dela de ${PAR_PAGE} elle aurait ` +
      'sa propre page 2, et la page 2 anglaise ne replierait plus sur la derniere page francaise.',
  );
});

// ── 2. Le nombre de traductions ne suit PAS le nombre d articles anglais ──────────────

test('exactement deux articles anglais sont apparies a leur equivalent francais', () => {
  const apparies = corpus.articles.en.filter((article) => article.localizations.length > 0);
  assert.equal(
    apparies.length,
    2,
    'les traductions doivent rester au nombre ecrit, quel que soit le nombre d articles anglais',
  );
});

test('l article temoin NON traduit le reste — la borne que l etoffement aurait effacee', () => {
  const temoin = corpus.articles.fr.find((article) => article.slug === 'fr-treize-5');
  assert.ok(temoin !== undefined, 'fr-treize-5 doit exister : une borne de la bascule le vise');
  assert.deepEqual(
    temoin.localizations,
    [],
    'fr-treize-5 traduit ferait rougir « article non traduit : la bascule remonte sur la rubrique anglaise »',
  );
});

test('l article temoin TRADUIT le reste, des deux cotes', () => {
  const francais = corpus.articles.fr.find((article) => article.slug === 'fr-treize-1');
  const anglais = corpus.articles.en.find((article) => article.slug === 'en-treize-1');
  assert.ok(francais !== undefined && anglais !== undefined);
  assert.equal(francais.documentId, anglais.documentId, 'les documentId se rejoignent, comme en Strapi 5');
  assert.deepEqual(
    francais.localizations.map((entree) => entree.locale),
    ['en'],
  );
  assert.deepEqual(
    anglais.localizations.map((entree) => entree.locale),
    ['fr'],
  );
});

// ── 3. L attendu ecrit a la main reclame une route paginee sous prefixe ───────────────

test('au moins une route paginee SOUS PREFIXE est attendue EMISE, pas seulement interdite', () => {
  const prefixeesEmises = ROUTES_ATTENDUES.emises.filter((route) => /^\/en\/.*\/page\/\d+$/.test(route));
  assert.ok(
    prefixeesEmises.length > 0,
    'aucune adresse paginee sous /en/ n est attendue emise : on retomberait dans le defaut du ' +
      '2026-08-10, ou elles n etaient verifiees qu ABSENTES',
  );
});

test('les deux familles paginees sont exercees sous prefixe, pas seulement la categorie', () => {
  const familles = new Set(
    ROUTES_ATTENDUES.emises
      .filter((route) => /^\/en\/.*\/page\/\d+$/.test(route))
      .map((route) => route.split('/')[2]),
  );
  assert.deepEqual([...familles].sort(), ['categorie', 'tag']);
});

test('aucune route attendue emise ne s ecrit /page/1, sous prefixe comme sans', () => {
  const fautives = ROUTES_ATTENDUES.emises.filter((route) => route.endsWith('/page/1'));
  assert.deepEqual(fautives, [], 'la page 1 n a jamais d adresse numerotee');
});

test('la borne du dela reste interdite sous prefixe — une page de plus que la derniere', () => {
  for (const route of ['/en/categorie/section-twelve/page/3', '/en/tag/wide-tag/page/3']) {
    assert.ok(
      ROUTES_ATTENDUES.interdites.includes(route),
      `${route} doit rester interdite : sans elle, rien ne dit que la derniere page est la derniere`,
    );
  }
});

test('emises et interdites ne se contredisent jamais', () => {
  const emises = new Set(ROUTES_ATTENDUES.emises);
  const contradictions = ROUTES_ATTENDUES.interdites.filter((route) => emises.has(route));
  assert.deepEqual(contradictions, [], 'une route attendue a la fois emise et interdite rend le verdict indecidable');
});
