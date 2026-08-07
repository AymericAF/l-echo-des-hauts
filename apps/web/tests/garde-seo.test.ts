/**
 * Garde des sorties SEO — sitemap, flux RSS, balises de partage, images OG generees.
 *
 * Comme la garde des liens, elle ne lit ni le registre ni le code : elle lit `dist/`.
 * Confronter le sitemap au registre prouverait que le registre est coherent avec
 * lui-meme ; ce qu on veut savoir, c est si le site PRODUIT contient les URL declarees.
 *
 * Chaque test de ce fichier fabrique le defaut que le controle est cense voir. Une
 * garde qui ne rougit jamais ne prouve rien — et c est particulierement vrai du
 * controle 7 (l encre des images OG), qui existe precisement parce que le succes et
 * l echec y produisent le meme fichier.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import sharp from 'sharp';

import { inspecterSeo, estNoindex, liensDuFlux, locsDe, metasDe } from '../scripts/verifier-seo.mjs';
import { CADRE_OG, svgOg } from '../src/lib/seo/gabarit-og.ts';

const ORIGINE = 'https://echo.test';

function distFactice(fichiers: Record<string, string | Buffer>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-seo-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu as never);
  }
  return racine;
}

/** Une page HTML complete au sens de la garde : partage minimal + canonique unique. */
function page(chemin: string, options: { noindex?: boolean; ogImage?: string; sansCanonique?: boolean } = {}): string {
  const url = `${ORIGINE}${chemin}`;
  return (
    '<!doctype html><html lang="fr"><head><title>t</title>' +
    (options.sansCanonique ? '' : `<link rel="canonical" href="${url}">`) +
    (options.noindex ? '<meta name="robots" content="noindex">' : '') +
    '<meta property="og:type" content="website">' +
    '<meta property="og:locale" content="fr_FR">' +
    '<meta property="og:title" content="t">' +
    `<meta property="og:url" content="${url}">` +
    (options.ogImage ? `<meta property="og:image" content="${options.ogImage}">` : '') +
    '<meta name="twitter:card" content="summary">' +
    '</head><body>x</body></html>'
  );
}

function sitemapIndex(segments: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    segments.map((nom) => `<sitemap><loc>${ORIGINE}/${nom}</loc></sitemap>`).join('') +
    '</sitemapindex>'
  );
}

function urlset(entrees: { chemin: string; alternates?: string[] }[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    entrees
      .map(
        (entree) =>
          `<url><loc>${ORIGINE}${entree.chemin}</loc>` +
          (entree.alternates ?? [])
            .map((a) => `<xhtml:link rel="alternate" hreflang="en" href="${ORIGINE}${a}" />`)
            .join('') +
          '</url>',
      )
      .join('') +
    '</urlset>'
  );
}

function flux(chemins: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">' +
    `<channel><title>t</title><link>${ORIGINE}/</link><description>d</description>` +
    `<atom:link href="${ORIGINE}/rss.xml" rel="self" type="application/rss+xml" />` +
    chemins
      .map((c) => `<item><title>i</title><link>${ORIGINE}${c}</link><guid isPermaLink="true">${ORIGINE}${c}</guid></item>`)
      .join('') +
    '</channel></rss>'
  );
}

