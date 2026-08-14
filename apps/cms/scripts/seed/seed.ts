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
 *
 * 3. **On n'ecrit QUE ce qui differe.** L'idempotence par le slug portait sur
 *    les DOCUMENTS, jamais sur les EVENEMENTS : chaque article etait reecrit en
 *    `?status=published`, Strapi 5 le REPUBLIAIT inchange, et le webhook
 *    `publish_to_coolify` sortait un deploiement par publication — 69 requetes,
 *    26 deploiements en serie le 2026-08-10. Le corps attendu est desormais
 *    compare a l'entree deja lue (`difference.ts`), et l'ecriture est SAUTEE
 *    quand rien ne differe. Toute incertitude fait reecrire, jamais sauter.
 */
import type { ClientStrapi, Parametres } from './client.ts';
import type { Corpus, ArticleLocale, SeoCorpus } from './corpus.ts';
import { indexerParSlug, decider } from './rapprochement.ts';
import {
  comparerCorps,
  parametresPopulate,
  type Nature,
  type Natures,
  type SlugAttendu,
} from './difference.ts';

export type Comptage = {
  crees: Record<string, number>;
  misAJour: Record<string, number>;
  /**
   * Les entrees SAUTEES, parce que la base porte deja le corps attendu.
   *
   * Un troisieme registre plutot qu'une ligne rangee en `misAJour` : le
   * comptage doit rester honnete. C'est le motif exact du commentaire des
   * medias — une ecriture qui n'a pas eu lieu n'est pas une mise a jour.
   */
  inchanges: Record<string, number>;
};

export type Journal = (ligne: string) => void;

/**
 * Ce qu'un passage de famille rend : les `documentId` par cle FR, et les
 * entrees LUES par slug. Les secondes servent la passe `articlesLies`, qui
 * ecrivait jusqu'ici sans jamais regarder ce qui etait deja pose.
 */
type ResultatFamille = { documentIds: Map<string, string>; lus: Map<string, any> };

const LOCALES = ['fr', 'en'] as const;
type Locale = (typeof LOCALES)[number];

/* ------------------------------------------------------------------ */
/* LES NATURES DES CHAMPS ECRITS — declaration unique                   */
/*                                                                      */
/* Elles servent DEUX fois : a batir le `populate` de la relecture, et a */
/* comparer. Une seconde liste ecrite a la main divergerait ; celle-ci   */
/* se derive. Un champ ecrit qui n'est pas declare ici fait REECRIRE     */
/* (cf. `difference.ts`), donc `tests/seed-idempotence.test.ts` rougit : */
/* l'oubli se paie en bruit, jamais en silence.                         */
/* ------------------------------------------------------------------ */

const NATURES_BLOCS: Record<string, Natures> = {
  'bloc.texte': { contenu: 'scalaire' },
  'bloc.citation': { texte: 'scalaire', auteurCitation: 'scalaire', source: 'scalaire' },
  'bloc.galerie': { images: 'medias', legende: 'scalaire', disposition: 'scalaire' },
  'bloc.encadre': { titre: 'scalaire', contenu: 'scalaire', variante: 'scalaire' },
  'bloc.video': { url: 'scalaire', legende: 'scalaire', vignette: 'media' },
  'bloc.image-legendee': { image: 'media', legende: 'scalaire', credit: 'scalaire' },
  'bloc.separateur': { style: 'scalaire' },
  'bloc.chiffres-cles': {
    entrees: { repete: { valeur: 'scalaire', unite: 'scalaire', libelle: 'scalaire' } },
  },
};

/**
 * Le composant `partage.seo`, ECRIT PAR LE SEED sur article, categorie et dossier.
 *
 * POURQUOI IL EST DECLARE, ET CE QUE SON ABSENCE COUTAIT. `comparerCorps` reecrit par prudence
 * tout champ dont la nature est inconnue — un fail-safe voulu. Tant que `seo` n etait pas
 * declare, la SECONDE passe du seed reecrivait donc TOUS les articles, toutes les categories et
 * tous les dossiers : le seed differentiel cessait d etre differentiel, en silence. Constate a la
 * fusion du 2026-08-14 (tache `fb7e972e`), ou six tests de `seed-difference` sont passes au rouge
 * — deux branches vertes separement, rouges ensemble.
 *
 * `repete` convient a un composant UNIQUE : les deux cotes passent par `enTableau`, qui enveloppe
 * un objet seul dans un tableau d un element. Et le `populate` se DERIVE de ces natures, donc
 * declarer le champ ici suffit aussi a le faire relire — sans quoi la comparaison le lirait
 * absent, donc different, donc reecriture perpetuelle.
 */
