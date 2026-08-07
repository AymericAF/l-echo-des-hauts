/**
 * La politique d indexation d une page — A-29, et rien d autre.
 *
 * A-29 (`docs/modele-donnees.md`) : « `noindex: true` -> la page porte
 * `<meta name="robots" content="noindex">` **et sort du sitemap**. Declarer dans le
 * sitemap une URL qu on demande par ailleurs de ne pas indexer est une contradiction
 * que la Search Console remonte comme erreur. Un seul champ, une seule intention,
 * appliquee aux deux points de lecture. »
 *
 * D ou ce module : les DEUX points de lecture (le `<head>` d une page, la construction
 * du sitemap) appellent la meme fonction. Avant lui, le `noindex` de
 * `/mentions-legales` etait ecrit en dur dans `src/pages/mentions-legales.astro`
 * (commit `d369449`) — une decision qu aucun autre code ne pouvait lire sans la
 * recopier. Le sitemap aurait donc porte sa propre liste, et le jour ou l une des deux
 * bouge, l autre ne le sait pas : c est la contradiction exacte qu A-29 interdit.
 *
 * Ce module ne TRANCHE aucune politique : il transcrit celle du code en place. En
 * particulier, `/mentions-legales` reste `noindex` — la decision `463b2551` qui arbitre
 * cet ecart avec la table de volumetrie du protocole de mesure attend Aymeric, et un
 * run autonome ne la prend pas a sa place.
 */
import type { Auteur, Categorie, Dossier, Seo, Tag } from '../domaine.ts';
import type { Famille, PageStatique } from '../routes/chemins.ts';
import type { DescripteurPage } from '../routes/contrepartie.ts';

/**
 * Les pages statiques que le site sert sans vouloir les faire indexer.
 *
 *   - `/404` : elle n a pas a etre indexee, et le protocole de mesure la range
 *     explicitement « hors sitemap ».
 *   - `/mentions-legales` : `noindex` depuis le commit `d369449`. Ecart connu avec la
 *     table de volumetrie du protocole, qui la compte parmi les pages du sitemap —
 *     decision `463b2551`, en attente. Le code fait foi ici, pas la table.
 */
export const STATIQUES_NOINDEX: readonly PageStatique[] = ['404', 'mentions-legales'];

/**
 * La page courante doit-elle porter `noindex` et sortir du sitemap ?
 *
 * L accueil est le seul cas force : c est le dernier repli de la bascule FR/EN (T-06),
 * et une page de repli qu on demande de desindexer n est pas un repli.
 *
 * @param page Le descripteur de la page — le meme objet que celui de la bascule.
 * @param seo La surcharge editoriale du component partage `partage.seo`, si l entite en
 *   porte une. Jamais lue en base pour une valeur PAR DEFAUT : les defauts se calculent
 *   au build (A-07), seule la surcharge explicite est stockee.
 */
export function noindexDe(page: DescripteurPage, seo: Seo | null): boolean {
  if (page.genre === 'accueil') return false;
  if (page.genre === 'statique') return STATIQUES_NOINDEX.includes(page.nom);
  return seo?.noindex ?? false;
}

/**
 * La surcharge SEO portee par l entite d un index, quand sa famille en porte une.
 *
 * `Categorie` et `Dossier` ont un champ `seo` au modele ; `Tag` et `Auteur` n en ont
 * pas. Rendre `null` pour ces deux-la n est pas un defaut a corriger un jour : c est le
 * modele de donnees, et l inventer ici ferait diverger le code du §3 du cahier.
 */
export function seoDeFamille(
  famille: Famille,
  entite: Categorie | Tag | Auteur | Dossier,
): Seo | null {
  if (famille === 'categorie') return (entite as Categorie).seo;
  if (famille === 'dossier') return (entite as Dossier).seo;
  return null;
}
