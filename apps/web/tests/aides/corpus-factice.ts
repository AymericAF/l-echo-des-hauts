/**
 * Fabrique de corpus de DOMAINE pour les tests de routes.
 *
 * Ce n est PAS une fixture Strapi : `tests/fixtures/*.json` porte la forme brute de
 * l API et sert au harnais de mapping. Ici on part de l autre bout — des entites du
 * domaine deja mappees — parce que le registre des routes, la pagination et la bascule
 * FR/EN ne connaissent que le domaine. Melanger les deux ferait passer un test de
 * routes au rouge pour une raison de mapping, et personne ne saurait laquelle des deux
 * couches a bouge.
 *
 * Tout y est deterministe : aucune date « maintenant », aucun identifiant aleatoire.
 */
import type {
  Article,
  Auteur,
  Categorie,
  Dossier,
  Locale,
  Localisation,
  Media,
  ReferenceArticle,
  ReferenceAuteur,
  ReferenceCategorie,
  ReferenceDossier,
  ReferenceTag,
  Tag,
} from '../../src/lib/domaine.ts';

export const MEDIA: Media = {
  url: '/uploads/factice.jpg',
  alternative: 'Une image de test',
  largeur: 1600,
  hauteur: 900,
  mime: 'image/jpeg',
};

export function localisation(documentId: string, locale: Locale, slug: string): Localisation {
  return { documentId, locale, slug };
}

export function categorie(
  documentId: string,
  locale: Locale,
  nom: string,
  slug: string,
  localisations: readonly Localisation[] = [],
  ordreAffichage = 1,
): Categorie {
  return {
    documentId,
    locale,
    nom,
    slug,
    description: null,
    couleurAccent: null,
    imageHero: null,
    ordreAffichage,
    seo: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    localisations,
  };
}

export function tag(
  documentId: string,
  locale: Locale,
  nom: string,
  slug: string,
  localisations: readonly Localisation[] = [],
): Tag {
  return {
    documentId,
    locale,
    nom,
    slug,
    updatedAt: '2026-01-01T00:00:00.000Z',
    localisations,
  };
}

export function auteur(
  documentId: string,
  locale: Locale,
  nom: string,
  slug: string,
  localisations: readonly Localisation[] = [],
): Auteur {
  return {
    documentId,
    locale,
    nom,
    slug,
    fonction: null,
    bio: null,
    photo: null,
    reseaux: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    localisations,
  };
}

export function dossier(
  documentId: string,
  locale: Locale,
  titre: string,
  slug: string,
  articles: readonly { documentId: string; titre: string; slug: string; datePublication: string }[] = [],
  localisations: readonly Localisation[] = [],
): Dossier {
  return {
    documentId,
    locale,
    titre,
    slug,
    introduction: null,
    imageHero: null,
    articles,
    dateOuverture: '2026-01-01',
    seo: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    localisations,
  };
}

export interface OptionsArticle {
  documentId: string;
  locale: Locale;
  titre: string;
  slug: string;
  categorie: ReferenceCategorie;
  auteur?: ReferenceAuteur;
  tags?: readonly ReferenceTag[];
  dossier?: ReferenceDossier | null;
  articlesLies?: readonly ReferenceArticle[];
  datePublication?: string;
  aLaUne?: boolean;
  localisations?: readonly Localisation[];
}

const AUTEUR_DEFAUT: ReferenceAuteur = {
  documentId: 'aut-defaut',
  nom: 'Auteur de test',
  slug: 'auteur-de-test',
};

export function article(options: OptionsArticle): Article {
  return {
    documentId: options.documentId,
    locale: options.locale,
    titre: options.titre,
    slug: options.slug,
    chapo: `Chapo de ${options.titre}.`,
    contenu: [{ type: 'bloc.texte', contenu: [{ type: 'paragraph', children: [] }] }],
    imageCouverture: MEDIA,
    legendeCouverture: null,
    auteur: options.auteur ?? AUTEUR_DEFAUT,
    categorie: options.categorie,
    tags: options.tags ?? [],
    dossier: options.dossier ?? null,
    articlesLies: options.articlesLies ?? [],
    datePublication: options.datePublication ?? '2026-01-01T00:00:00.000Z',
    aLaUne: options.aLaUne ?? false,
    seo: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    localisations: options.localisations ?? [],
  };
}

export function referenceCategorie(source: Categorie): ReferenceCategorie {
  return {
    documentId: source.documentId,
    nom: source.nom,
    slug: source.slug,
    couleurAccent: source.couleurAccent,
  };
}

export function referenceTag(source: Tag): ReferenceTag {
  return { documentId: source.documentId, nom: source.nom, slug: source.slug };
}

export function referenceAuteur(source: Auteur): ReferenceAuteur {
  return { documentId: source.documentId, nom: source.nom, slug: source.slug };
}

export function referenceDossier(source: Dossier): ReferenceDossier {
  return { documentId: source.documentId, titre: source.titre, slug: source.slug };
}

/**
 * Serie de N articles d une meme categorie, dates decroissantes et distinctes.
 * Sert a exercer les BORNES de pagination : 11, 12, 13 articles.
 */
export function serieArticles(
  nombre: number,
  base: Omit<OptionsArticle, 'documentId' | 'titre' | 'slug'> & { prefixe: string },
): Article[] {
  return Array.from({ length: nombre }, (_, index) => {
    const rang = index + 1;
    const jour = String(28 - (rang % 28)).padStart(2, '0');
    return article({
      ...base,
      documentId: `${base.prefixe}-${String(rang).padStart(3, '0')}`,
      titre: `${base.prefixe} numero ${rang}`,
      slug: `${base.prefixe}-${rang}`,
      // Dates strictement decroissantes pour que l ordre soit total et lisible.
      datePublication: `2026-${String(((rang - 1) % 12) + 1).padStart(2, '0')}-${jour}T08:00:00.000Z`,
    });
  });
}
