/**
 * Le contexte de site partage par toutes les sorties SEO : le `<head>` des pages, les
 * segments de sitemap, les deux flux RSS et le `robots.txt`.
 *
 * Deux valeurs seulement, mais toutes deux dangereuses si chaque appelant les resout a
 * sa facon :
 *
 *   - **L ORIGINE.** Elle sert aux canoniques, aux `hreflang`, aux `<loc>` du sitemap,
 *     aux `guid` du flux et a la ligne `Sitemap:` du `robots.txt`. Deux resolutions
 *     differentes (l une avec slash final, l autre sans ; l une depuis `Astro.site`,
 *     l autre depuis `process.env`) produisent deux jeux d URL pour un meme site — et
 *     un canonique qui ne correspond pas a l URL du sitemap est une erreur que la
 *     Search Console remonte sans dire d ou elle vient.
 *   - **LES CONFIGURATIONS.** Le Single Type par locale porte le nom du site, la
 *     description par defaut et l image de partage par defaut. Le sitemap y lit aussi la
 *     date de modification des pages statiques.
 *
 * Ce module est la SEULE frontiere entre `astro:content` et les modules SEO : tout ce
 * qui vit dans `metadonnees.ts`, `sitemap.ts`, `flux.ts`, `robots.ts` et `gabarit-og.ts`
 * est du TypeScript pur, testable par `node --test` sans Astro. Meme decoupage que
 * `registre-site.ts` pour les routes, et pour la meme raison.
 */
import { getEntry } from 'astro:content';

import type { Configuration, Locale } from '../domaine.ts';
import { LOCALES_SITE } from '../routes/registre.ts';

/**
 * L origine publique du site, sans slash final.
 *
 * `Astro.site` vient de `astro.config.mjs`, qui la lit dans `ECHO_SITE_URL`. Le repli
 * n est pas une valeur inventee : c est la meme constante que celle du fichier de
 * configuration et de `integrations/garde-liens.mjs`, pour qu un build sans variable
 * d environnement produise un site coherent plutot qu un melange.
 */
export function origineDuSite(site: URL | undefined): string {
  const brute = site?.href ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
  return brute.replace(/\/+$/, '');
}

let memoire: Promise<Map<Locale, Configuration | null>> | null = null;

async function charger(): Promise<Map<Locale, Configuration | null>> {
  const entrees = await Promise.all(
    LOCALES_SITE.map(async (locale) => {
      const entree = await getEntry('configurations', locale);
      return [locale, entree?.data ?? null] as const;
    }),
  );
  return new Map(entrees);
}

/** Les `Configuration` des deux locales, chargees une seule fois par build. */
export function configurationsDuSite(): Promise<Map<Locale, Configuration | null>> {
  memoire ??= charger();
  return memoire;
}
