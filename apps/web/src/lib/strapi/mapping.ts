/**
 * Traduction des reponses Strapi en entites du domaine — l unique endroit du front
 * qui connaisse la forme d une reponse REST.
 *
 * C est la parade au risque R4 du brief (« Strapi bouge pendant le projet »), et le
 * brief precise a quelle condition elle vaut quelque chose : « encore faut-il qu il
 * soit ecrit AVANT, pas apres ». Ecrit apres, un mapping se contente de refleter ce
 * que le front consomme deja ; ecrit avant, il pose le contrat et casse quand la
 * source s en ecarte.
 *
 * Deux invariants, tenus par `lecture.ts` :
 *   1. une cle demandee par le populate DOIT exister — son absence leve ;
 *   2. `null` est une valeur legitime pour un optionnel, jamais pour un requis.
 *
 * i18n : rien ici ne derive un slug d une autre locale. Strapi 5 localise d office
 * toute relation et tout `uid` (docs/modele-donnees.md, encadre A-06) ; les
 * `localisations` portent donc le slug PROPRE de la contrepartie.
 */
import type {
  Article,
  Auteur,
  Bloc,
  Categorie,
  ChiffreCle,
  Configuration,
  Dossier,
  LienSocial,
  Localisation,
  Locale,
  Media,
  NoeudRichTexte,
  Plateforme,
  ReferenceArticle,
  ReferenceArticleDeDossier,
  ReferenceAuteur,
  ReferenceCategorie,
  ReferenceDossier,
  ReferenceTag,
  Seo,
  Tag,
} from '../domaine.ts';
import { PLATEFORMES } from '../domaine.ts';
import { ValeurInattendueError } from './erreurs.ts';
import {
  blocksOptionnel,
  blocksRequis,
  booleenRequis,
  enumRequis,
  entierRequis,
  listeOuVide,
  listeRequise,
  nombreOptionnel,
  objetOptionnel,
  objetRequis,
  texteOptionnel,
  texteRequis,
} from './lecture.ts';

const LOCALES: readonly Locale[] = ['fr', 'en'];

/** Plafond du champ `articlesLies` (A-13). Le lifecycle Strapi le tient a l ecriture ; ici c est la troncature defensive au build, pour les entrees creees par l API ou le seed. */
const MAX_ARTICLES_LIES = 3;

const REGEX_COULEUR_HEX = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// briques communes
// ---------------------------------------------------------------------------

function locale(source: unknown, chemin: string): Locale {
  return enumRequis(source, 'locale', chemin, LOCALES);
}

function documentId(source: unknown, chemin: string): string {
  return texteRequis(source, 'documentId', chemin);
}

function media(brut: unknown, chemin: string): Media {
  return {
    url: texteRequis(brut, 'url', chemin),
    alternative: texteOptionnel(brut, 'alternativeText', chemin),
    largeur: nombreOptionnel(brut, 'width', chemin),
    hauteur: nombreOptionnel(brut, 'height', chemin),
    mime: texteOptionnel(brut, 'mime', chemin),
  };
}

function mediaRequis(source: unknown, cle: string, chemin: string): Media {
  return media(objetRequis(source, cle, chemin), `${chemin}.${cle}`);
}

function mediaOptionnel(source: unknown, cle: string, chemin: string): Media | null {
  const brut = objetOptionnel(source, cle, chemin);
  return brut === null ? null : media(brut, `${chemin}.${cle}`);
}

function richTexte(noeuds: unknown[]): NoeudRichTexte[] {
  return noeuds as NoeudRichTexte[];
}

function seo(source: unknown, chemin: string): Seo | null {
  const brut = objetOptionnel(source, 'seo', chemin);
  if (brut === null) return null;
  const ici = `${chemin}.seo`;
  return {
    metaTitre: texteOptionnel(brut, 'metaTitre', ici),
    metaDescription: texteOptionnel(brut, 'metaDescription', ici),
    imagePartage: mediaOptionnel(brut, 'imagePartage', ici),
    noindex: booleenRequis(brut, 'noindex', ici),
    canonique: texteOptionnel(brut, 'canonique', ici),
  };
}

