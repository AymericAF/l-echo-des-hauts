/**
 * Corpus de RECETTE des routes : un jeu de donnees fabrique pour exercer les BORNES.
 *
 * POURQUOI IL EXISTE. Le critere de recette de ce lot porte sur les bornes de
 * pagination — « premiere page, derniere page, categorie a moins de 12 articles,
 * categorie a EXACTEMENT 12 » — et sur la bascule FR/EN d un article traduit et d un
 * article non traduit. Or aucune de ces bornes n est atteinte par le corpus editorial
 * reel tel qu il est seede : au 2026-08-07, l instance porte 13 articles francais, donc
 * AUCUNE categorie ne depasse 12 et aucune page 2 n existe. Recetter la pagination sur
 * ce corpus reviendrait a certifier « conforme » sur un chemin jamais parcouru.
 *
 * CE QU IL PROUVE, ET CE QU IL NE PROUVE PAS. Il exerce la chaine entiere — client →
 * mapping → corpus → registre → `getStaticPaths` → `dist/` → gardes — sur des donnees
 * de forme Strapi. Il ne prouve rien sur le contenu editorial reel, ni sur les
 * permissions de l instance. C est le meme partage que `serveur-fixtures.mjs`, applique
 * a un autre critere.
 *
 * IL NE SERT JAMAIS EN PRODUCTION : aucun code de `src/` ne l importe.
 *
 * Les bornes, et ce que chacune attrape :
 *
 *   | Entite                 | FR  | EN | Ce que la borne attrape                          |
 *   |------------------------|-----|----|--------------------------------------------------|
 *   | categorie `treize`     | 13  | 2  | page 2 existe et ne porte qu un article           |
 *   | categorie `douze`      | 12  | 0  | **frontiere** : aucune page 2 vide                |
 *   | categorie `cinq`       |  5  | —  | moins d une page ; aucune pagination rendue       |
 *   | categorie `vide`       |  0  | 0  | index vide : AUCUNE route emise (§10.3)           |
 *   | tag `large`            | 25  | 2  | trois pages : une page du MILIEU, avec ses bornes |
 *   | tag `sans-en`          |  3  | 0  | tag FR emis, contrepartie EN non emise            |
 */

const IMAGE = {
  id: 900,
  documentId: 'med-recette-900',
  url: '/uploads/recette_couverture.jpg',
  alternativeText: 'Image de recette',
  caption: 'Oeuvre du projet — CC0 1.0',
  width: 1600,
  height: 900,
  mime: 'image/jpeg',
};

const PARAGRAPHE = (texte) => ({ type: 'paragraph', children: [{ type: 'text', text: texte }] });

const SEO_VIDE = null;

/** Categories : `[cle, slugFr, slugEn|null, nombreArticlesFr, nombreArticlesEn]`. */
const CATEGORIES = [
  ['treize', 'rubrique-treize', 'section-thirteen', 13, 2],
  ['douze', 'rubrique-douze', 'section-twelve', 12, 0],
  ['cinq', 'rubrique-cinq', null, 5, 0],
  ['vide', 'rubrique-vide', 'section-empty', 0, 0],
];

const TAGS = [
  ['large', 'etiquette-large', 'wide-tag'],
  ['sans-en', 'etiquette-sans-en', 'tag-without-english'],
];

/** Sur combien d articles FR, dans l ordre global, chaque etiquette est posee. */
const PORTEE_TAG_LARGE = 25;
const PORTEE_TAG_SANS_EN = 3;

function localisation(documentId, locale, slug) {
  return { id: 1, documentId, locale, slug };
}

function categorieEntree(cle, slug, locale, ordre, slugAutre, localeAutre) {
  return {
    id: 1,
    documentId: `cat-${cle}`,
    nom: `Rubrique ${cle} (${locale})`,
    slug,
    description: `Description de la rubrique ${cle}.`,
    couleurAccent: '#1f6f4a',
    imageHero: null,
    ordreAffichage: ordre,
    locale,
    updatedAt: '2026-01-01T00:00:00.000Z',
    seo: SEO_VIDE,
    localizations: slugAutre === null ? [] : [localisation(`cat-${cle}`, localeAutre, slugAutre)],
  };
}

