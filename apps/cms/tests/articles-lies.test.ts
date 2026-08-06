/**
 * A-13 — « max 3 » sur une relation n existe pas nativement dans Strapi.
 *
 * Le cahier pose la contrainte a deux endroits ; celui-ci est le premier :
 * un lifecycle qui refuse la sauvegarde au-dela de 3 liens, avec un message
 * lisible par un non-technicien. Le second (troncature defensive au build)
 * appartient a `apps/web`.
 *
 * Ce que ces tests exercent, c est le calcul du nombre de liens RESULTANT
 * d une ecriture — pas la coche d une case. Strapi 5 accepte quatre formes
 * de payload pour une relation, et trois d entre elles ne portent pas le
 * total : elles portent un delta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ARTICLES_LIES,
  compterArticlesLies,
  verifierArticlesLies,
} from '../src/api/article/content-types/article/lifecycles.ts';

test('le plafond est celui du PDF', () => {
  assert.equal(MAX_ARTICLES_LIES, 3);
});

test('champ absent : le nombre existant est conserve', () => {
  assert.equal(compterArticlesLies(undefined, 2), 2);
  assert.equal(compterArticlesLies(null, 2), 2);
});

test('tableau nu : il porte le total', () => {
  assert.equal(compterArticlesLies([], 3), 0);
  assert.equal(compterArticlesLies([1, 2, 3], 0), 3);
  assert.equal(compterArticlesLies(['a', 'b', 'c', 'd'], 0), 4);
});

test('`set` porte le total et efface l existant', () => {
  assert.equal(compterArticlesLies({ set: [] }, 3), 0);
  assert.equal(compterArticlesLies({ set: [1, 2] }, 3), 2);
  assert.equal(compterArticlesLies({ set: [1, 2, 3, 4] }, 0), 4);
});

test('`connect` / `disconnect` portent un delta, pas un total', () => {
  assert.equal(compterArticlesLies({ connect: [{ documentId: 'a' }] }, 2), 3);
  assert.equal(compterArticlesLies({ connect: [{ documentId: 'a' }] }, 3), 4);
  assert.equal(compterArticlesLies({ disconnect: [{ documentId: 'a' }] }, 3), 2);
  assert.equal(
    compterArticlesLies({ connect: [{ documentId: 'a' }, { documentId: 'b' }], disconnect: [{ documentId: 'c' }] }, 2),
    3
  );
});

test('`set` l emporte sur `connect` quand les deux sont presents', () => {
  assert.equal(compterArticlesLies({ set: [1], connect: [{ documentId: 'z' }] }, 3), 1);
});

test('un compte ne descend jamais sous zero', () => {
  assert.equal(compterArticlesLies({ disconnect: [{ documentId: 'a' }, { documentId: 'b' }] }, 1), 0);
});

test('3 liens passent, 4 sont refuses', () => {
  assert.doesNotThrow(() => verifierArticlesLies({ articlesLies: [1, 2, 3] }));
  assert.doesNotThrow(() => verifierArticlesLies({ articlesLies: [] }));
  assert.doesNotThrow(() => verifierArticlesLies({}));
  assert.throws(() => verifierArticlesLies({ articlesLies: [1, 2, 3, 4] }));
});

test('le refus porte un message francais qui nomme le champ et le plafond', () => {
  try {
    verifierArticlesLies({ articlesLies: [1, 2, 3, 4] });
    assert.fail('aurait du lever');
  } catch (e: any) {
    assert.match(e.message, /articles li/i, 'le message nomme le champ');
    assert.match(e.message, /3/, 'le message nomme le plafond');
    assert.match(e.message, /4/, 'le message nomme le nombre refuse');
    assert.equal(e.name, 'ValidationError', 'Strapi doit rendre un 400 lisible, pas un 500');
  }
});

test('une mise a jour qui depasse par `connect` est refusee aussi', () => {
  assert.throws(
    () => verifierArticlesLies({ articlesLies: { connect: [{ documentId: 'd' }] } }, 3),
    /articles li/i
  );
  assert.doesNotThrow(() =>
    verifierArticlesLies(
      { articlesLies: { connect: [{ documentId: 'd' }], disconnect: [{ documentId: 'a' }] } },
      3
    )
  );
});
