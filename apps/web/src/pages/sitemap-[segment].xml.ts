/**
 * `/sitemap-<type>.xml` — un segment par type de contenu (§5.2).
 *
 * Comme `[...index].astro` pour les pages : `getStaticPaths` ne calcule rien, il
 * TRANSCRIT ce que `segmentsSitemap()` a decide. Un segment vide n est pas emis, donc
 * n apparait pas ici — et l index, qui lit la meme fonction, ne le declare pas non plus.
 */
import type { APIRoute, GetStaticPaths } from 'astro';

import { registreDuSite } from '../lib/routes/registre-site.ts';
import { configurationsDuSite, origineDuSite } from '../lib/seo/contexte-site.ts';
import { segmentsSitemap, xmlUrlset, type Segment } from '../lib/seo/sitemap.ts';

export const getStaticPaths: GetStaticPaths = async () => {
  const [registre, configurations] = await Promise.all([registreDuSite(), configurationsDuSite()]);
  return segmentsSitemap(registre, configurations).map((segment) => ({
    params: { segment: segment.nom },
    props: { segment },
  }));
};

export const GET: APIRoute = ({ props, site }) => {
  const { segment } = props as { segment: Segment };
  return new Response(xmlUrlset(segment.entrees, origineDuSite(site)), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
