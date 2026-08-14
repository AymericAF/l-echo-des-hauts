/**
 * Transcription machine du cahier `docs/modele-donnees.md` (depot prive de documentation),
 * inventaire §1 et tableaux §2 a §5. Un seul endroit porte la specification ; les tests
 * la confrontent aux fichiers de schema.
 *
 * `loc` = localisation i18n au champ (arbitrage A-06) :
 *   true    -> `pluginOptions.i18n.localized` doit valoir true
 *   false   -> `pluginOptions.i18n.localized` doit valoir false
 *   'force' -> Strapi 5 impose la localisation (relations et uid) : la cle i18n
 *              ne doit PAS etre ecrite, sinon le fichier affirme un reglage
 *              que le moteur ignore. Voir le rapport de divergence A-06.
 */

export type Loc = true | false | 'force';

export interface ChampSpec {
  type: string;
  required?: boolean;
  maxLength?: number;
  /** A-09 : `required` porte sur la presence de la cle, jamais sur le vide — `minLength: 1` est ce qui refuse `""` sur un `uid`. */
  minLength?: number;
  min?: number;
  default?: unknown;
  unique?: boolean;
  regex?: string;
  targetField?: string;
  multiple?: boolean;
  allowedTypes?: string[];
  repeatable?: boolean;
  component?: string;
  components?: string[];
  relation?: string;
  target?: string;
  inversedBy?: string;
  mappedBy?: string;
  enum?: string[];
  loc?: Loc;
}

export interface TypeSpec {
  kind: 'collectionType' | 'singleType';
  singularName: string;
  pluralName: string;
  displayName: string;
  draftAndPublish: boolean;
  i18n: boolean;
  attributes: Record<string, ChampSpec>;
}

export const BLOCS_CONTENU = [
  'bloc.texte',
  'bloc.citation',
  'bloc.galerie',
  'bloc.encadre',
  'bloc.video',
  'bloc.image-legendee',
  'bloc.separateur',
  'bloc.chiffres-cles',
] as const;

