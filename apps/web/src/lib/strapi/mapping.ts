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
 * Trois invariants, tenus par `lecture.ts` :
 *   1. une cle demandee par le populate DOIT exister — son absence leve ;
 *   2. `null` est une valeur legitime pour un optionnel, jamais pour un requis ;
 *   3. un `slug` est un SEGMENT D URL, pas une chaine quelconque (`slugRequis`, A-09) —
 *      c est la garde de build du 2026-08-11, la seule qui tienne quel que soit le
 *      chemin d ecriture, `minLength: 1` cote Strapi ne couvrant que l entity-validator.
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
  slugRequis,
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
    // `caption` natif : le credit se LIT ici, il ne se recopie dans aucune entite (§6.5).
    legende: texteOptionnel(brut, 'caption', chemin),
    largeur: nombreOptionnel(brut, 'width', chemin),
    hauteur: nombreOptionnel(brut, 'height', chemin),
    mime: texteOptionnel(brut, 'mime', chemin),
  };
}

/**
 * LA SURCHARGE LOCALISEE DE L ALTERNATIVE — appliquee ICI, une fois, pour tout le site.
 *
 * L `alternativeText` de la mediatheque est UNE valeur par fichier, sans locale :
 * `plugin::upload.file` ne porte aucune entree i18n, et le plugin upload ecrit par
 * `strapi.db.query`, jamais par le Document Service. Les pages anglaises servaient donc
 * des alternatives FRANCAISES — 28 textes distincts sur 41 pages, mesure le 2026-08-14.
 * La parade est un champ LOCALISE pose a cote du media (`alternativeCouverture`,
 * `alternativeHero`, `alternativePhoto`, `alternativeLogo`, `alternative` du bloc,
 * `alternativePartage` du composant `partage.seo`, `alternativeVignette` de `bloc.video`).
 *
 * LES TROIS PORTEURS QUE LA REVUE DES HUIT BLOCS A RELEVES (A-04, 2026-08-17), et ou ils en
 * sont depuis la decision `5ca1ca4b` (branche A), amendee le 2026-08-19 :
 *   1. `bloc.video.vignette`      — COUVERT ici, par `alternativeVignette` ;
 *   2. `bloc.galerie.images`      — COUVERT, mais PAS ici : chaque entree du repetable
 *      `images` porte son `alternative` a cote de son `image`, et le mapping se contente
 *      de la lire (cf. `case 'bloc.galerie'`). Il n y a plus d appariement a faire, donc
 *      plus de fonction dediee — c est exactement ce que la refonte du 2026-08-19 achete ;
 *   3. le noeud `image` d un champ `blocks` (`bloc.texte.contenu`, `bloc.encadre.contenu`)
 *      — NON COUVERT, et il ne peut pas l etre d ici : `richTexte()` est un transtypage,
 *      il ne traverse pas les noeuds, et un noeud de Blocks n a aucun champ voisin ou
 *      poser une surcharge. `RichTexte.astro` y lit l `alternativeText` NATIF en clair.
 *      Trou connu, ecrit plutot que comble — cf. A-04 dans `docs/modele-donnees.md`.
 *
 * POURQUOI LE REPLI EST ICI ET PAS DANS LES COMPOSANTS. Il y a sept endroits ou un `alt`
 * sort d un media. Leur demander a chacun de se souvenir du repli, c est sept occasions
 * de l oublier — et l oubli serait SILENCIEUX, un alt francais restant un alt valide.
 * Applique au mapping, le rendu ignore d ou vient l alternative : il n y a plus rien a
 * oublier, et la garde tient sur `mapper*` plutot que sur sept fichiers `.astro`.
 *
 * `texteOptionnel` ramene `null` sur une chaine blanche : une surcharge blanche ne
 * remplace donc RIEN, et l alternative native passe. C est la meme doctrine qu ailleurs
 * — refuser a l entree (la garde du seed refuse d ecrire une surcharge blanche), etre
 * honnete a la sortie.
 */
function avecSurcharge(media: Media, surcharge: string | null): Media {
  return surcharge === null ? media : { ...media, alternative: surcharge };
}

