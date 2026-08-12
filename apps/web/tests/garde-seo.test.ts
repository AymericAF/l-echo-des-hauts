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
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import sharp from 'sharp';

import {
  HAUTEUR_MINIMALE_GLYPHES,
  SONDE_RATIO_MINIMAL,
  blocsJsonLd,
  inspecterSeo,
  estNoindex,
  liensDuFlux,
  locsDe,
  mesurerBandeTitre,
  metasDe,
  noeudsJsonLd,
  sonderRasteriseur,
  titreDeSonde,
  urlsDuGraphe,
  verdictDebordement,
  verdictSonde,
  TOLERANCE_DEBORDEMENT,
} from '../scripts/verifier-seo.mjs';
import { CADRE_OG, MARGE_OG, dispositionOg, svgOg, TAILLES_TITRE } from '../src/lib/seo/gabarit-og.ts';

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

/**
 * Un bloc JSON-LD minimal mais COMPLET au sens du controle 8 : vocabulaire declare, un
 * noeud type, aucune URL a faire resoudre.
 */
function jsonLd(chemin: string): string {
  return (
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebPage', name: chemin }],
    }) +
    '</script>'
  );
}

/**
 * Une page HTML complete au sens de la garde : partage minimal, canonique unique, et —
 * depuis le controle 8 — ses donnees structurees. `sansJsonLd` et `jsonLdBrut` existent
 * pour fabriquer les defauts que ce controle est cense voir.
 */
function page(
  chemin: string,
  options: {
    noindex?: boolean;
    ogImage?: string;
    sansCanonique?: boolean;
    sansJsonLd?: boolean;
    jsonLdBrut?: string;
  } = {},
): string {
  const url = `${ORIGINE}${chemin}`;
  const structure = options.jsonLdBrut !== undefined
    ? `<script type="application/ld+json">${options.jsonLdBrut}</script>`
    : options.sansJsonLd
      ? ''
      : jsonLd(chemin);
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
    structure +
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

/** Le MEME gabarit, mais sans aucun glyphe : le cas ou le rasteriseur ne dessine RIEN. */
async function pngSansTexte(): Promise<Buffer> {
  const svg = svgOg({ titre: 'x', rubrique: 'x', auteur: 'x', nomSite: 'x', couleurAccent: null })
    .replace(/<text[\s\S]*?<\/text>/g, '')
    .replace(/<rect x="72"[^>]*\/>/g, '');
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const GABARIT = {
  rubrique: 'Territoire',
  auteur: 'Noelle Vasseur',
  nomSite: 'L Echo des Hauts',
  couleurAccent: null,
} as const;

/** Le gabarit reel, rasterise tel quel. */
function pngDuTitre(titre: string): Promise<Buffer> {
  return sharp(Buffer.from(svgOg({ ...GABARIT, titre }))).png().toBuffer();
}

/**
 * Le gabarit reel dont les glyphes du TITRE sont remplaces par des « tofu » : les petits
 * rectangles de 12 px de haut que le rasteriseur dessine A LA PLACE des caracteres quand
 * aucune fonte n est installee.
 *
 * C est le cas fondateur, et il n est PAS « l image est vide » : un build sans fonte
 * produit une image ou le texte est bien dessine, a la mauvaise TAILLE. Mesure le
 * 2026-08-08 sur les 21 images du site rendues sans fonte : 12 a 13 px de haut, contre
 * 65 px avec les fontes de `nixpacks.toml`.
 *
 * Fabrique en dur plutot qu en vidant fontconfig : le rendu sans fonte n est pas
 * deterministe (le meme titre rend 0 ou 12 px d une execution a l autre), et un banc doit
 * rendre le meme verdict sur toutes les machines.
 */
function pngTofu(titre: string): Promise<Buffer> {
  const disposition = dispositionOg({ ...GABARIT, titre });
  const boites = disposition.lignes
    .flatMap((ligne) =>
      [...ligne.texte].map(
        (_, index) =>
          `  <rect x="${ligne.x + index * 10}" y="${ligne.y - 12}" width="8" height="12" ` +
          'fill="none" stroke="#1b1a17" stroke-width="1" />',
      ),
    )
    .join('\n');
  const svg = svgOg({ ...GABARIT, titre })
    .replace(/^ {2}<text[^>]*font-family="Georgia[^>]*>.*?<\/text>$/gm, '')
    .replace('</svg>', `${boites}\n</svg>`);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Le titre le plus long que le gabarit accepte sans ellipse : 4 lignes au palier 44 px. */
const TITRE_LE_PLUS_LONG =
  'Une enquete publique de six mois, quatre recours au tribunal administratif et un million ' +
  'quatre cent vingt mille euros plus tard, le chantier de restauration du clocher reprend enfin';

/**
 * Le pire cas TYPOGRAPHIQUE concevable : 4 lignes au plus petit palier, sans capitale,
 * sans accent et sans le moindre jambage — donc reduit a la hauteur d x. Aucun titre reel
 * ne ressemble a cela ; c est la borne basse absolue de la population « avec fontes ».
 */
const TITRE_SANS_JAMBAGE = Array.from(
  { length: 30 },
  (_, index) =>
    ['anse', 'ourse', 'somme', 'venue', 'course', 'rose', 'zone', 'ecran', 'nommer', 'annonce'][index % 10],
).join(' ');

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
    'index.html': page('/', { ogImage: 'https://echoback.test/uploads/partage.png' }),
  });
  assert.deepEqual(rapport.manquements, []);
});

