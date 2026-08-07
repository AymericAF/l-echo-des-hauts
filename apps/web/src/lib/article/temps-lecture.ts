/**
 * Temps de lecture d un article — calcule AU BUILD (§4.5 du cahier).
 *
 * §4.5 dit « derive du nombre de mots de la Dynamic Zone », pas « des blocs texte » :
 * le comptage traverse donc les HUIT blocs. Ne compter que `bloc.texte` sous-estimerait
 * un article compose de citations, d encadres et de chiffres-cles — c est-a-dire
 * exactement les articles « vitrine » du plan editorial, ceux qui exercent au moins
 * quatre types de blocs.
 *
 * Ce qui compte comme mot : un jeton separe par des espaces et portant au moins une
 * lettre ou un chiffre. Un tiret cadratin isole, une puce, un guillemet ne sont pas des
 * mots — les compter gonflerait le temps affiche d autant plus que l article est
 * typographie avec soin.
 *
 * La vitesse retenue est une CONVENTION, pas une mesure : le cahier n en donne aucune.
 * 200 mots/minute est la valeur usuelle pour de la lecture suivie en francais. Elle vit
 * ici, en constante nommee, et nulle part ailleurs.
 */
import type { Bloc } from '../domaine.ts';

export const MOTS_PAR_MINUTE = 200;

export interface TempsLecture {
  readonly mots: number;
  /** Toujours >= 1 : « 0 min de lecture » se lit comme une panne, pas comme une information. */
  readonly minutes: number;
}

export function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((jeton) => /[\p{L}\p{N}]/u.test(jeton)).length;
}

/** Aplatit un noeud Blocks en son texte visible, a travers gras, liens et listes. */
function texteDuNoeud(noeud: unknown): string {
  if (noeud === null || typeof noeud !== 'object') return '';
  const n = noeud as { text?: unknown; children?: unknown };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.children)) return n.children.map(texteDuNoeud).join(' ');
  return '';
}

function texteDuBloc(bloc: Bloc): string[] {
  switch (bloc.type) {
    case 'bloc.texte':
      return bloc.contenu.map(texteDuNoeud);

    case 'bloc.citation':
      return [bloc.texte, bloc.auteurCitation ?? '', bloc.source ?? ''];

    case 'bloc.galerie':
      return [bloc.legende ?? ''];

    case 'bloc.encadre':
      return [bloc.titre ?? '', ...bloc.contenu.map(texteDuNoeud)];

    case 'bloc.video':
      return [bloc.legende ?? ''];

    case 'bloc.image-legendee':
      return [bloc.legende ?? '', bloc.credit ?? ''];

    case 'bloc.separateur':
      // Aucun texte : un separateur ne se lit pas.
      return [];

    case 'bloc.chiffres-cles':
      return bloc.entrees.flatMap((entree) => [entree.valeur, entree.unite ?? '', entree.libelle]);
  }
}

export function motsDeLaDynamicZone(blocs: readonly Bloc[]): number {
  return blocs
    .flatMap(texteDuBloc)
    .reduce((total, texte) => total + compterMots(texte), 0);
}

export function tempsDeLecture(blocs: readonly Bloc[]): TempsLecture {
  const mots = motsDeLaDynamicZone(blocs);
  return { mots, minutes: Math.max(1, Math.ceil(mots / MOTS_PAR_MINUTE)) };
}
