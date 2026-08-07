/**
 * PREUVE des bornes de pagination et de la bascule FR/EN, lue dans `dist/`.
 *
 * Ce script ne relit pas `getStaticPaths` : il lance un `astro build` REEL sur le corpus
 * de recette (`corpus-recette.mjs`), puis inspecte l ARBORESCENCE PRODUITE. C est la
 * seule lecture qui vaille quelque chose ici — la classe de defaut visee (une page 2
 * vide, un lien « suivant » vers une page inexistante, une bascule qui atterrit sur une
 * 404) est precisement celle qu une relecture du code ne voit pas.
 *
 * Les attendus sont ECRITS A LA MAIN dans `corpus-recette.mjs` (`ROUTES_ATTENDUES`), pas
 * derives du registre : un attendu calcule par le code qu il controle ne controle rien.
 *
 *   npm run preuve:pagination
 *
 * La sortie va dans `dist-recette/`, jamais dans `dist/` : le corpus de recette n est pas
 * le site, et l ecraser ferait passer un jeu de test pour la sortie de production.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { corpusRecette, ROUTES_ATTENDUES } from './corpus-recette.mjs';
import { inspecterLiens } from './verifier-liens.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'dist-recette');
const ORIGINE = 'https://echo.ayfiweb.fr';

// --- Strapi de substitution -----------------------------------------------------

function configuration(locale) {
  const base = JSON.parse(
    fs.readFileSync(path.join(RACINE, 'tests', 'fixtures', 'configuration-fr.json'), 'utf8'),
  );
  return {
    data: {
      ...base.data,
      locale,
      nomSite: locale === 'fr' ? 'L Echo des Hauts' : 'L Echo des Hauts',
      baseline: locale === 'fr' ? 'Corpus de recette' : 'Acceptance corpus',
      descriptionDefaut:
        locale === 'fr' ? 'Corpus fabrique pour la recette des routes.' : 'Corpus built to test routes.',
    },
  };
}

function enveloppe(entrees) {
  return {
    data: entrees,
    meta: { pagination: { page: 1, pageSize: 100, pageCount: 1, total: entrees.length } },
  };
}

function demarrerServeur(corpus) {
  const serveur = http.createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://localhost');
    const nom = url.pathname.replace(/^\/api\//, '');
    const locale = url.searchParams.get('locale') ?? 'fr';

    if (nom === 'configuration') {
      reponse.writeHead(200, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify(configuration(locale)));
      return;
    }
    if (!(nom in corpus)) {
      reponse.writeHead(404, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify({ error: { status: 404 } }));
      return;
    }
    reponse.writeHead(200, { 'content-type': 'application/json' });
    reponse.end(JSON.stringify(enveloppe(corpus[nom][locale] ?? [])));
  });

  return new Promise((resoudre) => {
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = serveur.address();
      resoudre({
        url: `http://127.0.0.1:${port}`,
        arreter: () => new Promise((fini) => serveur.close(fini)),
      });
    });
  });
}

function lancer(commande, arguments_, env) {
  return new Promise((resoudre) => {
    const processus = spawn(commande, arguments_, {
      cwd: RACINE,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    processus.on('close', resoudre);
  });
}

// --- lecture de la sortie --------------------------------------------------------

function fichiersDe(dossier, base = '') {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const relatif = base ? `${base}/${entree.name}` : entree.name;
    if (entree.isDirectory()) trouves.push(...fichiersDe(path.join(dossier, entree.name), relatif));
    else trouves.push(relatif);
  }
  return trouves;
}

function routesEmises(dist) {
  const routes = new Set();
  for (const relatif of fichiersDe(dist)) {
    if (!relatif.endsWith('.html')) continue;
    if (relatif === 'index.html') routes.add('/');
    else if (relatif.endsWith('/index.html')) routes.add(`/${relatif.slice(0, -'/index.html'.length)}`);
    else routes.add(`/${relatif.slice(0, -'.html'.length)}`);
  }
  return routes;
}

function html(dist, route) {
  const candidats = [
    path.join(dist, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`),
    path.join(dist, `${route.slice(1)}.html`),
  ];
  for (const chemin of candidats) if (fs.existsSync(chemin)) return fs.readFileSync(chemin, 'utf8');
  throw new Error(`Page absente de la sortie : ${route}`);
}

function liensDe(contenu, motif) {
  return [...contenu.matchAll(motif)].map((trouve) => trouve[1]);
}

// --- deroule ---------------------------------------------------------------------

const echecs = [];
const constats = [];

function verifier(intitule, condition, detail = '') {
  if (condition) constats.push(`  ok   ${intitule}`);
  else echecs.push(`${intitule}${detail ? ` — ${detail}` : ''}`);
}

const serveur = await demarrerServeur(corpusRecette());
console.log(`\n▸ Strapi de substitution : ${serveur.url} (corpus de recette)\n`);

const code = await lancer('npx', ['astro', 'build', '--outDir', SORTIE], {
  ECHO_STRAPI_URL: serveur.url,
  ECHO_STRAPI_API_TOKEN_READONLY: 'jeton-de-recette',
  ECHO_SITE_URL: ORIGINE,
});
await serveur.arreter();

if (code !== 0) {
  console.error(`\n✖ Le build de recette a echoue (code ${code}).`);
  process.exit(code);
}

const routes = routesEmises(SORTIE);

console.log('\n─────────────  BORNES DE PAGINATION  ─────────────\n');
console.log(`Routes emises : ${routes.size}`);

for (const attendue of ROUTES_ATTENDUES.emises) {
  verifier(`emise : ${attendue}`, routes.has(attendue), 'absente de la sortie');
}
for (const interdite of ROUTES_ATTENDUES.interdites) {
  verifier(`jamais emise : ${interdite}`, !routes.has(interdite), 'presente dans la sortie');
}

// Aucune route en `/page/1`, nulle part : la page 1 ferait doublon avec la forme courte.
verifier(
  'aucune route ne finit par /page/1',
  [...routes].every((route) => !route.endsWith('/page/1')),
  [...routes].filter((route) => route.endsWith('/page/1')).join(', '),
);

// La page 2 de `rubrique-treize` ne porte qu UN article — 13 = 12 + 1.
const page2 = html(SORTIE, '/categorie/rubrique-treize/page/2');
const cartesPage2 = (page2.match(/class="carte"/g) ?? []).length;
verifier('la page 2 de rubrique-treize porte 1 article', cartesPage2 === 1, `${cartesPage2} carte(s)`);

const page1 = html(SORTIE, '/categorie/rubrique-treize');
const cartesPage1 = (page1.match(/class="carte"/g) ?? []).length;
verifier('la page 1 de rubrique-treize porte 12 articles', cartesPage1 === 12, `${cartesPage1} carte(s)`);

const douze = html(SORTIE, '/categorie/rubrique-douze');
const cartesDouze = (douze.match(/class="carte"/g) ?? []).length;
verifier('rubrique-douze porte ses 12 articles sur une seule page', cartesDouze === 12, `${cartesDouze}`);
verifier(
  'rubrique-douze ne rend AUCUNE navigation de pagination',
  !douze.includes('class="pagination"'),
  'une pagination est rendue pour une seule page',
);

// Bornes de navigation : pas de `rel=prev` sur la page 1, pas de `rel=next` sur la derniere.
verifier('page 1 : aucun rel="prev"', !/rel="prev"/.test(page1));
verifier('page 1 : un rel="next"', /rel="next"/.test(page1));
verifier('derniere page : aucun rel="next"', !/rel="next"/.test(page2));
verifier('derniere page : un rel="prev"', /rel="prev"/.test(page2));

// Une page du MILIEU (tag a 3 pages) porte les deux bornes.
const milieu = html(SORTIE, '/tag/etiquette-large/page/2');
verifier('page du milieu : rel="prev" ET rel="next"', /rel="prev"/.test(milieu) && /rel="next"/.test(milieu));

// Tout lien de pagination aboutit — verifie ici sur les pages paginees, en plus de la garde globale.
for (const route of ['/categorie/rubrique-treize', '/categorie/rubrique-treize/page/2', '/tag/etiquette-large/page/2']) {
  const contenu = html(SORTIE, route);
  const nav = contenu.match(/<nav class="pagination"[\s\S]*?<\/nav>/);
  const cibles = nav ? liensDe(nav[0], /href="([^"]+)"/g) : [];
  const mortes = cibles.filter((cible) => !routes.has(cible.replace(/\/$/, '') || '/'));
  verifier(`${route} : ${cibles.length} lien(s) de pagination, tous vivants`, mortes.length === 0, mortes.join(', '));
}

console.log('\n─────────────  BASCULE FR / EN  ─────────────\n');

/** Le lien de bascule d une page : c est le seul `<a>` de la nav `bascule`. */
function bascule(contenu) {
  const nav = contenu.match(/<nav class="bascule"[\s\S]*?<\/nav>/);
  if (!nav) return null;
  const lien = nav[0].match(/<a[^>]*href="([^"]+)"/);
  return lien ? lien[1] : null;
}