/** §2 — les 5 collection types, plus le single type du §5. */
export const CONTENT_TYPES: Record<string, TypeSpec> = {
  // ---------------------------------------------------------------- §2.1
  article: {
    kind: 'collectionType',
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
    draftAndPublish: true, // §3.1 lu tel quel + A-02
    i18n: true,
    attributes: {
      titre: { type: 'string', required: true, maxLength: 120, loc: true },
      slug: { type: 'uid', targetField: 'titre', required: true, minLength: 1, loc: 'force' },
      chapo: { type: 'text', required: true, maxLength: 300, loc: true },
      contenu: {
        type: 'dynamiczone',
        required: true,
        min: 1, // A-01
        components: [...BLOCS_CONTENU],
        loc: true,
      },
      /* LOCALISE depuis le 2026-08-14 (tache `f011a634`) — A-06 amende SUR LE FOND.
         Sa colonne « partages » etait un CHOIX, pas une contrainte : un champ media PEUT
         etre localise, `hasLocalizedOption` s appliquant a tout type d attribut. Ce lot le
         renverse pour les medias PORTEURS DE TEXTE, dont le libelle grave est francais et
         ne peut donc pas servir une page anglaise. */
      imageCouverture: {
        type: 'media',
        multiple: false,
        allowedTypes: ['images'],
        required: true,
        loc: true,
      },
      legendeCouverture: { type: 'string', loc: true },
      /* SURCHARGE LOCALISEE DE L ALTERNATIVE (2026-08-14, tache `2801722c`) — A-04 amende.
         L `alternativeText` de la mediatheque est UNE valeur par fichier, sans locale :
         `plugin::upload.file` ne porte aucune entree i18n et le plugin upload ecrit par
         `strapi.db.query`, jamais par le Document Service. Ce champ la surcharge POUR CETTE
         LOCALE ; vide, il ne change rien. Il est donc `loc: true` par necessite — non
         localise, il servirait le francais des deux cotes, c est-a-dire le defaut repare. */
      alternativeCouverture: { type: 'string', loc: true },
      auteur: {
        type: 'relation',
        relation: 'manyToOne',
        target: 'api::auteur.auteur',
        inversedBy: 'articles', // A-10 : une relation, pas deux
        required: true,
        loc: 'force',
      },
      categorie: {
        type: 'relation',
        relation: 'manyToOne',
        target: 'api::categorie.categorie',
        // A-11 : sens unique, aucune face inverse
        required: true,
        loc: 'force',
      },
      tags: {
        type: 'relation',
        relation: 'manyToMany',
        target: 'api::tag.tag',
        // A-11 : manyWay, pas d'inverse ; optionnel, non borne
        loc: 'force',
      },
      dossier: {
        type: 'relation',
        relation: 'manyToOne',
        target: 'api::dossier.dossier',
        inversedBy: 'articles',
        // optionnel (annexe A : le piege exact de l'extraction texte)
        loc: 'force',
      },
      articlesLies: {
        type: 'relation',
        relation: 'manyToMany',
        target: 'api::article.article',
        // A-12 : non reciproque ; A-13 : max 3 pose par lifecycle
        loc: 'force',
      },
      datePublication: { type: 'datetime', required: true, loc: false },
      aLaUne: { type: 'boolean', default: false, loc: false },
      seo: { type: 'component', repeatable: false, component: 'partage.seo', loc: true },
    },
  },

  // ---------------------------------------------------------------- §2.2
  auteur: {
    kind: 'collectionType',
    singularName: 'auteur',
    pluralName: 'auteurs',
    displayName: 'Auteur',
    draftAndPublish: false, // A-02
    i18n: true, // A-06
    attributes: {
      nom: { type: 'string', required: true, loc: false },
      slug: { type: 'uid', targetField: 'nom', required: true, minLength: 1, loc: 'force' }, // A-09
      fonction: { type: 'string', loc: true },
      bio: { type: 'blocks', loc: true },
      photo: { type: 'media', multiple: false, allowedTypes: ['images'], loc: false },
      alternativePhoto: { type: 'string', loc: true },
      reseaux: {
        type: 'component',
        repeatable: true,
        component: 'partage.lien-social',
        loc: false,
      },
      articles: {
        type: 'relation',
        relation: 'oneToMany',
        target: 'api::article.article',
        mappedBy: 'auteur', // A-10
        loc: 'force',
      },
    },
  },

  // ---------------------------------------------------------------- §2.3
  categorie: {
    kind: 'collectionType',
    singularName: 'categorie',
    pluralName: 'categories',
    displayName: 'Categorie',
    draftAndPublish: false, // A-02
    i18n: true, // ecrit tel quel dans le PDF
    attributes: {
      nom: { type: 'string', required: true, loc: true },
      slug: { type: 'uid', targetField: 'nom', required: true, minLength: 1, loc: 'force' },
      description: { type: 'text', loc: true },
      couleurAccent: { type: 'string', regex: '^#[0-9a-fA-F]{6}$', loc: false }, // A-15
      imageHero: { type: 'media', multiple: false, loc: true }, // localise le 2026-08-14, cf. imageCouverture
      alternativeHero: { type: 'string', loc: true },
      ordreAffichage: { type: 'integer', default: 0, loc: false }, // A-16
      seo: { type: 'component', repeatable: false, component: 'partage.seo', loc: true },
    },
  },

  // ---------------------------------------------------------------- §2.4
  tag: {
    kind: 'collectionType',
    singularName: 'tag',
    pluralName: 'tags',
    displayName: 'Tag',
    draftAndPublish: false, // A-02
    i18n: true, // A-06
    attributes: {
      nom: { type: 'string', required: true, loc: true }, // A-17 : short
      slug: { type: 'uid', targetField: 'nom', required: true, minLength: 1, loc: 'force' },
    },
  },

  // ---------------------------------------------------------------- §2.5
  dossier: {
    kind: 'collectionType',
    singularName: 'dossier',
    pluralName: 'dossiers',
    displayName: 'Dossier',
    draftAndPublish: false, // A-02
    i18n: true, // A-06
    attributes: {
      titre: { type: 'string', required: true, loc: true },
      slug: { type: 'uid', targetField: 'titre', required: true, minLength: 1, loc: 'force' },
      introduction: { type: 'blocks', loc: true },
      imageHero: { type: 'media', multiple: false, loc: true }, // localise le 2026-08-14, cf. imageCouverture
      alternativeHero: { type: 'string', loc: true },
      articles: {
        type: 'relation',
        relation: 'oneToMany',
        target: 'api::article.article',
        mappedBy: 'dossier', // A-10
        loc: 'force',
      },
      dateOuverture: { type: 'date', loc: false },
      seo: { type: 'component', repeatable: false, component: 'partage.seo', loc: true },
    },
  },

  // ---------------------------------------------------------------- §5
  configuration: {
    kind: 'singleType',
    singularName: 'configuration',
    pluralName: 'configurations',
    displayName: 'Configuration',
    draftAndPublish: false, // A-34
    i18n: true, // A-06
    attributes: {
      nomSite: { type: 'string', required: true, loc: true }, // A-31
      baseline: { type: 'string', loc: true },
      logo: { type: 'media', multiple: false, allowedTypes: ['images'], required: true, loc: false },
      logoSombre: { type: 'media', multiple: false, allowedTypes: ['images'], loc: false }, // A-35
      favicon: { type: 'media', multiple: false, allowedTypes: ['images'], loc: false },
      descriptionDefaut: { type: 'text', maxLength: 160, required: true, loc: true },
      imagePartageDefaut: {
        type: 'media',
        multiple: false,
        allowedTypes: ['images'],
        required: true,
        loc: false,
      }, // A-28
      alternativeLogo: { type: 'string', loc: true },
      alternativePartageDefaut: { type: 'string', loc: true },
      reseaux: {
        type: 'component',
        repeatable: true,
        component: 'partage.lien-social',
        loc: false,
      }, // A-32
      texteFooter: { type: 'blocks', loc: true },
      mentionsLegales: { type: 'blocks', required: true, loc: true }, // A-33
    },
  },
};

