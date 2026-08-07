/**
 * `/robots.txt` — « robots.txt genere » (§5.2).
 *
 * Genere, et non depose dans `public/` : la ligne `Sitemap:` porte une URL ABSOLUE, donc
 * l origine du site. Un fichier statique la figerait a la valeur d un environnement, et
 * la recette sur `echo.ayfiweb.fr` publierait alors l adresse d un autre. Le contenu
 * lui-meme est calcule par `src/lib/seo/robots.ts`, teste sans Astro.
 */
import type { APIRoute } from 'astro';

import { origineDuSite } from '../lib/seo/contexte-site.ts';
import { robotsTxt } from '../lib/seo/robots.ts';

export const GET: APIRoute = ({ site }) =>
  new Response(robotsTxt(origineDuSite(site)), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
