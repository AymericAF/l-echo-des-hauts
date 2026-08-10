/**
 * Entites du DOMAINE. Aucune forme Strapi ici : ni `data`, ni `attributes`, ni
 * `documentId` imbrique, ni `__component`. C est la frontiere que §4.3 du cahier
 * demande et que R4 du brief justifie — quand Strapi change, seul
 * `src/lib/strapi/mapping.ts` bouge, les pages ne bougent pas.
 *
 * Point d attention i18n, etabli le 2026-08-07 (docs/modele-donnees.md, encadre A-06) :
 * Strapi 5 localise d office toute relation et tout champ `uid`. Un `slug` est donc
 * TOUJOURS celui d une locale donnee, jamais partage — d ou `locale` sur chaque entite
 * et `localisations` qui porte le slug propre de la contrepartie.
 */

export type Locale = 'fr' | 'en';

export interface Media {
  readonly url: string;
  /** `alternativeText` natif de la Media Library — jamais une legende (A-04). */
  readonly alternative: string | null;
  /**
   * `caption` NATIF de la Media Library — le porteur du credit et de la licence
   * (plan editorial §6.5). Il voyage avec le fichier, donc il reste juste partout ou
   * l image est reutilisee ; c est la raison pour laquelle `Auteur` n a pas de champ
   * `credit` (§13, point 6b, option (ii) tranchee le 2026-08-03 : deux porteurs d un
   * meme credit finissent par diverger).
   *
   * Optionnel ICI, exige AILLEURS : la garde de build du §6.7, condition 3, refuse un
   * media au `caption` vide. Le front n a donc pas a se substituer a elle.
   */
  readonly legende: string | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
  readonly mime: string | null;
}

export const PLATEFORMES = [
  'linkedin',
  'x',
  'bluesky',
  'mastodon',
  'instagram',
  'facebook',
  'youtube',
  'site',
] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export interface LienSocial {
  readonly plateforme: Plateforme;
  readonly url: string;
}

/** Surcharge editoriale. Tout y est optionnel : les defauts se calculent au build (A-07). */
export interface Seo {
  readonly metaTitre: string | null;
  readonly metaDescription: string | null;
  readonly imagePartage: Media | null;
  readonly noindex: boolean;
  readonly canonique: string | null;
}

/** Un noeud de champ « Rich text (Blocks) » de Strapi 5 (ni Markdown, ni HTML). */
export interface NoeudRichTexte {
  readonly type: string;
  readonly [autre: string]: unknown;
}

/** La contrepartie d une entite dans une autre locale : son slug lui appartient. */
export interface Localisation {
  readonly documentId: string;
  readonly locale: Locale;
  readonly slug: string;
}

// --- references (ce qu une relation peuplee ramene, pas l entite entiere) ---

export interface ReferenceAuteur {
  readonly documentId: string;
  readonly nom: string;
  readonly slug: string;
}

export interface ReferenceCategorie {
  readonly documentId: string;
  readonly nom: string;
  readonly slug: string;
  readonly couleurAccent: string | null;
}

export interface ReferenceTag {
  readonly documentId: string;
  readonly nom: string;
  readonly slug: string;
}

export interface ReferenceDossier {
  readonly documentId: string;
  readonly titre: string;
  readonly slug: string;
}

export interface ReferenceArticle {
  readonly documentId: string;
  readonly titre: string;
  readonly slug: string;
  readonly chapo: string;
  readonly imageCouverture: Media;
}

export interface ReferenceArticleDeDossier {
  readonly documentId: string;
  readonly titre: string;
  readonly slug: string;
  readonly datePublication: string;
}

// --- les 8 blocs de la Dynamic Zone ---------------------------------------

export interface BlocTexte {
  readonly type: 'bloc.texte';
  readonly contenu: readonly NoeudRichTexte[];
}

export interface BlocCitation {
  readonly type: 'bloc.citation';
  readonly texte: string;
  readonly auteurCitation: string | null;
  readonly source: string | null;
}

export type DispositionGalerie = 'grille' | 'carrousel' | 'pleine-largeur';

export interface BlocGalerie {
  readonly type: 'bloc.galerie';
  readonly images: readonly Media[];
  readonly legende: string | null;
  readonly disposition: DispositionGalerie;
}

export type VarianteEncadre = 'info' | 'alerte' | 'complement';

