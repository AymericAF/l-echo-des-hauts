/**
 * Troncature des valeurs SEO calculees au build.
 *
 * A-07 : rien n est ecrit en base, tout se calcule au build. A-26 : le `titre` peut
 * faire 120 caracteres quand `metaTitre` en vise 60, et le `chapo` 300 quand
 * `metaDescription` en vise 160. Sans troncature, Google coupe au milieu d un mot — et
 * si la valeur etait ecrite en base, elle violerait la contrainte du champ qui l accueille.
 *
 * Cette fonction sert desormais DEUX appelants (le <title> de toute page, la meta
 * description d un article) : elle vit donc dans `src/lib/`, pas dans un layout.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { tronquerSurUnMot } from '../src/lib/texte.ts';

test('un texte plus court que la limite sort intact, sans ellipse', () => {
  assert.equal(tronquerSurUnMot('Le viaduc rouvre', 60), 'Le viaduc rouvre');
  assert.equal(tronquerSurUnMot('123456', 6), '123456');
});

test('un texte trop long est coupe sur une frontiere de mot et porte une ellipse', () => {
  const titre = 'Le viaduc rouvre apres dix-huit mois de travaux et de detours';
  const tronque = tronquerSurUnMot(titre, 30);

  assert.ok(tronque.length <= 30, `« ${tronque} » depasse la limite`);
  assert.ok(tronque.endsWith('…'));
  assert.ok(!tronque.slice(0, -1).endsWith(' '), 'une espace avant l ellipse trahit une coupe brute');
  assert.ok(titre.startsWith(tronque.slice(0, -1)), 'le debut doit rester celui du texte d origine');
});

test('un mot unique plus long que la limite est coupe quand meme', () => {
  // Sinon la valeur depasserait la borne du champ qui l accueille — c est la
  // contradiction qu A-26 evite en calculant au build plutot qu en base.
  const tronque = tronquerSurUnMot('anticonstitutionnellement', 10);
  assert.ok(tronque.length <= 10);
  assert.ok(tronque.endsWith('…'));
});

test('la troncature ne renvoie jamais une chaine vide', () => {
  assert.notEqual(tronquerSurUnMot('Un chapo tres long', 2), '');
});
