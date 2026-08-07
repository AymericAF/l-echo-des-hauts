/**
 * `/rss.xml` — le flux francais (§2.1, route du §4.2).
 *
 * Le contenu vient du REGISTRE : ce flux ne peut donc pas publier un lien vers une page
 * que le build n a pas emise. Son miroir anglais est `src/pages/en/rss.xml.ts`.
 */
import type { APIRoute } from 'astro';

import { registreDuSite } from '../lib/routes/registre-site.ts';
import { configurationsDuSite, origineDuSite } from '../lib/seo/contexte-site.ts';
import { entreesFlux, xmlRss } from '../lib/seo/flux.ts';

export const GET: APIRoute = async ({ site }) => {
  const [registre, configurations] = await Promise.all([registreDuSite(), configurationsDuSite()]);
  const configuration = configurations.get('fr') ?? null;
  const xml = xmlRss({
    locale: 'fr',
    origine: origineDuSite(site),
    nomSite: configuration?.nomSite ?? 'L’Écho des Hauts',
    description: configuration?.descriptionDefaut ?? '',
    entrees: entreesFlux(registre, 'fr'),
    genereLe: new Date().toISOString(),
  });
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