export interface BlocEncadre {
  readonly type: 'bloc.encadre';
  readonly titre: string | null;
  readonly contenu: readonly NoeudRichTexte[];
  readonly variante: VarianteEncadre;
}

export interface BlocVideo {
  readonly type: 'bloc.video';
  readonly url: string;
  readonly legende: string | null;
  /** Source prioritaire de la vignette (T-03) ; vide, elle se derive de l url au build. */
  readonly vignette: Media | null;
}

export interface BlocImageLegendee {
  readonly type: 'bloc.image-legendee';
  readonly image: Media;
  readonly legende: string | null;
  readonly credit: string | null;
}

export type StyleSeparateur = 'ligne' | 'points' | 'espace';

export interface BlocSeparateur {
  readonly type: 'bloc.separateur';
  readonly style: StyleSeparateur;
}

export interface ChiffreCle {
  readonly valeur: string;
  readonly unite: string | null;
  readonly libelle: string;
}

export interface BlocChiffresCles {
  readonly type: 'bloc.chiffres-cles';
  readonly entrees: readonly ChiffreCle[];
}

export type Bloc =
  | BlocTexte
  | BlocCitation
  | BlocGalerie
  | BlocEncadre
  | BlocVideo
  | BlocImageLegendee
  | BlocSeparateur
  | BlocChiffresCles;

// --- entites ---------------------------------------------------------------

export interface Article {
  readonly documentId: string;
  readonly locale: Locale;
  readonly titre: string;
  readonly slug: string;
  readonly chapo: string;
  readonly contenu: readonly Bloc[];
  readonly imageCouverture: Media;
  readonly legendeCouverture: string | null;
  readonly auteur: ReferenceAuteur;
  readonly categorie: ReferenceCategorie;
  readonly tags: readonly ReferenceTag[];
  readonly dossier: ReferenceDossier | null;
  /** Tronque a 3 au build (A-13) ; le repli par categorie commune se calcule ailleurs. */
  readonly articlesLies: readonly ReferenceArticle[];
  /** Date EDITORIALE : affichage, tri, RSS, `datePublished` (A-14). */
  readonly datePublication: string;
  readonly aLaUne: boolean;
  readonly seo: Seo | null;
  /** Systeme : visibilite seule, jamais affichee (A-14). */
  readonly publishedAt: string;
  /** Systeme : alimente `dateModified` (A-14). */
  readonly updatedAt: string;
  readonly localisations: readonly Localisation[];
}

export interface Auteur {
  readonly documentId: string;
  readonly locale: Locale;
  readonly nom: string;
  readonly slug: string;
  readonly fonction: string | null;
  readonly bio: readonly NoeudRichTexte[] | null;
  readonly photo: Media | null;
  readonly reseaux: readonly LienSocial[];
  readonly updatedAt: string;
  readonly localisations: readonly Localisation[];
}

export interface Categorie {
  readonly documentId: string;
  readonly locale: Locale;
  readonly nom: string;
  readonly slug: string;
  readonly description: string | null;
  readonly couleurAccent: string | null;
  readonly imageHero: Media | null;
  readonly ordreAffichage: number;
  readonly seo: Seo | null;
  readonly updatedAt: string;
  readonly localisations: readonly Localisation[];
}

export interface Tag {
  readonly documentId: string;
  readonly locale: Locale;
  readonly nom: string;
  readonly slug: string;
  readonly updatedAt: string;
  readonly localisations: readonly Localisation[];
}

export interface Dossier {
  readonly documentId: string;
  readonly locale: Locale;
  readonly titre: string;
  readonly slug: string;
  readonly introduction: readonly NoeudRichTexte[] | null;
  readonly imageHero: Media | null;
  /** Tries par `datePublication` croissante (A-18). */
  readonly articles: readonly ReferenceArticleDeDossier[];
  readonly dateOuverture: string | null;
  readonly seo: Seo | null;
  readonly updatedAt: string;
  readonly localisations: readonly Localisation[];
}

export interface Configuration {
  readonly documentId: string;
  readonly locale: Locale;
  readonly nomSite: string;
  readonly baseline: string | null;
  readonly logo: Media;
  readonly logoSombre: Media | null;
  readonly favicon: Media | null;
  readonly descriptionDefaut: string;
  readonly imagePartageDefaut: Media;
  readonly reseaux: readonly LienSocial[];
  readonly texteFooter: readonly NoeudRichTexte[] | null;
  readonly mentionsLegales: readonly NoeudRichTexte[];
  readonly updatedAt: string;
}
