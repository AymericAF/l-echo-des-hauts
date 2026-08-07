/**
 * Le REGISTRE des routes reellement emises par le build (T-04).
 *
 * C est la seule source de verite du lot « pages » : les `getStaticPaths` emettent ce
 * qu il contient, la bascule FR/EN y lit sa contrepartie, les `hreflang` y verifient
 * l existence de leur cible, et `integrations/garde-liens.mjs` confronte apres coup
 * `dist/` a ce meme raisonnement. Une page qui construirait son URL autrement ferait
 * mentir les trois.
 *
 * Deux regles de fond y vivent, et aucune n est deductible du code d une page :
 *
 *   - **Un index dont la liste est vide dans la locale courante n est pas emis**
 *     (`docs/plan-editorial.md` §10.3, en prolongement de T-06). Une rubrique anglaise
 *     sans article traduit ne produit pas une erreur : elle produit une page publiee,
 *     vide, indexable, et comptee dans le « miroir anglais complet » du §4.2. Le seul
 *     endroit ou l on peut le voir, c est ici — a l echelle du corpus entier.
 *   - **Les relations sont localisees d office en Strapi 5** (A-06) : un article EN ne
 *     pointe que des entites EN. Le filtrage par locale est donc structurel, pas une
 *     precaution ; on le rend explicite pour que le jour ou une donnee croisee arrive,
 *     elle soit ignoree plutot que rendue.
 *
 * L accueil et les pages statiques des DEUX locales sont toujours emis, meme si la
 * locale n a aucun article : `/en` est le dernier repli de la bascule (T-06), et un
 * repli qui peut ne pas exister n est pas un repli.
 */
import type { Article, Auteur, Categorie, Dossier, Locale, Localisation, Tag } from '../domaine.ts';
import {
  ARTICLES_PAR_PAGE,
  FAMILLES,
  FAMILLES_PAGINEES,
  PAGES_STATIQUES,
  cheminAccueil,
  cheminArticle,
  cheminIndex,
  cheminStatique,
  type Famille,
} from './chemins.ts';
import { paginer, type Tranche } from './pagination.ts';

/** Les locales du site (§4.2 : FR, plus le miroir anglais). */
export const LOCALES_SITE: readonly Locale[] = ['fr', 'en'];

export interface CorpusRoutes {
  readonly articles: readonly Article[];
  readonly categories: readonly Categorie[];
  readonly tags: readonly Tag[];
  readonly auteurs: readonly Auteur[];
  readonly dossiers: readonly Dossier[];
}

export interface IndexEmis {
  readonly famille: Famille;
  readonly locale: Locale;
  readonly documentId: string;
  readonly slug: string;
  /** Intitule affiche en tete de page : `nom` d une categorie, `titre` d un dossier… */
  readonly titre: string;
  readonly description: string | null;
  readonly localisations: readonly Localisation[];
  readonly pages: readonly Tranche<Article>[];
  /** L entite source, pour ce qu une page d index affiche au-dela de la liste. */
  readonly entite: Categorie | Tag | Auteur | Dossier;
}

export interface Registre {
  readonly chemins: ReadonlySet<string>;
  contient(chemin: string): boolean;
  /** `null` quand l index n est pas emis — l absence EST la reponse (§10.3). */
  index(locale: Locale, famille: Famille, documentId: string): IndexEmis | null;
  readonly indexes: readonly IndexEmis[];
  articles(locale: Locale): readonly Article[];
  articleParSlug(locale: Locale, slug: string): Article | null;
}

/** Ordre total et deterministe (esprit d A-16) : sans cle de departage, la page bouge d un build a l autre. */
function parDateDecroissante(a: Article, b: Article): number {
  return (
    b.datePublication.localeCompare(a.datePublication) || a.documentId.localeCompare(b.documentId)
  );
}

function parDateCroissante(a: Article, b: Article): number {
  return (
    a.datePublication.localeCompare(b.datePublication) || a.documentId.localeCompare(b.documentId)
  );
}

function articlesDeLaLocale(corpus: CorpusRoutes, locale: Locale): Article[] {
  return corpus.articles.filter((entree) => entree.locale === locale).sort(parDateDecroissante);
}

/**
 * Les articles d un dossier suivent l ordre de la SERIE (A-18 : `datePublication`
 * croissante), pas l ordre antichronologique des autres index : un dossier se lit du
 * premier au dernier episode.
 */