function lienSocial(brut: unknown, chemin: string): LienSocial {
  const plateforme = enumRequis(brut, 'plateforme', chemin, PLATEFORMES) as Plateforme;
  return { plateforme, url: texteRequis(brut, 'url', chemin) };
}

function reseaux(source: unknown, chemin: string): LienSocial[] {
  return listeOuVide(source, 'reseaux', chemin).map((brut, index) =>
    lienSocial(brut, `${chemin}.reseaux[${index}]`),
  );
}

function localisations(source: unknown, chemin: string): Localisation[] {
  return listeOuVide(source, 'localizations', chemin).map((brut, index) => {
    const ici = `${chemin}.localizations[${index}]`;
    return {
      documentId: documentId(brut, ici),
      locale: locale(brut, ici),
      // Le slug de la contrepartie se LIT ; il ne se derive jamais du slug courant (T-05, piege 1).
      slug: texteRequis(brut, 'slug', ici),
    };
  });
}

function couleurAccent(source: unknown, chemin: string): string | null {
  const valeur = texteOptionnel(source, 'couleurAccent', chemin);
  if (valeur !== null && !REGEX_COULEUR_HEX.test(valeur)) {
    throw new ValeurInattendueError(
      `${chemin}.couleurAccent`,
      `« ${valeur} » ne respecte pas ^#[0-9a-fA-F]{6}$ (A-15 : ni forme courte, ni rgba)`,
    );
  }
  return valeur;
}

// ---------------------------------------------------------------------------
// references (relations peuplees)
// ---------------------------------------------------------------------------

function referenceAuteur(source: unknown, chemin: string): ReferenceAuteur {
  const brut = objetRequis(source, 'auteur', chemin);
  const ici = `${chemin}.auteur`;
  return {
    documentId: documentId(brut, ici),
    nom: texteRequis(brut, 'nom', ici),
    slug: texteRequis(brut, 'slug', ici),
  };
}

function referenceCategorie(source: unknown, chemin: string): ReferenceCategorie {
  const brut = objetRequis(source, 'categorie', chemin);
  const ici = `${chemin}.categorie`;
  return {
    documentId: documentId(brut, ici),
    nom: texteRequis(brut, 'nom', ici),
    slug: texteRequis(brut, 'slug', ici),
    couleurAccent: couleurAccent(brut, ici),
  };
}

function referencesTags(source: unknown, chemin: string): ReferenceTag[] {
  return listeOuVide(source, 'tags', chemin).map((brut, index) => {
    const ici = `${chemin}.tags[${index}]`;
    return {
      documentId: documentId(brut, ici),
      nom: texteRequis(brut, 'nom', ici),
      slug: texteRequis(brut, 'slug', ici),
    };
  });
}

function referenceDossier(source: unknown, chemin: string): ReferenceDossier | null {
  const brut = objetOptionnel(source, 'dossier', chemin);
  if (brut === null) return null;
  const ici = `${chemin}.dossier`;
  return {
    documentId: documentId(brut, ici),
    titre: texteRequis(brut, 'titre', ici),
    slug: texteRequis(brut, 'slug', ici),
  };
}

function articlesLies(source: unknown, chemin: string): ReferenceArticle[] {
  return listeOuVide(source, 'articlesLies', chemin)
    .slice(0, MAX_ARTICLES_LIES)
    .map((brut, index) => {
      const ici = `${chemin}.articlesLies[${index}]`;
      return {
        documentId: documentId(brut, ici),
        titre: texteRequis(brut, 'titre', ici),
        slug: texteRequis(brut, 'slug', ici),
        chapo: texteRequis(brut, 'chapo', ici),
        imageCouverture: mediaRequis(brut, 'imageCouverture', ici),
      };
    });
}

