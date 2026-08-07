/**
 * Le format des fichiers d'article versionnes : en-tete JSON entre `---`,
 * puis un corps decoupe en blocs `::: type` ... `:::`.
 *
 * Ce test ne touche ni le reseau ni Strapi : il ne juge que la lecture des
 * fichiers du depot. Un corpus qui se lit mal doit echouer ICI, avant la
 * premiere ecriture — c'est ce qui rend le seed rejouable sans laisser
 * la base a moitie remplie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  separerEnTete,
  lireAttributs,
  decouperEnBlocs,
  markdownVersBlocks,
} from '../scripts/seed/markdown.ts';
import { ErreurCorpus } from '../scripts/seed/erreurs.ts';

test('separerEnTete rend l en-tete JSON et le corps', () => {
  const source = ['---', '{ "slug": "a05", "titre": "Qui decide" }', '---', '', 'corps ici'].join(
    '\n'
  );
  const { enTete, corps } = separerEnTete(source);
  assert.equal(enTete.slug, 'a05');
  assert.equal(enTete.titre, 'Qui decide');
  assert.equal(corps.trim(), 'corps ici');
});

test('separerEnTete refuse un fichier sans en-tete', () => {
  assert.throws(() => separerEnTete('pas d en-tete du tout'), ErreurCorpus);
});

test('separerEnTete refuse un en-tete JSON invalide', () => {
  assert.throws(() => separerEnTete('---\n{ slug: a05 }\n---\ncorps'), ErreurCorpus);
});

test('lireAttributs lit les valeurs entre guillemets, y compris avec espaces et =', () => {
  const attrs = lireAttributs('auteur="Marie Sanz" source="Registre, p. 12" variante=alerte');
  assert.deepEqual(attrs, {
    auteur: 'Marie Sanz',
    source: 'Registre, p. 12',
    variante: 'alerte',
  });
});

test('decouperEnBlocs rend les blocs dans l ordre, avec leur type et leurs attributs', () => {
  const corps = [
    '::: texte',
    'Premier paragraphe.',
    ':::',
    '',
    '::: citation auteur="Marie Sanz" source="Entretien"',
    'On a produit jusqu a la derniere minute.',
    ':::',
    '',
    '::: separateur style=ligne',
    ':::',
  ].join('\n');

  const blocs = decouperEnBlocs(corps);
  assert.equal(blocs.length, 3);
  assert.equal(blocs[0].type, 'texte');
  assert.equal(blocs[0].corps.trim(), 'Premier paragraphe.');
  assert.equal(blocs[1].type, 'citation');
  assert.equal(blocs[1].attributs.auteur, 'Marie Sanz');
  assert.equal(blocs[2].type, 'separateur');
  assert.equal(blocs[2].attributs.style, 'ligne');
});

test('decouperEnBlocs refuse un bloc non ferme', () => {
  assert.throws(() => decouperEnBlocs('::: texte\nsans fermeture'), ErreurCorpus);
});

test('decouperEnBlocs refuse du texte hors de tout bloc', () => {
  assert.throws(() => decouperEnBlocs('du texte orphelin\n\n::: texte\nok\n:::'), ErreurCorpus);
});

test('markdownVersBlocks rend paragraphes, titres h2/h3 et listes', () => {
  const blocks = markdownVersBlocks(
    ['## Un titre', '', 'Un paragraphe.', '', '### Sous-titre', '', '- un', '- deux'].join('\n')
  );
  assert.deepEqual(
    blocks.map((b: any) => b.type),
    ['heading', 'paragraph', 'heading', 'list']
  );
  assert.equal((blocks[0] as any).level, 2);
  assert.equal((blocks[2] as any).level, 3);
  assert.equal((blocks[3] as any).format, 'unordered');
  assert.equal((blocks[3] as any).children.length, 2);
});

test('markdownVersBlocks rend le gras, l italique et les liens', () => {
  const [para] = markdownVersBlocks('Un **gras**, un *italique* et un [lien](https://exemple.test).');
  const enfants = (para as any).children;
  assert.equal(enfants.find((e: any) => e.bold)?.text, 'gras');
  assert.equal(enfants.find((e: any) => e.italic)?.text, 'italique');
  const lien = enfants.find((e: any) => e.type === 'link');
  assert.equal(lien.url, 'https://exemple.test');
  assert.equal(lien.children[0].text, 'lien');
});

test('markdownVersBlocks refuse un champ Blocks vide — le schema exige du contenu', () => {
  assert.throws(() => markdownVersBlocks('   \n\n  '), ErreurCorpus);
});
