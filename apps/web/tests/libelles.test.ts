/**
 * Parite des libelles FR / EN.
 *
 * Le mode d echec vise : une cle ajoutee en francais et oubliee en anglais. Elle ne
 * casse rien — TypeScript la reclamerait si les deux objets etaient types, ce qu ils
 * sont ; mais un `?? ''` ou un elargissement de type suffirait a la laisser passer, et
 * la page anglaise afficherait alors un libelle francais, ou rien. Ce test constate la
 * parite sur les VALEURS, ce que le typage ne fait pas : aucune n est vide, et aucune
 * n est identique en francais et en anglais quand il s agit d une phrase.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIBELLES, libelles } from '../src/lib/i18n/libelles.ts';

test('les deux locales portent exactement les memes cles', () => {
  assert.deepEqual(Object.keys(LIBELLES.fr).sort(), Object.keys(LIBELLES.en).sort());
});

test('aucun libelle n est vide, dans aucune des deux locales', () => {
  for (const [locale, table] of Object.entries(LIBELLES)) {
    for (const [cle, valeur] of Object.entries(table)) {
      if (typeof valeur === 'string') {
        assert.ok(valeur.trim().length > 0, `${locale}.${cle} est vide`);
      }
    }
  }
});

test('les libelles a trous sont des fonctions dans les deux locales, et interpolent', () => {
  assert.equal(libelles('fr').tempsLecture(7), 'Lecture : 7 min');
  assert.equal(libelles('en').tempsLecture(7), '7 min read');
  assert.equal(libelles('fr').pageXsurY(2, 3), 'Page 2 sur 3');
  assert.equal(libelles('en').pageXsurY(2, 3), 'Page 2 of 3');
});

test('le pluriel du compteur d articles est traite, pas ignore', () => {
  assert.equal(libelles('fr').nombreArticles(1), '1 article');
  assert.equal(libelles('fr').nombreArticles(12), '12 articles');
});

test('la mention de media fictif existe dans les deux locales et nomme le journal', () => {
  for (const locale of ['fr', 'en'] as const) {
    const texte = libelles(locale).mediaFictifTexte;
    assert.match(texte, /Écho des Hauts/);
    assert.ok(texte.length > 120, `${locale} : la mention doit etre explicite, pas allusive`);
  }
});

/**
 * LES QUATRE CHAINES RAPATRIEES LE 2026-08-11 (tache `ba63557e`).
 *
 * Elles vivaient en dur dans des composants et des modules, donc HORS de ce dictionnaire :
 * l etiquette du bloc de reseaux du pied de page, le nom affichable de la plateforme
 * `site`, le libelle du lien video et sa mention d ouverture, et le « par » du texte
 * alternatif de l image de partage. Aucune n avait de contrepartie anglaise, parce
 * qu aucune n avait de domicile ou en ecrire une.
 *
 * Ce qui les rendait invisibles : les pages anglaises ne servaient pas le bloc concerne.
 * Rendre le bloc (commit `e9dc7c0`) n a rien casse, il a montre ce qui dormait.
 */
test('les chaines rapatriees du pied de page ont une contrepartie anglaise', () => {
  assert.equal(libelles('fr').reseauxDuJournal, 'Reseaux du journal');
  assert.notEqual(libelles('en').reseauxDuJournal, libelles('fr').reseauxDuJournal);
  assert.doesNotMatch(libelles('en').reseauxDuJournal, /journal/i);

  assert.equal(libelles('fr').plateformeSite, 'Site web');
  assert.equal(libelles('en').plateformeSite, 'Website');
});

test('le libelle du lien video et sa mention d onglet sont localises', () => {
  assert.equal(libelles('fr').voirLaVideoSur('YouTube'), 'Voir la video sur YouTube');
  assert.equal(libelles('en').voirLaVideoSur('YouTube'), 'Watch the video on YouTube');
  assert.equal(libelles('fr').voirLaVideo, 'Voir la video');
  assert.equal(libelles('en').voirLaVideo, 'Watch the video');

  /* La mention est du TEXTE ACCESSIBLE : un lecteur d ecran anglophone l entend telle
     quelle. C est le cout precis que la tache nomme — pas un defaut cosmetique. */
  assert.equal(libelles('fr').ouvreNouvelOnglet, '(s ouvre dans un nouvel onglet)');
  assert.equal(libelles('en').ouvreNouvelOnglet, '(opens in a new tab)');
});

test('la signature du texte alternatif de l image de partage est localisee', () => {
  assert.equal(libelles('fr').parAuteur('Camille Ferrand'), 'par Camille Ferrand');
  assert.equal(libelles('en').parAuteur('Camille Ferrand'), 'by Camille Ferrand');
});

test('les phrases d ossature different reellement entre FR et EN', () => {
  const aComparer = [
    'allerAuContenu',
    'sommaire',
    'aLireAussi',
    'aLaUne',
    'dernieresPublications',
    'titre404',
    'reseauxDuJournal',
    'plateformeSite',
    'ouvreNouvelOnglet',
  ] as const;
  for (const cle of aComparer) {
    assert.notEqual(
      LIBELLES.fr[cle],
      LIBELLES.en[cle],
      `${cle} : le miroir anglais afficherait un libelle francais`,
    );
  }
});
