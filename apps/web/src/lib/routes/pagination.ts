/**
 * Decoupe d une liste en pages — §4.2, « 12 par page ».
 *
 * Trois decisions sont prises ici, et ce sont les trois qui produisent les defauts de
 * bord si on ne les prend pas :
 *
 *   1. **Une liste vide ne produit AUCUNE page.** Le tableau vide se propage jusqu au
 *      registre, qui n emet alors aucune route : c est le mecanisme qui applique la
 *      regle « un index vide n est pas emis » (`docs/plan-editorial.md` §10.3). La
 *      variante « une page vide » aurait publie 5 pages tag anglaises vides et
 *      indexables.
 *   2. **`Math.ceil` sur un multiple exact ne cree pas de page finale vide** : 12
 *      articles font UNE page, pas deux. C est la frontiere que le critere de recette
 *      nomme, parce qu elle est invisible sur un jeu de donnees quelconque.
 *   3. **Les bornes de navigation sont portees par la page**, pas recalculees dans le
 *      composant. Un « suivant » calcule a l affichage finit toujours par pointer une
 *      page inexistante sur la derniere.
 */

export interface Tranche<T> {
  readonly numero: number;
  readonly nombreDePages: number;
  readonly items: readonly T[];
  /** `null` sur la premiere page — jamais 0, jamais la page courante. */
  readonly precedente: number | null;
  /** `null` sur la derniere page — c est ce qui interdit un lien mort. */
  readonly suivante: number | null;
}

export function paginer<T>(items: readonly T[], parPage: number): Tranche<T>[] {
  if (!Number.isInteger(parPage) || parPage < 1) {
    throw new Error(`Taille de page invalide : ${parPage}. Un entier strictement positif est attendu.`);
  }

  const nombreDePages = Math.ceil(items.length / parPage);
  if (nombreDePages === 0) return [];

  return Array.from({ length: nombreDePages }, (_, index) => {
    const numero = index + 1;
    return {
      numero,
      nombreDePages,
      items: items.slice(index * parPage, (index + 1) * parPage),
      precedente: numero > 1 ? numero - 1 : null,
      suivante: numero < nombreDePages ? numero + 1 : null,
    };
  });
}
