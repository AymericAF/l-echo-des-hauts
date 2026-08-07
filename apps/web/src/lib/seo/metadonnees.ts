/**
 * Les metadonnees de `<head>` d une page — §5.2, calculees AU BUILD.
 *
 * C EST LE POINT DE VIGILANCE DE TOUT LE LOT. Les valeurs SEO par defaut se calculent
 * ici, a chaque build, a partir du contenu. Elles ne sont JAMAIS ecrites en base : une
 * valeur pre-remplie par un lifecycle Strapi se fige au premier enregistrement, et la
 * surcharge du component partage `partage.seo` devient alors un piege — on ne sait plus,
 * en lisant la base, si ce qu on voit est un choix editorial ou un defaut fossilise
 * d une version anterieure du titre. C est A-07 de `docs/modele-donnees.md`, et c est la
 * raison d etre de ce module : la chaine de repli vit dans le code, pas dans les donnees.
 *
 * Une seule fonction pure, appelee par le layout. Elle prend un CONTEXTE deja resolu
 * (pas d acces au Content Layer, pas d `Astro.url`) et rend la liste des balises a
 * ecrire. C est ce qui la rend testable par `node --test` sans Astro, et c est ce qui
 * permet d exercer la chaine de repli dans les deux sens plutot que de la relire.
 *
 * Trois arbitrages y sont tenus, chacun cite a sa ligne :
 *
 *   - **A-27** — une canonique surchargee qui pointe ailleurs ANNULE la reciprocite
 *     `hreflang` : Google suit la canonique et ignore les alternates. Le cas est
 *     legitime (contenu syndique) mais ne doit pas etre silencieux : on retire les
 *     alternates ET on remonte un avertissement de build.
 *   - **T-06** — les alternates ne sortent que sur une contrepartie EXACTE. Un
 *     `hreflang="en"` pointant une page de rubrique est une erreur SEO franche.
 *   - **A-26** — le `<title>` vise 60 caracteres quand `titre` va jusqu a 120 ; la
 *     `meta description` vise 160 quand `chapo` va jusqu a 300. La troncature est au
 *     build (`src/lib/texte.ts`), jamais en base.
 */
import type { Locale, Seo } from '../domaine.ts';
import type { Contrepartie } from '../routes/contrepartie.ts';
import { tronquerSurUnMot } from '../texte.ts';

/** A-26 : la balise `<title>` vise 60 caracteres, le champ source en autorise 120. */
export const LONGUEUR_TITRE = 60;

/** A-07 : la `meta description` vise 160, le `chapo` source en autorise 300. */
export const LONGUEUR_DESCRIPTION = 160;

/** Le format des images Open Graph generees (§4.5) : 1200x630, le ratio 1.91:1 attendu. */
export const DIMENSION_OG = { largeur: 1200, hauteur: 630 } as const;

/** Les locales Open Graph, qui ne s ecrivent pas comme les codes de langue HTML. */
const LOCALE_OG: Record<Locale, string> = { fr: 'fr_FR', en: 'en_GB' };

export interface ImagePartage {
  /** Absolue (mediatheque Strapi) ou enracinee sur le site (`/og/...`). */
  readonly url: string;
  readonly largeur: number | null;
  readonly hauteur: number | null;
  readonly alternative: string | null;
  readonly mime: string | null;
}

/** Ce qu une page ARTICLE ajoute a Open Graph, et qu aucune autre page ne porte. */
export interface DetailArticle {
  readonly datePublication: string;
  readonly dateModification: string;
  readonly auteur: string;
  readonly rubrique: string;
  readonly etiquettes: readonly string[];
}

export interface ContexteSeo {
  readonly locale: Locale;
  /** Le titre BRUT de la page, avant troncature et avant surcharge. */
  readonly titre: string;
  /** La description BRUTE (chapo, description de rubrique…), avant troncature. */
  readonly description: string | null;
  readonly nomSite: string | null;
  readonly descriptionDefaut: string | null;
  /** La surcharge editoriale `partage.seo`, quand l entite en porte une. */
  readonly seo: Seo | null;
  /** `ECHO_SITE_URL` — l origine publique du site. */
  readonly origine: string;
  /** Le chemin normalise de la page (sans slash final hors racine). */
  readonly chemin: string;
  readonly contrepartie: Contrepartie | null;
  readonly imagePartage: ImagePartage | null;
  readonly article: DetailArticle | null;
  readonly noindex: boolean;
}

export interface Alternate {
  readonly hreflang: string;
  readonly href: string;
}

export interface MetaSeo {
  /** Le contenu de `<title>`, suffixe du nom du site. */
  readonly titre: string;
  readonly description: string | null;
  readonly canonique: string;
  /** Vrai quand `seo.canonique` designe une AUTRE URL que la page (A-27). */
  readonly canoniqueSurchargee: boolean;
  readonly noindex: boolean;
  readonly alternates: readonly Alternate[];
  readonly og: readonly { property: string; content: string }[];
  readonly twitter: readonly { name: string; content: string }[];
  /** Remontes au build par le layout : A-27 exige un avertissement, pas un silence. */
  readonly avertissements: readonly string[];
}

