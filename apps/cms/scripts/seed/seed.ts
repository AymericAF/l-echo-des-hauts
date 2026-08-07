/**
 * Orchestration du seed : le corpus versionne -> l'API Strapi.
 *
 * Deux proprietes portent tout le reste :
 *
 * 1. **Idempotence par le slug.** Chaque famille est d'abord LUE (par locale),
 *    indexee sur son slug, puis ecrite en creation ou en mise a jour. Une
 *    seconde execution ne cree rien.
 *
 * 2. **Les relations sont ecrites sur la localisation EN, jamais heritees.**
 *    Strapi 5 localise d'office toute relation et tout champ `uid` (A-06) :
 *    rien ne se recopie du FR vers le EN. Une localisation EN dont les relations
 *    pointent encore les entrees FR ne leve AUCUNE erreur — elle produit un site
 *    anglais aux rubriques francaises. C'est le mode d'echec que le controle 12
 *    du plan editorial existe pour attraper, et il se joue ICI.
 */
import type { ClientStrapi, Parametres } from './client.ts';
import type { Corpus, ArticleLocale } from './corpus.ts';
import { indexerParSlug, decider } from './rapprochement.ts';

export type Comptage = {
  crees: Record<string, number>;
  misAJour: Record<string, number>;
};

export type Journal = (ligne: string) => void;

const LOCALES = ['fr', 'en'] as const;
type Locale = (typeof LOCALES)[number];

/** Remplace tout `{ __media: "cle" }` par l'id Strapi du media televerse. */
function resoudreMedias<T>(valeur: T, ids: Map<string, number>): T {
  if (valeur == null) return valeur;
  if (Array.isArray(valeur)) return valeur.map((v) => resoudreMedias(v, ids)) as unknown as T;
  if (typeof valeur === 'object') {
    const objet = valeur as Record<string, any>;
    if (typeof objet.__media === 'string') {
      const id = ids.get(objet.__media);
      if (id === undefined) throw new Error(`media non televerse : ${objet.__media}`);
      return id as unknown as T;
    }
    const sortie: Record<string, any> = {};
    for (const [cle, v] of Object.entries(objet)) {
      if (v === undefined) continue;
      sortie[cle] = resoudreMedias(v, ids);
    }
    return sortie as unknown as T;
  }
  return valeur;
}

