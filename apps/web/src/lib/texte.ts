/**
 * Troncature des valeurs SEO calculees AU BUILD (A-07, A-26 de `docs/modele-donnees.md`).
 *
 * Deux limites du cahier ne tiennent pas dans leur source : `titre` va jusqu a 120 quand
 * `metaTitre` vise 60 ; `chapo` va jusqu a 300 quand `metaDescription` vise 160. La
 * troncature se fait donc au build, jamais en base — une valeur pre-remplie par un
 * lifecycle se figerait au premier enregistrement et violerait la borne du champ qui
 * l accueille.
 *
 * La coupe cherche une frontiere de MOT, mais ne s y accroche pas : si la derniere
 * espace tombe trop tot (moins de la moitie de la limite), on coupe au caractere. Un
 * titre coupe au tiers serait pire qu un mot tranche.
 */

/** Coupe `texte` a `longueur` caracteres AU PLUS, ellipse comprise. */
export function tronquerSurUnMot(texte: string, longueur: number): string {
  if (texte.length <= longueur) return texte;
  const coupe = texte.slice(0, longueur - 1);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > longueur / 2 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}