function articlesDeDossier(dossier: Dossier, articles: readonly Article[]): Article[] {
  const parId = new Map(articles.map((entree) => [entree.documentId, entree]));
  return dossier.articles
    .map((reference) => parId.get(reference.documentId))
    .filter((entree): entree is Article => entree !== undefined)
    .sort(parDateCroissante);
}

function listeDeFamille(
  famille: Famille,
  entite: Categorie | Tag | Auteur | Dossier,
  articles: readonly Article[],
): Article[] {
  switch (famille) {
    case 'categorie':
      return articles.filter((entree) => entree.categorie.documentId === entite.documentId);
    case 'tag':
      return articles.filter((entree) =>
        entree.tags.some((etiquette) => etiquette.documentId === entite.documentId),
      );
    case 'auteur':
      return articles.filter((entree) => entree.auteur.documentId === entite.documentId);
    case 'dossier':
      return articlesDeDossier(entite as Dossier, articles);
  }
}

function entitesDeFamille(corpus: CorpusRoutes, famille: Famille) {
  switch (famille) {
    case 'categorie':
      return corpus.categories;
    case 'tag':
      return corpus.tags;
    case 'auteur':
      return corpus.auteurs;
    case 'dossier':
      return corpus.dossiers;
  }
}

function titreDe(famille: Famille, entite: Categorie | Tag | Auteur | Dossier): string {
  if (famille === 'dossier') return (entite as Dossier).titre;
  return (entite as Categorie | Tag | Auteur).nom;
}

function descriptionDe(famille: Famille, entite: Categorie | Tag | Auteur | Dossier): string | null {
  if (famille === 'categorie') return (entite as Categorie).description;
  if (famille === 'auteur') return (entite as Auteur).fonction;
  return null;
}

export function construireRegistre(corpus: CorpusRoutes): Registre {
  const chemins = new Set<string>();
  const indexes: IndexEmis[] = [];
  const parLocale = new Map<Locale, Article[]>();

  for (const locale of LOCALES_SITE) {
    // 1. Accueil et pages statiques : toujours emis, y compris sur une locale sans article.
    chemins.add(cheminAccueil(locale));
    for (const nom of PAGES_STATIQUES) chemins.add(cheminStatique(locale, nom));

    // 2. Articles : le slug est celui de SA locale, jamais derive du francais (T-05, piege 1).
    const articles = articlesDeLaLocale(corpus, locale);
    parLocale.set(locale, articles);
    for (const entree of articles) chemins.add(cheminArticle(locale, entree.slug));

    // 3. Index : emis seulement s ils portent au moins un article DANS CETTE LOCALE.
    for (const famille of FAMILLES) {
      for (const entite of entitesDeFamille(corpus, famille)) {
        if (entite.locale !== locale) continue;

        const liste = listeDeFamille(famille, entite, articles);
        const parPage = FAMILLES_PAGINEES.includes(famille) ? ARTICLES_PAR_PAGE : Math.max(liste.length, 1);
        const pages = paginer(liste, parPage);
        if (pages.length === 0) continue; // §10.3 — la regle vit ici, et seulement ici.

        for (const page of pages) chemins.add(cheminIndex(locale, famille, entite.slug, page.numero));

        indexes.push({
          famille,
          locale,
          documentId: entite.documentId,
          slug: entite.slug,
          titre: titreDe(famille, entite),
          description: descriptionDe(famille, entite),
          localisations: entite.localisations,
          pages,
          entite,
        });
      }
    }
  }

  const parCle = new Map(indexes.map((index) => [`${index.locale}|${index.famille}|${index.documentId}`, index]));
  const parSlug = new Map(
    [...parLocale.entries()].flatMap(([locale, articles]) =>
      articles.map((entree) => [`${locale}|${entree.slug}`, entree] as const),
    ),
  );

  return {
    chemins,
    contient: (chemin) => chemins.has(chemin),
    index: (locale, famille, documentId) => parCle.get(`${locale}|${famille}|${documentId}`) ?? null,
    indexes,
    articles: (locale) => parLocale.get(locale) ?? [],
    articleParSlug: (locale, slug) => parSlug.get(`${locale}|${slug}`) ?? null,
  };
}