/** La meme chose sur un media FACULTATIF : pas de media, rien a surcharger. */
function surchargerOptionnel(media: Media | null, surcharge: string | null): Media | null {
  return media === null ? null : avecSurcharge(media, surcharge);
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
    imagePartage: surchargerOptionnel(
      mediaOptionnel(brut, 'imagePartage', ici),
      texteOptionnel(brut, 'alternativePartage', ici),
    ),
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
      slug: slugRequis(brut, 'slug', ici),
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
    slug: slugRequis(brut, 'slug', ici),
  };
}

function referenceCategorie(source: unknown, chemin: string): ReferenceCategorie {
  const brut = objetRequis(source, 'categorie', chemin);
  const ici = `${chemin}.categorie`;
  return {
    documentId: documentId(brut, ici),
    nom: texteRequis(brut, 'nom', ici),
    slug: slugRequis(brut, 'slug', ici),
    couleurAccent: couleurAccent(brut, ici),
  };
}

function referencesTags(source: unknown, chemin: string): ReferenceTag[] {
  return listeOuVide(source, 'tags', chemin).map((brut, index) => {
    const ici = `${chemin}.tags[${index}]`;
    return {
      documentId: documentId(brut, ici),
      nom: texteRequis(brut, 'nom', ici),
      slug: slugRequis(brut, 'slug', ici),
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
    slug: slugRequis(brut, 'slug', ici),
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
        slug: slugRequis(brut, 'slug', ici),
        chapo: texteRequis(brut, 'chapo', ici),
        imageCouverture: avecSurcharge(
          mediaRequis(brut, 'imageCouverture', ici),
          texteOptionnel(brut, 'alternativeCouverture', ici),
        ),
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

    /**
     * LA GALERIE — `images` est un REPETABLE `{ image, alternative }` depuis le 2026-08-19.
     *
     * CE QUE CETTE FORME SUPPRIME, et pourquoi il n y a plus une ligne de logique ici.
     * Jusqu au 2026-08-19, l alternative vivait dans une table `alternatives` posee A COTE
     * de la galerie, et une fonction dediee la rapprochait des images par l url du fichier.
     * L appariement obligeait a trois refus (entree orpheline, doublon, entree blanche) —
     * tous justes, tous inutiles aujourd hui, et surtout tous invisibles la ou la faute se
     * commettait : dans l admin Strapi, ou le picker media rouvre toute la mediatheque sans
     * rien dire de ce qui est deja dans `images`. Le redacteur qui se trompait ne voyait
     * aucune erreur ; il voyait un build casse, plus tard, ailleurs.
     *
     * Ici, l entree EST l image. Il n y a plus rien a apparier — donc plus d orphelin (une
     * entree de plus est une IMAGE de plus), plus de doublon a departager (le meme fichier
     * deux fois, ce sont deux images, chacune avec sa ligne), plus de rang a craindre
     * (reordonner deplace la paire entiere). Le mapping se contente de LIRE.
     *
     * `texteOptionnel` ramene `null` sur une chaine blanche : une alternative vide laisse
     * donc passer l `alternativeText` natif, exactement comme les six autres porteurs. Le
     * refus de l entree blanche n a plus lieu d etre — vide est le cas NORMAL, les images
     * decoratives n ayant aucune surcharge a porter.
     */
    case 'bloc.galerie':
      return {
        type: 'bloc.galerie',
        images: listeRequise(brut, 'images', chemin).map((entree, index) => {
          const ici = `${chemin}.images[${index}]`;
          return avecSurcharge(
            media(objetRequis(entree, 'image', ici), `${ici}.image`),
            texteOptionnel(entree, 'alternative', ici),
          );
        }),
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
        vignette: surchargerOptionnel(
          mediaOptionnel(brut, 'vignette', chemin),
          texteOptionnel(brut, 'alternativeVignette', chemin),
        ),
      };

    case 'bloc.image-legendee':
      return {
        type: 'bloc.image-legendee',
        image: avecSurcharge(
          mediaRequis(brut, 'image', chemin),
          texteOptionnel(brut, 'alternative', chemin),
        ),
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
    slug: slugRequis(brut, 'slug', chemin),
    chapo: texteRequis(brut, 'chapo', chemin),
    contenu: listeRequise(brut, 'contenu', chemin).map((element, index) =>
      bloc(element, `${chemin}.contenu[${index}]`),
    ),
    imageCouverture: avecSurcharge(
      mediaRequis(brut, 'imageCouverture', chemin),
      texteOptionnel(brut, 'alternativeCouverture', chemin),
    ),
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
    slug: slugRequis(brut, 'slug', chemin),
    fonction: texteOptionnel(brut, 'fonction', chemin),
    bio: blocksOptionnel(brut, 'bio', chemin) as NoeudRichTexte[] | null,
    photo: surchargerOptionnel(
      mediaOptionnel(brut, 'photo', chemin),
      texteOptionnel(brut, 'alternativePhoto', chemin),
    ),
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
    slug: slugRequis(brut, 'slug', chemin),
    description: texteOptionnel(brut, 'description', chemin),
    couleurAccent: couleurAccent(brut, chemin),
    imageHero: surchargerOptionnel(
      mediaOptionnel(brut, 'imageHero', chemin),
      texteOptionnel(brut, 'alternativeHero', chemin),
    ),
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
    slug: slugRequis(brut, 'slug', chemin),
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
        slug: slugRequis(element, 'slug', ici),
        datePublication: texteRequis(element, 'datePublication', ici),
      };
    })
    // A-18 : une serie se lit du premier au dernier episode, pas comme un fil d actualite.
    .sort((a, b) => a.datePublication.localeCompare(b.datePublication));

  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    titre: texteRequis(brut, 'titre', chemin),
    slug: slugRequis(brut, 'slug', chemin),
    introduction: blocksOptionnel(brut, 'introduction', chemin) as NoeudRichTexte[] | null,
    imageHero: surchargerOptionnel(
      mediaOptionnel(brut, 'imageHero', chemin),
      texteOptionnel(brut, 'alternativeHero', chemin),
    ),
    articles,
    dateOuverture: texteOptionnel(brut, 'dateOuverture', chemin),
    seo: seo(brut, chemin),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
    localisations: localisations(brut, chemin),
  };
}

