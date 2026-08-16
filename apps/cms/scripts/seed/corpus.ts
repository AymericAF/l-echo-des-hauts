/**
 * Lecture et validation du corpus de demonstration VERSIONNE (`apps/cms/data`).
 *
 * Tout est lu et valide AVANT la premiere ecriture. La regle n'est pas
 * cosmetique : le seed sert deux fois — au montage du demonstrateur, et pour
 * reconstruire l'environnement depuis le depot en cas de perte, puisque aucune
 * astreinte ni engagement de retablissement n'est pris sur ce projet
 * (`docs/brief.md`, §3 hypothese 6). Un echec a mi-parcours laisserait une base
 * a moitie remplie que la seconde execution rapprocherait sur un etat partiel.
 */
import fs from 'node:fs';
import path from 'node:path';

import { composerCredit, verifierFormatCredit, type SourceCredit } from './credits.ts';
import { ErreurCorpus, MediaIntrouvable } from './erreurs.ts';
import { lireArticle, markdownVersBlocks, type BlocBrut } from './markdown.ts';
import { verifierUnicite } from './rapprochement.ts';
import {
  deriverVoie,
  verifierPlacementVoieC,
  verifierPortraitAuteur,
  verifierSidecarVoieC,
  type Placement,
  type Voie,
} from './voies.ts';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Renvoi vers un media du corpus, resolu en id Strapi apres televersement. */
export type RenvoiMedia = { __media: string };

export type MediaCorpus = {
  /** cle dans le manifeste, ex. `couvertures/A05.svg` */
  cle: string;
  /** nom de fichier, cle de rapprochement dans la mediatheque Strapi */
  nom: string;
  chemin: string;
  alternativeText: string;
  /** `true` quand l image ne porte AUCUNE information : elle sort en `alt=""`. Declare, jamais devine. */
  decoratif: boolean;
  /** Ligne de credit COMPOSEE au format du §6.5, jamais ecrite a la main. */
  caption: string;
  ayantDroit: string;
  licence: string;
  /** Voie d'acquisition du §6.3 — DERIVEE de l'ayant droit, ou declaree. */
  voie: Voie;
  /**
   * OU ce media est employe, releve sur l'emploi REEL dans le corpus et jamais
   * sur son chemin de fichier. C'est ce qui rend les conditions 5 et 7 du §6.7
   * opposables : un prefixe de dossier se renomme, un emploi non.
   */
  placements: Placement[];
  /**
   * QUELLES entrees l'emploient — la colonne « article(s) ou entite » du
   * registre du §6.7. Elle se DERIVE d'ici : recopiee a la main, elle
   * divergerait au premier article deplace.
   */
  emplois: string[];
};

/**
 * La surcharge editoriale `partage.seo`, telle qu elle s ecrit dans le corpus.
 *
 * Tout est optionnel, et l ABSENCE est une information : « pas de surcharge,
 * calcule au build » (A-07). Un champ absent ne se remplace donc jamais par un
 * defaut ici — ce serait figer en base ce que le build sait recalculer.
 *
 * `imagePartage` porte une cle du manifeste, comme `imageCouverture` ou
 * `imageHero` : elle est resolue en id de mediatheque au seed.
 */
export type SeoCorpus = {
  metaTitre?: string;
  metaDescription?: string;
  imagePartage?: string;
  /**
   * La surcharge LOCALISEE de l alternative de la carte (A-04 amende). Elle ne se pose
   * jamais sans `imagePartage` : sans carte, elle ne surchargerait rien.
   */
  alternativePartage?: string;
  noindex?: boolean;
  canonique?: string;
};

/**
 * LA SURCHARGE LOCALISEE DE L ALTERNATIVE TEXTUELLE (2026-08-14, tache `2801722c`).
 *
 * Les champs `alternative*` ci-dessous sont FACULTATIFS, et leur absence est une
 * information : « pas de surcharge, prends l `alternativeText` de la mediatheque ».
 * Ils existent parce que cet `alternativeText` est UNE valeur par fichier, sans
 * locale — `plugin::upload.file` ne porte aucune entree i18n, et le plugin upload
 * ecrit par `strapi.db.query`, jamais par le Document Service. Une image servie sur
 * une page anglaise sortait donc avec son alternative FRANCAISE.
 *
 * A-04 tient sur son fond : l alternative ne vient JAMAIS d une legende, et le champ
 * natif reste la source par defaut. Ce qui est amende est sa phrase « il n y a rien
 * a ajouter au modele ».
 *
 * DEUX GARDES les tiennent, toutes deux dans `chargerCorpus` : une surcharge BLANCHE
 * est refusee (elle ecraserait l alternative native par du silence), et une surcharge
 * sur un media `decoratif: true` l est aussi (meme contradiction que celle deja
 * gardee au manifeste).
 */
export type CategorieLocale = {
  nom: string;
  slug: string;
  description?: string;
  seo?: SeoCorpus;
  alternativeHero?: string;
  /**
   * LE MEDIA DU BANDEAU, PAR LOCALE (2026-08-14, tache `f011a634`).
   *
   * Il surcharge l `imageHero` PARTAGE de l entree : le fichier francais grave le nom de
   * la rubrique et la signature du magazine, donc il ne peut pas servir une page anglaise.
   * Absent, la locale sert le fichier partage — le comportement d origine, exactement.
   * A-06 est amende sur le fond : sa colonne « partages » etait un CHOIX, pas une
   * contrainte, et ce lot le renverse pour les champs media porteurs de texte.
   */
  imageHero?: string;
};
export type CategorieCorpus = {
  ordreAffichage: number;
  couleurAccent?: string;
  imageHero?: string;
  fr: CategorieLocale;
  en?: CategorieLocale;
};

export type TagLocale = { nom: string; slug: string };
export type TagCorpus = { fr: TagLocale; en?: TagLocale };

export type AuteurLocale = {
  slug: string;
  fonction?: string;
  bio?: unknown[];
  alternativePhoto?: string;
};
export type AuteurCorpus = {
  nom: string;
  photo?: string;
  reseaux: { plateforme: string; url: string }[];
  fr: AuteurLocale;
  en?: AuteurLocale;
};

export type DossierLocale = {
  titre: string;
  slug: string;
  introduction?: unknown[];
  seo?: SeoCorpus;
  alternativeHero?: string;
  /** Le media du bandeau, par locale — cf. `CategorieLocale.imageHero`. */
  imageHero?: string;
};
export type DossierCorpus = {
  dateOuverture?: string;
  imageHero?: string;
  fr: DossierLocale;
  en?: DossierLocale;
};

