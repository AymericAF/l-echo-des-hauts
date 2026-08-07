/**
 * Pagination — le test porte sur les BORNES, pas sur le cas moyen.
 *
 * Le mode d echec redoute n est pas « la page 2 est fausse » : c est la page 2 VIDE
 * emise pour une categorie qui compte exactement 12 articles, et le lien « suivant »
 * de la derniere page qui pointe une URL jamais construite. Les deux sont invisibles
 * sur un jeu de donnees quelconque et se decouvrent en cliquant.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARTICLES_PAR_PAGE } from '../src/lib/routes/chemins.ts';
import { paginer } from '../src/lib/routes/pagination.ts';

const items = (nombre: number): number[] => Array.from({ length: nombre }, (_, i) => i + 1);

test('une liste vide ne produit AUCUNE page — un index vide n est pas emis', () => {
  assert.deepEqual(paginer([], ARTICLES_PAR_PAGE), []);
});

test('une liste plus courte qu une page produit une page unique, complete', () => {
  const pages = paginer(items(5), ARTICLES_PAR_PAGE);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].numero, 1);
  assert.equal(pages[0].nombreDePages, 1);
  assert.deepEqual(pages[0].items, [1, 2, 3, 4, 5]);
  assert.equal(pages[0].precedente, null);
  assert.equal(pages[0].suivante, null);
});

test('EXACTEMENT 12 articles produisent UNE page, jamais une page 2 vide', () => {
  const pages = paginer(items(12), ARTICLES_PAR_PAGE);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].items.length, 12);
  assert.equal(pages[0].suivante, null);
});

test('13 articles produisent deux pages : 12 puis 1', () => {
  const pages = paginer(items(13), ARTICLES_PAR_PAGE);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].items.length, 12);
  assert.equal(pages[1].items.length, 1);
  assert.deepEqual(pages[1].items, [13]);
});

test('les bornes de navigation sont nulles aux extremites et jamais hors intervalle', () => {
  const pages = paginer(items(25), ARTICLES_PAR_PAGE);
  assert.equal(pages.length, 3);

  assert.equal(pages[0].precedente, null, 'la premiere page n a pas de precedente');
  assert.equal(pages[0].suivante, 2);

  assert.equal(pages[1].precedente, 1);
  assert.equal(pages[1].suivante, 3);

  assert.equal(pages[2].precedente, 2);
  assert.equal(pages[2].suivante, null, 'la derniere page n a pas de suivante');

  for (const page of pages) {
    assert.ok(page.suivante === null || page.suivante <= pages.length);
    assert.ok(page.precedente === null || page.precedente >= 1);
  }
});

test('chaque page connait le nombre total de pages', () => {
  for (const page of paginer(items(25), ARTICLES_PAR_PAGE)) {
    assert.equal(page.nombreDePages, 3);
  }
});

test('la decoupe conserve l ordre et ne perd ni ne duplique aucun element', () => {
  const source = items(37);
  const pages = paginer(source, ARTICLES_PAR_PAGE);
  assert.deepEqual(pages.flatMap((page) => page.items), source);
});

test('un multiple exact de la taille de page ne cree pas de page vide finale', () => {
  for (const multiple of [12, 24, 36]) {
    const pages = paginer(items(multiple), ARTICLES_PAR_PAGE);
    assert.equal(pages.length, multiple / 12);
    assert.equal(pages.at(-1)?.items.length, 12);
  }
});

test('une taille de page non entiere ou nulle est refusee', () => {
  assert.throws(() => paginer(items(3), 0), /taille/i);
  assert.throws(() => paginer(items(3), -1), /taille/i);
  assert.throws(() => paginer(items(3), 2.5), /taille/i);
});