export function mapperConfiguration(brut: unknown): Configuration {
  const chemin = 'configuration';
  /* UNE seule surcharge pour les DEUX logos, et c est voulu : dans le `<picture>` de
     `EnTete.astro`, le logo sombre est un `<source srcset>` — qui n a pas d attribut
     `alt`. L alternative rendue vient toujours du `<img>` de repli, donc du logo clair.
     Un second champ laisserait croire qu il sert a quelque chose. Le `favicon` n en
     porte aucune : un `<link rel="icon">` ne rend jamais d alternative. */
  const alternativeLogo = texteOptionnel(brut, 'alternativeLogo', chemin);
  return {
    documentId: documentId(brut, chemin),
    locale: locale(brut, chemin),
    nomSite: texteRequis(brut, 'nomSite', chemin),
    baseline: texteOptionnel(brut, 'baseline', chemin),
    logo: avecSurcharge(mediaRequis(brut, 'logo', chemin), alternativeLogo),
    logoSombre: surchargerOptionnel(mediaOptionnel(brut, 'logoSombre', chemin), alternativeLogo),
    favicon: mediaOptionnel(brut, 'favicon', chemin),
    descriptionDefaut: texteRequis(brut, 'descriptionDefaut', chemin),
    imagePartageDefaut: avecSurcharge(
      mediaRequis(brut, 'imagePartageDefaut', chemin),
      texteOptionnel(brut, 'alternativePartageDefaut', chemin),
    ),
    reseaux: reseaux(brut, chemin),
    texteFooter: blocksOptionnel(brut, 'texteFooter', chemin) as NoeudRichTexte[] | null,
    mentionsLegales: richTexte(blocksRequis(brut, 'mentionsLegales', chemin)),
    updatedAt: texteRequis(brut, 'updatedAt', chemin),
  };
}