export type ArticleLocale = {
  slug: string;
  titre: string;
  chapo: string;
  auteur: string;
  categorie: string;
  tags: string[];
  dossier?: string;
  articlesLies: string[];
  datePublication: string;
  aLaUne: boolean;
  imageCouverture: string;
  legendeCouverture?: string;
  alternativeCouverture?: string;
  contenu: Record<string, any>[];
  seo?: SeoCorpus;
};
export type ArticleCorpus = { code: string; fr: ArticleLocale; en?: ArticleLocale };

export type ConfigurationLocale = {
  nomSite: string;
  baseline?: string;
  descriptionDefaut: string;
  texteFooter?: unknown[];
  mentionsLegales: unknown[];
  /** Vaut pour le logo CLAIR et le logo SOMBRE : le `<source>` d un `<picture>` n a pas d `alt`. */
  alternativeLogo?: string;
  alternativePartageDefaut?: string;
};
export type ConfigurationCorpus = {
  logo: string;
  logoSombre?: string;
  favicon?: string;
  imagePartageDefaut: string;
  reseaux: { plateforme: string; url: string }[];
  fr: ConfigurationLocale;
  en?: ConfigurationLocale;
};

export type Corpus = {
  racine: string;
  medias: MediaCorpus[];
  categories: CategorieCorpus[];
  tags: TagCorpus[];
  auteurs: AuteurCorpus[];
  dossiers: DossierCorpus[];
  articles: ArticleCorpus[];
  configuration: ConfigurationCorpus;
};

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

const LOCALES = ['fr', 'en'] as const;
const MAX_ARTICLES_LIES = 3;

function lireJson(chemin: string): any {
  if (!fs.existsSync(chemin)) {
    throw new ErreurCorpus(`fichier de corpus absent : ${chemin}`);
  }
  try {
    return JSON.parse(fs.readFileSync(chemin, 'utf8'));
  } catch (e) {
    throw new ErreurCorpus(`${chemin} : JSON invalide — ${(e as Error).message}`);
  }
}

function exigerTexte(valeur: unknown, contexte: string): string {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    throw new ErreurCorpus(`${contexte} : champ requis, vide ou absent`);
  }
  return valeur;
}

/* ------------------------------------------------------------------ */
/* L ALPHABET DES BLANCS — copie DELIBEREE, et gardee                   */
/*                                                                      */
/* LE DEFAUT QU IL FERME. Ce fichier testait `.trim()`, qui couvre bien  */
/* l espace insecable U+00A0 mais LAISSE PASSER les caracteres de        */
/* largeur nulle — U+200B, U+200C, U+200D, U+2060. Un `alternativeText`  */
/* fait d un seul U+200B entrait donc au corpus sans un mot : la lecture */
/* le normalisait en absent, donc le site restait correct, mais le       */
/* corpus portait une valeur invisible que rien n avait signalee a       */
/* l ECRITURE. L alphabet explicite, lui, vivait deja dans               */
/* `apps/web/src/lib/strapi/lecture.ts` (`estBlanc`).                    */
/*                                                                      */
/* POURQUOI UNE COPIE, ET PAS UN MODULE PARTAGE. Les deux applications   */
/* ne peuvent PAS s importer, et ce n est pas un choix de style : le     */
/* depot n a aucun `package.json` a sa racine ni aucun `workspaces`, et  */
/* chaque application est construite par Coolify avec sa PROPRE          */
/* `Base Directory` (`/apps/web`, `/apps/cms`). Un `import` d une        */
/* application vers l autre casserait le build — la seconde n existe pas */
/* dans l arbre de la premiere. Faire importer le seed depuis `apps/web` */
/* aurait le meme defaut, en plus d inverser le sens du flux.            */
/*                                                                      */
/* CE QUI REND LA COPIE ACCEPTABLE, et c est tout le point : elle est    */
/* GARDEE. `tests/alphabet-des-blancs.test.ts` lit les DEUX fichiers et  */
/* echoue si un caractere diverge. Un test PEUT lire d une application a */
/* l autre la ou un build ne le peut pas : il tourne dans le depot       */
/* entier, pas depuis une `Base Directory`. La duplication cesse donc    */
/* d etre silencieuse — ce qui est exactement ce que ce depot corrige    */
/* partout ailleurs, et ce que la divergence d origine demontrait.       */
/* ------------------------------------------------------------------ */

/** Doit rester IDENTIQUE, caractere pour caractere, a celui de `apps/web/src/lib/strapi/lecture.ts`. */
const BLANCS_INVISIBLES =
  '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200d\\u2028\\u2029\\u202f\\u205f\\u2060\\u3000\\ufeff';

/** Vrai si la chaine ne contient QUE des caracteres sans trace visible (chaine vide comprise). */
export function estBlanc(valeur: string): boolean {
  return new RegExp(`^[${BLANCS_INVISIBLES}]*$`, 'u').test(valeur);
}

/* ------------------------------------------------------------------ */
/* Medias                                                              */
/* ------------------------------------------------------------------ */

