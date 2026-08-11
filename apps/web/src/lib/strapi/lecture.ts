/**
 * Lecture defensive d une reponse Strapi.
 *
 * Regle unique, et c est elle qui fait tout le harnais : **une cle demandee par le
 * populate doit EXISTER dans la reponse**. Strapi rend `null` pour un champ optionnel
 * vide, jamais une cle absente — l absence de cle signifie donc que le champ a disparu
 * du schema, ou que le populate a cesse de le demander. Les deux sont des ruptures.
 *
 * D ou la distinction que tout ce fichier applique :
 *   - cle absente        → ChampManquantError (rupture)
 *   - valeur `null`      → acceptee pour un optionnel, refusee pour un requis
 */
import { ChampManquantError, ValeurInattendueError } from './erreurs.ts';

export type Brut = Record<string, unknown>;

export function estObjet(valeur: unknown): valeur is Brut {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Rend la valeur brute d une cle, en exigeant que la cle existe. */
export function lire(source: unknown, cle: string, chemin: string): unknown {
  const complet = `${chemin}.${cle}`;
  if (!estObjet(source)) {
    throw new ChampManquantError(complet, `le conteneur attendu n est pas un objet (${typeofLisible(source)})`);
  }
  if (!Object.prototype.hasOwnProperty.call(source, cle)) {
    throw new ChampManquantError(complet);
  }
  return source[cle];
}

function typeofLisible(valeur: unknown): string {
  if (valeur === null) return 'null';
  if (Array.isArray(valeur)) return 'tableau';
  return typeof valeur;
}

// --- chaines ---------------------------------------------------------------

/**
 * L alphabet des caracteres qui n affichent RIEN — l unique domicile de cette liste.
 *
 * Pourquoi une liste explicite plutot que `trim()`. Le critere que ce fichier applique
 * est un critere de RENDU : « ce champ sortira-t-il vide a l ecran ? ». `trim()` repond
 * a une autre question — « ce caractere appartient-il a la grammaire `WhiteSpace`
 * d ECMAScript ? » — et les deux reponses divergent des deux cotes :
 *
 *   - l espace INSECABLE U+00A0 est bien retiree par `trim()` (mesure du 2026-08-11 sur
 *     Node 24 : `' '.trim().length === 0`), mais s en remettre a une regle de
 *     langage pour un jugement de rendu est un raccourci, pas une garantie ; elle est
 *     donc nommee ici, avec ses cousines U+2000-U+200A, U+202F, U+205F et U+3000 ;
 *   - les caracteres de LARGEUR NULLE, eux, passent `trim()` sans encombre : U+200B,
 *     U+200C, U+200D et U+2060 ne sont pas de categorie Zs. Mesure du meme jour :
 *     `'​'.trim().length === 1`. Or un titre fait d un U+200B est EXACTEMENT aussi
 *     vide a l ecran qu un titre fait d une espace — il produit le meme `<h1>` creux,
 *     le meme `<title>` creux et le meme `headline` creux dans le JSON-LD.
 *
 * La liste est bornee a ce qui ne laisse aucune trace visible. Elle ne contient donc ni
 * le point median, ni le tiret, ni aucun caractere qui, lui, se voit.
 */
const BLANCS_INVISIBLES =
  '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200d\\u2028\\u2029\\u202f\\u205f\\u2060\\u3000\\ufeff';

/** Vrai si la chaine ne contient QUE des caracteres sans trace visible (une chaine de longueur nulle comprise). */
export function estBlanc(valeur: string): boolean {
  return new RegExp(`^[${BLANCS_INVISIBLES}]*$`, 'u').test(valeur);
}

/**
 * Rend la chaine lisible dans un message d erreur, en echappant ce qui ne se voit pas.
 *
 * `JSON.stringify(' ')` rend `" "` : deux guillemets autour de rien. Le lecteur du
 * journal de build devrait alors compter des pixels pour savoir ce qui a ete refuse, et
 * ne saurait toujours pas s il a affaire a une espace ordinaire ou a une insecable — la
 * distinction qui decide de la correction a faire dans Strapi.
 */
function echapperInvisibles(valeur: string): string {
  const echappee = Array.from(valeur)
    .map((caractere) =>
      estBlanc(caractere) && caractere !== ' '
        ? `\\u${caractere.codePointAt(0)!.toString(16).padStart(4, '0')}`
        : caractere,
    )
    .join('');
  return `"${echappee}"`;
}

/**
 * Un champ texte requis : present, de type chaine, et PORTEUR DE QUELQUE CHOSE.
 *
 * La troisieme condition est celle qui manquait jusqu au 2026-08-11 : la regle etait
 * `valeur.length === 0`, donc `"   "` passait. Ce que ca produisait, sans qu un build
 * rougisse : un `<h1>` visuellement vide, un `<title>` vide, un `headline` vide dans le
 * JSON-LD, et une entree de sitemap pointant une page sans titre — c est-a-dire le mode
 * d echec que `erreurs.ts` existe pour fermer (« le build reste vert et le site ment »),
 * sur la moitie des champs qu il couvre.
 *
 * Ce qu elle ne fait PAS, deliberement : elle ne NORMALISE rien. La valeur est rendue
 * telle quelle, blancs de bordure compris. Refuser un champ vide et reecrire le contenu
 * d autrui sont deux gestes differents ; le second appartient a la saisie, pas a la
 * lecture, et un mapping qui corrige en silence est un mapping qui ment a son tour.
 */
export function texteRequis(source: unknown, cle: string, chemin: string): string {
  const valeur = lire(source, cle, chemin);
  if (typeof valeur !== 'string') {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `chaine non vide attendue, recu ${JSON.stringify(valeur)}`);
  }
  if (estBlanc(valeur)) {
    throw new ValeurInattendueError(
      `${chemin}.${cle}`,
      valeur.length === 0
        ? 'chaine non vide attendue, recu ""'
        : `chaine non vide attendue, recu ${echapperInvisibles(valeur)} — ${valeur.length} caractere(s), ` +
          'tous BLANCS : ce champ sortirait vide a l ecran (titre, balise ou libelle) ' +
          'alors que le build resterait vert',
    );
  }
  return valeur;
}