/** Une valeur utile : ni `null`, ni vide, ni faite d espaces. */
function renseignee(valeur: string | null | undefined): string | null {
  if (valeur === null || valeur === undefined) return null;
  const propre = valeur.trim();
  return propre === '' ? null : propre;
}

function absolue(url: string, origine: string): string {
  return new URL(url, origine).href;
}

export function metadonneesSeo(contexte: ContexteSeo): MetaSeo {
  const avertissements: string[] = [];

  // --- titre et description : surcharge, puis repli, puis troncature ---------------
  const titreSource = renseignee(contexte.seo?.metaTitre) ?? contexte.titre;
  const nomSite = renseignee(contexte.nomSite);
  const titreCourt = tronquerSurUnMot(titreSource, LONGUEUR_TITRE);
  const titre = nomSite === null ? titreCourt : `${titreCourt} — ${nomSite}`;

  const descriptionSource =
    renseignee(contexte.seo?.metaDescription) ??
    renseignee(contexte.description) ??
    renseignee(contexte.descriptionDefaut);
  const description =
    descriptionSource === null ? null : tronquerSurUnMot(descriptionSource, LONGUEUR_DESCRIPTION);

  // --- canonique ------------------------------------------------------------------
  const calculee = absolue(contexte.chemin, contexte.origine);
  const surcharge = renseignee(contexte.seo?.canonique);
  const canonique = surcharge ?? calculee;
  const canoniqueSurchargee = surcharge !== null && surcharge !== calculee;
  if (canoniqueSurchargee) {
    avertissements.push(
      `A-27 : la canonique de ${contexte.chemin} pointe « ${surcharge} », une autre URL que la ` +
        'page. Les alternates hreflang sont donc supprimes — Google suit la canonique et les ' +
        'ignorerait, et un jeu d alternates non reciproque est remonte en erreur par la Search Console.',
    );
  }

  // --- hreflang (T-06) -------------------------------------------------------------
  const cible = contexte.contrepartie;
  const alternates: Alternate[] =
    cible !== null && cible.exact && !canoniqueSurchargee
      ? (() => {
          const hrefCible = absolue(cible.chemin, contexte.origine);
          const hrefFr = contexte.locale === 'fr' ? calculee : hrefCible;
          return [
            { hreflang: contexte.locale, href: calculee },
            { hreflang: cible.locale, href: hrefCible },
            { hreflang: 'x-default', href: hrefFr },
          ];
        })()
      : [];

  // --- Open Graph ------------------------------------------------------------------
  const og: { property: string; content: string }[] = [];
  const ajouterOg = (property: string, content: string | null | undefined): void => {
    const valeur = renseignee(content ?? null);
    if (valeur !== null) og.push({ property, content: valeur });
  };

  ajouterOg('og:type', contexte.article === null ? 'website' : 'article');
  ajouterOg('og:site_name', nomSite);
  ajouterOg('og:locale', LOCALE_OG[contexte.locale]);
  if (alternates.length > 0) ajouterOg('og:locale:alternate', LOCALE_OG[cible!.locale]);
  ajouterOg('og:title', titre);
  ajouterOg('og:description', description);
  ajouterOg('og:url', canonique);

  const image = contexte.imagePartage;
  if (image !== null) {
    const urlImage = absolue(image.url, contexte.origine);
    ajouterOg('og:image', urlImage);
    if (image.largeur !== null) ajouterOg('og:image:width', String(image.largeur));
    if (image.hauteur !== null) ajouterOg('og:image:height', String(image.hauteur));
    ajouterOg('og:image:type', image.mime);
    ajouterOg('og:image:alt', image.alternative);
  }

  if (contexte.article !== null) {
    ajouterOg('article:published_time', contexte.article.datePublication);
    ajouterOg('article:modified_time', contexte.article.dateModification);
    ajouterOg('article:author', contexte.article.auteur);
    ajouterOg('article:section', contexte.article.rubrique);
    for (const etiquette of contexte.article.etiquettes) ajouterOg('article:tag', etiquette);
  }

  // --- Twitter Card -----------------------------------------------------------------
  const twitter: { name: string; content: string }[] = [];
  const ajouterTwitter = (name: string, content: string | null | undefined): void => {
    const valeur = renseignee(content ?? null);
    if (valeur !== null) twitter.push({ name, content: valeur });
  };

  /* Pas de `twitter:site` ni de `twitter:creator` : L Echo des Hauts est un media
     FICTIF, il n a pas de compte. Inventer un identifiant ferait pointer la carte vers
     un compte reel appartenant a quelqu un d autre. */
  ajouterTwitter('twitter:card', image === null ? 'summary' : 'summary_large_image');
  ajouterTwitter('twitter:title', titre);
  ajouterTwitter('twitter:description', description);
  if (image !== null) {
    ajouterTwitter('twitter:image', absolue(image.url, contexte.origine));
    ajouterTwitter('twitter:image:alt', image.alternative);
  }

  return {
    titre,
    description,
    canonique,
    canoniqueSurchargee,
    noindex: contexte.noindex,
    alternates,
    og,
    twitter,
    avertissements,
  };
}