function chargerMedias(racine: string): { liste: MediaCorpus[]; parCle: Map<string, MediaCorpus> } {
  const dossier = path.join(racine, 'medias');
  const manifeste = lireJson(path.join(dossier, 'manifeste.json'));
  const liste: MediaCorpus[] = [];
  const parCle = new Map<string, MediaCorpus>();
  const nomsVus = new Map<string, string>();

  for (const [cle, meta] of Object.entries<any>(manifeste)) {
    const chemin = path.join(dossier, cle);
    if (!fs.existsSync(chemin)) throw new MediaIntrouvable(cle, chemin);

    // UNE IMAGE QUI NE DIT RIEN LE DECLARE — elle ne se tait pas (tache `face261a`).
    //
    // Le controle 5 du §11 du plan editorial exige un `alternativeText` non vide sur
    // chaque media. La regle est juste par defaut et fausse dans un cas : une image
    // DECORATIVE, qui ne porte aucune information que le texte voisin ne porte deja,
    // doit sortir en `alt=""`. C'est une forme reconnue — axe-core l'accepte, et elle
    // dit a un lecteur d'ecran de PASSER l'image. La contraindre a porter une
    // alternative produit l'inverse du but : « Composition graphique evoquant un seau
    // de traite », quatre fois de suite dans une galerie, est du bruit qui se fait lire.
    //
    // Ce que ce champ ne fait PAS : autoriser l'oubli. Une alternative absente et une
    // alternative volontairement vide ne doivent jamais se ressembler, sinon
    // « decoratif » devient la case qu'on coche pour se taire. D'ou trois refus.
    const decoratif = meta?.decoratif;
    if (decoratif !== undefined && decoratif !== true) {
      throw new ErreurCorpus(
        `manifeste des medias, "${cle}" : \`decoratif\` ne vaut que le booleen \`true\`, recu ${JSON.stringify(decoratif)}.\n` +
          `  Le defaut EST « non decoratif » : un champ qui redit le defaut finit par le contredire.\n` +
          `  Pour une image qui porte une information, on n'ecrit rien.`
      );
    }

    const alternativeText = meta?.alternativeText;
    if (typeof alternativeText !== 'string') {
      throw new ErreurCorpus(
        `manifeste des medias, "${cle}" : alternativeText absent ou non textuel.\n` +
          `  L'alternative textuelle vient de la mediatheque, jamais d'une legende (A-04).`
      );
    }
    if (decoratif === true && alternativeText !== '') {
      throw new ErreurCorpus(
        `manifeste des medias, "${cle}" : \`decoratif: true\` et une alternative NON VIDE se contredisent.\n` +
          `  Ou l'image porte une information — alors elle la dit et n'est pas decorative —,\n` +
          `  ou elle n'en porte pas, et son \`alternativeText\` vaut "" exactement.\n` +
          `  Recu ${JSON.stringify(alternativeText)}.`
      );
    }
    if (decoratif !== true && estBlanc(alternativeText)) {
      throw new ErreurCorpus(
        `manifeste des medias, "${cle}" : alternativeText vide.\n` +
          `  L'alternative textuelle vient de la mediatheque, jamais d'une legende (A-04),\n` +
          `  et le controle 5 du plan editorial l'exige non vide sur chaque media.\n` +
          `  La SEULE facon legitime de vider une alternative est de declarer\n` +
          `  \`"decoratif": true\` a cote — une declaration, pas un oubli.`
      );
    }

    // Le `caption` n'est PAS ecrit a la main : il est COMPOSE depuis les champs
    // de la source, au format impose du §6.5. Une phrase toute faite dans le
    // manifeste serait une seconde copie de la licence, a diverger — et c'est
    // exactement l'etat que ce champ avait avant le 2026-08-10, ou 94 medias
    // sur 94 portaient une legende editoriale qui ne creditait rien.
    if (meta?.caption !== undefined) {
      throw new ErreurCorpus(
        `manifeste des medias, "${cle}" : champ \`caption\` interdit.\n` +
          `  La ligne de credit se COMPOSE depuis \`ayantDroit\`, \`licence\` et\n` +
          `  \`modifications\` (§6.5) ; l'ecrire a la main en ferait une seconde copie\n` +
          `  de la licence. Une legende editoriale se met dans \`note\`.`
      );
    }

    let caption: string;
    try {
      caption = composerCredit(meta as SourceCredit, cle);
    } catch (e) {
      throw new ErreurCorpus((e as Error).message);
    }
    // Ceinture et bretelles : ce qui part vers la mediatheque est ce qui a ete
    // juge. Sans ce second passage, une evolution du composeur pourrait
    // televerser une ligne que la garde refuse ailleurs — seed vert, registre
    // faux, et « le succes declare qui ment ».
    const verdict = verifierFormatCredit(caption);
    if (!verdict.conforme) {
      throw new ErreurCorpus(
        `manifeste des medias, "${cle}" : ligne de credit hors format — ${verdict.motif}`
      );
    }

    const nom = path.basename(cle);
    if (nomsVus.has(nom)) {
      throw new ErreurCorpus(
        `manifeste des medias : deux fichiers portent le nom "${nom}" ` +
          `("${nomsVus.get(nom)}" et "${cle}").\n` +
          `  Le rapprochement dans la mediatheque se fait sur ce nom : il doit etre unique.`
      );
    }
    nomsVus.set(nom, cle);

    // La VOIE est derivee ici, avant tout emploi : sans elle, les conditions 5,
    // 6 et 7 du §6.7 ne sont pas seulement absentes, elles sont INEXPRIMABLES.
    let voie: Voie;
    try {
      voie = deriverVoie(meta, cle);
    } catch (e) {
      throw new ErreurCorpus((e as Error).message);
    }

    const media: MediaCorpus = {
      cle,
      nom,
      chemin,
      alternativeText,
      decoratif: decoratif === true,
      caption,
      ayantDroit: String(meta.ayantDroit).trim(),
      // Plus de valeur par defaut : `composerCredit` vient de refuser une
      // licence absente ou hors liste blanche. Un defaut ici reintroduirait
      // une licence que personne n'a relevee (§6.8).
      licence: String(meta.licence).trim(),
      voie,
      placements: [],
      emplois: [],
    };
    liste.push(media);
    parCle.set(cle, media);
  }

  return { liste, parCle };
}

/* ------------------------------------------------------------------ */
/* Dynamic zone                                                        */
/* ------------------------------------------------------------------ */

const media = (cle: string): RenvoiMedia => ({ __media: cle });

