/**
 * L URL d un media, construite ICI ET NULLE PART AILLEURS.
 *
 * LE DEFAUT QUE CE FICHIER A PORTE, ecrit pour qu il ne revienne pas. Jusqu au
 * 2026-08-09, `urlMedia` ABSOLUTISAIT les URL relatives du provider local de Strapi
 * contre `ECHO_STRAPI_URL` : `/uploads/A01.svg` sortait en
 * `https://echoback.ayfiweb.fr/uploads/A01.svg`. Le raisonnement avait l air solide — le
 * provider local rend des URL relatives, servies telles quelles depuis `echo.ayfiweb.fr`
 * elles ne pointent nulle part — et il etait faux, parce qu il concluait « donc vers le
 * CMS » la ou T-01 dit « donc depuis notre domaine ». Resultat mesure sur le site en
 * ligne (recette du 2026-08-08, tache `e100971e`) : la CSP servie porte
 * `img-src 'self' data:`, les 21 balises `<img>` de l accueil pointaient le CMS, et le
 * navigateur les REFUSAIT toutes. Sur 86 URL, l inventaire reseau relevait 193 requetes
 * — 86 documents, 107 feuilles de style, ZERO image. Les fichiers repondaient pourtant
 * en 200 : ce n etait pas une image manquante, c etait une image INTERDITE.
 *
 * CE QUI N AVAIT PAS DEVIE. La CSP appliquait exactement l arbitrage T-01
 * (`docs/arbitrages-techniques.md`) : « l image de vignette servie depuis notre propre
 * domaine, telechargee au build ». Elargir `img-src` aurait defait un arbitrage ratifie
 * pour couvrir un ecart d implementation. C est le front qui revient sur T-01.
 *
 * COMMENT. Le chemin rendu est ENRACINE SUR LE SITE, sous `/medias/`. Les octets sont
 * telecharges depuis la mediatheque a la fin du build par
 * `integrations/medias-locaux.mjs`, qui reconstruit la source distante avec
 * `sourceDistanteMedia`. Le site sert donc ses propres fichiers, et
 * `ECHO_STRAPI_URL` cesse d apparaitre dans une page.
 *
 * CE QUE CE FICHIER NE TRANCHE PAS. Le FORMAT des medias (SVG servi tel quel, ou derive
 * AVIF + repli WebP par Sharp — decision `129b7fc6`, en attente d Aymeric) est une autre
 * question : localiser un fichier et choisir son format sont independants. Quelle que
 * soit la branche retenue, elle s appliquera a des fichiers deja servis par le site.
 */
import type { Media } from './domaine.ts';

/** Le prefixe sous lequel le SITE sert ses medias. */
export const PREFIXE_MEDIAS = '/medias/';

/**
 * LA CLASSE DE CARACTÈRES DES CHEMINS DE MÉDIAS — un seul littéral, deux usages.
 *
 * Elle est **ÉCRITE** par `cheminLocalMedia` (ci-dessous, qui lève si un chemin en sort) et
 * **LUE** par `scripts/medias-locaux.mjs`, qui construit sa regex de relecture à partir d'elle.
 * Les deux côtés lisaient auparavant DEUX littéraux identiques, et rien ne garantissait qu'ils
 * le restent : la coïncidence était une **convention** écrite dans un docblock.
 *
 * ⚠️ CE QUE LA DIVERGENCE COÛTERAIT, ET POURQUOI UNE SEULE DES DEUX FORMES EST SILENCIEUSE.
 * Si un caractère hors classe apparaissait dans un nom de fichier :
 *   · **au MILIEU** — la relecture tronque la référence, le téléchargement part sur un chemin
 *     coupé, Strapi rend 404, et le build ROUGIT. Ce cas se voit tout seul.
 *   · **en PREMIÈRE position** après `/medias/` — la regex ne matche **rien du tout**. Aucun
 *     téléchargement n'est tenté, la page pointe un fichier jamais déposé, le build est **VERT**
 *     et l'image morte en ligne. **C'est le seul cas silencieux**, et c'est celui que
 *     l'assertion de `cheminLocalMedia` ferme.
 *
 * ON LÈVE, ON NE RÉPARE PAS. Filtrer, normaliser ou échapper masquerait un changement du
 * producteur — c'est-à-dire précisément l'événement qu'on veut voir. La médiathèque ne peut
 * aujourd'hui rien émettre hors de cette classe (`@strapi/upload` remplace le nom par
 * `nameToSlug` + 10 hexadécimaux, mesuré au contrôle `9181da31`) ; le jour où ce ne serait plus
 * vrai, le build doit s'arrêter, pas s'adapter.
 *
 * La classe n'est **pas élargie** : distinguer l'espace séparateur d'un `srcset` de l'espace
 * d'un nom de fichier est impossible, et c'est ce qui a fait écarter cette voie.
 */
