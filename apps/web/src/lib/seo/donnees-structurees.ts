/**
 * Les donnees structurees du §5.1 — les CINQ types, CALCULES AU BUILD.
 *
 * §5.1 du cahier, mot pour mot : « Article sur les pages article, avec `author`,
 * `datePublished`, `dateModified`, `image`, `publisher`. BreadcrumbList sur toutes les
 * pages profondes. Person sur les pages auteur. WebSite avec SearchAction sur l accueil.
 * CollectionPage sur les pages categorie et dossier. »
 *
 * RIEN DE CE QUI SUIT N EST STOCKE EN BASE, et c est le point de vigilance de tout le
 * lot (A-07). Une valeur SEO pre-remplie par un lifecycle Strapi se fige au premier
 * enregistrement : le jour ou le titre change, le graphe continue d annoncer l ancien, et
 * personne ne peut plus dire en lisant la base si ce qu il voit est un choix editorial ou
 * le fossile d une version anterieure. La surcharge `partage.seo` devient alors un piege
 * plutot qu un outil. Le graphe se recalcule donc a chaque build, ici, a partir du
 * contenu — exactement comme `metadonnees.ts` pour le `<head>`.
 *
 * UNE FONCTION PURE, sur un contexte deja resolu : pas d acces au Content Layer, pas
 * d `Astro.url`, pas de `getEntry`. C est ce qui la rend exercable par `node --test` sans
 * Astro, et donc ce qui permet de verifier ce qui sort sur CHAQUE famille de page plutot
 * que de le relire. Le meme decoupage que `metadonnees.ts`, `sitemap.ts` et `flux.ts`.
 *
 * CE QU ELLE NE PROUVE PAS. Qu un noeud soit calcule ne dit pas qu il est SERVI : c est
 * le controle 8 de `scripts/verifier-seo.mjs` qui confronte `dist/` au critere du §1
 * (« 100 % des pages indexables portent un JSON-LD valide »), et lui seul verrait un
 * layout qui oublie d appeler cette fonction.
 */
import type { Locale } from '../domaine.ts';
import { prefixeLocale } from '../routes/chemins.ts';
import { tronquerSurUnMot } from '../texte.ts';

/**
 * Le `headline` d un Article vise 110 caracteres.
 *
 * Ce n est pas la meme borne que le `<title>` (60, A-26) ni que le champ source (120) :
 * c est celle de la documentation des resultats enrichis, au-dela de laquelle Google
 * IGNORE la propriete au lieu de la tronquer. Un titre de 118 caracteres produirait donc
 * un Article sans titre — l echec le plus silencieux du lot, puisque le graphe reste
 * parfaitement valide.
 */
export const LONGUEUR_HEADLINE = 110;

/**
 * Le chemin du formulaire de recherche, cible du `SearchAction`.
 *
 * IL VIT ICI ET NON DANS `chemins.ts`, deliberement. `chemins.ts` fabrique les URL que le
 * build EMET, et `/recherche` releve du lot Pagefind (§5.4) : l y declarer laisserait
 * croire au registre qu une route existe. La consequence est ecrite plutot que tue : tant
 * que ce lot n est pas livre, le `SearchAction` de l accueil designe une page que `dist/`
 * ne contient pas. C est le §5.1 qui l exige sur l accueil, et un `SearchAction` absent
 * serait un manquement au cahier ; un `SearchAction` vers une page a venir n en est pas
 * un pour le test des resultats enrichis, qui valide la forme de l action.
 */
export const CHEMIN_RECHERCHE = '/recherche';

/** Le parametre de requete du formulaire, fixe par la convention de `SearchAction`. */
const PARAMETRE_RECHERCHE = 'q';

export interface ImageJsonLd {
  /** ABSOLUE : un graphe se lit hors de la page qui le porte. */
  readonly url: string;
  readonly largeur: number | null;
  readonly hauteur: number | null;
}

export interface EtapeFilAriane {
  readonly nom: string;
  /** ABSOLUE, et elle doit resoudre : un fil qui pointe une page absente est une erreur. */
  readonly url: string;
}

/**
 * Ce que la page EST, du point de vue du §5.1 — et rien d autre.
 *
 * `'aucun'` n est pas un trou : c est le cas EXPLICITE des pages profondes que le §5.1 ne
 * nomme pas (etiquette, pages statiques). Elles portent leur fil d Ariane, ce qui suffit
 * au critere « 100 % des pages indexables portent un JSON-LD valide » sans inventer un
 * type que le cahier ne demande pas. Le perimetre se pointe, il ne se devine pas.
 */