export interface ComponentSpec {
  categorie: string;
  nom: string;
  displayName: string;
  attributes: Record<string, ChampSpec>;
}

/** §3 (les 8 blocs + le component imbrique A-24) et §4 (les 2 components partages). */
export const COMPONENTS: Record<string, ComponentSpec> = {
  'bloc.texte': {
    categorie: 'bloc',
    nom: 'texte',
    displayName: 'Texte',
    attributes: {
      contenu: { type: 'blocks', required: true }, // A-20
    },
  },
  'bloc.citation': {
    categorie: 'bloc',
    nom: 'citation',
    displayName: 'Citation',
    attributes: {
      texte: { type: 'text', required: true }, // long, A-20
      auteurCitation: { type: 'string' }, // texte libre, pas une relation
      source: { type: 'string' },
    },
  },
  'bloc.galerie': {
    categorie: 'bloc',
    nom: 'galerie',
    displayName: 'Galerie',
    attributes: {
      images: { type: 'media', multiple: true, allowedTypes: ['images'], required: true },
      legende: { type: 'string' }, // A-22 : une seule legende pour la galerie
      disposition: {
        type: 'enumeration',
        enum: ['grille', 'carrousel', 'pleine-largeur'],
        required: true,
        default: 'grille',
      }, // A-23, A-05
    },
  },
  'bloc.encadre': {
    categorie: 'bloc',
    nom: 'encadre',
    displayName: 'Encadre',
    attributes: {
      titre: { type: 'string' },
      contenu: { type: 'blocks', required: true },
      variante: {
        type: 'enumeration',
        enum: ['info', 'alerte', 'complement'],
        required: true,
        default: 'info',
      }, // A-23
    },
  },
  'bloc.video': {
    categorie: 'bloc',
    nom: 'video',
    displayName: 'Video',
    attributes: {
      url: { type: 'string', required: true, regex: '^https?://' }, // A-20
      legende: { type: 'string' },
      vignette: { type: 'media', multiple: false, allowedTypes: ['images'] }, // A-03 amende par T-03
    },
  },
  'bloc.image-legendee': {
    categorie: 'bloc',
    nom: 'image-legendee',
    displayName: 'Image legendee',
    attributes: {
      image: { type: 'media', multiple: false, allowedTypes: ['images'], required: true },
      legende: { type: 'string' },
      /* Un attribut de COMPOSANT ne declare pas d option i18n : ce qui le rend localise
         est la dynamic zone `contenu` de l article, qui l est. */
      alternative: { type: 'string' },
      credit: { type: 'string' }, // R5 : obligatoire operationnellement, pas dans le schema
    },
  },
  'bloc.separateur': {
    categorie: 'bloc',
    nom: 'separateur',
    displayName: 'Separateur',
    attributes: {
      style: {
        type: 'enumeration',
        enum: ['ligne', 'points', 'espace'],
        required: true,
        default: 'ligne',
      }, // A-23
    },
  },
  'bloc.chiffres-cles': {
    categorie: 'bloc',
    nom: 'chiffres-cles',
    displayName: 'Chiffres cles',
    attributes: {
      entrees: {
        type: 'component',
        repeatable: true,
        component: 'bloc.chiffre-entree',
        required: true,
        min: 1,
      }, // A-20, A-24
    },
  },
  'bloc.chiffre-entree': {
    categorie: 'bloc',
    nom: 'chiffre-entree',
    displayName: 'Chiffre entree',
    attributes: {
      valeur: { type: 'string', required: true }, // A-25 : Text, pas Number
      unite: { type: 'string' },
      libelle: { type: 'string', required: true },
    },
  },
  'partage.seo': {
    categorie: 'partage',
    nom: 'seo',
    displayName: 'Seo',
    attributes: {
      // A-07 : tout est optionnel et reste vide ; le defaut se calcule AU BUILD
      metaTitre: { type: 'string', maxLength: 60 },
      metaDescription: { type: 'text', maxLength: 160 },
      imagePartage: { type: 'media', multiple: false },
      noindex: { type: 'boolean', default: false }, // A-29
      canonique: { type: 'string' }, // A-27
    },
  },
  'partage.lien-social': {
    categorie: 'partage',
    nom: 'lien-social',
    displayName: 'Lien social',
    attributes: {
      plateforme: {
        type: 'enumeration',
        enum: [
          'linkedin',
          'x',
          'bluesky',
          'mastodon',
          'instagram',
          'facebook',
          'youtube',
          'site',
        ],
        required: true,
      }, // A-30 : liste fermee
      url: { type: 'string', required: true }, // A-20
    },
  },
};

/** §1 — inventaire : 17 schemas, 75 champs declares. */
export const INVENTAIRE = {
  collectionTypes: 5,
  singleTypes: 1,
  blocsDynamicZone: 8,
  componentImbrique: 1,
  componentsPartages: 2,
  schemas: 17,
  champs: 82,
};
