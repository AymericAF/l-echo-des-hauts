/**
 * Sommaire automatique d un article — calcule AU BUILD (§4.5 du cahier).
 *
 * Trois regles viennent d A-21 de `docs/modele-donnees.md`, et aucune n est cosmetique :
 *
 *   1. Seuls les blocs TEXTE alimentent le sommaire. Les titres d un `bloc.encadre` en
 *      sont exclus — le §4.5 dit « des blocs texte », et un encadre est un aparte, pas
 *      une etape de lecture.
 *   2. Un titre de niveau 1 saisi dans un champ Blocks est RETROGRADE en 2, exactement
 *      comme `RichTexte.astro` le rend. Le sommaire doit decrire le document produit,
 *      pas le document saisi : annoncer un niveau 1 decrirait une page a deux <h1>,
 *      c est-a-dire un avertissement axe-core et la porte P2 ratee.
 *   3. Les ancres sont des slugs de titres, DEDOUBLONNES par suffixe numerique. C est le
 *      defaut qu on ne voit qu en cliquant : deux ancres identiques envoient toujours au
 *      premier des deux titres, et aucun test de rendu ne le remarque.
 *
 * Ce module rend DEUX choses, et la seconde existe pour une raison precise : la page a
 * besoin de poser l ancre sur le titre lui-meme, dans `RichTexte`. Elle ne peut pas la
 * recalculer localement — le dedoublonnage est global a l article, pas local a un bloc.
 * `ancres` porte donc, pour chaque bloc texte, UN emplacement par titre RENCONTRE (et
 * `null` pour les titres hors sommaire) : sauter les titres exclus ferait glisser toutes
 * les ancres suivantes d un cran, sur le mauvais paragraphe.
 */
import type { Bloc, NoeudRichTexte } from '../domaine.ts';

/** §4.5 : « les titres de niveau 2 et 3 ». Rien au-dessus, rien en dessous. */
const NIVEAUX_RETENUS = [2, 3] as const;

/** Niveau de titre le plus haut qu un champ Blocks puisse produire au rendu (A-21). */
const NIVEAU_MIN_RENDU = 2;

export type NiveauSommaire = (typeof NIVEAUX_RETENUS)[number];

export interface EntreeSommaire {
  readonly niveau: NiveauSommaire;
  /** Le texte du titre, enrichissements aplatis (gras, liens, italiques). */
  readonly texte: string;
  /** Cible du lien, sans le `#`. Unique dans tout l article. */
  readonly ancre: string;
  /** Index du bloc dans la Dynamic Zone — le rendu s en sert pour reposer l ancre. */
  readonly indexBloc: number;
}

export interface Sommaire {
  readonly entrees: readonly EntreeSommaire[];
  /**
   * Par index de bloc texte : l ancre de chaque titre rencontre, dans l ordre de lecture.
   * `null` = titre hors sommaire (niveau 4+, ou texte vide) : il n a pas d ancre, mais il
   * occupe sa place pour que les suivants ne glissent pas.
   */
  readonly ancres: ReadonlyMap<number, readonly (string | null)[]>;
}

/**
 * Slug d ancre : minuscules, sans accent, sans ponctuation.
 *
 * Le repli « titre » n est pas de la coquetterie : un `href="#"` renvoie en haut de page
 * sans qu aucune erreur ne soit levee — le lecteur croit que le sommaire est casse, et
 * rien dans le build ne l aura signale.
 */
export function slugifier(texte: string): string {
  const slug = texte
    .normalize('NFD')
    // Les marques que `NFD` vient de detacher. Designees par leur PROPRIETE Unicode
    // plutot que par un intervalle de caracteres combinants : ces caracteres-la sont
    // invisibles dans un editeur, et un re-encodage du fichier casserait l intervalle
    // sans que rien ne le montre.
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'titre' : slug;
}

/** Aplatit un noeud Blocks en son texte visible, a travers gras, liens et listes. */
function texteDuNoeud(noeud: unknown): string {
  if (noeud === null || typeof noeud !== 'object') return '';
  const n = noeud as { text?: unknown; children?: unknown };
  if (typeof n.text === 'string') return n.text;
  if (Array.isArray(n.children)) return n.children.map(texteDuNoeud).join('');
  return '';
}

/** Le niveau REELLEMENT rendu par `RichTexte.astro` pour ce titre (A-21). */
function niveauRendu(noeud: NoeudRichTexte): number {
  const brut = (noeud as { level?: unknown }).level;
  const demande = typeof brut === 'number' ? brut : NIVEAU_MIN_RENDU;
  return Math.min(6, Math.max(NIVEAU_MIN_RENDU, demande));
}

function estTitre(noeud: NoeudRichTexte): boolean {
  return noeud.type === 'heading';
}

export function construireSommaire(blocs: readonly Bloc[]): Sommaire {
  const entrees: EntreeSommaire[] = [];
  const ancres = new Map<number, (string | null)[]>();
  const prises = new Set<string>();

  const ancreUnique = (texte: string): string => {
    const base = slugifier(texte);
    let candidate = base;
    let suffixe = 1;
    while (prises.has(candidate)) {
      suffixe += 1;
      candidate = `${base}-${suffixe}`;
    }
    prises.add(candidate);
    return candidate;
  };

  blocs.forEach((bloc, indexBloc) => {
    if (bloc.type !== 'bloc.texte') return;

    const parBloc: (string | null)[] = [];
    for (const noeud of bloc.contenu) {
      if (!estTitre(noeud)) continue;

      const niveau = niveauRendu(noeud);
      const texte = texteDuNoeud(noeud).replace(/\s+/g, ' ').trim();

      if (texte === '' || !(NIVEAUX_RETENUS as readonly number[]).includes(niveau)) {
        parBloc.push(null);
        continue;
      }

      const ancre = ancreUnique(texte);
      parBloc.push(ancre);
      entrees.push({ niveau: niveau as NiveauSommaire, texte, ancre, indexBloc });
    }

    if (parBloc.length > 0) ancres.set(indexBloc, parBloc);
  });

  return { entrees, ancres };
}
