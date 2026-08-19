/**
 * LE COMPTE AFFICHE EN TETE D UN INDEX — derive de la liste, jamais saisi.
 *
 * Ce module existe pour une raison precise : le nombre d episodes d un dossier a d abord
 * vecu en PROSE, dans le chapo (« Cinq episodes, du captage a la coupure… »). Un compte
 * ecrit a la main est exact le jour ou on l ecrit et faux au sixieme episode, sans que
 * rien ne le signale. Les commits `e30f3c8` et `9871a27` l ont retire des deux chapos ;
 * ce qui suit est la contrepartie qu Aymeric avait posee comme condition : l information
 * revient, mais DERIVEE de la liste d articles que la page recoit deja.
 *
 * Il ne fait aucune requete et n ajoute aucun champ : l `IndexEmis` porte deja ses pages,
 * donc ses articles. Un champ « nombre d episodes » en base serait un second porteur de
 * la meme information — c est-a-dire le defaut d origine, deplace du chapo vers le CMS.
 *
 * POURQUOI CE N EST PAS UNE EXPRESSION DANS `PageIndex.astro`. Aucun test de ce depot ne
 * peut instancier un composant Astro. Une regle laissee dans le gabarit serait une regle
 * non prouvee, a commencer par le cas a zero — le seul que la navigation ne montre jamais.
 */
import type { Locale } from '../domaine.ts';
import { libelles } from '../i18n/libelles.ts';
import type { Famille } from './chemins.ts';

/**
 * Ce que le compte lit d un index, et rien de plus.
 *
 * Structurellement satisfait par un `IndexEmis`, sans le lui imposer : le compte n a
 * besoin ni du slug, ni des localisations, ni de l entite — et un test qui devrait les
 * fabriquer pour verifier un pluriel finirait par ne pas etre ecrit.
 */
export interface IndexComptable {
  readonly famille: Famille;
  readonly pages: readonly { readonly items: readonly unknown[] }[];
}

/**
 * Le total des articles de l index — TOUTES pages confondues, pas la tranche affichee.
 *
 * Un dossier n est pas pagine aujourd hui (`FAMILLES_PAGINEES` ne porte que `categorie`
 * et `tag`), donc `pages[0].items.length` donnerait le meme resultat. Il le donnerait
 * jusqu au jour ou un dossier depasse la taille de page, et ce jour-la le compte
 * annoncerait la page au lieu du dossier.
 */
export function totalDeLIndex(index: IndexComptable): number {
  return index.pages.reduce((somme, page) => somme + page.items.length, 0);
}

/**
 * Le compte a afficher, ou `null` quand il n y a rien a annoncer.
 *
 * Un dossier compte des EPISODES (c est une serie) ; les trois autres familles comptent
 * des articles, comme avant. Zero ne rend rien dans les deux cas : « 0 article » est une
 * phrase correcte qui n apprend rien, et l index vide n est de toute facon pas emis (§10.3).
 */
export function compteDeLIndex(index: IndexComptable, locale: Locale): string | null {
  const total = totalDeLIndex(index);
  const mots = libelles(locale);

  if (index.famille === 'dossier') return mots.nombreEpisodes(total);
  return total < 1 ? null : mots.nombreArticles(total);
}
