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

export function texteRequis(source: unknown, cle: string, chemin: string): string {
  const valeur = lire(source, cle, chemin);
  if (typeof valeur !== 'string' || valeur.length === 0) {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `chaine non vide attendue, recu ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

/**
 * L alphabet d un `uid` Strapi, PRIVE de la chaine vide — c est tout l ecart, et c est
 * le defaut du 2026-08-10.
 *
 * Strapi valide ses `uid` contre `/^[A-Za-z0-9-_.~]*$/`. Le quantificateur `*` accepte
 * `""`, et `required: true` ne porte que sur la presence de la cle : un `PUT` posant
 * `slug:""` a donc ete accepte en `200` sur `echoback.ayfiweb.fr`, et l API a servi
 * `["territory", ..., "outdoors", ""]`. Le `+` ci-dessous est la seule difference.
 */
const ALPHABET_SLUG = /^[A-Za-z0-9-_.~]+$/;

/**
 * Un `slug`, c est-a-dire un segment d URL — pas une chaine quelconque.
 *
 * Cette fonction existe parce que `texteRequis` ne disait qu une chose : « non vide ».
 * Elle attrapait donc `""` par accident, sans jamais le nommer — et laissait passer
 * `"   "`, `"deux mots"` ou un accent, qui produisent une URL tout aussi cassee. Une
 * garde qui protege par effet de bord se perd au premier remaniement ; celle-ci declare
 * sa regle, et `tests/garde-slug.test.ts` l exerce sur les treize portes d entree.
 *
 * Elle est la derniere barriere, et la seule qui ne depende pas du chemin d ecriture :
 * `minLength: 1` (A-09, pose cote Strapi le 2026-08-11) ne s applique qu aux ecritures
 * qui traversent l entity-validator — mesure le meme jour, un `strapi.db.query` ou un
 * UPDATE SQL direct l ignore completement.
 */
export function slugRequis(source: unknown, cle: string, chemin: string): string {
  const valeur = lire(source, cle, chemin);
  if (typeof valeur !== 'string' || !ALPHABET_SLUG.test(valeur)) {
    throw new ValeurInattendueError(
      `${chemin}.${cle}`,
      `slug inutilisable comme segment d URL — recu ${JSON.stringify(valeur)}, attendu ` +
        `${ALPHABET_SLUG.source} (A-09). Vide, il produit une URL sans segment ou une ` +
        'collision avec la page d index ; hors alphabet, une URL qui ne se resout pas',
    );
  }
  return valeur;
}

export function texteOptionnel(source: unknown, cle: string, chemin: string): string | null {
  const valeur = lire(source, cle, chemin);
  if (valeur === null || valeur === '') return null;
  if (typeof valeur !== 'string') {
    throw new ValeurInattendueError(`${chemin}.${cle}`, `chaine ou null attendus, recu ${JSON.stringify(valeur)}`);
  }
  return valeur;
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
