/**
 * Le registre du SITE : le corpus du Content Layer, passe dans `construireRegistre`.
 *
 * Deux raisons de le memoriser ici plutot que de le reconstruire dans chaque page :
 *
 *   1. **Le cout.** Une page de liste consulte le registre pour sa bascule et pour sa
 *      pagination ; a ~120 pages, le reconstruire a chaque rendu multiplierait par 120
 *      un parcours de tout le corpus, pour un resultat identique.
 *   2. **La coherence.** Deux registres construits a deux instants du build pourraient
 *      diverger si le store bougeait entre-temps. Un seul registre, partage, garantit
 *      que la route qu une page EMET et la route qu une autre page CITE sont la meme.
 *
 * Ce module est la SEULE frontiere entre `astro:content` et la logique de routes : tout
 * ce qui vit dans `registre.ts`, `contrepartie.ts`, `chemins.ts` et `pagination.ts` est
 * du TypeScript pur, testable par `node --test` sans Astro.
 */
import { getCollection } from 'astro:content';

import { construireRegistre, type CorpusRoutes, type Registre } from './registre.ts';

let memoire: Promise<Registre> | null = null;

async function construire(): Promise<Registre> {
  const [articles, categories, tags, auteurs, dossiers] = await Promise.all([
    getCollection('articles'),
    getCollection('categories'),
    getCollection('tags'),
    getCollection('auteurs'),
    getCollection('dossiers'),
  ]);

  const corpus: CorpusRoutes = {
    articles: articles.map((entree) => entree.data),
    categories: categories.map((entree) => entree.data),
    tags: tags.map((entree) => entree.data),
    auteurs: auteurs.map((entree) => entree.data),
    dossiers: dossiers.map((entree) => entree.data),
  };

  return construireRegistre(corpus);
}

export function registreDuSite(): Promise<Registre> {
  memoire ??= construire();
  return memoire;
}
