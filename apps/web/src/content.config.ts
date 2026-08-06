/**
 * Les six collections du site, toutes alimentees par le meme loader Strapi.
 *
 * Le schema est `z.custom<T>()` volontairement : le contrat de forme est deja tenu,
 * une fois pour toutes, par `src/lib/strapi/mapping.ts` et son harnais de tests.
 * Le redecrire en zod creerait une SECONDE source de verite sur les memes champs —
 * et deux copies d un meme contrat finissent toujours par diverger. Ce que zod
 * apporte ici, c est le typage de `getCollection()`, pas une validation de plus.
 *
 * Les identifiants sont `<locale>:<documentId>` : en Strapi 5, les localisations d un
 * document PARTAGENT son `documentId`, seule la locale les distingue.
 */
import { defineCollection, z } from 'astro:content';
import { loaderStrapi } from './lib/strapi/loader.ts';
import type { Article, Auteur, Categorie, Configuration, Dossier, Tag } from './lib/domaine.ts';

export const collections = {
  articles: defineCollection({ loader: loaderStrapi('articles'), schema: z.custom<Article>() }),
  auteurs: defineCollection({ loader: loaderStrapi('auteurs'), schema: z.custom<Auteur>() }),
  categories: defineCollection({ loader: loaderStrapi('categories'), schema: z.custom<Categorie>() }),
  tags: defineCollection({ loader: loaderStrapi('tags'), schema: z.custom<Tag>() }),
  dossiers: defineCollection({ loader: loaderStrapi('dossiers'), schema: z.custom<Dossier>() }),
  configurations: defineCollection({
    loader: loaderStrapi('configurations'),
    schema: z.custom<Configuration>(),
  }),
};
