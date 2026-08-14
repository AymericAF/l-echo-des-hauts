/**
 * COMPARER AVANT D'ECRIRE — ce qui rend le seed silencieux a corpus inchange.
 *
 * POURQUOI CE MODULE EXISTE. Le rapprochement par slug rendait le seed
 * idempotent sur les DOCUMENTS : deux passages ne creaient rien de plus. Il ne
 * l'a jamais rendu idempotent sur les EVENEMENTS. Chaque article etait reecrit
 * avec `?status=published`, Strapi 5 REPUBLIE le document meme quand rien ne
 * change, le webhook `publish_to_coolify` est abonne a `entry.publish`, et un
 * deploiement de production part. Le seed du 2026-08-10 a produit 26
 * deploiements en serie (69 requetes emises, 43 refusees en silence).
 *
 * C'est exactement le traitement deja applique aux medias dans `seed.ts` le
 * 2026-08-10 — « on ne reecrit que ce qui differe » — etendu aux entrees.
 *
 * LE SENS DU DOUTE EST ASYMETRIQUE, ET C'EST TOUT LE MODULE. Reecrire a tort
 * coute un deploiement ; SAUTER a tort produit un site faux que rien ne
 * signale — le mode d'echec exact que le controle 12 du plan editorial existe
 * pour attraper (une localisation EN dont les relations pointent encore les
 * entrees FR ne leve AUCUNE erreur). Toute incertitude rend donc « different »
 * avec son motif, jamais « identique » :
 *
 *   - un champ dont la NATURE n'est pas declaree ;
 *   - une relation dont le slug attendu n'est pas resolu ;
 *   - une relation lue sans slug, un bloc de zone dynamique inconnu.
 *
 * Consequence voulue : ajouter un champ au corps ecrit sans le declarer ici
 * fait REECRIRE, et `tests/seed-idempotence.test.ts` echoue. L'oubli se paie en
 * bruit, jamais en silence.
 *
 * LES RELATIONS SE COMPARENT PAR LE SLUG, JAMAIS PAR LE `documentId`. En
 * Strapi 5 un document porte le MEME `documentId` dans toutes ses locales : le
 * peupler ne distingue donc RIEN, et une localisation EN pointant l'entree FR
 * passerait pour identique. Seul le `slug`, localise d'office (A-06), differe
 * d'une locale a l'autre — c'est le meme raisonnement, et la meme reserve, que
 * `controle12.ts`.
 */

/** Ce qu'un champ du corps ecrit est, et donc comment il se relit et se compare. */
export type Nature =
  | 'scalaire'
  /** Date ou date-heure : comparee sur l'instant, pas sur la chaine. */
  | 'date'
  /** Media unique : le corps porte un id numerique, la lecture un objet. */
  | 'media'
  | 'medias'
  /** Relation : le corps porte un `documentId`, la comparaison passe par le SLUG. */
  | 'relation'
  /** Relation multiple : comparee en ENSEMBLE — l'ordre n'est pas garanti par Strapi. */
  | 'relations'
  /** Zone dynamique : un jeu de natures par `__component`. L'ordre, lui, compte. */
  | { zone: Record<string, Natures> }
  /** Composant repetable : un seul jeu de natures, l'ordre compte. */
  | { repete: Natures };

export type Natures = Record<string, Nature>;

/** Le slug ATTENDU, dans la locale ecrite, du document vise par une relation. */
export type SlugAttendu = (documentId: string) => string | undefined;

export type Verdict = { identique: boolean; motif: string };

const IDENTIQUE: Verdict = { identique: true, motif: '' };
const different = (motif: string): Verdict => ({ identique: false, motif });

/** `undefined`, `null` et le tableau vide decrivent le meme etat : rien. */
function vide(valeur: unknown): boolean {
  return valeur === undefined || valeur === null || (Array.isArray(valeur) && valeur.length === 0);
}

/**
 * Egalite profonde INSENSIBLE A L'ORDRE DES CLES.
 *
 * `JSON.stringify` ne conviendrait pas : les champs `blocks` sont stockes en
 * `jsonb` par PostgreSQL, qui REORDONNE les cles. Comparer deux serialisations
 * ferait diverger un objet identique, et le seed reecrirait pour toujours.
 */
export function egalProfond(a: unknown, b: unknown): boolean {
  if (vide(a) && vide(b)) return true;
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => egalProfond(v, b[i]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    const cles = new Set([...Object.keys(oa), ...Object.keys(ob)]);
    for (const cle of cles) {
      if (!egalProfond(oa[cle], ob[cle])) return false;
    }
    return true;
  }
  return false;
}