const NATURE_SEO: Nature = {
  repete: {
    metaTitre: 'scalaire',
    metaDescription: 'scalaire',
    noindex: 'scalaire',
    canonique: 'scalaire',
    imagePartage: 'media',
  },
};

export const NATURES: Record<string, Natures> = {
  'categorie:fr': {
    seo: NATURE_SEO,
    nom: 'scalaire',
    slug: 'scalaire',
    description: 'scalaire',
    couleurAccent: 'scalaire',
    ordreAffichage: 'scalaire',
    imageHero: 'media',
  },
  'categorie:en': { seo: NATURE_SEO, nom: 'scalaire', slug: 'scalaire', description: 'scalaire' },
  'tag:fr': { nom: 'scalaire', slug: 'scalaire' },
  'tag:en': { nom: 'scalaire', slug: 'scalaire' },
  'auteur:fr': {
    nom: 'scalaire',
    slug: 'scalaire',
    fonction: 'scalaire',
    bio: 'scalaire',
    photo: 'media',
    reseaux: { repete: { plateforme: 'scalaire', url: 'scalaire' } },
  },
  'auteur:en': { slug: 'scalaire', fonction: 'scalaire', bio: 'scalaire' },
  'dossier:fr': {
    seo: NATURE_SEO,
    titre: 'scalaire',
    slug: 'scalaire',
    introduction: 'scalaire',
    dateOuverture: 'date',
    imageHero: 'media',
  },
  'dossier:en': { seo: NATURE_SEO, titre: 'scalaire', slug: 'scalaire', introduction: 'scalaire' },
  configuration: {
    nomSite: 'scalaire',
    baseline: 'scalaire',
    descriptionDefaut: 'scalaire',
    texteFooter: 'scalaire',
    mentionsLegales: 'scalaire',
    logo: 'media',
    logoSombre: 'media',
    favicon: 'media',
    imagePartageDefaut: 'media',
    reseaux: { repete: { plateforme: 'scalaire', url: 'scalaire' } },
  },
  article: {
    seo: NATURE_SEO,
    titre: 'scalaire',
    slug: 'scalaire',
    chapo: 'scalaire',
    contenu: { zone: NATURES_BLOCS },
    imageCouverture: 'media',
    legendeCouverture: 'scalaire',
    auteur: 'relation',
    categorie: 'relation',
    tags: 'relations',
    dossier: 'relation',
    articlesLies: 'relations',
    datePublication: 'date',
    aLaUne: 'scalaire',
  },
};

const NATURES_CONFIGURATION: Natures = NATURES.configuration;

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

/**
 * Le composant `partage.seo` tel que Strapi l attend, ou `undefined`.
 *
 * Deux details qui ne se voient pas a la relecture, et qui echouent en silence :
 *
 *   - `imagePartage` porte une CLE DE MANIFESTE dans le corpus et doit partir en
 *     ID de mediatheque. Envoyee telle quelle, Strapi la refuse — ou l ignore.
 *   - une surcharge dont AUCUN champ n est renseigne ne doit pas partir du tout.
 *     Ecrire un composant vide creerait en base la ligne que A-07 interdit
 *     precisement : celle qui fait croire, plus tard, a un choix editorial.
 */
function corpsSeo(
  seo: SeoCorpus | undefined,
  idsMedia: Map<string, number>
): Record<string, any> | undefined {
  if (seo === undefined) return undefined;

  const corps = {
    metaTitre: seo.metaTitre,
    metaDescription: seo.metaDescription,
    noindex: seo.noindex,
    canonique: seo.canonique,
    imagePartage: seo.imagePartage ? idsMedia.get(seo.imagePartage) : undefined,
  };

  return Object.values(corps).every((v) => v === undefined) ? undefined : corps;
}

