/**
 * La bascule FR/EN — T-04, T-05 et T-06 de `docs/arbitrages-techniques.md`.
 *
 * UNE fonction, alimentee par le registre des routes reellement emises. C est la regle
 * la plus importante de tout le lot, et elle tient en une phrase : **l URL de
 * contrepartie n est jamais fabriquee par manipulation de chaine**. Les cinq slugs
 * (`Article`, `Categorie`, `Tag`, `Auteur`, `Dossier`) sont des `uid`, donc localises
 * d office par Strapi 5 (A-06) : `/en/` + un slug francais est une 404, et le piege est
 * invisible en developpement tant que les deux slugs se ressemblent.
 *
 * Ce que la fonction rend, et pourquoi deux informations et pas une :
 *
 *   - `chemin` — la cible du lien `<a>`. Elle est TOUJOURS presente : un en-tete dont
 *     les elements apparaissent et disparaissent d un article a l autre se lit comme
 *     une panne et fait bouger la mise en page (T-06). Quand la contrepartie exacte
 *     n existe pas, on remonte d un cran : article → page de sa rubrique → accueil.
 *   - `exact` — vrai seulement si la cible est la MEME page dans l autre langue. Le
 *     `hreflang` ne s emet que la-dessus : un `hreflang="en"` pointant une page de
 *     rubrique ou un accueil est une erreur SEO franche, remontee comme telle par la
 *     Search Console. Le repli de navigation ne doit jamais contaminer les alternates.
 *
 * Garantie par mecanisme : la derniere echelle est l accueil de l autre locale, que le
 * registre emet toujours. S il n y est pas, on LEVE plutot que de rendre un lien mort —
 * un lien de bascule casse ne se decouvre qu en cliquant, c est-a-dire jamais en test.
 */
import type { Article, Locale } from '../domaine.ts';
import {
  autreLocale,
  cheminAccueil,
  cheminArticle,
  cheminIndex,
  cheminStatique,
  type Famille,
  type PageStatique,
} from './chemins.ts';
import type { Registre } from './registre.ts';

export type DescripteurPage =
  | { genre: 'accueil'; locale: Locale }
  | { genre: 'article'; locale: Locale; article: Article }
  | { genre: 'index'; locale: Locale; famille: Famille; documentId: string; numero: number }
  | { genre: 'statique'; locale: Locale; nom: PageStatique };

export interface Contrepartie {
  readonly chemin: string;
  readonly locale: Locale;
  /** `true` → la cible est la meme page dans l autre langue → le `hreflang` peut sortir. */
  readonly exact: boolean;
}

/** Un candidat : une cible possible, et si l atteindre vaut « contrepartie exacte ». */
interface Candidat {
  readonly chemin: string | null;
  readonly exact: boolean;
}

/**
 * L echelle d un article : sa traduction, puis la page anglaise de sa rubrique, puis
 * l accueil. « Le lecteur atterrit sur du contenu anglais du meme sujet plutot que sur
 * une page d accueil generique » (T-06).
 */
function candidatsArticle(registre: Registre, locale: Locale, article: Article): Candidat[] {
  const cible = autreLocale(locale);
  const traduction = article.localisations.find((entree) => entree.locale === cible) ?? null;
  const rubrique = registre.index(cible, 'categorie', article.categorie.documentId);

  return [
    { chemin: traduction ? cheminArticle(cible, traduction.slug) : null, exact: true },
    { chemin: rubrique ? cheminIndex(cible, 'categorie', rubrique.slug, 1) : null, exact: false },
  ];
}

/**
 * L echelle d un index. T-05, piege 2 : la pagination n a pas la meme profondeur dans
 * les deux langues — avec 8 articles traduits, une categorie a 3 pages en francais et
 * une seule en anglais. On replie donc sur la DERNIERE page existante de la
 * contrepartie, ce qui n est pas la meme page : aucun `hreflang`.
 */
function candidatsIndex(
  registre: Registre,
  locale: Locale,
  famille: Famille,
  documentId: string,
  numero: number,
): Candidat[] {
  const cible = autreLocale(locale);
  const index = registre.index(cible, famille, documentId);
  if (index === null) return [];

  const derniere = index.pages.length;
  const meme = numero <= derniere;

  return [
    { chemin: meme ? cheminIndex(cible, famille, index.slug, numero) : null, exact: true },
    { chemin: cheminIndex(cible, famille, index.slug, derniere), exact: false },
  ];
}

function candidats(registre: Registre, page: DescripteurPage): Candidat[] {
  const cible = autreLocale(page.locale);

  switch (page.genre) {
    case 'accueil':
      return [{ chemin: cheminAccueil(cible), exact: true }];

    case 'statique':
      // T-05, piege 3 : une 404 statique ne sait pas quelle URL a ete demandee — sans
      // JavaScript, elle ne peut pas proposer sa propre traduction. Assume, et sans
      // alternative : sa bascule pointe l accueil, et ce n est pas une contrepartie.
      return page.nom === '404' ? [] : [{ chemin: cheminStatique(cible, page.nom), exact: true }];

    case 'article':
      return candidatsArticle(registre, page.locale, page.article);

    case 'index':
      return candidatsIndex(registre, page.locale, page.famille, page.documentId, page.numero);
  }
}

export function contrepartie(registre: Registre, page: DescripteurPage): Contrepartie {
  const cible = autreLocale(page.locale);

  for (const candidat of candidats(registre, page)) {
    if (candidat.chemin === null) continue;
    if (!registre.contient(candidat.chemin)) continue;
    return { chemin: candidat.chemin, locale: cible, exact: candidat.exact };
  }

  const accueil = cheminAccueil(cible);
  if (!registre.contient(accueil)) {
    throw new Error(
      `Registre incoherent : l accueil « ${accueil} » n est pas une route emise. C est le ` +
        'dernier repli de la bascule FR/EN (T-06) ; sans lui, une page rendrait un lien mort ' +
        'qui ne se decouvrirait qu en cliquant.',
    );
  }
  return { chemin: accueil, locale: cible, exact: false };
}