export type SujetJsonLd =
  | { readonly genre: 'accueil' }
  | {
      readonly genre: 'article';
      /** Le titre de l ARTICLE, brut — jamais le `<title>` suffixe du nom du site. */
      readonly titre: string;
      readonly datePublication: string;
      readonly dateModification: string;
      readonly image: ImageJsonLd | null;
      readonly auteur: { readonly nom: string; readonly url: string | null };
      readonly rubrique: string | null;
      readonly etiquettes: readonly string[];
    }
  | { readonly genre: 'collection' }
  | {
      readonly genre: 'auteur';
      readonly fonction: string | null;
      readonly portrait: ImageJsonLd | null;
      readonly reseaux: readonly string[];
    }
  | { readonly genre: 'aucun' };

export interface ContexteJsonLd {
  readonly locale: Locale;
  /** `ECHO_SITE_URL`, sans slash final — la meme que celle des canoniques. */
  readonly origine: string;
  /** L URL absolue de la page courante, telle que la canonique la declare. */
  readonly canonique: string;
  /** Le titre AFFICHE de la page (`<h1>` / nom de l index), avant suffixe. */
  readonly titre: string;
  readonly description: string | null;
  readonly nomSite: string | null;
  readonly logo: ImageJsonLd | null;
  /** Vide sur l accueil : « BreadcrumbList sur toutes les pages PROFONDES ». */
  readonly filAriane: readonly EtapeFilAriane[];
  readonly sujet: SujetJsonLd;
}

export interface GrapheJsonLd {
  readonly '@context': string;
  readonly '@graph': readonly Record<string, unknown>[];
}

/** Une valeur utile : ni `null`, ni vide, ni faite d espaces. */
function renseignee(valeur: string | null | undefined): string | null {
  if (valeur === null || valeur === undefined) return null;
  const propre = valeur.trim();
  return propre === '' ? null : propre;
}

/**
 * Assemble un noeud en ECARTANT les proprietes vides.
 *
 * Une cle a `null` ou a `[]` dans un graphe n est pas neutre : elle AFFIRME que
 * l information existe et ne vaut rien. Le test des resultats enrichis la remonte, et un
 * `jobTitle: null` sur un auteur sans fonction est une erreur qu on ne se serait pas
 * infligee en n ecrivant pas la cle.
 */
function noeud(entrees: Record<string, unknown>): Record<string, unknown> {
  const propre: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(entrees)) {
    if (valeur === null || valeur === undefined) continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    propre[cle] = valeur;
  }
  return propre;
}

function imageObject(image: ImageJsonLd | null): Record<string, unknown> | null {
  if (image === null) return null;
  return noeud({
    '@type': 'ImageObject',
    url: image.url,
    width: image.largeur,
    height: image.hauteur,
  });
}

/** L URL de l accueil du site, dans la forme que la canonique de l accueil declare. */
function urlAccueil(origine: string): string {
  return `${origine.replace(/\/+$/, '')}/`;
}

/**
 * Les seuls liens qu un `sameAs` a le droit de porter : ceux qui designent la personne
 * AILLEURS QUE SUR CE SITE.
 *
 * LE DEFAUT DU 2026-08-11 (tache 6e8578be), releve sur la production. Les cinq auteurs
 * portent dans `reseaux` l URL de leur propre page — un choix EDITORIAL assume et ecrit
 * (§ `reseaux` de `docs/plan-editorial.md`), qui vaut pour la nav et pour elle seule.
 * Verse tel quel dans `sameAs`, il produisait `sameAs[0] === url` sur les dix pages
 * auteur : une declaration d identite circulaire, qui n apprend rien a personne.
 *
 * La regle etait ecrite juste en dessous, en commentaire — et un commentaire ne tient
 * rien. Elle est ici, et elle juge la DONNEE plutot que l intention.
 *
 * Deux pieges, tous deux couverts par un test :
 *
 *  1. Comparer a la CANONIQUE ne suffit pas. `Auteur.reseaux` est NON localise (A-06),
 *     donc la page `/en/auteur/<slug>` porte l URL FRANCAISE : elle differe de sa
 *     canonique tout en restant une page de ce site. La reference est donc l ORIGINE.
 *  2. Un `startsWith` sur l origine avalerait `https://echo.ayfiweb.fr.exemple.test/…`,
 *     qui est un hote TIERS, et effacerait un vrai profil externe. On compare des
 *     origines resolues, jamais des chaines.
 *
 * Un lien relatif n a pas d origine propre : il designe forcement ce site, donc il sort.
 */