test('un og:image en SVG est un manquement — les plateformes ne le rasterisent pas', async () => {
  /* LE DEFAUT DU 2026-08-11 (tache 9b173668). `imagePartageDefaut` etait un SVG, donc
     l accueil, les rubriques, les auteurs et les dossiers servaient un `og:image` en
     `image/svg+xml` — releve sur la production. La balise etait presente, le fichier
     existait, l URL resolvait : les six premiers controles etaient verts, et ces pages
     n avaient AUCUNE image de partage. */
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: `${ORIGINE}/medias/partage-defaut.svg` }),
    'medias/partage-defaut.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  assert.equal(rapport.manquements.length, 1, rapport.manquements.join(' | '));
  assert.match(rapport.manquements[0], /\.svg/);
  assert.match(rapport.manquements[0], /AUCUNE image de partage/);
});

test('le format se juge meme quand l image est HORS du site — ce que rasterise X ne depend pas de l hote', async () => {
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: 'https://echoback.test/uploads/partage.svg' }),
  });
  assert.equal(rapport.manquements.length, 1, rapport.manquements.join(' | '));
  assert.match(rapport.manquements[0], /og:image est en \.svg/);
});

test('une URL de partage avec query ou ancre garde son format lisible', async () => {
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: `${ORIGINE}/og/fr/a.png?v=2` }),
  });
  assert.deepEqual(rapport.manquements, []);
});

// --- 7. la hauteur des glyphes des images OG — le controle que rien d autre ne fait ---

/** Mesure une image en memoire, comme la garde la mesurerait dans `dist/`. */
async function mesurer(png: Buffer) {
  const dist = distFactice({ 'og/fr/a.png': png });
  const mesure = await mesurerBandeTitre(path.join(dist, 'og/fr/a.png'));
  fs.rmSync(dist, { recursive: true, force: true });
  return mesure;
}

test('une image OG dont le texte n a PAS ete dessine est un manquement', async () => {
  const rapport = await inspecter({ 'og/fr/a.png': await pngSansTexte() });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /glyphes/);
  assert.match(rapport.manquements[0], /fonte/, 'le message doit nommer la cause probable');
});

