/**
 * `/en/rss.xml` — le miroir anglais du flux (§4.2 : « miroir anglais complet »).
 *
 * Deux flux plutot qu un seul melange : `<language>` est une propriete du CANAL, pas de
 * l item. Un flux bilingue serait annonce dans une langue et livrerait l autre, ce
 * qu aucun agregateur ne sait presenter.
 */
import type { APIRoute } from 'astro';

import { registreDuSite } from '../../lib/routes/registre-site.ts';
import { configurationsDuSite, origineDuSite } from '../../lib/seo/contexte-site.ts';
import { entreesFlux, xmlRss } from '../../lib/seo/flux.ts';

export const GET: APIRoute = async ({ site }) => {
  const [registre, configurations] = await Promise.all([registreDuSite(), configurationsDuSite()]);
  const configuration = configurations.get('en') ?? null;
  const xml = xmlRss({
    locale: 'en',
    origine: origineDuSite(site),
    nomSite: configuration?.nomSite ?? 'L’Écho des Hauts',
    description: configuration?.descriptionDefaut ?? '',
    entrees: entreesFlux(registre, 'en'),
    genereLe: new Date().toISOString(),
  });
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