function memeInstant(a: unknown, b: unknown): boolean {
  if (vide(a) && vide(b)) return true;
  const ta = Date.parse(String(a));
  const tb = Date.parse(String(b));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

/** L'id d'un media, qu'il soit rendu en objet peuple ou en id nu. */
function idMedia(valeur: unknown): number | undefined {
  if (valeur === null || valeur === undefined) return undefined;
  if (typeof valeur === 'number') return valeur;
  if (typeof valeur === 'object') {
    const id = (valeur as { id?: unknown }).id;
    return typeof id === 'number' ? id : undefined;
  }
  return undefined;
}

const enTableau = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Le slug LU d'une entree liee peuplee. `undefined` = illisible, donc doute. */
function slugLu(valeur: unknown): string | undefined {
  if (valeur === null || valeur === undefined || typeof valeur !== 'object') return undefined;
  const slug = (valeur as { slug?: unknown }).slug;
  return typeof slug === 'string' && slug.trim() !== '' ? slug : undefined;
}

/**
 * Le corps qu'on s'apprete a ecrire est-il DEJA celui de l'entree lue ?
 *
 * Seules les cles de `attendu` sont jugees : un champ que le seed n'ecrit pas
 * (un `seo` saisi a la main, par exemple) ne doit pas provoquer de reecriture.
 */
export function comparerCorps(
  attendu: Record<string, unknown>,
  existant: unknown,
  natures: Natures,
  slugAttendu: SlugAttendu
): Verdict {
  if (existant === null || existant === undefined || typeof existant !== 'object') {
    return different('aucune entree lue a comparer');
  }
  const lu = existant as Record<string, unknown>;

  for (const [champ, valeur] of Object.entries(attendu)) {
    const nature = natures[champ];
    if (nature === undefined) {
      return different(`champ « ${champ} » sans nature declaree — on reecrit par prudence`);
    }
    const verdict = comparerChamp(champ, valeur, lu[champ], nature, slugAttendu);
    if (!verdict.identique) return verdict;
  }
  return IDENTIQUE;
}

function comparerChamp(
  champ: string,
  attendu: unknown,
  lu: unknown,
  nature: Nature,
  slugAttendu: SlugAttendu
): Verdict {
  if (nature === 'scalaire') {
    return egalProfond(attendu, lu) ? IDENTIQUE : different(`champ « ${champ} » different`);
  }

  if (nature === 'date') {
    return memeInstant(attendu, lu) ? IDENTIQUE : different(`date « ${champ} » differente`);
  }

  if (nature === 'media' || nature === 'medias') {
    const voulus = (nature === 'media' ? enTableau(attendu) : enTableau(attendu)).map(idMedia);
    const trouves = enTableau(lu).map(idMedia);
    if (voulus.some((v) => v === undefined) && !vide(attendu)) {
      return different(`media « ${champ} » attendu sans id exploitable`);
    }
    if (trouves.some((v) => v === undefined) && !vide(lu)) {
      return different(`media « ${champ} » lu sans id exploitable`);
    }
    return egalProfond(voulus, trouves) ? IDENTIQUE : different(`media « ${champ} » different`);
  }

  if (nature === 'relation' || nature === 'relations') {
    const cibles = enTableau(attendu);
    const slugsVoulus: string[] = [];
    for (const cible of cibles) {
      const slug = typeof cible === 'string' ? slugAttendu(cible) : undefined;
      if (slug === undefined) {
        return different(
          `relation « ${champ} » : slug attendu non resolu pour « ${String(cible)} »`
        );
      }
      slugsVoulus.push(slug);
    }
    const lus = enTableau(lu);
    const slugsLus: string[] = [];
    for (const entree of lus) {
      const slug = slugLu(entree);
      if (slug === undefined) {
        return different(`relation « ${champ} » lue sans slug — locale indeterminable`);
      }
      slugsLus.push(slug);
    }
    if (slugsVoulus.length !== slugsLus.length) {
      return different(`relation « ${champ} » : ${slugsLus.length} entree(s) lue(s), ${slugsVoulus.length} attendue(s)`);
    }
    // Ensemble pour une relation multiple : Strapi ne garantit pas l'ordre.
    const tri = (l: string[]) => [...l].sort();
    return egalProfond(tri(slugsVoulus), tri(slugsLus))
      ? IDENTIQUE
      : different(`relation « ${champ} » differente — attendu [${tri(slugsVoulus).join(', ')}], lu [${tri(slugsLus).join(', ')}]`);
  }

  if ('zone' in nature) {
    const blocsVoulus = enTableau(attendu) as Record<string, unknown>[];
    const blocsLus = enTableau(lu) as Record<string, unknown>[];
    if (blocsVoulus.length !== blocsLus.length) {
      return different(`zone « ${champ} » : ${blocsLus.length} bloc(s) lu(s), ${blocsVoulus.length} attendu(s)`);
    }
    for (let i = 0; i < blocsVoulus.length; i++) {
      const voulu = blocsVoulus[i] ?? {};
      const luBloc = blocsLus[i] ?? {};
      const composant = String(voulu.__component ?? '');
      if (composant !== String(luBloc.__component ?? '')) {
        return different(`zone « ${champ} » bloc ${i + 1} : « ${composant} » attendu, « ${String(luBloc.__component ?? '')} » lu`);
      }
      const sousNatures = nature.zone[composant];
      if (sousNatures === undefined) {
        return different(`zone « ${champ} » : bloc « ${composant} » sans natures declarees`);
      }
      const { __component, ...champsVoulus } = voulu;
      const verdict = comparerCorps(champsVoulus, luBloc, sousNatures, slugAttendu);
      if (!verdict.identique) {
        return different(`zone « ${champ} » bloc ${i + 1} (${composant}) : ${verdict.motif}`);
      }
    }
    return IDENTIQUE;
  }

  // Composant repetable.
  const voulus = enTableau(attendu) as Record<string, unknown>[];
  const lus = enTableau(lu) as Record<string, unknown>[];
  if (voulus.length !== lus.length) {
    return different(`composant « ${champ} » : ${lus.length} entree(s) lue(s), ${voulus.length} attendue(s)`);
  }
  for (let i = 0; i < voulus.length; i++) {
    const verdict = comparerCorps(voulus[i] ?? {}, lus[i] ?? {}, nature.repete, slugAttendu);
    if (!verdict.identique) {
      return different(`composant « ${champ} » entree ${i + 1} : ${verdict.motif}`);
    }
  }
  return IDENTIQUE;
}

/* ------------------------------------------------------------------ */
/* Le populate NECESSAIRE, DERIVE des memes natures                     */
/*                                                                      */
/* Une seconde liste ecrite a la main a cote des natures divergerait au  */
/* premier champ ajoute : le populate cesserait de ramener un champ que  */
/* la comparaison juge, et la comparaison le lirait absent — donc        */
/* different — donc reecriture perpetuelle. Elle se DERIVE.              */
/* ------------------------------------------------------------------ */

/** Le joker est interdit au build (§1) ; il ne descend d'ailleurs qu'au 1er niveau. */
export function parametresPopulate(natures: Natures, prefixe = 'populate'): Record<string, string> {
  const sortie: Record<string, string> = {};

  for (const [champ, nature] of Object.entries(natures)) {
    if (nature === 'scalaire' || nature === 'date') continue;

    if (nature === 'media' || nature === 'medias') {
      sortie[`${prefixe}[${champ}][fields][0]`] = 'name';
      continue;
    }
    if (nature === 'relation' || nature === 'relations') {
      sortie[`${prefixe}[${champ}][fields][0]`] = 'slug';
      continue;
    }
    if ('zone' in nature) {
      for (const [composant, sousNatures] of Object.entries(nature.zone)) {
        Object.assign(sortie, feuille(`${prefixe}[${champ}][on][${composant}]`, sousNatures));
      }
      continue;
    }
    Object.assign(sortie, feuille(`${prefixe}[${champ}]`, nature.repete));
  }

  return sortie;
}

/** Une feuille de populate NOMME toujours ses champs — jamais `true`, jamais `*`. */
function feuille(prefixe: string, natures: Natures): Record<string, string> {
  const sortie: Record<string, string> = {};
  const scalaires = Object.entries(natures)
    .filter(([, n]) => n === 'scalaire' || n === 'date')
    .map(([c]) => c);

  // Un composant sans champ scalaire (`bloc.chiffres-cles`) demande quand meme
  // le strict minimum plutot que de laisser Strapi decider.
  const champs = scalaires.length > 0 ? scalaires : ['id'];
  champs.forEach((c, i) => {
    sortie[`${prefixe}[fields][${i}]`] = c;
  });

  Object.assign(sortie, parametresPopulate(natures, `${prefixe}[populate]`));
  return sortie;
}
