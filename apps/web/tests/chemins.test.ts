/**
 * Les chemins du §4.2 se fabriquent a UN seul endroit.
 *
 * Pourquoi ce test existe : T-04 interdit de fabriquer une URL par manipulation de
 * chaine dans une page. La contrepartie de cette interdiction, c est que la
 * construction legitime soit centralisee et exercee — sinon chaque page reinvente son
 * prefixe `/en` et sa borne de pagination, et l ecart ne se voit qu en cliquant.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARTICLES_PAR_PAGE,
  autreLocale,
  cheminAccueil,
  cheminArticle,
  cheminIndex,
  cheminStatique,
  normaliserChemin,
  prefixeLocale,
} from '../src/lib/routes/chemins.ts';

test('le francais n a pas de prefixe, l anglais en a un', () => {
  assert.equal(prefixeLocale('fr'), '');
  assert.equal(prefixeLocale('en'), '/en');
});

test('l accueil francais est la racine, l accueil anglais est /en', () => {
  assert.equal(cheminAccueil('fr'), '/');
  assert.equal(cheminAccueil('en'), '/en');
});

test('la normalisation retire le slash final, sauf sur la racine', () => {
  assert.equal(normaliserChemin('/categorie/territoire/'), '/categorie/territoire');
  assert.equal(normaliserChemin('/categorie/territoire'), '/categorie/territoire');
  assert.equal(normaliserChemin('/'), '/');
  assert.equal(normaliserChemin(''), '/');
  assert.equal(normaliserChemin('/en/'), '/en');
});

test('la normalisation retire la requete et le fragment', () => {
  assert.equal(normaliserChemin('/categorie/territoire/?a=1#b'), '/categorie/territoire');
  assert.equal(normaliserChemin('/#contenu'), '/');
});

test('un chemin d article porte le slug de SA locale', () => {
  assert.equal(cheminArticle('fr', 'le-viaduc'), '/article/le-viaduc');
  assert.equal(cheminArticle('en', 'the-viaduct'), '/en/article/the-viaduct');
});

test('la page 1 d un index n a PAS de segment /page/1', () => {
  assert.equal(cheminIndex('fr', 'categorie', 'territoire', 1), '/categorie/territoire');
  assert.equal(cheminIndex('en', 'categorie', 'territory', 1), '/en/categorie/territory');
});

test('les pages suivantes portent /page/[n]', () => {
  assert.equal(cheminIndex('fr', 'categorie', 'territoire', 2), '/categorie/territoire/page/2');
  assert.equal(cheminIndex('fr', 'tag', 'eau', 3), '/tag/eau/page/3');
  assert.equal(cheminIndex('en', 'tag', 'water', 2), '/en/tag/water/page/2');
});

test('auteur et dossier ne sont pas pagines (A-42) : demander une page 2 est une erreur', () => {
  assert.equal(cheminIndex('fr', 'auteur', 'hakim-zerrouki'), '/auteur/hakim-zerrouki');
  assert.equal(cheminIndex('fr', 'dossier', 'l-eau-du-plateau'), '/dossier/l-eau-du-plateau');
  assert.throws(() => cheminIndex('fr', 'auteur', 'hakim-zerrouki', 2), /pagin/i);
  assert.throws(() => cheminIndex('fr', 'dossier', 'l-eau-du-plateau', 2), /pagin/i);
});

test('un numero de page inferieur a 1 est refuse plutot que silencieusement corrige', () => {
  assert.throws(() => cheminIndex('fr', 'categorie', 'territoire', 0), /numero/i);
  assert.throws(() => cheminIndex('fr', 'categorie', 'territoire', -1), /numero/i);
  assert.throws(() => cheminIndex('fr', 'categorie', 'territoire', 1.5), /numero/i);
});

test('les pages statiques du §4.2 existent dans les deux locales', () => {
  assert.equal(cheminStatique('fr', 'a-propos'), '/a-propos');
  assert.equal(cheminStatique('en', 'a-propos'), '/en/a-propos');
  assert.equal(cheminStatique('fr', 'mentions-legales'), '/mentions-legales');
  assert.equal(cheminStatique('en', 'mentions-legales'), '/en/mentions-legales');
  assert.equal(cheminStatique('fr', '404'), '/404');
  assert.equal(cheminStatique('en', '404'), '/en/404');
});

test('l autre locale est une bijection', () => {
  assert.equal(autreLocale('fr'), 'en');
  assert.equal(autreLocale('en'), 'fr');
});

test('la taille de page du §4.2 est 12, ecrite une seule fois', () => {
  assert.equal(ARTICLES_PAR_PAGE, 12);
});