test('une image OG rendue en « tofu » — texte a la BONNE place, a la mauvaise taille — est un manquement', async () => {
  for (const titre of ['Le lac de la Fauge a 41 %', TITRE_LE_PLUS_LONG]) {
    const rapport = await inspecter({ 'og/fr/a.png': await pngTofu(titre) });
    assert.equal(rapport.manquements.length, 1, `titre : ${titre}`);
    assert.match(rapport.manquements[0], /glyphes/);
  }
});

test("l ecart-type ne separe PAS les deux populations — c est pourquoi la garde ne decide plus dessus", async () => {
  /* Le defaut d origine : la garde comparait l ECART-TYPE des pixels de la bande a un
     seuil. Cette mesure croit avec la QUANTITE de texte, pas avec sa taille. Un titre
     court reellement dessine porte donc MOINS d encre qu un titre long rendu en tofu :
     les deux populations se croisent, et aucun seuil sur l ecart-type ne les separe.
     C est ce test qui interdit d y revenir. */
  const courtEtDessine = await mesurer(await pngDuTitre('Eau'));
  const longEtVide = await mesurer(await pngTofu(TITRE_LE_PLUS_LONG));

  assert.ok(
    longEtVide!.ecartType > courtEtDessine!.ecartType,
    `ecart-type : vide=${longEtVide!.ecartType} dessine=${courtEtDessine!.ecartType}`,
  );
  // La hauteur des glyphes, elle, les separe — dans le bon sens et largement.
  assert.ok(
    courtEtDessine!.hauteurGlyphes >= HAUTEUR_MINIMALE_GLYPHES &&
      longEtVide!.hauteurGlyphes < HAUTEUR_MINIMALE_GLYPHES,
    `hauteur : vide=${longEtVide!.hauteurGlyphes} dessine=${courtEtDessine!.hauteurGlyphes}`,
  );
});

test('le seuil laisse passer le pire titre que le gabarit puisse produire', async () => {
  /* La borne basse de la population « avec fontes » n est pas le titre du site : c est le
     titre qui occupe le plus petit palier de corps avec les glyphes les plus courts. Si
     ce cas-la passe, tout titre reel passe. */
  for (const titre of [TITRE_LE_PLUS_LONG, TITRE_SANS_JAMBAGE, 'Eau', 'Le lac']) {
    const mesure = await mesurer(await pngDuTitre(titre));
    assert.ok(
      mesure !== null && mesure.hauteurGlyphes >= HAUTEUR_MINIMALE_GLYPHES,
      `« ${titre.slice(0, 40)} » : ${mesure?.hauteurGlyphes} px < ${HAUTEUR_MINIMALE_GLYPHES}`,
    );
  }
});

test('le seuil reste sous la moitie du plus petit palier de corps du gabarit', () => {
  /* Le calcul qui fixe le seuil (cf. `verifier-seo.mjs`) s appuie sur le fait qu une ligne
     de titre est dessinee a 44 px au minimum. Si un palier plus petit apparaissait, le
     seuil ne serait plus derriere aucune mesure — ce test le dirait. */
  assert.ok(
    HAUTEUR_MINIMALE_GLYPHES <= Math.min(...TAILLES_TITRE) / 2,
    `seuil ${HAUTEUR_MINIMALE_GLYPHES} px pour un plus petit palier de ${Math.min(...TAILLES_TITRE)} px`,
  );
});

test('une image OG illisible est signalee comme telle, pas comme sans glyphes', async () => {
  const rapport = await inspecter({ 'og/fr/a.png': Buffer.from('ceci n est pas un PNG') });
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /image illisible/);
});

// --- controle 9 : le titre ne deborde pas de la zone de texte ---------------------

/** Le titre en capitales du defaut du 2026-08-11 : il sortait jusqu au bord de l image. */
const TITRE_CAPITALES = 'LE BUDGET 2027 DE LA COMMUNAUTE DES HAUTS EN DEBAT';