export const CARACTERES_MEDIA = 'A-Za-z0-9._~%\\-/';

/** La même classe, compilée une fois, pour vérifier qu'un chemin y tient ENTIÈREMENT. */
const CHEMIN_CONFORME = new RegExp(`^[${CARACTERES_MEDIA}]+$`);

/** Le prefixe sous lequel STRAPI sert les siens (provider local, runbook etapes 7 et 14). */
export const PREFIXE_UPLOADS = '/uploads/';

/** Ce que porte tout message de refus : la cause tient en une reference. */
const RENVOI_T01 =
  'T-01 (docs/arbitrages-techniques.md) : le media est servi DEPUIS NOTRE DOMAINE, ' +
  'telecharge au build. Une URL vers un autre hote sortirait une balise que la CSP du ' +
  "site (`img-src 'self' data:`) refuse — c est le defaut mesure le 2026-08-08.";

/**
 * Le sous-chemin d une URL de mediatheque, quelle que soit sa forme.
 *
 * Rend `null` quand l URL ne designe pas la mediatheque — l appelant decide quoi en
 * faire ; ici, on ne devine pas.
 */
function sousCheminMediatheque(url: string): string | null {
  if (url === '') return null;

  const chemin = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
    ? (() => {
        try {
          return new URL(url, 'https://invalide.invalid').pathname;
        } catch {
          return null;
        }
      })()
    : url.split('#')[0].split('?')[0];

  if (chemin === null || !chemin.startsWith(PREFIXE_UPLOADS)) return null;
  const reste = chemin.slice(PREFIXE_UPLOADS.length);
  return reste === '' ? null : reste;
}

/**
 * Le chemin SUR LE SITE d une URL de mediatheque Strapi.
 *
 * Leve plutot que de recopier une URL etrangere : une balise que la CSP refusera doit
 * arreter le build, pas produire une page dont l image ne s affichera jamais. La garde
 * `integrations/garde-origine-medias.mjs` tient la meme regle sur la SORTIE, parce
 * qu une URL peut aussi entrer dans une page sans passer par ici.
 */
export function cheminLocalMedia(url: string): string {
  const reste = sousCheminMediatheque(url);
  if (reste === null) {
    throw new Error(`URL de media hors de la mediatheque : « ${url} ». ${RENVOI_T01}`);
  }
  if (!CHEMIN_CONFORME.test(reste)) {
    // Le caractère est NOMMÉ : « un chemin invalide » enverrait relire toute la chaîne, alors
    // que la seule chose à regarder est ce que la médiathèque a émis.
    const fautif = [...reste].find((c) => !CHEMIN_CONFORME.test(c));
    throw new Error(
      `Nom de media hors de la classe de caracteres : « ${fautif} » dans « ${url} ». `
      + `Le lecteur de scripts/medias-locaux.mjs ne saurait pas relire ce chemin — s il est en `
      + `PREMIERE position, sa regex ne matche RIEN, aucun telechargement n est tente, et la page `
      + `pointerait un fichier JAMAIS DEPOSE avec un build vert. On leve donc, sans filtrer ni `
      + `normaliser : reparer masquerait un changement du producteur, qui est justement ce qu il `
      + `faut voir. Classe attendue : [${CARACTERES_MEDIA}] (cf. CARACTERES_MEDIA ci-dessus).`,
    );
  }
  return `${PREFIXE_MEDIAS}${reste}`;
}

/** L URL a ecrire dans une page pour un media. */
export function urlMedia(media: Media): string {
  return cheminLocalMedia(media.url);
}

/**
 * L inverse : d ou telecharger les octets d un media local, au build.
 *
 * @param cheminLocal Un chemin rendu par `cheminLocalMedia`.
 * @param baseStrapi `ECHO_STRAPI_URL`, avec ou sans slash final.
 */
export function sourceDistanteMedia(cheminLocal: string, baseStrapi: string): string {
  if (!cheminLocal.startsWith(PREFIXE_MEDIAS)) {
    throw new Error(
      `« ${cheminLocal} » n est pas un chemin de media local (attendu : ${PREFIXE_MEDIAS}…).`,
    );
  }
  const base = baseStrapi.replace(/\/+$/, '');
  return `${base}${PREFIXE_UPLOADS}${cheminLocal.slice(PREFIXE_MEDIAS.length)}`;
}
