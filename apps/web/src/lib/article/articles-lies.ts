/**
 * Articles lies d une page article — champ manuel, complete par un REPLI automatique
 * calcule au build (§4.5 : « articles lies de secours, par categorie commune, si le
 * champ manuel est vide » ; A-13 de `docs/modele-donnees.md`).
 *
 * Trois points que l enonce du cahier laisse implicites et qu il faut trancher ici :
 *
 *   - **Le repli est un COMPLEMENT, pas une alternative.** A-13 ecrit « le build complete
 *     toujours a 3 » : un champ manuel a un seul lien reste donc complete a trois. Lire
 *     « si le champ est vide » comme un tout-ou-rien laisserait une carte solitaire sous
 *     un article, ce qui se lit comme un bug de mise en page.
 *   - **Le champ manuel n est jamais reordonne ni filtre.** C est de la curation
 *     editoriale, directionnelle par nature (A-12) ; le mapping l a deja tronque a 3
 *     (troncature defensive) et Strapi ne peuple que des entrees publiees. Le corpus ne
 *     sert qu au repli.
 *   - **Le repli peut rendre MOINS de trois cartes**, et c est voulu : la relation est
 *     localisee d office (A-06), donc sur les 8 articles anglais du seed une categorie
 *     peut n avoir aucun voisin. On rend ce qui existe plutot que d elargir le critere —
 *     un « article lie » d une autre categorie ne serait plus un article lie.
 *
 * L ordre du repli est TOTAL et deterministe (esprit d A-16) : `datePublication`
 * decroissante, puis `documentId` croissant. Sans cle de departage, deux articles de
 * meme date sortiraient dans l ordre que la base veut bien donner, et la page bougerait
 * d un build a l autre sans qu aucun contenu n ait change.
 */
import type { Article, ReferenceArticle } from '../domaine.ts';

/** Plafond du §3.1 (« max 3 »), applique ici a la liste RENDUE, manuel et repli confondus. */
export const NOMBRE_ARTICLES_LIES = 3;

function enReference(article: Article): ReferenceArticle {
  return {
    documentId: article.documentId,
    titre: article.titre,
    slug: article.slug,
    chapo: article.chapo,
    imageCouverture: article.imageCouverture,
  };
}

export function articlesLies(
  article: Article,
  corpus: readonly Article[],
): readonly ReferenceArticle[] {
  const manuels = article.articlesLies.slice(0, NOMBRE_ARTICLES_LIES);
  if (manuels.length >= NOMBRE_ARTICLES_LIES) return manuels;

  const exclus = new Set<string>([article.documentId, ...manuels.map((lie) => lie.documentId)]);

  const secours = corpus
    .filter(
      (candidat) =>
        candidat.locale === article.locale &&
        candidat.categorie.documentId === article.categorie.documentId &&
        !exclus.has(candidat.documentId),
    )
    .sort(
      (a, b) =>
        b.datePublication.localeCompare(a.datePublication) ||
        a.documentId.localeCompare(b.documentId),
    )
    .slice(0, NOMBRE_ARTICLES_LIES - manuels.length)
    .map(enReference);

  return [...manuels, ...secours];
}
