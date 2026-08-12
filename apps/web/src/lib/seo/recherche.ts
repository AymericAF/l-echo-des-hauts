/**
 * Ce qui entre dans l index de recherche, et l adresse du bundle qui le lit (§5.4).
 *
 * DEUX DECISIONS, ecrites ici parce qu elles se cassent en silence partout ailleurs.
 *
 * 1. **Le perimetre indexe se DERIVE du `noindex` deja calcule** (A-29,
 *    `src/lib/seo/indexation.ts`), il ne se recopie pas. Une seconde liste de pages
 *    « a ne pas indexer », posee a la main dans un attribut de gabarit, divergerait de
 *    la premiere au premier changement — et le site aurait alors deux politiques
 *    d indexation, l une pour les moteurs, l autre pour son propre moteur interne.
 *    Proposer dans une recherche interne ce qu on demande a Google d ignorer n a pas de
 *    sens ; le `noindex` est donc l unique critere.
 *
 * 2. **La page de recherche s exclut elle-meme, et cela ne se deduit PAS du `noindex`.**
 *    `/recherche` est une page indexable : la table de volumetrie de
 *    `docs/protocole-mesure.md` la compte au sitemap, au meme titre que `/a-propos`, et
 *    ce document n a pas a etre contredit ici. Elle n a pourtant rien a dire dans ses
 *    propres resultats — elle n a aucun contenu propre, seulement un champ de saisie.
 *    D ou le second terme, explicite.
 *
 * Le bundle, lui, a une adresse et une seule : `/pagefind/pagefind.js`. Elle est ecrite
 * ICI et lue par la page ; ~~la garde T-09 exempte exactement `(en/)?pagefind/<fichier>.js`
 * et rien d autre~~ **2026-08-12 (tache cf33a689) : la garde T-09 n exempte plus un CHEMIN
 * mais ce que la page CHARGE** — cette constante est donc devenue le point d entree a
 * partir duquel elle calcule ce qui a le droit d etre servi (`scripts/verifier-sortie.mjs`).
 * Ecrire l adresse a la main dans le
 * gabarit la mettrait hors de portee de tout test : c est le seul lien entre la seule
 * page autorisee a charger du JavaScript et la seule exemption de la garde.
 */
import type { DescripteurPage } from '../routes/contrepartie.ts';

/**
 * L entree du bundle Pagefind, deposee en post-build par `scripts/index-pagefind.mjs`.
 *
 * Elle n existe PAS pendant `astro build` : Pagefind indexe la sortie une fois qu elle
 * est ecrite. Aucune garde de build ne peut donc la resoudre, et c est pour cela que la
 * page la charge par un `<script is:inline>` — jamais par un import que Vite tenterait
 * de resoudre, ce qui emettrait un chunk dans `_astro/`, servi a TOUTES les pages, et
 * refuse par la garde T-09.
 */
export const CHEMIN_BUNDLE_PAGEFIND = '/pagefind/pagefind.js';

/**
 * Cette page doit-elle entrer dans l index de recherche ?
 *
 * @param page Le descripteur de la page — le meme objet que celui de la bascule FR/EN.
 * @param noindex Le `noindex` DEJA calcule pour cette page (`noindexDe`), passe plutot
 *   que recalcule : la surcharge editoriale `partage.seo.noindex` n est connue que du
 *   gabarit, et un second calcul ici finirait par diverger du premier.
 */
export function indexableParRecherche(page: DescripteurPage, noindex: boolean): boolean {
  if (noindex) return false;
  if (page.genre === 'statique' && page.nom === 'recherche') return false;
  return true;
}