export async function executerSeed(
  client: ClientStrapi,
  corpus: Corpus,
  journal: Journal = () => {}
): Promise<Comptage> {
  const crees: Record<string, number> = {};
  const misAJour: Record<string, number> = {};
  const compter = (registre: Record<string, number>, cle: string) => {
    registre[cle] = (registre[cle] ?? 0) + 1;
  };

  /* ---------------------------------------------------------------- */
  /* 1. Medias — rapprochement sur le nom de fichier                    */
  /* ---------------------------------------------------------------- */

  const idsMedia = new Map<string, number>();
  for (const media of corpus.medias) {
    const existants = await client.listerMedias(media.nom);
    if (existants.length > 0) {
      idsMedia.set(media.cle, existants[0].id);
      compter(misAJour, 'media');
    } else {
      const televerse = await client.televerser(media);
      idsMedia.set(media.cle, televerse.id);
      compter(crees, 'media');
      journal(`media televerse : ${media.cle}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 2. Familles simples — FR d'abord, puis la localisation EN          */
  /* ---------------------------------------------------------------- */

  /**
   * Ecrit une famille pour une locale et rend, par cle FR, le documentId.
   * `documentIdConnus` porte le resultat du passage FR : une localisation ne
   * se cree jamais ex nihilo, elle s'ajoute au document deja existant.
   */
  async function ecrireFamille<E extends { fr: { slug: string }; en?: { slug: string } }>(opts: {
    nom: string;
    plural: string;
    entrees: E[];
    locale: Locale;
    documentIdConnus?: Map<string, string>;
    corpsDe: (entree: E, locale: Locale) => Record<string, any>;
    params?: Parametres;
  }): Promise<Map<string, string>> {
    const { nom, plural, entrees, locale, documentIdConnus, corpsDe, params = {} } = opts;
    const existants = await client.listerTout(plural, { locale, ...params });
    const index = indexerParSlug(existants);
    const documentIds = new Map<string, string>();

    for (const entree of entrees) {
      const local = entree[locale];
      if (!local) continue;
      const cleFr = entree.fr.slug;
      const data = corpsDe(entree, locale);
      const dejaConnu = documentIdConnus?.get(cleFr);

      if (dejaConnu) {
        // Locale secondaire : on ecrit SUR le document existant. C'est ce
        // `?locale=en` qui cree la localisation, et rien d'autre.
        const existeDeja = index.has(local.slug);
        await client.mettreAJour(plural, dejaConnu, data, { locale, ...params });
        compter(existeDeja ? misAJour : crees, `${nom}:${locale}`);
        documentIds.set(cleFr, dejaConnu);
        continue;
      }

      const decision = decider(index, local.slug);
      if (decision.action === 'creer') {
        const cree = await client.creer(plural, data, { locale, ...params });
        compter(crees, `${nom}:${locale}`);
        documentIds.set(cleFr, cree.documentId);
        journal(`${nom} cree (${locale}) : ${local.slug}`);
      } else {
        await client.mettreAJour(plural, decision.documentId, data, { locale, ...params });
        compter(misAJour, `${nom}:${locale}`);
        documentIds.set(cleFr, decision.documentId);
      }
    }
    return documentIds;
  }

  /* --- categories --- */
  const idsCategorie = await ecrireFamille({
    nom: 'categorie',
    plural: 'categories',
    entrees: corpus.categories,
    locale: 'fr',
    corpsDe: (c, l) => ({
      nom: c[l]!.nom,
      slug: c[l]!.slug,
      description: c[l]!.description,
      couleurAccent: c.couleurAccent,
      ordreAffichage: c.ordreAffichage,
      imageHero: c.imageHero ? idsMedia.get(c.imageHero) : undefined,
    }),
  });
  await ecrireFamille({
    nom: 'categorie',
    plural: 'categories',
    entrees: corpus.categories,
    locale: 'en',
    documentIdConnus: idsCategorie,
    corpsDe: (c, l) => ({ nom: c[l]!.nom, slug: c[l]!.slug, description: c[l]!.description }),
  });

  /* --- tags --- */
  const idsTag = await ecrireFamille({
    nom: 'tag',
    plural: 'tags',
    entrees: corpus.tags,
    locale: 'fr',
    corpsDe: (t, l) => ({ nom: t[l]!.nom, slug: t[l]!.slug }),
  });
  await ecrireFamille({
    nom: 'tag',
    plural: 'tags',
    entrees: corpus.tags,
    locale: 'en',
    documentIdConnus: idsTag,
    corpsDe: (t, l) => ({ nom: t[l]!.nom, slug: t[l]!.slug }),
  });

  /* --- auteurs --- */
  const idsAuteur = await ecrireFamille({
    nom: 'auteur',
    plural: 'auteurs',
    entrees: corpus.auteurs,
    locale: 'fr',
    corpsDe: (a, l) => ({
      nom: a.nom,
      slug: a[l]!.slug,
      fonction: a[l]!.fonction,
      bio: a[l]!.bio,
      photo: a.photo ? idsMedia.get(a.photo) : undefined,
      reseaux: a.reseaux,
    }),
  });
  await ecrireFamille({
    nom: 'auteur',
    plural: 'auteurs',
    entrees: corpus.auteurs,
    locale: 'en',
    documentIdConnus: idsAuteur,
    corpsDe: (a, l) => ({ slug: a[l]!.slug, fonction: a[l]!.fonction, bio: a[l]!.bio }),
  });

  /* --- dossiers --- */
  const idsDossier = await ecrireFamille({
    nom: 'dossier',
    plural: 'dossiers',
    entrees: corpus.dossiers,
    locale: 'fr',
    corpsDe: (d, l) => ({
      titre: d[l]!.titre,
      slug: d[l]!.slug,
      introduction: d[l]!.introduction,
      dateOuverture: d.dateOuverture,
      imageHero: d.imageHero ? idsMedia.get(d.imageHero) : undefined,
    }),
  });
  await ecrireFamille({
    nom: 'dossier',
    plural: 'dossiers',
    entrees: corpus.dossiers,
    locale: 'en',
    documentIdConnus: idsDossier,
    corpsDe: (d, l) => ({ titre: d[l]!.titre, slug: d[l]!.slug, introduction: d[l]!.introduction }),
  });

  /* ---------------------------------------------------------------- */
  /* 3. Articles                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Le corps d'un article, relations comprises.
   *
   * Les relations sont passees par `documentId` : un document porte le meme
   * `documentId` dans toutes ses locales, et Strapi 5 en resout la localisation
   * correspondant a l'entree ecrite. C'est exactement ce que le controle 12 (b)
   * verifie ensuite sur la base peuplee — on ne le suppose pas.
   */
  const corpsArticle = (art: ArticleLocale) => ({
    titre: art.titre,
    slug: art.slug,
    chapo: art.chapo,
    contenu: resoudreMedias(art.contenu, idsMedia),
    imageCouverture: idsMedia.get(art.imageCouverture),
    legendeCouverture: art.legendeCouverture,
    auteur: idsAuteur.get(art.auteur),
    categorie: idsCategorie.get(art.categorie),
    tags: art.tags.map((t) => idsTag.get(t)).filter(Boolean),
    dossier: art.dossier ? idsDossier.get(art.dossier) : undefined,
    datePublication: art.datePublication,
    aLaUne: art.aLaUne,
  });

  const paramsArticle: Parametres = { status: 'published' };
  const idsArticle = await ecrireFamille({
    nom: 'article',
    plural: 'articles',
    entrees: corpus.articles as any,
    locale: 'fr',
    corpsDe: (a: any, l) => corpsArticle(a[l]),
    params: paramsArticle,
  });
  await ecrireFamille({
    nom: 'article',
    plural: 'articles',
    entrees: corpus.articles as any,
    locale: 'en',
    documentIdConnus: idsArticle,
    corpsDe: (a: any, l) => corpsArticle(a[l]),
    params: paramsArticle,
  });

  // Seconde passe : `articlesLies` ne peut se poser qu'une fois tous les
  // articles ecrits — c'est une relation d'un article vers un autre.
  const codeVersDocumentId = new Map<string, string>();
  for (const a of corpus.articles) {
    const id = idsArticle.get(a.fr.slug);
    if (id) codeVersDocumentId.set(a.code, id);
  }
  for (const locale of LOCALES) {
    for (const a of corpus.articles) {
      const art = a[locale];
      if (!art || art.articlesLies.length === 0) continue;
      const documentId = codeVersDocumentId.get(a.code);
      if (!documentId) continue;
      await client.mettreAJour(
        'articles',
        documentId,
        { articlesLies: art.articlesLies.map((c) => codeVersDocumentId.get(c)).filter(Boolean) },
        { locale, ...paramsArticle }
      );
    }
  }

  /* ---------------------------------------------------------------- */
  /* 4. Single type Configuration                                       */
  /* ---------------------------------------------------------------- */

  const conf = corpus.configuration;
  const mediasConfig = {
    logo: idsMedia.get(conf.logo),
    logoSombre: conf.logoSombre ? idsMedia.get(conf.logoSombre) : undefined,
    favicon: conf.favicon ? idsMedia.get(conf.favicon) : undefined,
    imagePartageDefaut: idsMedia.get(conf.imagePartageDefaut),
    reseaux: conf.reseaux,
  };
  for (const locale of LOCALES) {
    const local = conf[locale];
    if (!local) continue;
    const existant = await client.lireSingle('configuration', { locale });
    await client.majSingle(
      'configuration',
      {
        nomSite: local.nomSite,
        baseline: local.baseline,
        descriptionDefaut: local.descriptionDefaut,
        texteFooter: local.texteFooter,
        mentionsLegales: local.mentionsLegales,
        ...(locale === 'fr' ? mediasConfig : { reseaux: conf.reseaux }),
      },
      { locale }
    );
    compter(existant ? misAJour : crees, `configuration:${locale}`);
  }

  return { crees, misAJour };
}