async function pngAvecTexte(): Promise<Buffer> {
  const svg = svgOg({
    titre: 'Le plateau se reboise, trente ans apres la deprise agricole du versant nord',
    rubrique: 'Territoire',
    auteur: 'Noelle Vasseur',
    nomSite: 'L Echo des Hauts',
    couleurAccent: null,
  });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Le MEME gabarit, mais sans aucun glyphe : ce que rend un build sans fonte installee. */
async function pngSansTexte(): Promise<Buffer> {
  const svg = svgOg({ titre: 'x', rubrique: 'x', auteur: 'x', nomSite: 'x', couleurAccent: null })
    .replace(/<text[\s\S]*?<\/text>/g, '')
    .replace(/<rect x="72"[^>]*\/>/g, '');
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Le site minimal et SAIN dont chaque test suivant abime une seule chose. */
async function siteSain(): Promise<Record<string, string | Buffer>> {
  return {
    'index.html': page('/', { ogImage: `${ORIGINE}/og/fr/a.png` }),
    'article/a/index.html': page('/article/a', { ogImage: `${ORIGINE}/og/fr/a.png` }),
    'mentions-legales/index.html': page('/mentions-legales', { noindex: true }),
    'sitemap-index.xml': sitemapIndex(['sitemap-pages.xml', 'sitemap-articles.xml']),
    'sitemap-pages.xml': urlset([{ chemin: '/' }]),
    'sitemap-articles.xml': urlset([{ chemin: '/article/a' }]),
    'rss.xml': flux(['/article/a']),
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${ORIGINE}/sitemap-index.xml\n`,
    'og/fr/a.png': await pngAvecTexte(),
  };
}

async function inspecter(modifications: Record<string, string | Buffer | null> = {}) {
  const fichiers = await siteSain();
  for (const [nom, contenu] of Object.entries(modifications)) {
    if (contenu === null) delete fichiers[nom];
    else fichiers[nom] = contenu;
  }
  const dist = distFactice(fichiers);
  const rapport = await inspecterSeo(dist, ORIGINE);
  fs.rmSync(dist, { recursive: true, force: true });
  return rapport;
}

// --- le temoin : le site sain ne remonte rien -----------------------------------

test('un site SEO sain ne remonte aucun manquement', async () => {
  const rapport = await inspecter();
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.segments, 2);
  assert.equal(rapport.urlsSitemap, 2);
  assert.equal(rapport.pagesIndexables, 2);
  assert.equal(rapport.imagesOg, 1);
});

// --- 1. l index declare un segment absent ----------------------------------------

test('un segment declare par l index mais absent de dist/ est un manquement', async () => {
  const rapport = await inspecter({ 'sitemap-articles.xml': null });
  assert.equal(rapport.manquements.length, 2); // le segment absent + la page qu il declarait
  assert.ok(rapport.manquements.some((m) => /sitemap-articles\.xml.*dist\/ ne contient pas/.test(m)));
});

test('un sitemap index absent est un manquement a lui seul', async () => {
  const rapport = await inspecter({ 'sitemap-index.xml': null });
  assert.ok(rapport.manquements.some((m) => /sitemap index absent/.test(m)));
});

// --- 2. une <loc> qui ne resout pas ----------------------------------------------

test('une URL de sitemap absente de dist/ est un manquement', async () => {
  const rapport = await inspecter({
    'sitemap-articles.xml': urlset([{ chemin: '/article/a' }, { chemin: '/article/fantome' }]),
  });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /article\/fantome.*aucune page de dist\//);
});

test('un alternate hreflang de sitemap absent de dist/ est un manquement', async () => {
  const rapport = await inspecter({
    'sitemap-articles.xml': urlset([{ chemin: '/article/a', alternates: ['/en/article/ghost'] }]),
  });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /alternate hreflang.*en\/article\/ghost/);
});

// --- 3. A-29 : une page noindex declaree au sitemap ------------------------------

test('declarer au sitemap une page qui porte noindex est un manquement (A-29)', async () => {
  const rapport = await inspecter({
    'sitemap-pages.xml': urlset([{ chemin: '/' }, { chemin: '/mentions-legales' }]),
  });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /mentions-legales.*noindex/);
});

// --- 4. couverture : une page indexable oubliee ----------------------------------

test('une page indexable qu aucun segment ne declare est un manquement', async () => {
  const rapport = await inspecter({
    'article/b/index.html': page('/article/b', { ogImage: `${ORIGINE}/og/fr/a.png` }),
  });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /page indexable absente du sitemap.*article\/b/);
});

test("c est bien la COUVERTURE qui detecte un segment entier oublie", async () => {
  const rapport = await inspecter({ 'sitemap-index.xml': sitemapIndex(['sitemap-pages.xml']) });
  assert.ok(
    rapport.manquements.some((m) => /page indexable absente du sitemap.*article\/a/.test(m)),
    'un segment retire de l index doit se voir par la couverture, pas seulement par son absence',
  );
});

// --- 5. le flux RSS ---------------------------------------------------------------

test('un flux qui publie un lien absent de dist/ est un manquement', async () => {
  const rapport = await inspecter({ 'rss.xml': flux(['/article/a', '/article/disparu']) });
  /* Deux manquements pour un seul article : un item RSS porte la meme URL dans son
     `<link>` ET dans son `<guid>`. Les deux sont controles — un guid permalien qui ne
     resout pas est un doublon d article dans tous les agregateurs. */
  assert.equal(rapport.manquements.length, 2);
  assert.ok(rapport.manquements.every((m) => /le flux publie.*article\/disparu/.test(m)));
});

test('le flux anglais est inspecte comme le francais', async () => {
  const rapport = await inspecter({ 'en/rss.xml': flux(['/en/article/absent']) });
  assert.ok(rapport.manquements.some((m) => /en\/rss\.xml.*en\/article\/absent/.test(m)));
});

// --- 6. les balises de partage ------------------------------------------------------

test('une page sans og:title est un manquement', async () => {
  const sansOg = page('/').replace('<meta property="og:title" content="t">', '');
  const rapport = await inspecter({ 'index.html': sansOg });
  assert.ok(rapport.manquements.some((m) => /index\.html.*og:title.*absente/.test(m)));
});

test('une page sans twitter:card est un manquement', async () => {
  const sansCarte = page('/').replace('<meta name="twitter:card" content="summary">', '');
  const rapport = await inspecter({ 'index.html': sansCarte });
  assert.ok(rapport.manquements.some((m) => /twitter:card.*absente/.test(m)));
});

test('une page sans canonique, ou avec deux, est un manquement', async () => {
  const sans = await inspecter({ 'index.html': page('/', { sansCanonique: true }) });
  assert.ok(sans.manquements.some((m) => /0 balise\(s\) canonical/.test(m)));

  const doublee = page('/').replace(
    `<link rel="canonical" href="${ORIGINE}/">`,
    `<link rel="canonical" href="${ORIGINE}/"><link rel="canonical" href="${ORIGINE}/en">`,
  );
  const deux = await inspecter({ 'index.html': doublee });
  assert.ok(deux.manquements.some((m) => /2 balise\(s\) canonical/.test(m)));
});

test('un og:image du site qui ne resout pas est un manquement', async () => {
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: `${ORIGINE}/og/fr/inexistante.png` }),
  });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /og:image pointe.*og\/fr\/inexistante\.png/);
});

test("un og:image herberge ailleurs (mediatheque Strapi) n est pas un manquement", async () => {
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: 'https://echoback.test/uploads/partage.svg' }),
  });
  assert.deepEqual(rapport.manquements, []);
});

// --- 7. l encre des images OG — le controle que rien d autre ne fait ----------------

test('une image OG dont le texte n a PAS ete dessine est un manquement', async () => {
  const rapport = await inspecter({ 'og/fr/a.png': await pngSansTexte() });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /bande de titre uniforme/);
  assert.match(rapport.manquements[0], /fonte/, "le message doit nommer la cause probable");
});

test('une image OG illisible est signalee comme telle, pas comme sans encre', async () => {
  const rapport = await inspecter({ 'og/fr/a.png': Buffer.from('ceci n est pas un PNG') });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /image illisible/);
});

test('le gabarit reel du site passe le seuil d encre avec une marge confortable', async () => {
  const png = await pngAvecTexte();
  const dist = distFactice({ 'og/fr/a.png': png });
  const { encreDuTitre } = await import('../scripts/verifier-seo.mjs');
  const encre = await encreDuTitre(path.join(dist, 'og/fr/a.png'));
  fs.rmSync(dist, { recursive: true, force: true });
  assert.ok(encre !== null && encre > 20, `encre mesuree : ${encre} (seuil de la garde : 8)`);
});

test('les images OG generees sont au format Open Graph attendu', async () => {
  const metadonnees = await sharp(await pngAvecTexte()).metadata();
  assert.equal(metadonnees.width, CADRE_OG.largeur);
  assert.equal(metadonnees.height, CADRE_OG.hauteur);
  assert.equal(metadonnees.format, 'png');
});

// --- les extracteurs, exerces separement ---------------------------------------------

test('les extracteurs lisent ce qu ils doivent lire, et rien de plus', () => {
  assert.deepEqual(locsDe('<url><loc>https://a/</loc></url><url><loc>https://b/</loc></url>'), [
    'https://a/',
    'https://b/',
  ]);
  assert.deepEqual(
    liensDuFlux('<link>https://a/</link><guid isPermaLink="true">https://b/</guid>'),
    ['https://a/', 'https://b/'],
  );
  assert.deepEqual(metasDe('<meta property="og:image" content="x"><meta property="og:image" content="y">').get('og:image'), ['x', 'y']);
  assert.equal(estNoindex('<meta name="robots" content="noindex, follow">'), true);
  assert.equal(estNoindex('<meta name="robots" content="index, follow">'), false);
  assert.equal(estNoindex('<p>noindex est un mot du texte</p>'), false);
});
