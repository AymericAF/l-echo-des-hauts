/**
 * `/og/<locale>/<slug>.png` — les images Open Graph generees par article (§4.5).
 *
 * UNE IMAGE PAR ARTICLE EMIS, et pas une de plus : `getStaticPaths` lit le REGISTRE,
 * comme toutes les autres routes du site. C est ce qui garantit qu aucun article n a une
 * balise `og:image` pointant un fichier absent, et qu aucun fichier ne reste orphelin
 * dans `dist/`.
 *
 * POURQUOI SHARP, ET CE QU IL NE GARANTIT PAS. Le gabarit est un SVG calcule au build
 * (`src/lib/seo/gabarit-og.ts`) ; sharp le rasterise en PNG, seul format que les
 * plateformes de partage acceptent reellement — un `og:image` en SVG est ignore par
 * Facebook, LinkedIn et X. Mais sharp embarque fontconfig, PAS de fontes : sur une image
 * de construction depourvue de police, la rasterisation REUSSIT et produit un PNG au
 * fond correct, dont le titre est remplace par une file de rectangles d une douzaine de
 * pixels. Le build serait vert, les vignettes illisibles. C est `scripts/verifier-seo.mjs`
 * qui refuse ce cas, en mesurant la HAUTEUR des glyphes de la bande de titre — la garde
 * est le seul endroit ou ce defaut peut etre vu.
 *
 * Sharp est declare en dependance DIRECTE dans `package.json` alors qu Astro l a deja en
 * dependance optionnelle : une dependance optionnelle peut etre absente d une
 * installation sans que rien n echoue a l installation, et cette route la rendrait alors
 * introuvable au milieu du build.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import sharp from 'sharp';

import type { Article, Locale } from '../../lib/domaine.ts';
import { LOCALES_SITE } from '../../lib/routes/registre.ts';
import { registreDuSite } from '../../lib/routes/registre-site.ts';
import { configurationsDuSite } from '../../lib/seo/contexte-site.ts';
import { svgOg } from '../../lib/seo/gabarit-og.ts';

export const getStaticPaths: GetStaticPaths = async () => {
  const [registre, configurations] = await Promise.all([registreDuSite(), configurationsDuSite()]);

  return LOCALES_SITE.flatMap((locale: Locale) =>
    registre.articles(locale).map((article) => ({
      /* Le chemin colle a `cheminImageOg()` : `/og/<locale>/<slug>.png`. Le suffixe
         `.png` vient du nom de fichier de la route, il ne fait pas partie du parametre. */
      params: { chemin: `${locale}/${article.slug}` },
      props: { article, nomSite: configurations.get(locale)?.nomSite ?? '' },
    })),
  );
};

export const GET: APIRoute = async ({ props }) => {
  const { article, nomSite } = props as { article: Article; nomSite: string };

  const svg = svgOg({
    titre: article.titre,
    rubrique: article.categorie.nom,
    auteur: article.auteur.nom,
    nomSite,
    couleurAccent: article.categorie.couleurAccent,
  });

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(png, { headers: { 'content-type': 'image/png' } });
};