// ---------------------------------------------------------------------------
// Dynamic Zone : les 8 blocs du §3.6
// ---------------------------------------------------------------------------

function bloc(brut: unknown, chemin: string): Bloc {
  const composant = texteRequis(brut, '__component', chemin);

  switch (composant) {
    case 'bloc.texte':
      return { type: 'bloc.texte', contenu: richTexte(blocksRequis(brut, 'contenu', chemin)) };

    case 'bloc.citation':
      return {
        type: 'bloc.citation',
        texte: texteRequis(brut, 'texte', chemin),
        auteurCitation: texteOptionnel(brut, 'auteurCitation', chemin),
        source: texteOptionnel(brut, 'source', chemin),
      };

    case 'bloc.galerie':
      return {
        type: 'bloc.galerie',
        images: listeRequise(brut, 'images', chemin).map((image, index) =>
          media(image, `${chemin}.images[${index}]`),
        ),
        legende: texteOptionnel(brut, 'legende', chemin),
        disposition: enumRequis(brut, 'disposition', chemin, ['grille', 'carrousel', 'pleine-largeur']),
      };

    case 'bloc.encadre':
      return {
        type: 'bloc.encadre',
        titre: texteOptionnel(brut, 'titre', chemin),
        contenu: richTexte(blocksRequis(brut, 'contenu', chemin)),
        variante: enumRequis(brut, 'variante', chemin, ['info', 'alerte', 'complement']),
      };

    case 'bloc.video':
      return {
        type: 'bloc.video',
        url: texteRequis(brut, 'url', chemin),
        legende: texteOptionnel(brut, 'legende', chemin),
        vignette: mediaOptionnel(brut, 'vignette', chemin),
      };

    case 'bloc.image-legendee':
      return {
        type: 'bloc.image-legendee',
        image: mediaRequis(brut, 'image', chemin),
        legende: texteOptionnel(brut, 'legende', chemin),
        credit: texteOptionnel(brut, 'credit', chemin),
      };

    case 'bloc.separateur':
      return {
        type: 'bloc.separateur',
        style: enumRequis(brut, 'style', chemin, ['ligne', 'points', 'espace']),
      };

    case 'bloc.chiffres-cles':
      return {
        type: 'bloc.chiffres-cles',
        entrees: listeRequise(brut, 'entrees', chemin).map(
          (entree, index): ChiffreCle => {
            const ici = `${chemin}.entrees[${index}]`;
            return {
              valeur: texteRequis(entree, 'valeur', ici),
              unite: texteOptionnel(entree, 'unite', ici),
              libelle: texteRequis(entree, 'libelle', ici),
            };
          },
        ),
      };

    default:
      // Un composant ajoute cote Strapi sans son rendu cote front est une rupture,
      // pas un cas a ignorer : §8.3 dit qu on n ajoute pas de composant.
      throw new ValeurInattendueError(
        `${chemin}.__component`,
        `« ${composant} » n appartient pas aux 8 blocs du §3.6`,
      );
  }
}

// ---------------------------------------------------------------------------
// entites
// ---------------------------------------------------------------------------

export function mapperArticle(brut: unknown): Article {
  const chemin = 'article';
  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    titre: texteRequis(brut, 'titre', chemin),
    slug: texteRequis(brut, 'slug', chemin),
    chapo: texteRequis(brut, 'chapo', chemin),
    contenu: listeRequise(brut, 'contenu', chemin).map((element, index) =>
      bloc(element, `${chemin}.contenu[${index}]`),
    ),
    imageCouverture: mediaRequis(brut, 'imageCouverture', chemin),
    legendeCouverture: texteOptionnel(brut, 'legendeCouverture', chemin),
    auteur: referenceAuteur(brut, chemin),
    categorie: referenceCategorie(brut, chemin),
    tags: referencesTags(brut, chemin),
    dossier: referenceDossier(brut, chemin),
    articlesLies: articlesLies(brut, chemin),
    datePublication: texteRequis(brut, 'datePublication', chemin),
    aLaUne: booleenRequis(brut, 'aLaUne', chemin),
    seo: seo(brut, chemin),
    publishedAt: texteRequis(brut, 'publishedAt', chemin),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
    localisations: localisations(brut, chemin),
  };
}

