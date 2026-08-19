/**
 * LE COMPTE D EPISODES D UN DOSSIER SE DERIVE, IL NE SE SAISIT PAS.
 *
 * CE QUE CE FICHIER FERME. Le nombre d episodes d un dossier a vecu en PROSE, ecrit a la
 * main : « Cinq episodes, du captage a la coupure… » (`apps/cms/data/dossiers.json`).
 * Exact le jour ou il a ete ecrit, faux le jour ou le dossier gagne un sixieme article,
 * et personne ne relit un chapo. Les commits `e30f3c8` et `9871a27` l ont retire des deux
 * chapos ; Aymeric a approuve ce retrait A CONDITION que l information revienne — DERIVEE
 * de la liste d articles, jamais ressaisie.
 *
 * POURQUOI UNE FONCTION ET PAS UNE EXPRESSION DANS LE `.astro`. Aucun test de ce depot ne
 * peut instancier un composant Astro (cf. l en-tete d `alternative-localisee.test.ts`).
 * Une regle enfouie dans le gabarit serait donc une regle non prouvee — en particulier le
 * cas a zero, qui est precisement celui que personne ne verra jamais en naviguant.
 *
 * LES TROIS CAS, ET POURQUOI LE TROISIEME EXISTE ALORS QU IL EST INATTEIGNABLE. N > 1 rend
 * le pluriel, N = 1 rend le singulier, N = 0 ne rend RIEN — pas « 0 episode ». Le registre
 * n emet pas d index vide (§10.3 du plan editorial), donc zero n arrive pas par la page ;
 * il arriverait par un appel depuis ailleurs, et une fonction qui repond « 0 episode » a
 * un dossier vide fabrique une affirmation fausse dans une langue correcte.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compteDeLIndex } from '../src/lib/routes/compte-index.ts';

/** Un index reduit a ce que le compte lit : sa famille et ses pages. */
function index(famille: 'categorie' | 'tag' | 'auteur' | 'dossier', nombre: number) {
  return { famille, pages: [{ items: Array.from({ length: nombre }, (_, rang) => rang) }] };
}

test('un dossier de cinq articles annonce cinq episodes, dans les deux langues', () => {
  assert.equal(compteDeLIndex(index('dossier', 5), 'fr'), '5 épisodes');
  assert.equal(compteDeLIndex(index('dossier', 5), 'en'), '5 instalments');
});

test('un dossier d un seul article prend le SINGULIER, dans les deux langues', () => {
  assert.equal(compteDeLIndex(index('dossier', 1), 'fr'), '1 épisode');
  assert.equal(compteDeLIndex(index('dossier', 1), 'en'), '1 instalment');
});

test('un dossier sans article n annonce RIEN, plutot que « 0 episode »', () => {
  assert.equal(compteDeLIndex(index('dossier', 0), 'fr'), null);
  assert.equal(compteDeLIndex(index('dossier', 0), 'en'), null);
});

/**
 * Le compte se derive de la liste que la page recoit DEJA — donc de TOUTES ses pages,
 * pas de la tranche affichee. Un dossier n est pas pagine aujourd hui (`FAMILLES_PAGINEES`
 * ne porte que `categorie` et `tag`), mais lire `pages[0]` seul ferait mentir le compte le
 * jour ou il le devient, et ce jour-la aucun test ne parlerait.
 */
test('le compte additionne toutes les pages, pas seulement la premiere', () => {
  const pagine = { famille: 'dossier' as const, pages: [{ items: [1, 2, 3] }, { items: [4, 5] }] };
  assert.equal(compteDeLIndex(pagine, 'fr'), '5 épisodes');
});

/**
 * Les trois autres familles gardent le libelle d ARTICLES qu elles rendaient deja : c est
 * le vocabulaire du dossier qui est particulier (une serie a des episodes), pas le compte.
 */
test('les autres familles continuent de compter des articles', () => {
  assert.equal(compteDeLIndex(index('categorie', 5), 'fr'), '5 articles');
  assert.equal(compteDeLIndex(index('auteur', 1), 'fr'), '1 article');
  assert.equal(compteDeLIndex(index('tag', 5), 'en'), '5 articles');
});