function tagEntree(cle, slug, locale, slugAutre, localeAutre) {
  return {
    id: 1,
    documentId: `tag-${cle}`,
    nom: `Etiquette ${cle} (${locale})`,
    slug,
    locale,
    updatedAt: '2026-01-01T00:00:00.000Z',
    localizations: slugAutre === null ? [] : [localisation(`tag-${cle}`, localeAutre, slugAutre)],
  };
}

function auteurEntree(locale, autre) {
  return {
    id: 1,
    documentId: 'aut-recette',
    nom: 'Camille Recette',
    slug: 'camille-recette',
    fonction: locale === 'fr' ? 'Reporter de recette' : 'Test reporter',
    bio: [PARAGRAPHE('Signature fabriquee pour la recette des routes.')],
    photo: null,
    reseaux: [],
    locale,
    updatedAt: '2026-01-01T00:00:00.000Z',
    localizations: [localisation('aut-recette', autre, 'camille-recette')],
  };
}

/**
 * Date strictement decroissante avec le rang : l ordre des index est alors total, et la
 * page 2 est reproductible d un build a l autre.
 */
function dateDuRang(rang) {
  const jour = new Date(Date.UTC(2026, 0, 1) + (500 - rang) * 86400000);
  return jour.toISOString();
}

function articleEntree({ rang, locale, cle, slugCategorie, slugArticle, tags, localisations }) {
  return {
    id: rang,
    documentId: `art-${locale}-${cle}-${String(rang).padStart(3, '0')}`,
    titre: `Article ${rang} de la rubrique ${cle} (${locale})`,
    slug: slugArticle,
    chapo: `Chapo de l article ${rang} de la rubrique ${cle}.`,
    legendeCouverture: null,
    datePublication: dateDuRang(rang),
    aLaUne: rang === 1 && cle === 'treize' && locale === 'fr',
    locale,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z',
    imageCouverture: IMAGE,
    auteur: { id: 1, documentId: 'aut-recette', nom: 'Camille Recette', slug: 'camille-recette' },
    categorie: {
      id: 1,
      documentId: `cat-${cle}`,
      nom: `Rubrique ${cle} (${locale})`,
      slug: slugCategorie,
      couleurAccent: '#1f6f4a',
    },
    tags,
    dossier: null,
    articlesLies: [],
    contenu: [
      {
        __component: 'bloc.texte',
        id: 1,
        contenu: [PARAGRAPHE(`Corps de l article ${rang} de la rubrique ${cle}.`)],
      },
    ],
    seo: SEO_VIDE,
    localizations: localisations,
  };
}

function referenceTag(cle, slug, locale) {
  return { id: 1, documentId: `tag-${cle}`, nom: `Etiquette ${cle} (${locale})`, slug };
}