function construireBloc(bloc: BlocBrut, contexte: string): Record<string, any> {
  const a = bloc.attributs;
  const ctx = `${contexte}, bloc \`${bloc.type}\``;

  switch (bloc.type) {
    case 'texte':
      return { __component: 'bloc.texte', contenu: markdownVersBlocks(bloc.corps) };

    case 'citation':
      return {
        __component: 'bloc.citation',
        texte: exigerTexte(bloc.corps.trim(), `${ctx} : texte`),
        auteurCitation: a.auteur,
        source: a.source,
      };

    case 'encadre':
      return {
        __component: 'bloc.encadre',
        titre: a.titre,
        variante: a.variante ?? 'info',
        contenu: markdownVersBlocks(bloc.corps),
      };

    case 'separateur':
      return { __component: 'bloc.separateur', style: a.style ?? 'ligne' };

    case 'chiffres-cles': {
      const entrees = bloc.corps
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .map((ligne) => {
          const [valeur, unite, libelle] = ligne.split('|').map((c) => c.trim());
          return {
            valeur: exigerTexte(valeur, `${ctx} : valeur`),
            unite: unite || undefined,
            libelle: exigerTexte(libelle, `${ctx} : libelle`),
          };
        });
      if (entrees.length === 0) throw new ErreurCorpus(`${ctx} : au moins une entree est requise`);
      return { __component: 'bloc.chiffres-cles', entrees };
    }

    case 'image-legendee':
      return {
        __component: 'bloc.image-legendee',
        image: media(exigerTexte(a.image, `${ctx} : attribut image`)),
        legende: a.legende,
        /* La surcharge LOCALISEE de l alternative. Elle n est pas validee ici : sa
           garde a besoin de savoir si le media est DECORATIF, ce que seul le
           manifeste dit — donc `chargerCorpus`, une fois les medias charges. */
        alternative: a.alternative,
        credit: a.credit,
      };

    case 'galerie': {
      const images = exigerTexte(a.images, `${ctx} : attribut images`)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (images.length === 0) throw new ErreurCorpus(`${ctx} : au moins une image est requise`);
      return {
        __component: 'bloc.galerie',
        images: images.map(media),
        legende: a.legende,
        disposition: a.disposition ?? 'grille',
      };
    }

    case 'video':
      return {
        __component: 'bloc.video',
        url: exigerTexte(a.url, `${ctx} : attribut url`),
        legende: a.legende,
        vignette: a.vignette ? media(a.vignette) : undefined,
      };

    default:
      throw new ErreurCorpus(
        `${ctx} : type de bloc inconnu — la Dynamic Zone n'accepte que les 8 blocs du modele`
      );
  }
}

/**
 * Le placement que chaque bloc de la Dynamic Zone donne aux medias qu'il cite.
 * Il se lit sur le `__component`, c'est-a-dire sur ce qui part reellement vers
 * Strapi — pas sur le dossier du fichier.
 */
const PLACEMENT_PAR_BLOC: Record<string, Placement> = {
  'bloc.galerie': 'galerie',
  'bloc.image-legendee': 'image-legendee',
  'bloc.video': 'video-vignette',
};

/** Toutes les cles de media citees par une dynamic zone, avec leur placement. */
function renvoisMediaDe(contenu: Record<string, any>[]): { cle: string; placement: Placement }[] {
  const renvois: { cle: string; placement: Placement }[] = [];
  for (const bloc of contenu) {
    const placement = PLACEMENT_PAR_BLOC[String(bloc?.__component ?? '')];
    const visiter = (v: any) => {
      if (v == null) return;
      if (Array.isArray(v)) return v.forEach(visiter);
      if (typeof v === 'object') {
        if (typeof v.__media === 'string') {
          if (placement === undefined) {
            // Un bloc qui se met a porter un media sans que ce tableau le sache
            // rendrait son placement INVISIBLE aux conditions 5 et 7 : la garde
            // serait verte sur un placement qu'elle n'a pas vu.
            throw new ErreurCorpus(
              `le bloc \`${bloc?.__component}\` cite le media "${v.__media}" alors qu aucun ` +
                `placement ne lui est associe.\n` +
                `  Sans placement, les conditions 5 et 7 du §6.7 ne verraient pas cet emploi.`
            );
          }
          renvois.push({ cle: v.__media, placement });
        } else Object.values(v).forEach(visiter);
      }
    };
    visiter(bloc);
  }
  return renvois;
}

/* ------------------------------------------------------------------ */
/* Surcharge SEO (`partage.seo`)                                        */
/* ------------------------------------------------------------------ */

/**
 * Les seules cles du component `partage.seo` (src/components/partage/seo.json).
 *
 * La liste est CLOSE : une cle hors de cette liste est refusee. Sans ce refus,
 * un `metaTitle` ecrit a l anglaise — ou n importe quelle faute de frappe — serait
 * charge, transmis, et jete par Strapi sans un mot. La surcharge ne sortirait pas,
 * et rien dans la chaine ne le dirait.
 */
const CLES_SEO = [
  'metaTitre',
  'metaDescription',
  'imagePartage',
  'alternativePartage',
  'noindex',
  'canonique',
] as const;

/** A-26 : la contrainte `maxLength` du champ Strapi, tenue des la LECTURE. */
const LONGUEUR_META_TITRE = 60;
const LONGUEUR_META_DESCRIPTION = 160;

/**
 * Lit et valide une surcharge `partage.seo`, ou rend `undefined` si l entree n en
 * porte pas.
 *
 * Tout est verifie ICI, avant la moindre ecriture : le seed sert a reconstruire
 * l environnement depuis le depot, et un corpus qui casse a mi-parcours laisserait
 * une base a moitie remplie. Une longueur refusee par Strapi au 40e article serait
 * decouverte exactement au pire moment.
 */
