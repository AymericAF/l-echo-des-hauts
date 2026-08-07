/**
 * Echappement XML — partage par le sitemap et le flux RSS.
 *
 * Ce n est pas une precaution theorique : les slugs et les titres viennent de la
 * redaction. Un titre qui contient « & » ou « < » produit un document MAL FORME, que
 * les agregateurs et la Search Console rejettent en bloc — et le rejet porte sur le
 * fichier entier, pas sur l entree fautive. Un flux invalide et un flux absent se
 * ressemblent beaucoup vus de loin : c est exactement le mode d echec ou succes et
 * echec rendent la meme sortie.
 *
 * Les cinq entites predefinies de XML, et rien d autre : un XML valide n en connait pas
 * d autres (`&nbsp;` par exemple est du HTML, et casse un flux RSS).
 */

export function echapperXml(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Les caracteres de controle interdits par XML 1.0, retires plutot qu echappes.
 *
 * Aucune sequence d echappement ne les rend valides : `&#8;` est refuse par un parseur
 * conforme au meme titre que l octet brut. Ils ne devraient pas arriver d un champ
 * Strapi — mais un copier-coller depuis un traitement de texte en produit, et le flux
 * casse alors sans que rien dans le contenu ait l air fautif.
 */
export function nettoyerXml(valeur: string): string {
  return valeur.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '');
}

/** Une valeur de texte prete a etre placee dans un noeud ou un attribut XML. */
export function texteXml(valeur: string): string {
  return echapperXml(nettoyerXml(valeur));
}