export function corpusRecette() {
  const articles = { fr: [], en: [] };

  // --- articles francais, categorie par categorie -------------------------------
  let rangGlobal = 0;
  for (const [cle, slugFr, , nombreFr] of CATEGORIES) {
    for (let index = 1; index <= nombreFr; index += 1) {
      rangGlobal += 1;
      const tags = [];
      if (rangGlobal <= PORTEE_TAG_LARGE) tags.push(referenceTag('large', 'etiquette-large', 'fr'));
      if (rangGlobal <= PORTEE_TAG_SANS_EN) {
        tags.push(referenceTag('sans-en', 'etiquette-sans-en', 'fr'));
      }
      articles.fr.push(
        articleEntree({
          rang: rangGlobal,
          locale: 'fr',
          cle,
          slugCategorie: slugFr,
          slugArticle: `fr-${cle}-${index}`,
          tags,
          localisations: [],
        }),
      );
    }
  }

  // --- articles anglais : uniquement dans `treize`, et deux d entre eux traduits --
  let rangEn = 0;
  for (const [cle, , slugEn, , nombreEn] of CATEGORIES) {
    for (let index = 1; index <= nombreEn; index += 1) {
      rangEn += 1;
      articles.en.push(
        articleEntree({
          rang: rangEn,
          locale: 'en',
          cle,
          slugCategorie: slugEn,
          slugArticle: `en-${cle}-${index}`,
          tags: [referenceTag('large', 'wide-tag', 'en')],
          localisations: [],
        }),
      );
    }
  }

  /* Les deux traductions : la localisation se declare DES DEUX COTES, avec le slug propre
     de chaque locale — c est ce que le mapping lit, et c est le piege n° 1 de T-05. Les
     documentId se rejoignent, comme en Strapi 5. */
  for (let index = 0; index < articles.en.length; index += 1) {
    const anglais = articles.en[index];
    const francais = articles.fr[index];
    const partage = `art-traduit-${index + 1}`;
    francais.documentId = partage;
    anglais.documentId = partage;
    francais.localizations = [localisation(partage, 'en', anglais.slug)];
    anglais.localizations = [localisation(partage, 'fr', francais.slug)];
  }

  const categories = {
    fr: CATEGORIES.map(([cle, slugFr, slugEn], index) =>
      categorieEntree(cle, slugFr, 'fr', index + 1, slugEn, 'en'),
    ),
    en: CATEGORIES.filter(([, , slugEn]) => slugEn !== null).map(([cle, slugFr, slugEn], index) =>
      categorieEntree(cle, slugEn, 'en', index + 1, slugFr, 'fr'),
    ),
  };

  const tags = {
    fr: TAGS.map(([cle, slugFr, slugEn]) => tagEntree(cle, slugFr, 'fr', slugEn, 'en')),
    en: TAGS.map(([cle, slugFr, slugEn]) => tagEntree(cle, slugEn, 'en', slugFr, 'fr')),
  };

  return {
    articles,
    categories,
    tags,
    auteurs: { fr: [auteurEntree('fr', 'en')], en: [auteurEntree('en', 'fr')] },
    dossiers: { fr: [], en: [] },
  };
}

/** Ce que le build DOIT emettre — attendu ecrit a la main, pas derive du code teste. */
export const ROUTES_ATTENDUES = {
  emises: [
    '/',
    '/404',
    '/a-propos',
    '/mentions-legales',
    '/en',
    '/en/404',
    '/en/a-propos',
    '/en/mentions-legales',

    // 13 articles → 2 pages ; la page 2 ne porte qu un article.
    '/categorie/rubrique-treize',
    '/categorie/rubrique-treize/page/2',
    // EXACTEMENT 12 → une seule page. C est la frontiere du critere.
    '/categorie/rubrique-douze',
    // moins de 12 → une seule page, aucune pagination rendue.
    '/categorie/rubrique-cinq',
    // 25 articles → 3 pages, dont une page du milieu.
    '/tag/etiquette-large',
    '/tag/etiquette-large/page/2',
    '/tag/etiquette-large/page/3',
    '/tag/etiquette-sans-en',
    '/auteur/camille-recette',

    // Miroir anglais : 2 articles dans une seule rubrique.
    '/en/categorie/section-thirteen',
    '/en/tag/wide-tag',
    '/en/auteur/camille-recette',
  ],
  interdites: [
    // §10.3 — un index vide n est pas emis, dans aucune des deux locales.
    '/categorie/rubrique-vide',
    '/en/categorie/section-empty',
    '/en/categorie/section-twelve',
    '/en/tag/tag-without-english',
    // La frontiere : 12 articles ne font pas naitre une page 2 vide.
    '/categorie/rubrique-douze/page/2',
    '/categorie/rubrique-cinq/page/2',
    // Aucune page au-dela de la derniere.
    '/categorie/rubrique-treize/page/3',
    '/tag/etiquette-large/page/4',
    '/en/categorie/section-thirteen/page/2',
    // La page 1 ne s ecrit jamais `/page/1`.
    '/categorie/rubrique-treize/page/1',
    '/tag/etiquette-large/page/1',
  ],
};
