/**
 * Le `robots.txt` genere — §5.2.
 *
 * IL N INTERDIT RIEN, ET C EST LA SEULE DECISION QU IL PORTE.
 *
 * Le reflexe est d y recopier les pages `noindex` en `Disallow`. C est un contresens, et
 * un contresens couteux : un crawler bloque par `robots.txt` ne TELECHARGE PAS la page,
 * donc ne lit jamais son `<meta name="robots" content="noindex">`. Une URL bloquee et
 * deja connue (par un lien entrant, un partage, un ancien sitemap) reste alors indexee —
 * sans titre ni description, ce qui est le pire des deux mondes. Google le documente
 * ainsi : pour desindexer, il faut laisser crawler et laisser lire le `noindex`.
 *
 * D ou la forme minimale ci-dessous : tout est autorise au crawl, l indexation se
 * decide page par page dans le `<head>` (A-29, `src/lib/seo/indexation.ts`), et le
 * `robots.txt` ne sert qu a une chose utile — annoncer l index de sitemaps.
 *
 * Aucune directive visant un robot d IA generative non plus : ce serait une politique
 * editoriale, elle n est ni au cahier ni au brief, et un run n a pas a la trancher.
 */
import { CHEMIN_SITEMAP_INDEX } from './sitemap.ts';

export function robotsTxt(origine: string): string {
  const sitemap = new URL(CHEMIN_SITEMAP_INDEX, origine).href;
  return [
    "# L'Echo des Hauts — media fictif, demonstrateur technique.",
    '# Aucune page n est interdite au crawl : l indexation se decide page par page,',
    '# dans la balise meta robots (A-29). Un Disallow empecherait justement de la lire.',
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
}