export function mapperAuteur(brut: unknown): Auteur {
  const chemin = 'auteur';
  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    nom: texteRequis(brut, 'nom', chemin),
    slug: texteRequis(brut, 'slug', chemin),
    fonction: texteOptionnel(brut, 'fonction', chemin),
    bio: blocksOptionnel(brut, 'bio', chemin) as NoeudRichTexte[] | null,
    photo: mediaOptionnel(brut, 'photo', chemin),
    reseaux: reseaux(brut, chemin),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
    localisations: localisations(brut, chemin),
  };
}

export function mapperCategorie(brut: unknown): Categorie {
  const chemin = 'categorie';
  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    nom: texteRequis(brut, 'nom', chemin),
    slug: texteRequis(brut, 'slug', chemin),
    description: texteOptionnel(brut, 'description', chemin),
    couleurAccent: couleurAccent(brut, chemin),
    imageHero: mediaOptionnel(brut, 'imageHero', chemin),
    ordreAffichage: entierRequis(brut, 'ordreAffichage', chemin),
    seo: seo(brut, chemin),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
    localisations: localisations(brut, chemin),
  };
}

export function mapperTag(brut: unknown): Tag {
  const chemin = 'tag';
  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    nom: texteRequis(brut, 'nom', chemin),
    slug: texteRequis(brut, 'slug', chemin),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
    localisations: localisations(brut, chemin),
  };
}

export function mapperDossier(brut: unknown): Dossier {
  const chemin = 'dossier';
  const articles = listeOuVide(brut, 'articles', chemin)
    .map((element, index): ReferenceArticleDeDossier => {
      const ici = `${chemin}.articles[${index}]`;
      return {
        documentId: documentId(element, ici),
        titre: texteRequis(element, 'titre', ici),
        slug: texteRequis(element, 'slug', ici),
        datePublication: texteRequis(element, 'datePublication', ici),
      };
    })
    // A-18 : une serie se lit du premier au dernier episode, pas comme un fil d actualite.
    .sort((a, b) => a.datePublication.localeCompare(b.datePublication));

  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    titre: texteRequis(brut, 'titre', chemin),
    slug: texteRequis(brut, 'slug', chemin),
    introduction: blocksOptionnel(brut, 'introduction', chemin) as NoeudRichTexte[] | null,
    imageHero: mediaOptionnel(brut, 'imageHero', chemin),
    articles,
    dateOuverture: texteOptionnel(brut, 'dateOuverture', chemin),
    seo: seo(brut, chemin),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
    localisations: localisations(brut, chemin),
  };
}

export function mapperConfiguration(brut: unknown): Configuration {
  const chemin = 'configuration';
  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    nomSite: texteRequis(brut, 'nomSite', chemin),
    baseline: texteOptionnel(brut, 'baseline', chemin),
    logo: mediaRequis(brut, 'logo', chemin),
    logoSombre: mediaOptionnel(brut, 'logoSombre', chemin),
    favicon: mediaOptionnel(brut, 'favicon', chemin),
    descriptionDefaut: texteRequis(brut, 'descriptionDefaut', chemin),
    imagePartageDefaut: mediaRequis(brut, 'imagePartageDefaut', chemin),
    reseaux: reseaux(brut, chemin),
    texteFooter: blocksOptionnel(brut, 'texteFooter', chemin) as NoeudRichTexte[] | null,
    mentionsLegales: richTexte(blocksRequis(brut, 'mentionsLegales', chemin)),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
  };
}