function lireSeo(
  brut: unknown,
  contexte: string,
  exigerMedia: (cle: string, contexte: string, placement: Placement, entite: string) => string,
  entite: string
): SeoCorpus | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (typeof brut !== 'object' || Array.isArray(brut)) {
    throw new ErreurCorpus(`${contexte} : seo doit etre un objet`);
  }

  const seo = brut as Record<string, unknown>;
  for (const cle of Object.keys(seo)) {
    if (!(CLES_SEO as readonly string[]).includes(cle)) {
      throw new ErreurCorpus(
        `${contexte} : seo porte la cle inconnue "${cle}" — les seules cles du component ` +
          `partage.seo sont ${CLES_SEO.join(', ')}`
      );
    }
  }

  const texteBorne = (cle: 'metaTitre' | 'metaDescription', maximum: number): string | undefined => {
    const valeur = seo[cle];
    if (valeur === undefined) return undefined;
    if (typeof valeur !== 'string' || valeur.trim() === '') {
      throw new ErreurCorpus(`${contexte} : seo.${cle} doit etre un texte non vide`);
    }
    if (valeur.length > maximum) {
      throw new ErreurCorpus(
        `${contexte} : seo.${cle} fait ${valeur.length} caracteres, le maximum est ${maximum} ` +
          `(A-26 ; le champ Strapi porte la meme borne et refuserait l ecriture)`
      );
    }
    return valeur;
  };

  const noindex = seo.noindex;
  if (noindex !== undefined && typeof noindex !== 'boolean') {
    throw new ErreurCorpus(
      `${contexte} : seo.noindex doit etre un booleen — « ${String(noindex)} » n en est pas un, ` +
        'et une chaine non vide serait vraie partout ou elle est relue'
    );
  }

  const canonique = seo.canonique;
  if (canonique !== undefined) {
    if (typeof canonique !== 'string' || !/^https?:\/\//.test(canonique)) {
      throw new ErreurCorpus(
        `${contexte} : seo.canonique doit etre une URL ABSOLUE (A-27) — « ${String(canonique)} » ` +
          'ne l est pas, et une canonique relative est ignoree par Google'
      );
    }
  }

  const imagePartage = seo.imagePartage;
  if (imagePartage !== undefined) {
    if (typeof imagePartage !== 'string') {
      throw new ErreurCorpus(`${contexte} : seo.imagePartage doit etre une cle du manifeste`);
    }
    exigerMedia(imagePartage, `${contexte} : seo.imagePartage`, 'partage-seo', entite);
    // Meme exigence que `imagePartageDefaut` : une carte de partage doit etre
    // rasterisable, sinon les plateformes n affichent aucune image sans qu aucun
    // fichier ne manque.
    exigerFormatDePartage(imagePartage, `${contexte} : seo.imagePartage`);
  }

  /* LA SURCHARGE LOCALISEE DE L ALTERNATIVE DE LA CARTE (A-04 amende, 2026-08-16).
     Deux refus a l entree, pour la meme raison que partout ailleurs : une surcharge
     BLANCHE ecraserait l alternative de la mediatheque par du silence, et une surcharge
     SANS carte ne surchargerait rien — le site retomberait sur l image generee au build
     ou sur celle par defaut, avec l alternative de celles-ci, pendant que son auteur
     croirait avoir traduit. Dans les deux cas, refuser ici est le seul endroit ou
     quelqu un le voit : plus loin, tout se passe sans erreur. */
  const alternativePartage = seo.alternativePartage;
  if (alternativePartage !== undefined) {
    if (typeof alternativePartage !== 'string' || estBlanc(alternativePartage)) {
      throw new ErreurCorpus(
        `${contexte} : seo.alternativePartage doit etre un texte non blanc — recu ` +
          `${JSON.stringify(alternativePartage)}.\n` +
          `  Une surcharge blanche n est pas « pas de surcharge » : elle ECRASE l alternative\n` +
          `  de la mediatheque par du silence. Pour ne pas surcharger, OMETTRE le champ.`
      );
    }
    if (imagePartage === undefined) {
      throw new ErreurCorpus(
        `${contexte} : seo.alternativePartage est pose SANS seo.imagePartage.\n` +
          `  Il n y a alors aucune carte a surcharger : la page servira l image generee au\n` +
          `  build ou celle par defaut, avec l alternative de CELLES-CI, et cette surcharge\n` +
          `  ne partira nulle part.`
      );
    }
  }

  return {
    metaTitre: texteBorne('metaTitre', LONGUEUR_META_TITRE),
    metaDescription: texteBorne('metaDescription', LONGUEUR_META_DESCRIPTION),
    imagePartage: imagePartage as string | undefined,
    alternativePartage: alternativePartage as string | undefined,
    noindex: noindex as boolean | undefined,
    canonique: canonique as string | undefined,
  };
}

/**
 * A-08 : `Auteur` et `Tag` n ont PAS de component `seo`, et c est un arbitrage —
 * leurs pages recoivent un SEO 100 % calcule au build.
 *
 * On refuse donc explicitement plutot que d ignorer : une surcharge posee la ne
 * partirait nulle part, et son auteur croirait l avoir posee. Si le besoin apparait
 * un jour, c est un ajout de champ au modele, pas un contournement par le corpus.
 */
function refuserSeo(porteur: unknown, contexte: string): void {
  if (porteur && typeof porteur === 'object' && 'seo' in (porteur as Record<string, unknown>)) {
    throw new ErreurCorpus(
      `${contexte} : cette famille ne porte pas de component seo (A-08). Son SEO est ` +
        'entierement calcule au build ; une surcharge ecrite ici ne serait jamais lue.'
    );
  }
}

/* ------------------------------------------------------------------ */
/* Chargement                                                          */
/* ------------------------------------------------------------------ */

/**
 * Les formats d image qu une plateforme de partage RASTERISE reellement.
 *
 * Ce ne sont pas les formats du site : le §5.3 impose l AVIF pour les images de contenu,
 * et le corpus de demonstration est en SVG d un bout a l autre — les deux sont ignores par
 * Facebook, LinkedIn et X sur une carte de partage.
 */
export const FORMATS_DE_PARTAGE = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * L image de partage par defaut doit etre dans un format que les plateformes rendent.
 *
 * LE DEFAUT QUE CETTE GARDE FERME (2026-08-11, tache 9b173668). `imagePartageDefaut`
 * pointait `identite/partage-defaut.svg`. Or c est la SEULE image de partage des pages
 * sans article — accueil, rubriques, auteurs, dossiers : leur `og:image` sortait donc en
 * `image/svg+xml`, releve sur la production le 2026-08-11
 * (`https://echo.ayfiweb.fr/medias/partage_defaut_8285eac923.svg`, `og:image:type` =
 * `image/svg+xml`). Facebook, LinkedIn et X ne rasterisent pas le SVG : ces pages
 * n avaient AUCUNE image de partage, et rien ne le disait — le fichier existait, la balise
 * pointait dessus, elle resolvait. Succes et echec rendaient la meme sortie.
 *
 * ET LES FIXTURES NE POUVAIENT PAS LE VOIR : `apps/web/tests/fixtures/configuration-*.json`
 * portent un `partage_defaut_99aa.jpg`. L integration continue etait donc verte sur un
 * corpus qui n est pas celui de la production. C est ici, sur la DONNEE REELLE, que le
 * controle a sa place.
 */
export function exigerFormatDePartage(cle: string, contexte: string): void {
  const extension = cle.slice(cle.lastIndexOf('.')).toLowerCase();
  if (!FORMATS_DE_PARTAGE.includes(extension)) {
    throw new ErreurCorpus(
      `${contexte} : "${cle}" est en ${extension || '(sans extension)'}.\n` +
        `  Une carte de partage doit etre dans un format que les plateformes RASTERISENT\n` +
        `  (${FORMATS_DE_PARTAGE.join(', ')}). Le SVG et l AVIF sont ignores par Facebook,\n` +
        `  LinkedIn et X : la page n'a alors aucune image de partage, sans qu'aucune balise\n` +
        `  ne manque ni qu'aucun fichier ne soit absent.`
    );
  }
}