/**
 * Le gabarit reel, mais dont les lignes de titre sont dessinees SANS decoupage — l etat
 * exact que produisait le modele de chasse unique de 0,54 em. Fabrique en dur plutot qu en
 * revenant a l ancien modele : un banc doit rendre le meme verdict sur toutes les machines.
 */
function pngDebordant(titre: string): Promise<Buffer> {
  const svg = svgOg({ ...GABARIT, titre })
    .replace(/^ {2}<text[^>]*font-family="Georgia[^>]*>.*?<\/text>$/gm, '')
    .replace(
      '</svg>',
      `  <text x="72" y="330" font-family="Georgia, serif" font-size="66" font-weight="700" ` +
        `fill="#1b1a17">${titre}</text>\n</svg>`,
    );
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test('une image OG dont le titre sort de la zone de texte est un manquement', async () => {
  const rapport = await inspecter({ 'og/fr/a.png': await pngDebordant(TITRE_CAPITALES) });
  assert.equal(rapport.manquements.length, 1, rapport.manquements.join(' | '));
  assert.match(rapport.manquements[0], /DEBORDE/);
  assert.match(rapport.manquements[0], /a droite/);
});

test('le debordement se mesure sur l ENCRE, pas sur le nombre de caracteres', async () => {
  const mesure = await mesurer(await pngDebordant(TITRE_CAPITALES));
  assert.ok(
    mesure!.droite > CADRE_OG.largeur - MARGE_OG,
    `bord droit de l encre : ${mesure!.droite} (zone de texte : ${CADRE_OG.largeur - MARGE_OG})`,
  );
  /* Le temoin qui compte : la HAUTEUR, elle, est parfaitement normale. C est pourquoi le
     controle 7 ne pouvait pas voir ce defaut. */
  assert.ok(mesure!.hauteurGlyphes >= HAUTEUR_MINIMALE_GLYPHES, `hauteur : ${mesure!.hauteurGlyphes}`);
});

test('le meme titre en capitales, mis en page par le gabarit, ne deborde plus', async () => {
  for (const titre of [TITRE_CAPITALES, 'MMMMMMMMMMMMMMMMMMMMMMMMMMMMM', TITRE_LE_PLUS_LONG]) {
    const rapport = await inspecter({ 'og/fr/a.png': await pngDuTitre(titre) });
    assert.deepEqual(rapport.manquements, [], `titre : ${titre.slice(0, 40)}`);
  }
});

test('une bande de titre vierge n est PAS accusee de debordement — c est le controle 7 qui la juge', () => {
  assert.deepEqual(verdictDebordement('og/fr/a.png', { hauteurGlyphes: 0, gauche: -1, droite: -1, ecartType: 0 }), []);
});

test('l anticrenelage ne fait pas rougir : la tolerance est nommee, pas devinee', () => {
  const droiteMax = CADRE_OG.largeur - MARGE_OG;
  const limite = { hauteurGlyphes: 65, gauche: MARGE_OG, droite: droiteMax + TOLERANCE_DEBORDEMENT, ecartType: 40 };
  assert.deepEqual(verdictDebordement('og/fr/a.png', limite), []);
  assert.equal(verdictDebordement('og/fr/a.png', { ...limite, droite: limite.droite + 1 }).length, 1);
});

// --- controle 7 bis : la sonde du rasteriseur ------------------------------------

test('la sonde suit le corps quand les glyphes sont dessines, et rien ne rougit', async () => {
  const sonde = await sonderRasteriseur();
  assert.notEqual(sonde, null, 'la sonde doit etre lisible sur une machine qui a des fontes');
  assert.ok(
    sonde!.ratio >= SONDE_RATIO_MINIMAL,
    `rapport mesure ${sonde!.ratio} (grand ${sonde!.grand.hauteur} px au corps ${sonde!.grand.corps}, ` +
      `petit ${sonde!.petit.hauteur} px au corps ${sonde!.petit.corps})`,
  );
  assert.deepEqual(verdictSonde(sonde), []);
});

test('un tofu de VINGT-CINQ pixels franchit le seuil absolu — et la sonde l attrape quand meme', () => {
  /* Le cas mesure le 2026-08-11 : la hauteur du rectangle de remplacement n est pas bornee.
     A 21 px (runner GitHub, run 31534444682) puis 25 px (poste Windows), elle DEPASSE le
     seuil de 20 px, et la premiere jambe accepte l image. Le seuil ne peut pas etre releve :
     le plancher legitime est a 22 px. La sonde, elle, ne regarde pas la taille du tofu mais
     le fait qu il ne grandit pas avec le corps. */
  const tofu25 = { grand: { corps: 66, hauteur: 25 }, petit: { corps: 44, hauteur: 25 }, ratio: 1 };
  assert.ok(25 >= HAUTEUR_MINIMALE_GLYPHES, 'le temoin : ce tofu passe bien la premiere jambe');
  const manques = verdictSonde(tofu25);
  assert.equal(manques.length, 2, manques.join(' | '));
  assert.match(manques.join(' | '), /ne SUIT PAS le corps/);
});

test('la sonde ne se contente pas du rapport : un tofu proportionnel serait pris par la hauteur', () => {
  /* Cas residuel : deux paliers qui tirent des tofus de tailles differentes pourraient
     rendre un rapport flatteur. Le second critere (part du corps) le ferme. */
  const trompeur = { grand: { corps: 66, hauteur: 21 }, petit: { corps: 44, hauteur: 12 }, ratio: 1.75 };
  assert.ok(trompeur.ratio >= SONDE_RATIO_MINIMAL, 'le temoin : ce cas passe le rapport');
  assert.match(verdictSonde(trompeur).join(' | '), /ne fait que 21 px/);
});

test('une sonde illisible est un manquement, jamais un silence', () => {
  assert.match(verdictSonde(null).join(' | '), /illisible/);
});

test("le titre de sonde se CHERCHE : il tombe sur le palier vise, pas sur un compte de mots ecrit en dur", () => {
  /* Les DEUX paliers extremes, ceux que la sonde oppose. Les paliers intermediaires ne
     sont pas exiges : le titre de sonde grandit d un mot entier a la fois, et un palier
     peut se sauter — ce qui est sans effet, la sonde ne s en sert pas. Ce qui compte est
     que ces deux-la se trouvent QUEL QUE SOIT le modele de chasse du gabarit : ecrire un
     compte de mots en dur ici en ferait une seconde source de verite. */
  for (const corps of [Math.max(...TAILLES_TITRE), Math.min(...TAILLES_TITRE)]) {
    const titre = titreDeSonde(corps);
    assert.notEqual(titre, null, `aucun titre de sonde pour le corps ${corps}`);
    assert.equal(dispositionOg({ ...GABARIT, titre: titre! }).tailleTitre, corps);
  }
});

test('la garde PORTE la sonde : un rasteriseur aveugle fait rougir `inspecterSeo`', async () => {
  /* MECANIQUE, PAS CONVENTIONNELLE. Les tests ci-dessus exercent `verdictSonde` ; celui-ci
     verifie qu'elle est BRANCHEE dans `inspecterSeo`. Retirer l'appel du controle 7 bis
     laisserait tous les autres verts. On ne peut pas priver de fontes le processus courant
     — fontconfig est lu une fois pour toutes —, donc on relance l'inspection dans un fils
     dont le `FONTCONFIG_PATH` ne declare aucun repertoire de polices. */
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-fc-vide-'));
  fs.writeFileSync(
    path.join(dossier, 'fonts.conf'),
    '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n' +
      `<fontconfig>\n  <cachedir>${path.join(dossier, 'cache')}</cachedir>\n</fontconfig>\n`,
  );
  fs.mkdirSync(path.join(dossier, 'cache'), { recursive: true });

  const dist = distFactice(await siteSain());
  const fils = spawnSync(
    process.execPath,
    [
      '-e',
      "import('./scripts/verifier-seo.mjs').then(async (m) => " +
        `{ const r = await m.inspecterSeo(${JSON.stringify(dist)}, ${JSON.stringify(ORIGINE)}); ` +
        'console.log(JSON.stringify(r.manquements)); });',
    ],
    {
      cwd: path.join(import.meta.dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, FONTCONFIG_PATH: dossier },
    },
  );
  fs.rmSync(dossier, { recursive: true, force: true });
  fs.rmSync(dist, { recursive: true, force: true });

  assert.equal(fils.status, 0, fils.stderr);
  const manquements: string[] = JSON.parse(fils.stdout.trim());
  assert.match(
    manquements.join(' | '),
    /sonde du rasteriseur/,
    `le controle 7 bis n a pas rougi dans un processus sans fonte : ${manquements.join(' | ')}`,
  );
});

test('le gabarit reel du site passe le seuil avec une marge confortable', async () => {
  const mesure = await mesurer(await pngAvecTexte());
  assert.ok(
    mesure !== null && mesure.hauteurGlyphes >= 3 * HAUTEUR_MINIMALE_GLYPHES,
    `hauteur mesuree : ${mesure?.hauteurGlyphes} px (seuil : ${HAUTEUR_MINIMALE_GLYPHES})`,
  );
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

// --- 8. les donnees structurees du §5.1 — un controle qui ne rougit jamais ne prouve rien

test('le temoin sain porte bien ses donnees structurees, sur 100 % des pages indexables', async () => {
  const rapport = await inspecter();
  assert.equal(rapport.pagesIndexablesAvecJsonLd, rapport.pagesIndexables);
  assert.equal(rapport.pagesIndexablesAvecJsonLd, 2);
  assert.ok(rapport.noeudsStructures > 0);
});

test('une page indexable SANS JSON-LD est un manquement, et l ecart est affirme a part', async () => {
  const rapport = await inspecter({
    'article/a/index.html': page('/article/a', { ogImage: `${ORIGINE}/og/fr/a.png`, sansJsonLd: true }),
  });
  assert.ok(rapport.manquements.some((m) => /SANS donnees structurees.*\/article\/a/.test(m)));
  // Le second membre : nommer la page ne suffit pas, le compte doit le dire aussi.
  assert.ok(
    rapport.manquements.some((m) => /couverture des donnees structurees : 1 .* sur 2 .*ecart est de 1/.test(m)),
  );
  assert.equal(rapport.pagesIndexablesAvecJsonLd, 1);
});

test('une page NOINDEX sans JSON-LD ne remonte rien : le critere porte sur les indexables', async () => {
  const rapport = await inspecter({
    'mentions-legales/index.html': page('/mentions-legales', { noindex: true, sansJsonLd: true }),
  });
  assert.deepEqual(rapport.manquements, []);
});

test('un JSON-LD que JSON.parse refuse est un manquement', async () => {
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: `${ORIGINE}/og/fr/a.png`, jsonLdBrut: '{"@type": ' }),
  });
  assert.ok(rapport.manquements.some((m) => /contenu illisible/.test(m)));
  assert.ok(rapport.manquements.some((m) => /couverture des donnees structurees/.test(m)));
});