export async function executerSeed(
  client: ClientStrapi,
  corpus: Corpus,
  journal: Journal = () => {}
): Promise<Comptage> {
  const crees: Record<string, number> = {};
  const misAJour: Record<string, number> = {};
  const inchanges: Record<string, number> = {};
  const compter = (registre: Record<string, number>, cle: string) => {
    registre[cle] = (registre[cle] ?? 0) + 1;
  };

  /**
   * Le slug ATTENDU d'un document, par locale — la seule cle qui distingue une
   * localisation d'une autre (`documentId` est commun a toutes, A-06). Il se
   * remplit famille par famille, avant que les articles n'en aient besoin.
   */
  const slugsParDocument = new Map<string, Partial<Record<Locale, string>>>();
  const enregistrerSlugs = (
    documentId: string | undefined,
    slugs: Partial<Record<Locale, string>>
  ) => {
    if (!documentId) return;
    slugsParDocument.set(documentId, { ...slugsParDocument.get(documentId), ...slugs });
  };
  const slugPour =
    (locale: Locale): SlugAttendu =>
    (documentId) =>
      slugsParDocument.get(documentId)?.[locale];

  /* ---------------------------------------------------------------- */
  /* 1. Medias — rapprochement sur le nom de fichier                    */
  /* ---------------------------------------------------------------- */

  const idsMedia = new Map<string, number>();
  for (const media of corpus.medias) {
    const existants = await client.listerMedias(media.nom);
    if (existants.length > 0) {
      const enBase = existants[0];
      idsMedia.set(media.cle, enBase.id);
      // Le rapprochement retenait l'id et s'arretait la : un fichier deja
      // televerse gardait SES metadonnees pour toujours, et corriger le
      // manifeste ne changeait rien a ce qui est PUBLIE. Or le `caption` est,
      // depuis le 2026-08-10, la ligne de credit rendue sous le portrait.
      // On ne reecrit que ce qui differe : une ecriture systematique ferait
      // 94 requetes a chaque passage et ferait mentir le comptage.
      if (
        enBase.alternativeText !== media.alternativeText ||
        enBase.caption !== media.caption
      ) {
        await client.majInfosMedia(enBase.id, {
          alternativeText: media.alternativeText,
          caption: media.caption,
        });
        compter(misAJour, 'media');
        journal(`media remis a jour : ${media.cle} — « ${media.caption} »`);
      } else {
        // Le rapprochement comptait 94 « mises a jour » de medias sans en
        // ecrire une seule : la meme fiction que celle des articles, un cran
        // plus tot. Un fichier retrouve et laisse tel quel est INCHANGE.
        compter(inchanges, 'media');
      }
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
    natures: Natures;
    documentIdConnus?: Map<string, string>;
    corpsDe: (entree: E, locale: Locale) => Record<string, any>;
    params?: Parametres;
  }): Promise<ResultatFamille> {
    const { nom, plural, entrees, locale, natures, documentIdConnus, corpsDe, params = {} } = opts;
    // Le `populate` se DERIVE des natures : sans lui, relations, medias et zone
    // dynamique reviendraient absents, donc « differents », donc reecrits — la
    // comparaison ne servirait a rien.
    const existants = await client.listerTout(plural, {
      locale,
      ...params,
      ...parametresPopulate(natures),
    });
    const index = indexerParSlug(existants);
    const lus = new Map<string, any>();
    for (const e of existants) {
      const slug = typeof e?.slug === 'string' ? e.slug.trim() : '';
      if (slug !== '') lus.set(slug, e);
    }
    const documentIds = new Map<string, string>();
    const slugAttendu = slugPour(locale);

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
        // Sauter n'est licite que si la localisation lue est bien CELLE de ce
        // document : un meme slug porte par un autre document est une anomalie,
        // pas une raison de ne rien faire.
        if (existeDeja && index.get(local.slug) === dejaConnu) {
          const verdict = comparerCorps(data, lus.get(local.slug), natures, slugAttendu);
          if (verdict.identique) {
            compter(inchanges, `${nom}:${locale}`);
            documentIds.set(cleFr, dejaConnu);
            continue;
          }
          journal(`${nom} reecrit (${locale}) : ${local.slug} — ${verdict.motif}`);
        }
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
        const verdict = comparerCorps(data, lus.get(local.slug), natures, slugAttendu);
        if (verdict.identique) {
          compter(inchanges, `${nom}:${locale}`);
          documentIds.set(cleFr, decision.documentId);
          continue;
        }
        journal(`${nom} reecrit (${locale}) : ${local.slug} — ${verdict.motif}`);
        await client.mettreAJour(plural, decision.documentId, data, { locale, ...params });
        compter(misAJour, `${nom}:${locale}`);
        documentIds.set(cleFr, decision.documentId);
      }
    }
    return { documentIds, lus };
  }

  /* --- categories --- */
  const { documentIds: idsCategorie } = await ecrireFamille({
    nom: 'categorie',
    plural: 'categories',
    entrees: corpus.categories,
    locale: 'fr',
    natures: NATURES['categorie:fr'],
    corpsDe: (c, l) => ({
      nom: c[l]!.nom,
      slug: c[l]!.slug,
      description: c[l]!.description,
      couleurAccent: c.couleurAccent,
      ordreAffichage: c.ordreAffichage,
      imageHero: c.imageHero ? idsMedia.get(c.imageHero) : undefined,
      seo: corpsSeo(c[l]!.seo, idsMedia),
    }),
  });
  for (const c of corpus.categories) {
    enregistrerSlugs(idsCategorie.get(c.fr.slug), { fr: c.fr.slug, en: c.en?.slug });
  }
  await ecrireFamille({
    nom: 'categorie',
    plural: 'categories',
    entrees: corpus.categories,
    locale: 'en',
    natures: NATURES['categorie:en'],
    documentIdConnus: idsCategorie,
    corpsDe: (c, l) => ({
      nom: c[l]!.nom,
      slug: c[l]!.slug,
      description: c[l]!.description,
      seo: corpsSeo(c[l]!.seo, idsMedia),
    }),
  });

  /* --- tags --- */
  const { documentIds: idsTag } = await ecrireFamille({
    nom: 'tag',
    plural: 'tags',
    entrees: corpus.tags,
    locale: 'fr',
    natures: NATURES['tag:fr'],
    corpsDe: (t, l) => ({ nom: t[l]!.nom, slug: t[l]!.slug }),
  });
  for (const t of corpus.tags) {
    enregistrerSlugs(idsTag.get(t.fr.slug), { fr: t.fr.slug, en: t.en?.slug });
  }
  await ecrireFamille({
    nom: 'tag',
    plural: 'tags',
    entrees: corpus.tags,
    locale: 'en',
    natures: NATURES['tag:en'],
    documentIdConnus: idsTag,
    corpsDe: (t, l) => ({ nom: t[l]!.nom, slug: t[l]!.slug }),
  });

  /* --- auteurs --- */
  const { documentIds: idsAuteur } = await ecrireFamille({
    nom: 'auteur',
    plural: 'auteurs',
    entrees: corpus.auteurs,
    locale: 'fr',
    natures: NATURES['auteur:fr'],
    corpsDe: (a, l) => ({
      nom: a.nom,
      slug: a[l]!.slug,
      fonction: a[l]!.fonction,
      bio: a[l]!.bio,
      photo: a.photo ? idsMedia.get(a.photo) : undefined,
      reseaux: a.reseaux,
    }),
  });
  for (const a of corpus.auteurs) {
    enregistrerSlugs(idsAuteur.get(a.fr.slug), { fr: a.fr.slug, en: a.en?.slug });
  }
  await ecrireFamille({
    nom: 'auteur',
    plural: 'auteurs',
    entrees: corpus.auteurs,
    locale: 'en',
    natures: NATURES['auteur:en'],
    documentIdConnus: idsAuteur,
    corpsDe: (a, l) => ({ slug: a[l]!.slug, fonction: a[l]!.fonction, bio: a[l]!.bio }),
  });

  /* --- dossiers --- */
  const { documentIds: idsDossier } = await ecrireFamille({
    nom: 'dossier',
    plural: 'dossiers',
    entrees: corpus.dossiers,
    locale: 'fr',
    natures: NATURES['dossier:fr'],
    corpsDe: (d, l) => ({
      titre: d[l]!.titre,
      slug: d[l]!.slug,
      introduction: d[l]!.introduction,
      dateOuverture: d.dateOuverture,
      imageHero: d.imageHero ? idsMedia.get(d.imageHero) : undefined,
      seo: corpsSeo(d[l]!.seo, idsMedia),
    }),
  });
  for (const d of corpus.dossiers) {
    enregistrerSlugs(idsDossier.get(d.fr.slug), { fr: d.fr.slug, en: d.en?.slug });
  }
  await ecrireFamille({
    nom: 'dossier',
    plural: 'dossiers',
    entrees: corpus.dossiers,
    locale: 'en',
    natures: NATURES['dossier:en'],
    documentIdConnus: idsDossier,
    corpsDe: (d, l) => ({
      titre: d[l]!.titre,
      slug: d[l]!.slug,
      introduction: d[l]!.introduction,
      seo: corpsSeo(d[l]!.seo, idsMedia),
    }),
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
    seo: corpsSeo(art.seo, idsMedia),
  });

  const paramsArticle: Parametres = { status: 'published' };
  const { documentIds: idsArticle, lus: articlesLusFr } = await ecrireFamille({
    nom: 'article',
    plural: 'articles',
    entrees: corpus.articles as any,
    locale: 'fr',
    natures: NATURES.article,
    corpsDe: (a: any, l) => corpsArticle(a[l]),
    params: paramsArticle,
  });
  for (const a of corpus.articles) {
    enregistrerSlugs(idsArticle.get(a.fr.slug), { fr: a.fr.slug, en: a.en?.slug });
  }
  const { lus: articlesLusEn } = await ecrireFamille({
    nom: 'article',
    plural: 'articles',
    entrees: corpus.articles as any,
    locale: 'en',
    natures: NATURES.article,
    documentIdConnus: idsArticle,
    corpsDe: (a: any, l) => corpsArticle(a[l]),
    params: paramsArticle,
  });

  // Seconde passe : `articlesLies` ne peut se poser qu'une fois tous les
  // articles ecrits — c'est une relation d'un article vers un autre.
  //
  // Elle ecrivait jusqu'ici SANS RIEN REGARDER : 21 republications a chaque
  // passage, donc 21 deploiements. Elle compare desormais, comme le reste. La
  // lecture employee est celle des passes ci-dessus : les corps ecrits n'y
  // portent pas `articlesLies`, et un PUT ne touche que ce qu'on lui donne —
  // la valeur relue est donc toujours a jour.
  const codeVersDocumentId = new Map<string, string>();
  for (const a of corpus.articles) {
    const id = idsArticle.get(a.fr.slug);
    if (id) codeVersDocumentId.set(a.code, id);
  }
  const lusParLocale: Record<Locale, Map<string, any>> = {
    fr: articlesLusFr,
    en: articlesLusEn,
  };
  for (const locale of LOCALES) {
    const slugAttendu = slugPour(locale);
    for (const a of corpus.articles) {
      const art = a[locale];
      if (!art || art.articlesLies.length === 0) continue;
      const documentId = codeVersDocumentId.get(a.code);
      if (!documentId) continue;
      const data = {
        articlesLies: art.articlesLies.map((c) => codeVersDocumentId.get(c)).filter(Boolean),
      };
      const verdict = comparerCorps(
        data,
        lusParLocale[locale].get(art.slug),
        NATURES.article,
        slugAttendu
      );
      if (verdict.identique) {
        compter(inchanges, `articlesLies:${locale}`);
        continue;
      }
      journal(`articlesLies reecrit (${locale}) : ${art.slug} — ${verdict.motif}`);
      await client.mettreAJour('articles', documentId, data, { locale, ...paramsArticle });
      compter(misAJour, `articlesLies:${locale}`);
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
    const data = {
      nomSite: local.nomSite,
      baseline: local.baseline,
      descriptionDefaut: local.descriptionDefaut,
      texteFooter: local.texteFooter,
      mentionsLegales: local.mentionsLegales,
      ...(locale === 'fr' ? mediasConfig : { reseaux: conf.reseaux }),
    };
    const existant = await client.lireSingle('configuration', {
      locale,
      ...parametresPopulate(NATURES_CONFIGURATION),
    });
    const verdict = comparerCorps(data, existant, NATURES_CONFIGURATION, slugPour(locale));
    if (verdict.identique) {
      compter(inchanges, `configuration:${locale}`);
      continue;
    }
    await client.majSingle('configuration', data, { locale });
    compter(existant ? misAJour : crees, `configuration:${locale}`);
  }

  return { crees, misAJour, inchanges };
}