export function chargerCorpus(racine: string): Corpus {
  if (!fs.existsSync(racine)) {
    throw new ErreurCorpus(`dossier de corpus absent : ${racine}`);
  }

  const { liste: medias, parCle: mediasParCle } = chargerMedias(racine);
  const mediasUtilises = new Set<string>();
  const exigerMedia = (cle: string, contexte: string, placement: Placement, entite: string) => {
    const media = mediasParCle.get(cle);
    if (!media) {
      throw new ErreurCorpus(
        `${contexte} : le media "${cle}" n'est pas au manifeste (data/medias/manifeste.json)`
      );
    }
    mediasUtilises.add(cle);
    if (!media.placements.includes(placement)) media.placements.push(placement);
    if (!media.emplois.includes(entite)) media.emplois.push(entite);
    return cle;
  };

  /**
   * LA SURCHARGE LOCALISEE DE L ALTERNATIVE, et les deux seules facons de la rater.
   *
   * Elle est FACULTATIVE, et son absence dit « prends l `alternativeText` de la
   * mediatheque ». Ce qui est refuse, ce n est donc pas de ne rien ecrire — c est
   * d ecrire quelque chose qui ne veut rien dire :
   *
   *  1. UNE SURCHARGE BLANCHE. « Absente » et « blanche » ne se ressemblent pas : la
   *     premiere laisse l alternative native passer, la seconde l ECRASE par du
   *     silence. C est le defaut du 2026-08-11 — `alt="   "` servi par un optionnel
   *     qui ne ramenait a `null` que la chaine STRICTEMENT vide —, et il ne doit pas
   *     rentrer par la porte qu on vient d ouvrir. On refuse donc aussi `""` : pour
   *     ne pas surcharger, on OMET le champ.
   *
   *  2. UNE SURCHARGE SUR UN MEDIA `decoratif: true`. Meme contradiction que celle
   *     deja gardee au manifeste : ou l image porte une information — alors elle n est
   *     pas decorative —, ou elle n en porte pas, et la traduire n a aucun sens. Sans
   *     cette garde, `decoratif` cesserait d etre opposable des qu on passe par la
   *     surcharge, et « decoratif » redeviendrait la case qu on coche pour se taire.
   */
  const exigerSurcharge = (
    valeur: unknown,
    cleMedia: string | undefined,
    champ: string,
    contexte: string
  ): string | undefined => {
    if (valeur === undefined) return undefined;
    if (typeof valeur !== 'string') {
      throw new ErreurCorpus(
        `${contexte} : \`${champ}\` doit etre un texte, recu ${JSON.stringify(valeur)}.`
      );
    }
    if (estBlanc(valeur)) {
      throw new ErreurCorpus(
        `${contexte} : \`${champ}\` est BLANC.\n` +
          `  Une surcharge blanche n est pas « pas de surcharge » : elle ECRASE l alternative\n` +
          `  de la mediatheque par du silence, et un lecteur d ecran passe l image sans un mot.\n` +
          `  Pour ne pas surcharger, OMETTRE le champ — ne pas le vider.`
      );
    }
    const media = cleMedia ? mediasParCle.get(cleMedia) : undefined;
    if (media?.decoratif) {
      throw new ErreurCorpus(
        `${contexte} : \`${champ}\` surcharge le media "${cleMedia}", declare \`decoratif: true\`.\n` +
          `  Ou l image porte une information — alors elle n est pas decorative —,\n` +
          `  ou elle n en porte pas, et il n y a rien a traduire.\n` +
          `  Recu ${JSON.stringify(valeur)}.`
      );
    }
    return valeur;
  };

  /* --- categories, tags, dossiers, auteurs --- */

  const categories: CategorieCorpus[] = lireJson(path.join(racine, 'categories.json'));
  const tags: TagCorpus[] = lireJson(path.join(racine, 'tags.json'));
  const dossiers: DossierCorpus[] = lireJson(path.join(racine, 'dossiers.json'));
  const auteursBruts: any[] = lireJson(path.join(racine, 'auteurs.json'));

  for (const locale of LOCALES) {
    verifierUnicite(
      categories.filter((c) => c[locale]).map((c) => c[locale]!.slug),
      `Categorie ${locale}`
    );
    verifierUnicite(
      tags.filter((t) => t[locale]).map((t) => t[locale]!.slug),
      `Tag ${locale}`
    );
    verifierUnicite(
      dossiers.filter((d) => d[locale]).map((d) => d[locale]!.slug),
      `Dossier ${locale}`
    );
    verifierUnicite(
      auteursBruts.filter((a) => a[locale]).map((a) => a[locale].slug),
      `Auteur ${locale}`
    );
  }

  for (const c of categories) {
    exigerTexte(c.fr?.nom, `Categorie ${c.fr?.slug} fr : nom`);
    if (c.en) exigerTexte(c.en.nom, `Categorie ${c.en.slug} en : nom`);
    if (c.imageHero) {
      exigerMedia(c.imageHero, `Categorie ${c.fr.slug}`, 'hero-categorie', `Categorie/${c.fr.slug}`);
    }
    refuserSeo(c, `Categorie ${c.fr?.slug} : seo hors locale`);
    for (const locale of LOCALES) {
      const localisee = c[locale];
      if (!localisee) continue;
      localisee.seo = lireSeo(
        localisee.seo,
        `Categorie ${localisee.slug} ${locale}`,
        exigerMedia,
        `Categorie/${localisee.slug}`
      );
      if (localisee.imageHero) {
        exigerMedia(
          localisee.imageHero,
          `Categorie ${localisee.slug} ${locale}`,
          'hero-categorie',
          `Categorie/${localisee.slug}`
        );
      }
      localisee.alternativeHero = exigerSurcharge(
        localisee.alternativeHero,
        localisee.imageHero ?? c.imageHero,
        'alternativeHero',
        `Categorie ${localisee.slug} ${locale}`
      );
    }
  }
  for (const t of tags) {
    exigerTexte(t.fr?.nom, `Tag ${t.fr?.slug} fr : nom`);
    if (t.en) exigerTexte(t.en.nom, `Tag ${t.en.slug} en : nom`);
    refuserSeo(t, `Tag ${t.fr?.slug}`);
    for (const locale of LOCALES) refuserSeo(t[locale], `Tag ${t.fr?.slug} ${locale}`);
  }

  const auteurs: AuteurCorpus[] = auteursBruts.map((a) => {
    exigerTexte(a.nom, `Auteur ${a.fr?.slug} : nom`);
    if (a.photo) exigerMedia(a.photo, `Auteur ${a.fr.slug}`, 'auteur-photo', `Auteur/${a.fr.slug}`);
    refuserSeo(a, `Auteur ${a.fr?.slug}`);
    for (const locale of LOCALES) refuserSeo(a[locale], `Auteur ${a.fr?.slug} ${locale}`);
    const localiser = (l: any, locale: string) =>
      l && {
        slug: l.slug,
        fonction: l.fonction,
        bio: l.bio ? markdownVersBlocks(l.bio) : undefined,
        alternativePhoto: exigerSurcharge(
          l.alternativePhoto,
          a.photo,
          'alternativePhoto',
          `Auteur ${l.slug} ${locale}`
        ),
      };
    return {
      nom: a.nom,
      photo: a.photo,
      reseaux: a.reseaux ?? [],
      fr: localiser(a.fr, 'fr'),
      en: localiser(a.en, 'en'),
    };
  });

  const dossiersLus: DossierCorpus[] = dossiers.map((d: any) => {
    if (d.imageHero) {
      exigerMedia(d.imageHero, `Dossier ${d.fr?.slug}`, 'hero-dossier', `Dossier/${d.fr?.slug}`);
    }
    const localiser = (l: any, locale: string) =>
      l && {
        titre: exigerTexte(l.titre, `Dossier ${l.slug} : titre`),
        slug: l.slug,
        introduction: l.introduction ? markdownVersBlocks(l.introduction) : undefined,
        seo: lireSeo(l.seo, `Dossier ${l.slug}`, exigerMedia, `Dossier/${l.slug}`),
        imageHero: l.imageHero
          ? exigerMedia(l.imageHero, `Dossier ${l.slug} ${locale}`, 'hero-dossier', `Dossier/${l.slug}`)
          : undefined,
        alternativeHero: exigerSurcharge(
          l.alternativeHero,
          l.imageHero ?? d.imageHero,
          'alternativeHero',
          `Dossier ${l.slug} ${locale}`
        ),
      };
    return {
      dateOuverture: d.dateOuverture,
      imageHero: d.imageHero,
      fr: localiser(d.fr, 'fr'),
      en: localiser(d.en, 'en'),
    };
  });

  /* --- articles --- */

  const dossierArticles = path.join(racine, 'articles');
  const fichiers = fs.existsSync(dossierArticles)
    ? fs.readdirSync(dossierArticles).filter((f) => f.endsWith('.md')).sort()
    : [];

  const parCode = new Map<string, ArticleCorpus>();
  for (const fichier of fichiers) {
    const contexte = `data/articles/${fichier}`;
    const attendu = /^([A-Za-z0-9-]+)\.(fr|en)\.md$/.exec(fichier);
    if (!attendu) {
      throw new ErreurCorpus(`${contexte} : nom attendu \`<code>.<fr|en>.md\``);
    }
    const [, code, locale] = attendu;
    const { enTete, blocs } = lireArticle(fs.readFileSync(path.join(dossierArticles, fichier), 'utf8'));

    if (enTete.code !== code || enTete.locale !== locale) {
      throw new ErreurCorpus(
        `${contexte} : l'en-tete annonce ${enTete.code}/${enTete.locale}, le nom de fichier ${code}/${locale}`
      );
    }
    if (blocs.length === 0) {
      throw new ErreurCorpus(`${contexte} : la Dynamic Zone exige au moins un bloc (A-01)`);
    }

    const contenu = blocs.map((b, i) => construireBloc(b, `${contexte} #${i + 1}`));
    for (const r of renvoisMediaDe(contenu)) exigerMedia(r.cle, contexte, r.placement, code);
    /* La surcharge des blocs se valide ICI et pas dans `construireBloc` : sa garde a
       besoin du manifeste pour savoir si le media est DECORATIF, et `construireBloc`
       ne le connait pas. */
    contenu.forEach((bloc, i) => {
      if (bloc.__component !== 'bloc.image-legendee') return;
      bloc.alternative = exigerSurcharge(
        bloc.alternative,
        (bloc.image as RenvoiMedia | undefined)?.__media,
        'alternative',
        `${contexte} #${i + 1}, bloc \`image-legendee\``
      );
    });
    exigerMedia(
      exigerTexte(enTete.imageCouverture, `${contexte} : imageCouverture`),
      contexte,
      'couverture',
      code
    );

    const liees: string[] = enTete.articlesLies ?? [];
    if (liees.length > MAX_ARTICLES_LIES) {
      throw new ErreurCorpus(
        `${contexte} : ${liees.length} articles lies, le maximum est ${MAX_ARTICLES_LIES} (A-13)`
      );
    }

    const article: ArticleLocale = {
      slug: exigerTexte(enTete.slug, `${contexte} : slug`),
      titre: exigerTexte(enTete.titre, `${contexte} : titre`),
      chapo: exigerTexte(enTete.chapo, `${contexte} : chapo`),
      auteur: exigerTexte(enTete.auteur, `${contexte} : auteur (requis)`),
      categorie: exigerTexte(enTete.categorie, `${contexte} : categorie (requise)`),
      tags: enTete.tags ?? [],
      dossier: enTete.dossier,
      articlesLies: liees,
      datePublication: exigerTexte(enTete.datePublication, `${contexte} : datePublication`),
      aLaUne: Boolean(enTete.aLaUne),
      imageCouverture: enTete.imageCouverture,
      legendeCouverture: enTete.legendeCouverture,
      alternativeCouverture: exigerSurcharge(
        enTete.alternativeCouverture,
        enTete.imageCouverture,
        'alternativeCouverture',
        contexte
      ),
      contenu,
      seo: lireSeo(enTete.seo, contexte, exigerMedia, `Article/${code} ${locale}`),
    };

    const existant = parCode.get(code) ?? ({ code } as ArticleCorpus);
    (existant as any)[locale] = article;
    parCode.set(code, existant);
  }

  const articles = [...parCode.values()];
  for (const a of articles) {
    if (!a.fr) throw new ErreurCorpus(`article ${a.code} : la locale fr est obligatoire`);
  }
  for (const locale of LOCALES) {
    verifierUnicite(
      articles.filter((a) => a[locale]).map((a) => a[locale]!.slug),
      `Article ${locale}`
    );
  }

  /* --- integrite des relations, par locale --- */

  for (const locale of LOCALES) {
    const slugsCategorie = new Set(categories.filter((c) => c[locale]).map((c) => c[locale]!.slug));
    const slugsAuteur = new Set(auteurs.filter((a) => a[locale]).map((a) => a[locale]!.slug));
    const slugsTag = new Set(tags.filter((t) => t[locale]).map((t) => t[locale]!.slug));
    const slugsDossier = new Set(dossiersLus.filter((d) => d[locale]).map((d) => d[locale]!.slug));

    for (const a of articles) {
      const art = a[locale];
      if (!art) continue;
      const ctx = `article ${a.code} (${locale})`;
      // Les relations sont citees par leur cle FR : c'est le document qui est
      // designe, Strapi 5 en resout la localisation (A-06). On verifie donc la
      // presence des deux cotes : la cle FR existe, ET la localisation visee aussi.
      if (!slugsCategorie.has(referenceLocale(categories, art.categorie, locale))) {
        throw new ErreurCorpus(`${ctx} : categorie inconnue en ${locale} — "${art.categorie}"`);
      }
      if (!slugsAuteur.has(referenceLocale(auteurs, art.auteur, locale))) {
        throw new ErreurCorpus(`${ctx} : auteur inconnu en ${locale} — "${art.auteur}"`);
      }
      for (const t of art.tags) {
        if (!slugsTag.has(referenceLocale(tags, t, locale))) {
          throw new ErreurCorpus(`${ctx} : tag inconnu en ${locale} — "${t}"`);
        }
      }
      if (art.dossier && !slugsDossier.has(referenceLocale(dossiersLus, art.dossier, locale))) {
        throw new ErreurCorpus(`${ctx} : dossier inconnu en ${locale} — "${art.dossier}"`);
      }
      for (const code of art.articlesLies) {
        const cible = parCode.get(code);
        if (!cible) throw new ErreurCorpus(`${ctx} : article lie inconnu — "${code}"`);
        if (!cible[locale]) {
          throw new ErreurCorpus(
            `${ctx} : article lie "${code}" sans localisation ${locale}.\n` +
              `  Une relation lie des entrees de MEME locale (A-06) : la citer ici la ferait\n` +
              `  pointer une entree francaise depuis une page anglaise, sans qu'aucune erreur ne monte.`
          );
        }
      }
    }
  }

  /* --- configuration --- */

  const configuration: ConfigurationCorpus = lireJson(path.join(racine, 'configuration.json'));
  for (const champ of ['logo', 'imagePartageDefaut'] as const) {
    exigerMedia(
      exigerTexte(configuration[champ], `configuration : ${champ} (requis)`),
      'configuration',
      'configuration',
      `Configuration/${champ}`
    );
  }
  exigerFormatDePartage(configuration.imagePartageDefaut, 'configuration : imagePartageDefaut');
  for (const champ of ['logoSombre', 'favicon'] as const) {
    if (configuration[champ]) {
      exigerMedia(configuration[champ]!, 'configuration', 'configuration', `Configuration/${champ}`);
    }
  }
  const localiserConfig = (l: any, nom: string) =>
    l && {
      nomSite: exigerTexte(l.nomSite, `configuration ${nom} : nomSite`),
      baseline: l.baseline,
      descriptionDefaut: exigerTexte(l.descriptionDefaut, `configuration ${nom} : descriptionDefaut`),
      texteFooter: l.texteFooter ? markdownVersBlocks(l.texteFooter) : undefined,
      mentionsLegales: markdownVersBlocks(
        exigerTexte(l.mentionsLegales, `configuration ${nom} : mentionsLegales (requis)`)
      ),
      alternativeLogo: exigerSurcharge(
        l.alternativeLogo,
        configuration.logo,
        'alternativeLogo',
        `configuration ${nom}`
      ),
      alternativePartageDefaut: exigerSurcharge(
        l.alternativePartageDefaut,
        configuration.imagePartageDefaut,
        'alternativePartageDefaut',
        `configuration ${nom}`
      ),
    };
  const config: ConfigurationCorpus = {
    ...configuration,
    reseaux: configuration.reseaux ?? [],
    fr: localiserConfig(configuration.fr, 'fr'),
    en: localiserConfig(configuration.en, 'en'),
  };

  /* --- medias orphelins : signale, jamais silencieux --- */

  const orphelins = medias.filter((m) => !mediasUtilises.has(m.cle));
  if (orphelins.length > 0) {
    throw new ErreurCorpus(
      `medias au manifeste mais utilises nulle part : ${orphelins.map((m) => m.cle).join(', ')}.\n` +
        `  Un media televersse sans emploi gonfle la mediatheque et fausse le comptage du controle 5.`
    );
  }

  /* --- conditions 5, 6 et 7 de la garde du §6.7 --- */

  // Elles se jugent ICI et pas dans `chargerMedias` : elles dependent du
  // PLACEMENT, qui n'est connu qu'une fois tout le corpus parcouru. Un media
  // n'est ni « une couverture » ni « un portrait » en soi — il l'est par
  // l'emploi que le corpus en fait.
  //
  // On collecte TOUS les manquements avant de lever : rendre le premier
  // transformerait une revue en jeu de piste, et c'est ce qui fait desarmer une
  // garde.
  const racineMedias = path.join(racine, 'medias');
  const manquements: string[] = [];
  for (const media of medias) {
    for (const verdict of [
      verifierPlacementVoieC(media.voie, media.placements, media.cle),
      verifierSidecarVoieC(media.voie, media.cle, racineMedias, media.licence),
      verifierPortraitAuteur(media.voie, media.licence, media.placements, media.cle, racineMedias),
    ]) {
      if (!verdict.conforme) manquements.push(verdict.motif);
    }
  }
  if (manquements.length > 0) {
    throw new ErreurCorpus(
      `garde des medias (plan editorial §6.7) — ${manquements.length} manquement(s) :\n` +
        manquements.map((m) => `  - ${m}`).join('\n')
    );
  }

  return {
    racine,
    medias,
    categories,
    tags,
    auteurs,
    dossiers: dossiersLus,
    articles,
    configuration: config,
  };
}

/**
 * Les relations sont citees par leur slug FR (cle canonique du document).
 * Cette fonction rend le slug de la locale demandee pour ce meme document.
 */
export function referenceLocale<T extends { fr: { slug: string }; en?: { slug: string } }>(
  entrees: T[],
  slugFr: string,
  locale: 'fr' | 'en'
): string {
  const entree = entrees.find((e) => e.fr?.slug === slugFr);
  if (!entree) return '';
  return (entree[locale] as { slug: string } | undefined)?.slug ?? '';
}
