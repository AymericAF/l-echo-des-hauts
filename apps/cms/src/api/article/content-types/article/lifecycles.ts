/**
 * A-13 — « max 3 » sur une relation n existe pas nativement dans Strapi.
 *
 * Le Content-Type Builder ne propose aucune cardinalite maximale sur une relation :
 * sans ce lifecycle, le « max 3 » du PDF §3.1 n est RIEN — une phrase que rien
 * n applique. Le cahier pose la contrainte a deux endroits ; celui-ci est le premier.
 * Le second — la troncature defensive aux 3 premiers AU BUILD — appartient a `apps/web`
 * et couvre les entrees ecrites par le seed ou par l API, qui ne passent pas ici.
 *
 * Le calcul n est pas une simple longueur de tableau : Strapi 5 accepte quatre formes
 * de payload pour une relation, et trois d entre elles portent un DELTA, pas un total.
 */
import { errors } from '@strapi/utils';

const { ValidationError } = errors;

export const MAX_ARTICLES_LIES = 3;

const longueur = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/**
 * Nombre de liens qui RESULTERA de cette ecriture.
 *
 * @param valeur   ce que porte `data.articlesLies` (absent, tableau, ou objet
 *                 `{ set }` / `{ connect, disconnect }`)
 * @param dejaLies nombre de liens actuellement en base — utile aux seuls deltas
 */
export function compterArticlesLies(valeur: unknown, dejaLies = 0): number {
  if (valeur === undefined || valeur === null) {
    return dejaLies;
  }
  if (Array.isArray(valeur)) {
    return valeur.length;
  }
  if (typeof valeur === 'object') {
    const v = valeur as Record<string, unknown>;
    // `set` porte le total et efface l existant : il l emporte sur les deltas.
    if (Array.isArray(v.set)) {
      return v.set.length;
    }
    const resultat = dejaLies + longueur(v.connect) - longueur(v.disconnect);
    return Math.max(0, resultat);
  }
  return dejaLies;
}

/**
 * Refuse la sauvegarde au-dela du plafond, avec un message lisible par un
 * non-technicien — c est la moitie de l arbitrage A-13 qui compte pour le redacteur.
 */
export function verifierArticlesLies(data: Record<string, unknown>, dejaLies = 0): void {
  if (!data || !('articlesLies' in data)) {
    return;
  }
  const total = compterArticlesLies(data.articlesLies, dejaLies);
  if (total > MAX_ARTICLES_LIES) {
    throw new ValidationError(
      `Articles lies : ${total} articles selectionnes, le maximum est ${MAX_ARTICLES_LIES}. ` +
        `Retirez-en ${total - MAX_ARTICLES_LIES} avant d enregistrer.`
    );
  }
}

/** Nombre de liens deja en base pour l entree visee par une mise a jour. */
async function lireNombreExistant(where: unknown): Promise<number> {
  if (!where || typeof where !== 'object') {
    return 0;
  }
  try {
    const entree = await strapi.db.query('api::article.article').findOne({
      where,
      populate: { articlesLies: true },
    });
    return Array.isArray(entree?.articlesLies) ? entree.articlesLies.length : 0;
  } catch {
    // Une lecture impossible ne doit pas transformer une sauvegarde valide en 500 :
    // on retombe sur 0, ce qui ne relache le plafond que pour les payloads en delta,
    // et la troncature au build reste la seconde garde (A-13).
    return 0;
  }
}

export default {
  async beforeCreate(event: any) {
    verifierArticlesLies(event.params?.data ?? {});
  },

  async beforeUpdate(event: any) {
    const data = event.params?.data ?? {};
    if (!('articlesLies' in data)) {
      return;
    }
    const valeur = data.articlesLies;
    // Un tableau nu ou un `set` portent deja le total : inutile d interroger la base.
    const besoinDeLExistant =
      valeur !== null &&
      typeof valeur === 'object' &&
      !Array.isArray(valeur) &&
      !Array.isArray((valeur as Record<string, unknown>).set);

    const dejaLies = besoinDeLExistant ? await lireNombreExistant(event.params?.where) : 0;
    verifierArticlesLies(data, dejaLies);
  },
};