function profilsExternes(reseaux: readonly string[], origine: string): string[] {
  let racine: URL;
  try {
    racine = new URL(origine);
  } catch {
    /* Sans origine lisible, rien ne peut etre declare interne : on ne SUPPRIME pas sur
       une reference qu on n a pas su lire. Laisser passer est le defaut recuperable ;
       vider `sameAs` par accident ne se verrait nulle part. */
    return [...reseaux];
  }
  return reseaux.filter((lien) => {
    let cible: URL;
    try {
      cible = new URL(lien, racine);
    } catch {
      /* Ni une URL absolue ni un chemin resolvable — ce n est pas un profil. */
      return false;
    }
    /* `new URL('/auteur/x', racine)` prend l origine de `racine` : le relatif sort ici. */
    return cible.origin !== racine.origin;
  });
}

/** L identifiant de l editeur — un seul pour tout le site, cite par chaque Article. */
function idOrganisation(origine: string): string {
  return `${origine.replace(/\/+$/, '')}/#organisation`;
}

function organisation(contexte: ContexteJsonLd): Record<string, unknown> | null {
  const nom = renseignee(contexte.nomSite);
  if (nom === null) return null;
  return noeud({
    '@type': 'Organization',
    '@id': idOrganisation(contexte.origine),
    name: nom,
    url: urlAccueil(contexte.origine),
    logo: imageObject(contexte.logo),
  });
}

/**
 * Le fil d Ariane — `null` en dessous de deux etapes.
 *
 * Un fil a une seule entree ne guide personne et n a pas de sens pour un moteur : il
 * decrit un chemin sans trajet. Chaque `ListItem` porte son `item`, y compris le dernier :
 * la propriete est facultative sur la derniere marche, mais l omettre fait dependre le
 * verdict d une regle de plus.
 */
function filAriane(etapes: readonly EtapeFilAriane[]): Record<string, unknown> | null {
  if (etapes.length < 2) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: etapes.map((etape, rang) => ({
      '@type': 'ListItem',
      position: rang + 1,
      name: etape.nom,
      item: etape.url,
    })),
  };
}

/** Type 1 — `WebSite` + `SearchAction`, sur l accueil et nulle part ailleurs (§5.1). */
function siteWeb(contexte: ContexteJsonLd): Record<string, unknown> {
  /* Le formulaire de CHAQUE locale, jamais celui du francais pour les deux : c est le
     meme defaut qu une contrepartie fabriquee par prefixage (T-04), invisible tant que
     les deux chemins se ressemblent. */
  const cible =
    `${contexte.origine.replace(/\/+$/, '')}${prefixeLocale(contexte.locale)}${CHEMIN_RECHERCHE}` +
    `?${PARAMETRE_RECHERCHE}={search_term_string}`;

  return noeud({
    '@type': 'WebSite',
    url: urlAccueil(contexte.origine),
    name: renseignee(contexte.nomSite) ?? renseignee(contexte.titre),
    description: renseignee(contexte.description),
    inLanguage: contexte.locale,
    publisher: renseignee(contexte.nomSite) === null ? null : { '@id': idOrganisation(contexte.origine) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: cible },
      'query-input': `required name=search_term_string`,
    },
  });
}

/** Type 2 — `Article`, avec les cinq proprietes que le §5.1 nomme. */
function article(
  contexte: ContexteJsonLd,
  sujet: Extract<SujetJsonLd, { genre: 'article' }>,
): Record<string, unknown> {
  return noeud({
    '@type': 'Article',
    '@id': `${contexte.canonique}#article`,
    headline: tronquerSurUnMot(sujet.titre, LONGUEUR_HEADLINE),
    description: renseignee(contexte.description),
    url: contexte.canonique,
    mainEntityOfPage: { '@type': 'WebPage', '@id': contexte.canonique },
    inLanguage: contexte.locale,
    datePublished: sujet.datePublication,
    dateModified: sujet.dateModification,
    image: imageObject(sujet.image),
    author: noeud({ '@type': 'Person', name: sujet.auteur.nom, url: sujet.auteur.url }),
    publisher:
      renseignee(contexte.nomSite) === null ? null : { '@id': idOrganisation(contexte.origine) },
    articleSection: renseignee(sujet.rubrique),
    keywords: [...sujet.etiquettes],
  });
}

