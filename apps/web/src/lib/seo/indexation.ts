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
 * (commit `8a125e4`, 2026-08-03 — cf. l en-tete de `STATIQUES_NOINDEX` ci-dessous pour
 * la mauvaise attribution qui a longtemps circule) — une decision qu aucun autre code ne
 * pouvait lire sans la recopier. Le sitemap aurait donc porte sa propre liste, et le jour
 * ou l une des deux bouge, l autre ne le sait pas : c est la contradiction exacte
 * qu A-29 interdit.
 *
 * Ce module ne TRANCHE aucune politique : il transcrit celle du code en place. En
 * particulier, `/mentions-legales` reste `noindex` — et depuis le 2026-08-10 ce n est
 * plus un simple etat de fait : la decision `463b2551`, qui arbitrait cet ecart avec la
 * table de volumetrie du protocole de mesure, a ete tranchee par Aymeric en branche B
 * (garder le `noindex`, corriger la table).
 */
import type { Auteur, Categorie, Dossier, Seo, Tag } from '../domaine.ts';
import type { Famille, PageStatique } from '../routes/chemins.ts';
import type { DescripteurPage } from '../routes/contrepartie.ts';

/**
 * Les pages statiques que le site sert sans vouloir les faire indexer.
 *
 *   - `/404` : elle n a pas a etre indexee, et le protocole de mesure la range
 *     explicitement « hors sitemap ».
 *   - `/mentions-legales` : `noindex` depuis le commit `8a125e4` (2026-08-03), qui a cree
 *     la page AVEC sa balise `robots`. CE N EST PAS `d369449` (2026-08-06), longtemps cite
 *     ici et dans la decision `463b2551` : ce commit-la n a rempli que l editeur et
 *     l hebergeur, et a CONSERVE une balise deja presente (verifie le 2026-08-12 par la
 *     tache de controle `70b67e23`, et rejouable : `git log -S 'noindex' -- apps/web/src`
 *     ne le fait pas apparaitre). L ecart avec la table de volumetrie du protocole, qui
 *     compte la page parmi celles du sitemap, est tranche depuis le 2026-08-10 —
 *     decision `463b2551`, branche B : le `noindex` reste, c est la table qui se corrige.
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