test('un graphe VIDE est un manquement : valide, et sans une seule information', async () => {
  const rapport = await inspecter({
    'index.html': page('/', {
      ogImage: `${ORIGINE}/og/fr/a.png`,
      jsonLdBrut: '{"@context":"https://schema.org","@graph":[]}',
    }),
  });
  assert.ok(rapport.manquements.some((m) => /graphe VIDE/.test(m)));
});

test('un graphe sans @context schema.org est un manquement : personne ne l interprete', async () => {
  const rapport = await inspecter({
    'index.html': page('/', { ogImage: `${ORIGINE}/og/fr/a.png`, jsonLdBrut: '{"@type":"WebPage"}' }),
  });
  assert.ok(rapport.manquements.some((m) => /@context/.test(m)));
});

test('un noeud sans @type est un manquement', async () => {
  const rapport = await inspecter({
    'index.html': page('/', {
      ogImage: `${ORIGINE}/og/fr/a.png`,
      jsonLdBrut: '{"@context":"https://schema.org","@graph":[{"name":"sans type"}]}',
    }),
  });
  assert.ok(rapport.manquements.some((m) => /sans « @type »/.test(m)));
});

test('une URL du graphe qui ne resout pas dans dist/ est un manquement', async () => {
  // Un `item` de fil d Ariane mort ne casse aucune page et ne se decouvre qu en Search
  // Console : c est le meme silence que le controle 6 ferme sur `og:image`.
  const rapport = await inspecter({
    'index.html': page('/', {
      ogImage: `${ORIGINE}/og/fr/a.png`,
      jsonLdBrut: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'A', item: `${ORIGINE}/` },
              { '@type': 'ListItem', position: 2, name: 'B', item: `${ORIGINE}/rubrique/disparue` },
            ],
          },
        ],
      }),
    }),
  });
  assert.ok(rapport.manquements.some((m) => /\/rubrique\/disparue.*dist\/ ne contient pas/.test(m)));
});