/** Type 4 — `Person`, sur les pages auteur. */
function personne(
  contexte: ContexteJsonLd,
  sujet: Extract<SujetJsonLd, { genre: 'auteur' }>,
): Record<string, unknown> {
  return noeud({
    '@type': 'Person',
    '@id': `${contexte.canonique}#personne`,
    name: contexte.titre,
    url: contexte.canonique,
    jobTitle: renseignee(sujet.fonction),
    image: imageObject(sujet.portrait),
    /* `sameAs` porte les profils EXTERNES de la personne. Les liens de reseaux du modele
       ne le sont PAS tous — les cinq auteurs y portent leur propre page (§ `reseaux` du
       plan editorial) —, et un lien interne s y glisse comme une affirmation fausse.
       `profilsExternes` ecarte ce qui designe ce site ; `noeud` omet la cle si rien ne
       reste, plutot que d ecrire un `sameAs: []` qui affirmerait un vide. */
    sameAs: profilsExternes(sujet.reseaux, contexte.origine),
    mainEntityOfPage: { '@type': 'WebPage', '@id': contexte.canonique },
  });
}

/** Type 5 — `CollectionPage`, sur les pages categorie et dossier. */
function pageDeCollection(contexte: ContexteJsonLd): Record<string, unknown> {
  return noeud({
    '@type': 'CollectionPage',
    '@id': contexte.canonique,
    url: contexte.canonique,
    name: contexte.titre,
    description: renseignee(contexte.description),
    inLanguage: contexte.locale,
  });
}

/**
 * Le graphe complet d une page — ou `null` quand il n y a rien a declarer.
 *
 * `null` plutot qu un `@graph` vide : un bloc `{"@graph":[]}` servi sur chaque page serait
 * valide, inerte et sans aucune information — le genre de sortie qui rend un controle vert
 * sans rien prouver.
 */
export function donneesStructurees(contexte: ContexteJsonLd): GrapheJsonLd | null {
  const noeuds: Record<string, unknown>[] = [];
  const editeur = organisation(contexte);

  switch (contexte.sujet.genre) {
    case 'accueil':
      noeuds.push(siteWeb(contexte));
      if (editeur !== null) noeuds.push(editeur);
      break;
    case 'article':
      noeuds.push(article(contexte, contexte.sujet));
      if (editeur !== null) noeuds.push(editeur);
      break;
    case 'auteur':
      noeuds.push(personne(contexte, contexte.sujet));
      break;
    case 'collection':
      noeuds.push(pageDeCollection(contexte));
      break;
    case 'aucun':
      break;
  }

  const fil = filAriane(contexte.filAriane);
  if (fil !== null) noeuds.push(fil);

  if (noeuds.length === 0) return null;
  return { '@context': 'https://schema.org', '@graph': noeuds };
}

/**
 * Le graphe, en texte pret a poser DANS une balise `<script type="application/ld+json">`.
 *
 * L ECHAPPEMENT N EST PAS COSMETIQUE, et c est la seule faille propre au JSON-LD. Les
 * valeurs du graphe viennent de la base, donc d une saisie : un titre qui contient
 * litteralement `</script>` ferme la balise pour l analyseur du navigateur, et tout ce qui
 * suit redevient du HTML — donc du JavaScript executable, sur un site qui en interdit.
 * `JSON.stringify` n echappe PAS `<`, parce que c est un caractere parfaitement legal en
 * JSON : c est a l ecrivain du HTML de s en charger.
 *
 * On echappe donc `<`, `>` et `&` en sequences `\uXXXX`, qui sont du JSON valide et que
 * `JSON.parse` restitue a l identique — l information n est pas perdue, elle est rendue
 * inoffensive. U+2028 et U+2029 suivent, par principe : legaux en JSON, illegaux en
 * litteral de chaine JavaScript, ils cassent tout code qui rembarquerait cette sortie.
 *
 * La garde T-09 attraperait le resultat au build, puisqu elle exige un contenu PARSABLE
 * et qu une balise fermee trop tot rend le JSON tronque. Mieux vaut que le cas ne se
 * produise pas : une garde qui rougit sur une saisie legitime finit desactivee.
 */
export function serialiserJsonLd(graphe: GrapheJsonLd): string {
  return JSON.stringify(graphe)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