/**
 * Un champ texte optionnel : `null` si absent de fait, sinon la chaine telle quelle.
 *
 * « Absent de fait » couvre TROIS etats, et c est le troisieme qui manquait jusqu au
 * 2026-08-11 : `null` (Strapi, champ vide), `''` (Strapi, champ vide autrement), et
 * une chaine faite UNIQUEMENT de blancs invisibles. Les trois affichent la meme
 * chose — rien — donc la lecture leur rend la meme valeur.
 *
 * Ce que ca fermait, et pourquoi ce defaut a survecu a la correction de `texteRequis` :
 * un `<h1>` fait de trois espaces se VOIT a l ecran, un `alt` fait de trois espaces ne
 * se voit nulle part. Il PASSE meme les gardes — axe-core exige une alternative non
 * nulle, il en trouve une, et compte trois espaces comme une description valide. La
 * garde reste verte sur une image qui n a plus d alternative du tout. C est la meme
 * classe de defaut qu une alternative qui nomme la FORME d un graphique : PRESENTE et
 * INUTILE. `alt=""`, lui, est une DECLARATION — « cette image est decorative » — et
 * c est exactement ce que rend ce `null` en aval.
 *
 * POURQUOI NORMALISER ICI ALORS QUE `texteRequis` REFUSE. Ce n est pas une entorse a
 * la regle voisine, ce sont deux contrats differents :
 *
 *  1. `texteOptionnel` normalise DEJA — `''` rend `null` depuis l origine. Ce qui est
 *     etendu ici est l ALPHABET du vide, pas la nature de la fonction. `texteRequis`,
 *     lui, n a jamais rien normalise et ne commence pas.
 *  2. Un champ optionnel a le DROIT d etre absent. Rougir un build parce qu un editeur
 *     a laisse une espace dans une legende ferait payer a la publication le prix d une
 *     coquille, sur un champ dont le schema dit qu il peut ne rien valoir.
 *  3. `null` declenche le repli DOCUMENTE de chaque consommateur (`alt=""`, pas de
 *     `<figcaption>`, `metaTitre` qui retombe sur le titre, canonique recalculee).
 *     Rendre la chaine de blancs force au contraire chaque consommateur a servir un
 *     attribut ou une balise qui ne porte rien.
 *
 * Et ce n est PAS reecrire le contenu d autrui : la valeur n est jamais rognee ni
 * remplacee. Une valeur PORTEUSE sort telle quelle, blancs de bordure compris. Ce qui
 * est choisi ici, c est la branche « absent » plutot que la branche « rempli », pour
 * une valeur qui n affiche rien.
 *
 * CE QUE CETTE BRANCHE COUTE, ecrit plutot que taire : la lecture cesse de distinguer
 * « champ laisse vide » de « champ rempli de blancs par erreur ». Un defaut de saisie
 * devient indiscernable d une absence voulue. Ce trou est ferme A L AUTRE BOUT, a
 * l ECRITURE : la garde de corpus du seed refuse un `alternativeText` blanc sur ce
 * meme alphabet (`apps/cms/scripts/seed/corpus.ts`). Refuser a l entree, etre honnete
 * a la sortie — l inverse laisserait le site mentir sur ce qu il n a pas su ecrire.
 */