test('une URL du graphe vers un AUTRE hote sort de la portee, sans manquement', async () => {
  const rapport = await inspecter({
    'index.html': page('/', {
      ogImage: `${ORIGINE}/og/fr/a.png`,
      jsonLdBrut: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'Person', name: 'A', sameAs: ['https://www.linkedin.com/in/x'], url: 'https://ailleurs.invalid/p' }],
      }),
    }),
  });
  assert.deepEqual(rapport.manquements, []);
});

test('les trois formes d un bloc JSON-LD sont lues : objet, tableau, @graph', () => {
  assert.equal(noeudsJsonLd('{"@type":"A"}')?.length, 1);
  assert.equal(noeudsJsonLd('[{"@type":"A"},{"@type":"B"}]')?.length, 2);
  assert.equal(noeudsJsonLd('{"@graph":[{"@type":"A"}]}')?.length, 1);
  // « je n ai pas su lire » et « il n y a rien dedans » ne se confondent pas.
  assert.equal(noeudsJsonLd('pas du json'), null);
  assert.equal(noeudsJsonLd('42'), null);
  assert.deepEqual(noeudsJsonLd('{"@graph":[]}'), []);
});

test('l extracteur de blocs ne retient QUE le type ld+json, quelle qu en soit la forme', () => {
  assert.deepEqual(blocsJsonLd('<script type="application/ld+json">{}</script>'), ['{}']);
  assert.deepEqual(blocsJsonLd("<script TYPE='Application/LD+JSON'>{}</script>"), ['{}']);
  assert.deepEqual(blocsJsonLd('<script>{}</script>'), []);
  assert.deepEqual(blocsJsonLd('<script type="application/json">{}</script>'), []);
  assert.deepEqual(blocsJsonLd('<script type="module">{}</script>'), []);
});

test('urlsDuGraphe ramasse url et item a toute profondeur, jamais @id ni urlTemplate', () => {
  // `@id` porte souvent un fragment (`…/#organisation`) qui ne designe aucun fichier, et
  // `urlTemplate` porte un gabarit — les confronter a dist/ ferait rougir un site sain.
  const trouvees = urlsDuGraphe([
    {
      '@type': 'WebSite',
      '@id': 'https://a/#site',
      url: 'https://a/',
      potentialAction: { target: { urlTemplate: 'https://a/recherche?q={search_term_string}' } },
    },
    { '@type': 'BreadcrumbList', itemListElement: [{ item: 'https://a/x' }] },
  ]);
  assert.deepEqual([...trouvees].sort(), ['https://a/', 'https://a/x']);
});
