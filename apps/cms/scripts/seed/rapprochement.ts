/**
 * Rapprochement d'une entree du corpus avec ce qui est deja en base.
 *
 * La cle est le SLUG, par locale — jamais l'id, jamais le titre. C'est ce qui
 * rend une seconde execution inoffensive : elle retrouve l'entree ecrite au
 * passage precedent et la met a jour, au lieu d'en creer une seconde.
 *
 * Le slug est le bon choix parce qu'il est **requis et unique** sur les cinq
 * collections (A-09), y compris sur chaque localisation : Strapi 5 localise
 * d'office tout champ `uid` (A-06), et l'unicite est verifiee par locale.
 */
import { ErreurCorpus } from './erreurs.ts';

export type Existant = { slug: string; documentId: string };
export type Decision = { action: 'creer' } | { action: 'mettreAJour'; documentId: string };

/** Index slug -> documentId. Les entrees sans slug sont ignorees, pas indexees. */
export function indexerParSlug(entrees: Existant[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const e of entrees) {
    const slug = typeof e?.slug === 'string' ? e.slug.trim() : '';
    if (slug === '') continue;
    index.set(slug, e.documentId);
  }
  return index;
}

export function decider(index: Map<string, string>, slug: string): Decision {
  const documentId = index.get(slug);
  return documentId ? { action: 'mettreAJour', documentId } : { action: 'creer' };
}

/**
 * Refuse un corpus qui porte deux fois le meme slug, ou un slug vide.
 *
 * Un slug vide serait rejete par Strapi (A-09), donc bruyamment ; un doublon,
 * lui, produirait deux ecritures dont la seconde ecraserait la premiere sans
 * qu'aucun compteur ne bouge. C'est ce silence-la qu'on ferme ici.
 */
export function verifierUnicite(slugs: string[], contexte: string): void {
  const vus = new Set<string>();
  for (const brut of slugs) {
    const slug = typeof brut === 'string' ? brut.trim() : '';
    if (slug === '') {
      throw new ErreurCorpus(`${contexte} : slug vide ou absent (requis — A-09)`);
    }
    if (vus.has(slug)) {
      throw new ErreurCorpus(`${contexte} : slug en double dans le corpus versionne — "${slug}"`);
    }
    vus.add(slug);
  }
}