export function texteOptionnel(source: unknown, cle: string, chemin: string): string | null {
  const valeur = lire(source, cle, chemin);
  if (valeur === null) return null;
  if (typeof valeur !== 'string') {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `chaine ou null attendus, recu ${JSON.stringify(valeur)}`);
  }
  // `estBlanc('')` est vrai : la chaine strictement vide reste couverte, sans cas a part.
  return estBlanc(valeur) ? null : valeur;
}

// --- nombres et booleens ---------------------------------------------------

export function nombreOptionnel(source: unknown, cle: string, chemin: string): number | null {
  const valeur = lire(source, cle, chemin);
  if (valeur === null) return null;
  if (typeof valeur !== 'number' || Number.isNaN(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `nombre ou null attendus, recu ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

export function entierRequis(source: unknown, cle: string, chemin: string): number {
  const valeur = nombreOptionnel(source, cle, chemin);
  if (valeur === null || !Number.isInteger(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `entier attendu, recu ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

export function booleenRequis(source: unknown, cle: string, chemin: string): boolean {
  const valeur = lire(source, cle, chemin);
  if (typeof valeur !== 'boolean') {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `booleen attendu, recu ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

// --- objets et listes ------------------------------------------------------

export function objetRequis(source: unknown, cle: string, chemin: string): Brut {
  const valeur = lire(source, cle, chemin);
  if (!estObjet(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `objet attendu, recu ${typeofLisible(valeur)}`);
  }
  return valeur;
}

export function objetOptionnel(source: unknown, cle: string, chemin: string): Brut | null {
  const valeur = lire(source, cle, chemin);
  if (valeur === null) return null;
  if (!estObjet(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `objet ou null attendus, recu ${typeofLisible(valeur)}`);
  }
  return valeur;
}

export function listeRequise(source: unknown, cle: string, chemin: string): unknown[] {
  const valeur = lire(source, cle, chemin);
  if (!Array.isArray(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `tableau attendu, recu ${typeofLisible(valeur)}`);
  }
  return valeur;
}

/**
 * Une relation multiple absente de la reponse est une rupture ; une relation vide est
 * un tableau. Strapi rend `null` sur certaines relations non peuplees : on l accepte
 * comme liste vide, mais jamais l absence de cle.
 */
export function listeOuVide(source: unknown, cle: string, chemin: string): unknown[] {
  const valeur = lire(source, cle, chemin);
  if (valeur === null) return [];
  if (!Array.isArray(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `tableau ou null attendus, recu ${typeofLisible(valeur)}`);
  }
  return valeur;
}

// --- enums -----------------------------------------------------------------

export function enumRequis<T extends string>(
  source: unknown,
  cle: string,
  chemin: string,
  valeurs: readonly T[],
): T {
  const valeur = texteRequis(source, cle, chemin);
  if (!(valeurs as readonly string[]).includes(valeur)) {
    throw new ValeurInattendueError(
      `${chemin}.${cle}`,
      `« ${valeur} » hors de l enum ferme [${valeurs.join(', ')}]`,
    );
  }
  return valeur as T;
}

/** Rich text « Blocks » de Strapi : un tableau de noeuds, dont on ne contraint pas la forme ici. */
export function blocksRequis(source: unknown, cle: string, chemin: string): unknown[] {
  const valeur = listeRequise(source, cle, chemin);
  if (valeur.length === 0) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, 'champ Blocks requis mais vide');
  }
  return valeur;
}

export function blocksOptionnel(source: unknown, cle: string, chemin: string): unknown[] | null {
  const valeur = lire(source, cle, chemin);
  if (valeur === null) return null;
  if (!Array.isArray(valeur)) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `tableau Blocks ou null attendus, recu ${typeofLisible(valeur)}`);
  }
  return valeur.length === 0 ? null : valeur;
}
