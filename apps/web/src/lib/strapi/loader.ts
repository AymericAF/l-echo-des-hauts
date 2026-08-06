/**
 * Loader Content Layer dedie a Strapi (§4.3 du cahier).
 *
 * Pourquoi un loader plutot qu un `fetch` dans chaque page : le Content Layer charge
 * une fois, met en cache entre deux builds via le digest, et fait de Strapi une source
 * de contenu comme une autre — les pages appellent `getCollection()`, jamais le reseau.
 * C est aussi ce qui rend la bascule vers une autre source (ou un mock) sans effet sur
 * les pages.
 *
 * Il ne fait AUCUN traitement : il stocke ce que `mapping.ts` a deja traduit et
 * valide. Toute logique de forme qui migrerait ici echapperait au harnais de tests.
 */
import type { Loader } from 'astro/loaders';
import { chargerCorpus, type Corpus, type EntreeLocalisee } from './corpus.ts';

export function loaderStrapi<C extends keyof Omit<Corpus, 'baseVide'>>(collection: C): Loader {
  return {
    name: `strapi:${String(collection)}`,
    load: async ({ store, logger, parseData, generateDigest }) => {
      const corpus = await chargerCorpus();
      const entrees = corpus[collection] as EntreeLocalisee<Record<string, unknown>>[];

      store.clear();
      for (const entree of entrees) {
        const data = await parseData({ id: entree.id, data: entree.valeur as Record<string, unknown> });
        store.set({ id: entree.id, data, digest: generateDigest(data) });
      }

      logger.info(`${entrees.length} entree(s) chargee(s) depuis Strapi`);
    },
  };
}