/**
 * Les alternates HREFLANG d une page — et eux seuls.
 *
 * Le selecteur exige `hreflang`, il ne se contente pas de `rel="alternate"`. Corrige le
 * 2026-08-07 : le lot SEO (§5.2) a ajoute `<link rel="alternate"
 * type="application/rss+xml">` dans le `<head>` de toutes les pages, et l ancien
 * selecteur le comptait comme un hreflang. Les quatre bornes de cette section sont
 * passees au rouge sur un site parfaitement sain — et la seule qui aurait pu rougir a
 * raison (« article traduit : les hreflang sont emis », qui attend exactement 3) serait
 * desormais passee au vert avec 2 vrais hreflang et un flux RSS. Un compteur qui compte
 * autre chose que ce qu il nomme finit toujours par mentir dans les deux sens.
 */
function alternates(contenu) {
  const balises = contenu.match(/<link\b[^>]*\brel="alternate"[^>]*>/g) ?? [];
  return balises
    .filter((balise) => /\bhreflang="/.test(balise))
    .map((balise) => balise.match(/\bhref="([^"]+)"/))
    .filter((trouve) => trouve !== null)
    .map((trouve) => trouve[1]);
}

// 1. Article TRADUIT : la bascule atterrit sur sa traduction, avec le slug ANGLAIS.
const traduitFr = html(SORTIE, '/article/fr-treize-1');
verifier(
  'article traduit : la bascule pointe /en/article/en-treize-1',
  bascule(traduitFr) === '/en/article/en-treize-1',
  `recu ${bascule(traduitFr)}`,
);
verifier('article traduit : la cible existe dans dist/', routes.has('/en/article/en-treize-1'));
verifier('article traduit : les hreflang sont emis', alternates(traduitFr).length === 3);

// 1 bis. Et en sens inverse.
const traduitEn = html(SORTIE, '/en/article/en-treize-1');
verifier(
  'traduction : la bascule revient sur /article/fr-treize-1',
  bascule(traduitEn) === '/article/fr-treize-1',
  `recu ${bascule(traduitEn)}`,
);

// 2. Article NON traduit : la bascule remonte d un cran (la rubrique anglaise), sans hreflang.
const nonTraduit = html(SORTIE, '/article/fr-treize-5');
verifier(
  'article non traduit : la bascule remonte sur la rubrique anglaise',
  bascule(nonTraduit) === '/en/categorie/section-thirteen',
  `recu ${bascule(nonTraduit)}`,
);
verifier('article non traduit : AUCUN hreflang', alternates(nonTraduit).length === 0);

// 3. Article d une rubrique sans contrepartie anglaise : la bascule tombe sur /en.
const orphelin = html(SORTIE, '/article/fr-cinq-1');
verifier(
  'rubrique sans contrepartie : la bascule tombe sur /en',
  bascule(orphelin) === '/en',
  `recu ${bascule(orphelin)}`,
);

// 4. Profondeur de pagination differente (T-05, piege 2) : repli sur la derniere page EN.
verifier(
  'page 2 FR sans page 2 EN : la bascule replie sur la derniere page anglaise',
  bascule(page2) === '/en/categorie/section-thirteen',
  `recu ${bascule(page2)}`,
);
verifier('ce repli n emet aucun hreflang', alternates(page2).length === 0);

// 5. La 404 pointe l accueil de l autre langue, sans hreflang (T-05, piege 3).
const erreur = html(SORTIE, '/404');
verifier('404 : la bascule pointe /en', bascule(erreur) === '/en', `recu ${bascule(erreur)}`);
verifier('404 : aucun hreflang', alternates(erreur).length === 0);

// 6. Le lien de bascule est TOUJOURS rendu, sur toutes les pages (T-06).
const sansBascule = [...routes].filter((route) => bascule(html(SORTIE, route)) === null);
verifier(
  `le lien de bascule est rendu sur les ${routes.size} pages`,
  sansBascule.length === 0,
  sansBascule.join(', '),
);

// 7. Aucun lien interne mort, sur la sortie de recette.
const rapportLiens = inspecterLiens(SORTIE, ORIGINE);
verifier(
  `${rapportLiens.liens} lien(s) interne(s) : aucun mort`,
  rapportLiens.manquements.length === 0,
  rapportLiens.manquements.slice(0, 5).join(' | '),
);

// --- verdict ---------------------------------------------------------------------

console.log(`\n${constats.join('\n')}`);

if (echecs.length > 0) {
  console.error(`\n✖ ${echecs.length} borne(s) non tenue(s) :`);
  for (const echec of echecs) console.error(`  - ${echec}`);
  process.exit(1);
}

console.log(
  `\n✔ ${constats.length} constats verts : bornes de pagination et bascule FR/EN prouvees sur ${routes.size} routes reellement emises.\n`,
);
