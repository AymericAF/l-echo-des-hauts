/**
 * Le corpus du build : une seule traversee de l API, memorisee, partagee par les six
 * loaders Content Layer.
 *
 * Deux raisons de centraliser plutot que de laisser chaque loader appeler Strapi :
 *   1. le temps de build (§7 : moins de 3 min de bout en bout) — six loaders x deux
 *      locales feraient douze allers-retours la ou deux suffisent par collection ;
 *   2. la COHERENCE, qui ne peut se juger qu en voyant tout le corpus a la fois (voir
 *      la garde ci-dessous).
 *
 * La garde, et pourquoi elle est ecrite ainsi. Au 2026-08-07 la base est vide : le
 * seed n a pas tourne, `GET /api/configuration` rend 404. Un build vert sur zero
 * entree ne prouve rien — mais il ne ment pas non plus, tant que le site produit est
 * visiblement vide. Ce qui mentirait, c est un site GARNI d articles coiffe d un
 * en-tete de remplacement, parce qu il aurait l air fini. D ou la regle :
 *
 *   - base entierement vide      → build autorise, avertissement bruyant ;
 *   - du contenu mais AUCUNE     → build REFUSE : c est une incoherence, pas un etat
 *     entree `Configuration`       de demarrage.
 */
import {
  chargerCollection,
  chargerConfiguration,
  lireConfiguration,
  type Configuration as ConfigurationClient,
} from './client.ts';
import {
  mapperArticle,
  mapperAuteur,
  mapperCategorie,
  mapperConfiguration,
  mapperDossier,
  mapperTag,
} from './mapping.ts';
import type {
  Article,
  Auteur,
  Categorie,
  Configuration,
  Dossier,
  Locale,
  Tag,
} from '../domaine.ts';

/** FR par defaut, EN en miroir (§4.2). Le token de build n a pas acces a `/api/i18n/locales` (403) : la liste vient du modele, pas d une decouverte. */
export const LOCALES: readonly Locale[] = ['fr', 'en'];

export interface EntreeLocalisee<T> {
  /** Cle du store Content Layer : `<locale>:<documentId>` — les localisations d un document PARTAGENT son documentId. */
  id: string;
  locale: Locale;
  valeur: T;
}

export interface Corpus {
  articles: EntreeLocalisee<Article>[];
  auteurs: EntreeLocalisee<Auteur>[];
  categories: EntreeLocalisee<Categorie>[];
  tags: EntreeLocalisee<Tag>[];
  dossiers: EntreeLocalisee<Dossier>[];
  configurations: EntreeLocalisee<Configuration>[];
  /** Aucune entree, nulle part : le seed n a pas encore tourne. */
  baseVide: boolean;
}

let enCours: Promise<Corpus> | null = null;

export function chargerCorpus(): Promise<Corpus> {
  enCours ??= construireCorpus();
  return enCours;
}

async function collecte<T>(
  client: ConfigurationClient,
  nom: 'articles' | 'auteurs' | 'categories' | 'tags' | 'dossiers',
  mapper: (brut: unknown) => T & { documentId: string },
): Promise<EntreeLocalisee<T>[]> {
  const entrees: EntreeLocalisee<T>[] = [];
  for (const locale of LOCALES) {
    const bruts = await chargerCollection(client, nom, locale);
    for (const brut of bruts) {
      const valeur = mapper(brut);
      entrees.push({ id: `${locale}:${valeur.documentId}`, locale, valeur });
    }
  }
  return entrees;
}

async function construireCorpus(): Promise<Corpus> {
  const client = lireConfiguration();

  const [articles, auteurs, categories, tags, dossiers] = await Promise.all([
    collecte(client, 'articles', mapperArticle),
    collecte(client, 'auteurs', mapperAuteur),
    collecte(client, 'categories', mapperCategorie),
    collecte(client, 'tags', mapperTag),
    collecte(client, 'dossiers', mapperDossier),
  ]);

  const configurations: EntreeLocalisee<Configuration>[] = [];
  for (const locale of LOCALES) {
    const brut = await chargerConfiguration(client, locale);
    if (brut === null) continue;
    const valeur = mapperConfiguration(brut);
    configurations.push({ id: locale, locale, valeur });
  }

  const nombreContenus =
    articles.length + auteurs.length + categories.length + tags.length + dossiers.length;
  const baseVide = nombreContenus === 0 && configurations.length === 0;

  if (configurations.length === 0 && nombreContenus > 0) {
    throw new Error(
      `Incoherence : ${nombreContenus} entrees de contenu existent, mais le Single Type ` +
        '`Configuration` n en a aucune. Chaque page lit `nomSite`, `logo`, ' +
        '`descriptionDefaut` et `imagePartageDefaut` (A-31) : construire le site sans eux ' +
        'produirait un site qui a l air fini et qui ne l est pas. Creer l entree ' +
        'Configuration dans Strapi, puis relancer le build.',
    );
  }

  if (baseVide) {
    console.warn(
      '\n⚠  BASE STRAPI VIDE — aucun article, auteur, categorie, tag, dossier, et aucune entree Configuration.\n' +
        '   Le build produit un site SANS CONTENU. Il ne prouve donc RIEN sur le mapping :\n' +
        '   aucune reponse Strapi reelle n a ete traduite. Les tests de mapping, eux, s exercent\n' +
        '   sur des fixtures derivees du schema (npm test).\n' +
        '   Lancer le seed, puis relancer ce build pour que le critere « donnees Strapi reelles » soit exerce.\n',
    );
  }

  return { articles, auteurs, categories, tags, dossiers, configurations, baseVide };
}
