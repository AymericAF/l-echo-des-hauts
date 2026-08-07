/**
 * `/sitemap-index.xml` — l index du sitemap segmente (§5.2, route du §4.2).
 *
 * Il ne liste que les segments REELLEMENT emis : un segment vide n existe pas, donc
 * n est pas declare. Cette route et `sitemap-[segment].xml.ts` derivent toutes deux de
 * `segmentsSitemap()` — c est ce qui interdit qu un segment soit annonce ici sans etre
 * produit la, ce qu aucun test de rendu ne verrait.
 */
import type { APIRoute } from 'astro';

import { configurationsDuSite, origineDuSite } from '../lib/seo/contexte-site.ts';
import { registreDuSite } from '../lib/routes/registre-site.ts';
import { segmentsSitemap, xmlSitemapIndex } from '../lib/seo/sitemap.ts';

export const GET: APIRoute = async ({ site }) => {
  const [registre, configurations] = await Promise.all([registreDuSite(), configurationsDuSite()]);
  const xml = xmlSitemapIndex(segmentsSitemap(registre, configurations), origineDuSite(site));
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
