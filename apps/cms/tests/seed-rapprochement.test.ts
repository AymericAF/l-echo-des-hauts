/**
 * Le rapprochement se fait sur le SLUG, par locale — jamais sur l'id ni sur le titre.
 *
 * C'est la piece qui rend le seed rejouable : une seconde execution doit
 * retrouver l'entree deja ecrite et la mettre a jour, au lieu d'en creer une
 * seconde. Le mode d'echec qu'on ferme ici est silencieux : un rapprochement
 * sur le titre laisserait passer un doublon des qu'un titre est retouche.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { indexerParSlug, decider, verifierUnicite } from '../scripts/seed/rapprochement.ts';
import { ErreurCorpus } from '../scripts/seed/erreurs.ts';

test('indexerParSlug rend un index slug -> documentId', () => {
  const index = indexerParSlug([
    { slug: 'eau', documentId: 'aaa' },
    { slug: 'foret', documentId: 'bbb' },
  ]);
  assert.equal(index.get('eau'), 'aaa');
  assert.equal(index.get('foret'), 'bbb');
  assert.equal(index.size, 2);
});

test('indexerParSlug ignore les entrees sans slug plutot que de les indexer sous undefined', () => {
  const index = indexerParSlug([
    { slug: 'eau', documentId: 'aaa' },
    { slug: '', documentId: 'bbb' },
    { slug: null as unknown as string, documentId: 'ccc' },
  ]);
  assert.equal(index.size, 1);
  assert.equal(index.get('eau'), 'aaa');
});

test('decider cree quand le slug est absent, met a jour quand il est present', () => {
  const index = indexerParSlug([{ slug: 'eau', documentId: 'aaa' }]);
  assert.deepEqual(decider(index, 'foret'), { action: 'creer' });
  assert.deepEqual(decider(index, 'eau'), { action: 'mettreAJour', documentId: 'aaa' });
});

test('decider est stable : rejoue sur un index deja peuple, il ne cree jamais', () => {
  const index = indexerParSlug([
    { slug: 'eau', documentId: 'aaa' },
    { slug: 'foret', documentId: 'bbb' },
  ]);
  for (const slug of ['eau', 'foret', 'eau']) {
    assert.equal(decider(index, slug).action, 'mettreAJour');
  }
});

test('decider ne rapproche PAS sur autre chose que le slug', () => {
  // Meme documentId, slug different : c'est une creation, pas une mise a jour.
  const index = indexerParSlug([{ slug: 'ancien-slug', documentId: 'aaa' }]);
  assert.deepEqual(decider(index, 'nouveau-slug'), { action: 'creer' });
});

test('verifierUnicite refuse deux fois le meme slug dans le corpus versionne', () => {
  assert.doesNotThrow(() => verifierUnicite(['eau', 'foret'], 'Tag fr'));
  assert.throws(() => verifierUnicite(['eau', 'foret', 'eau'], 'Tag fr'), ErreurCorpus);
});

test('verifierUnicite refuse un slug vide', () => {
  assert.throws(() => verifierUnicite(['eau', ''], 'Tag en'), ErreurCorpus);
});
