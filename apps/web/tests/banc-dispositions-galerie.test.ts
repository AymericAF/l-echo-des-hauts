/**
 * LE BANC DOIT EXERCER LES DEUX DISPOSITIONS DE GALERIE — sinon deux règles axe
 * ne sont JAMAIS évaluées chez lui, et leur régression passerait au vert.
 *
 * LE DÉFAUT, MESURÉ LE 2026-08-14 (tache `c094568d`, puis `45c31807`). Deux regles
 * sont exercees EN PRODUCTION et jamais sur le banc : `tabindex` et
 * `scrollable-region-focusable`. En production elles le sont par UN seul noeud, sur
 * un seul article :
 *
 *   <ul class="bloc-galerie__bande" tabindex="0" aria-label="Galerie d images, …">
 *
 * La cause se lit dans `BlocGalerie.astro`, elle ne se suppose pas : `defilante` vaut
 * `bloc.disposition === 'carrousel'`, et le `tabindex` n est ecrit que dans ce cas.
 * Les fixtures ne posaient que `grille` — sur les 24 pages du banc, le mot `tabindex`
 * n apparaissait PAS UNE FOIS.
 *
 * POURQUOI CET ECART EST PIRE QUE CELUI QUI A OUVERT LE FIL. Les violations
 * `image-redundant-alt` etaient BRUYANTES ET FAUSSES ; celle-ci est SILENCIEUSE ET
 * VRAIE. Une regression qui retirerait le `tabindex` du carrousel laisserait le banc
 * VERT — or le composant l ecrit comme une exigence (« ATTEIGNABLE ET PARCOURABLE AU
 * CLAVIER »), adossee a A-05.
 *
 * CE QUE CE FICHIER GARDE, ET CE QU IL NE GARDE PAS. Il garde que le CORPUS DU BANC
 * pose les deux dispositions — la condition necessaire. Il ne dit rien de la sortie :
 * que les deux regles passent d `inapplicable` a `passee` se mesure sur `dist/` par
 * une campagne axe, pas ici. Les deux sont necessaires, aucune ne remplace l autre.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(ICI, 'fixtures');

function galeriesDe(nom: string) {
  const brut = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${nom}.json`), 'utf8'));
  const articles = Array.isArray(brut) ? brut : (brut.data ?? [brut]);
  return articles.flatMap((article: any) =>
    (article.contenu ?? []).filter((bloc: any) => bloc.__component === 'bloc.galerie')
  );
}

/* LE BANC, TOUTES LOCALES CONFONDUES — c est ainsi que la production l exerce aussi :
   UN seul article y porte le carrousel, et cela suffit a faire evaluer les deux regles.
   Exiger un carrousel dans CHAQUE locale demanderait un second article anglais, sans rien
   ajouter a ce qui est garde ici. */
const TOUTES = ['articles-fr', 'articles-en'].flatMap((nom) => galeriesDe(nom));

test('le banc pose une galerie en CARROUSEL — sans elle, aucun `tabindex` n est rendu', () => {
  assert.ok(
    TOUTES.some((g: any) => g.disposition === 'carrousel'),
    'sans galerie defilante, `tabindex` et `scrollable-region-focusable` restent INAPPLICABLES ' +
      'sur le banc : une regression qui retirerait le tabindex du carrousel le laisserait vert'
  );
});

test('le banc garde AUSSI une galerie en grille — l autre branche reste exercee', () => {
  assert.ok(
    TOUTES.some((g: any) => g.disposition === 'grille'),
    'remplacer la grille par un carrousel deplacerait le trou au lieu de le combler'
  );
});

test('la galerie defilante porte PLUSIEURS images — une bande d une seule image ne defile pas', () => {
  const carrousel: any = TOUTES.find((g: any) => g.disposition === 'carrousel');
  assert.ok(carrousel, 'le banc doit porter une galerie carrousel');
  assert.ok(
    (carrousel.images ?? []).length >= 2,
    'une bande defilante d une seule image ne produit pas de region defilante, et ' +
      '`scrollable-region-focusable` resterait inapplicable malgre le tabindex'
  );
});
