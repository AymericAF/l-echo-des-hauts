/**
 * Les requetes REST du build, DECLAREES — une par type de contenu.
 *
 * Contrainte dure de la §1 : populate explicite au build, jamais le joker. Deux
 * raisons, et la seconde est celle qu on oublie : le poids des reponses, et le temps
 * de build (§7 du cahier : moins de 3 minutes de bout en bout, cible de 90 s a 300
 * articles). Le joker ne descend d ailleurs QU AU PREMIER NIVEAU en Strapi 5 : il
 * ramene trop de champs et pas assez de profondeur. Un populate explicite fait
 * l inverse — exactement les champs voulus, a la profondeur voulue.
 *
 * Rien ici n est une chaine de caracteres : ce sont des objets, serialises par
 * `serialiserParametres`. Une requete ecrite a la main ailleurs dans `src/` est
 * refusee par `tests/requete.test.ts`.
 */

/** Une feuille de populate nomme TOUJOURS ses champs — jamais `true`, jamais `'*'`. */
export interface FeuillePopulate {
  fields: string[];
  populate?: Populate;
}

/** Populate d une Dynamic Zone : composant par composant (`on`), jamais en bloc. */
export interface PopulateDynamicZone {
  on: Record<string, FeuillePopulate>;
}

export type Populate = Record<string, FeuillePopulate | PopulateDynamicZone>;

export interface Requete {
  fields: string[];
  populate?: Populate;
  sort?: string[];
  pagination?: { pageSize: number };
  [autre: string]: unknown;
}

/**
 * Champs d un media : ce que le rendu utilise, et rien de plus (pas de `formats`, lourd).
 *
 * `caption` y est demande pour TOUS les medias, pas pour le seul portrait d auteur qui
 * l affiche aujourd hui (§13, point 6b) : il porte le credit et la licence du fichier
 * (§6.5), donc il appartient au media, pas a la page. Le demander au cas par cas ferait
 * du populate une liste des ecrans qui l affichent — une liste a diverger.
 */
const CHAMPS_MEDIA = ['url', 'alternativeText', 'caption', 'width', 'height', 'mime'];
const MEDIA: FeuillePopulate = { fields: CHAMPS_MEDIA };

const SEO: FeuillePopulate = {
  fields: ['metaTitre', 'metaDescription', 'noindex', 'canonique'],
  populate: { imagePartage: MEDIA },
};

const LIEN_SOCIAL: FeuillePopulate = { fields: ['plateforme', 'url'] };

/**
 * La contrepartie d une locale : on demande son `slug`, JAMAIS on ne le derive du
 * francais. Un `uid` est localise d office en Strapi 5 (docs/modele-donnees.md, A-06),
 * et T-05 nomme ce piege « numero un » : `/en/article/` + slug francais est une 404.
 */
const LOCALISATIONS: FeuillePopulate = { fields: ['locale', 'slug'] };

/** Les 8 blocs du §3.6, chacun avec ses seuls champs. */
const CONTENU: PopulateDynamicZone = {
  on: {
    'bloc.texte': { fields: ['contenu'] },
    'bloc.citation': { fields: ['texte', 'auteurCitation', 'source'] },
    'bloc.galerie': { fields: ['legende', 'disposition'], populate: { images: MEDIA } },
    'bloc.encadre': { fields: ['titre', 'contenu', 'variante'] },
    'bloc.video': { fields: ['url', 'legende'], populate: { vignette: MEDIA } },
    /* `alternative` : la surcharge LOCALISEE de l alternative textuelle. Un champ non
       demande n arrive JAMAIS, et son absence ne se voit pas — le repli retomberait en
       silence sur l alternative francaise du media. */
    'bloc.image-legendee': {
      fields: ['legende', 'alternative', 'credit'],
      populate: { image: MEDIA },
    },
    'bloc.separateur': { fields: ['style'] },
    // Ce bloc n a aucun champ scalaire : `fields: ['id']` demande donc le strict minimum
    // plutot que de laisser Strapi decider — c est la meme discipline, pas une exception.
    'bloc.chiffres-cles': {
      fields: ['id'],
      populate: { entrees: { fields: ['valeur', 'unite', 'libelle'] } },
    },
  },
};

export const REQUETES = {
  articles: {
    fields: [
      'titre',
      'slug',
      'chapo',
      'legendeCouverture',
      'alternativeCouverture',
      'datePublication',
      'aLaUne',
      'locale',
      'updatedAt',
      'publishedAt',
    ],
    populate: {
      imageCouverture: MEDIA,
      auteur: { fields: ['nom', 'slug'] },
      categorie: { fields: ['nom', 'slug', 'couleurAccent'] },
      tags: { fields: ['nom', 'slug'] },
      dossier: { fields: ['titre', 'slug'] },
      articlesLies: {
        /* Une carte d article lie rend un `alt` (`PageArticle.astro`) : sans la
           surcharge ici, ces cartes-la resteraient francaises sur une page anglaise. */
        fields: ['titre', 'slug', 'chapo', 'alternativeCouverture'],
        populate: { imageCouverture: MEDIA },
      },
      contenu: CONTENU,
      seo: SEO,
      localizations: LOCALISATIONS,
    },
    sort: ['datePublication:desc'],
    pagination: { pageSize: 50 },
  },

  auteurs: {
    fields: ['nom', 'slug', 'fonction', 'bio', 'alternativePhoto', 'locale', 'updatedAt'],
    populate: {
      photo: MEDIA,
      reseaux: LIEN_SOCIAL,
      localizations: LOCALISATIONS,
    },
    sort: ['nom:asc'],
    pagination: { pageSize: 50 },
  },

  categories: {
    fields: [
      'nom',
      'slug',
      'description',
      'couleurAccent',
      'ordreAffichage',
      'alternativeHero',
      'locale',
      'updatedAt',
    ],
    populate: {
      imageHero: MEDIA,
      seo: SEO,
      localizations: LOCALISATIONS,
    },
    // Tri total et deterministe (A-16) : sans cle de departage, le menu bouge d un build a l autre.
    sort: ['ordreAffichage:asc', 'nom:asc'],
    pagination: { pageSize: 50 },
  },

  tags: {
    fields: ['nom', 'slug', 'locale', 'updatedAt'],
    populate: { localizations: LOCALISATIONS },
    sort: ['nom:asc'],
    pagination: { pageSize: 100 },
  },

  dossiers: {
    fields: [
      'titre',
      'slug',
      'introduction',
      'dateOuverture',
      'alternativeHero',
      'locale',
      'updatedAt',
    ],
    populate: {
      imageHero: MEDIA,
      // Tri par datePublication croissante (A-18) : fait au mapping, la relation n etant pas triable ici.
      articles: { fields: ['titre', 'slug', 'datePublication'] },
      seo: SEO,
      localizations: LOCALISATIONS,
    },
    sort: ['dateOuverture:desc'],
    pagination: { pageSize: 50 },
  },

  configuration: {
    fields: [
      'nomSite',
      'baseline',
      'descriptionDefaut',
      'texteFooter',
      'mentionsLegales',
      'alternativeLogo',
      'alternativePartageDefaut',
      'locale',
      'updatedAt',
    ],
    populate: {
      logo: MEDIA,
      logoSombre: MEDIA,
      favicon: MEDIA,
      imagePartageDefaut: MEDIA,
      reseaux: LIEN_SOCIAL,
    },
  },
} satisfies Record<string, Requete>;

export type NomRequete = keyof typeof REQUETES;

/**
 * Serialise en notation a crochets, celle qu attend le parseur de Strapi.
 * Ecrite ici plutot qu importee (`qs`) pour garder le depot public sans dependance
 * de plus pour trente lignes — et pour qu elle soit testee.
 */
export function serialiserParametres(parametres: Record<string, unknown>): string {
  const morceaux: string[] = [];

  const parcourir = (prefixe: string, valeur: unknown): void => {
    if (valeur === undefined) return;
    if (Array.isArray(valeur)) {
      valeur.forEach((element, index) => parcourir(`${prefixe}[${index}]`, element));
      return;
    }
    if (valeur !== null && typeof valeur === 'object') {
      for (const [cle, sousValeur] of Object.entries(valeur as Record<string, unknown>)) {
        parcourir(`${prefixe}[${cle}]`, sousValeur);
      }
      return;
    }
    morceaux.push(`${encodeURIComponent(prefixe)}=${encodeURIComponent(String(valeur))}`);
  };

  for (const [cle, valeur] of Object.entries(parametres)) parcourir(cle, valeur);
  return morceaux.join('&');
}

export function construireUrl(
  baseUrl: string,
  chemin: string,
  parametres: Record<string, unknown>,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const requete = serialiserParametres(parametres);
  return `${base}/api/${chemin}${requete ? `?${requete}` : ''}`;
}
