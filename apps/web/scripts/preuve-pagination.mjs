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
 *
 * CODES DE SORTIE — trois issues, pas deux (convention du parc, cf. `serveur-fixtures.mjs`) :
 *   0  toutes les bornes tenues ;
 *   1  au moins une borne non tenue — la preuve a eu lieu et a trouve quelque chose ;
 *   2  VERIFICATION IMPOSSIBLE — une donnee de banc manque, rien n a ete prouve.
 * Le 2 est ce que cette preuve n avait pas : `configuration-en.json` ecarte du banc, elle
 * rendait 0 et « 57 constats verts » sur des pages anglaises servies en francais.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { configurationRecette, corpusRecette, entreesDuCorpus, ROUTES_ATTENDUES } from './corpus-recette.mjs';
import { indexer, manquementsDepot, resumeIndex, retirerBundlesNonCharges } from './index-pagefind.mjs';
import { commandesDeJugement, incapacitesDuJugement, verdictDuJugement } from './juger-sortie.mjs';
import { ORIGINE_PAR_DEFAUT } from './origine.mjs';
import { exigerBanc, ISSUES, servirMedia } from './serveur-fixtures.mjs';
import { inspecterLiens } from './verifier-liens.mjs';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'dist-recette');
const ORIGINE = ORIGINE_PAR_DEFAUT;

/**
 * LE BANC EST EXIGE AVANT LE BUILD — trois issues, et non deux.
 *
 * Cette preuve ne consomme des fixtures que pour la Configuration ; son corpus, lui, est
 * embarque (`corpus-recette.mjs`). Elle exige donc la Configuration de CHAQUE locale du
 * site, et s arrete en 2 (VERIFICATION IMPOSSIBLE) si l une manque, en la nommant.
 *
 * Sans ce pas, l absence se subissait : mesure du 2026-08-10, `configuration-en.json`
 * ecarte, la preuve rendait « 57 constats verts » et un code 0, sur des pages anglaises
 * bourrees de francais.
 */
exigerBanc(
  'bornes de pagination et bascule FR/EN',
  LOCALES_SITE.map((locale) => `configuration-${locale}`),
);

// --- Strapi de substitution -----------------------------------------------------

/**
 * Ce que le banc n a PAS su servir pendant le build. Non vide = la preuve n a pas eu
 * lieu, et le verdict final sort en 2 plutot qu en 1 : une donnee manquante n est pas
 * une borne non tenue.
 */
const incapacites = [];

function enveloppe(entrees) {
  return {
    data: entrees,
    meta: { pagination: { page: 1, pageSize: 100, pageCount: 1, total: entrees.length } },
  };
}

function demarrerServeur(corpus) {
  const serveur = http.createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://localhost');

    /* `/uploads/` — AJOUTE le 2026-08-10, sinon ce script ne construit plus rien.
       Depuis le commit `6ff1fb8` (T-01), l integration `medias-locaux` TELECHARGE au
       build les medias que la sortie reference et fait echouer le build s ils ne
       repondent pas. Le Strapi de substitution de `serveur-fixtures.mjs` sert deja
       `/uploads/` pour cette raison ; celui-ci ne le faisait pas, et `preuve:pagination`
       echouait sur 5 medias en 404 — un echec qui ne dit RIEN de la pagination, seul
       objet de ce script. Les octets importent peu : c est l aboutissement de la
       requete qui est exerce. */
    if (url.pathname.startsWith('/uploads/')) {
      reponse.writeHead(200, { 'content-type': 'image/svg+xml' });
      reponse.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9" viewBox="0 0 16 9">' +
          '<rect width="16" height="9" fill="#d9d4c8"/></svg>',
      );
      return;
    }

    const nom = url.pathname.replace(/^\/api\//, '');
    const locale = url.searchParams.get('locale') ?? 'fr';

    // Depuis T-01 le build TELECHARGE les medias qu il reference : un Strapi de
    // substitution muet sur `/uploads/` fait echouer le build entier, et la preuve
    // rougit pour une raison etrangere a son objet (les bornes de pagination).
    if (servirMedia(requete, reponse)) return;

    // Toute incapacite du banc sort en 500 NOMME : le build n a pas de mode degrade
    // (`src/lib/strapi/client.ts`), il s arrete donc en portant la cause. Un 404 ou une
    // liste vide serait une reponse plausible — c est-a-dire un mensonge indiscernable.
    try {
      if (nom === 'configuration') {
        reponse.writeHead(200, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify(configurationRecette(locale)));
        return;
      }
      if (!(nom in corpus)) {
        reponse.writeHead(404, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify({ error: { status: 404 } }));
        return;
      }
      reponse.writeHead(200, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify(enveloppe(entreesDuCorpus(corpus, nom, locale))));
    } catch (erreur) {
      incapacites.push(erreur.message);
      console.error(`\n${erreur.message}\n`);
      reponse.writeHead(500, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify({ error: { status: 500, name: 'BancIndisponible' } }));
    }
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

// L INCAPACITE SE LIT AVANT L ECHEC DU BUILD, et sous son propre intitule : le build a
// bien echoue, mais dire « borne non tenue » d une donnee de banc absente enverrait
// chercher un defaut de pagination la ou il n y en a aucun.
if (incapacites.length > 0) {
  console.error(`\n${[...new Set(incapacites)].join('\n')}\n`);
  console.error('✖ La preuve n a PAS eu lieu : le banc n a pas su servir ce qu on lui demandait.');
  process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
}

if (code !== 0) {
  console.error(`\n✖ Le build de recette a echoue (code ${code}).`);
  process.exit(code);
}

// --- la sortie de recette est jugee comme la vraie (2026-08-12, tache da329cb3) ----
//
// CE QUI MANQUAIT, ET POURQUOI CA COMPTE. Ce corpus existe pour exercer ce que le corpus
// editorial n atteint pas : une page 2, une categorie a douze pile, un article non
// traduit, une rubrique sans contrepartie anglaise, la 404. Il etait construit, puis
// juge sur ses BORNES seulement — plus les liens morts. Releve du 2026-08-12 :
// `dist-recette/pagefind/` n existait pas, et aucun des sept verificateurs derives n y
// etait lance. Un defaut qui ne se serait manifeste QUE sur une de ces pages passait donc
// au travers de tout le dispositif, y compris de la contrainte opposable « aucun
// JavaScript hors /recherche ».
//
// L INDEX EST DEPOSE D ABORD, LES VERIFICATEURS JUGENT ENSUITE — l ordre de la
// production. `npm run build` enchaine `astro build` PUIS `index-pagefind.mjs`, dont la
// seconde moitie re-inspecte la sortie AUGMENTEE : c est le seul endroit du site ou du
// JavaScript peut entrer apres la garde T-09. Juger avant l index reviendrait a juger une
// sortie qui n est pas celle qu on sert.
//
// POURQUOI PAR IMPORT ET NON PAR `npm run build`. Ce script construit avec `--outDir`,
// que `npm run build` ne sait pas transmettre (`index-pagefind.mjs` prend son chemin en
// argument, pas de `--outDir`). L exemption reste donc ecrite dans
// `tests/integration-continue.test.ts` — mais elle ne couvre plus que la PORTE du build :
// le maillon d indexation, lui, est desormais exerce ici, par import direct.

const jugements = [];

console.log('\n─────────────  INDEX DE RECHERCHE, SUR LE CORPUS DE RECETTE  ─────────────\n');
try {
  const { pages } = await indexer(SORTIE);
  /* LE MEME RETRAIT QUE LA PRODUCTION, ET AVANT DE JUGER. `retirerBundlesNonCharges`
     ne vivait que dans le bloc « usage en ligne de commande » d `index-pagefind.mjs`
     (p2/wt-code-refacto) : `npm run build` en beneficiait, ce chemin-ci non. La recette
     jugeait donc une sortie que la production ne deploierait JAMAIS, et la garde du
     zero-JS (p2/la-garde-du-zero-js-juge-la-sortie-deposee) accusait a juste titre
     4 bundles Pagefind charges par aucune page. Sans cet appel, la recette est plus
     severe que le reel — le pire des ecarts, puisqu il fait douter d une sortie saine. */
  const retires = retirerBundlesNonCharges(SORTIE);
  if (retires.length > 0) {
    const octets = retires.reduce((total, r) => total + r.octets, 0);
    console.log(
      `▸ ${retires.length} bundle(s) Pagefind charge(s) par aucune page, retire(s) ` +
        `(${(octets / 1024).toFixed(1)} Kio) : ${retires.map((r) => r.relatif).join(', ')}`,
    );
  }
  const manquementsIndex = manquementsDepot(SORTIE);
  if (manquementsIndex.length > 0) {
    console.error(`\n✖ ${manquementsIndex.length} manquement(s) APRES depot de l index de recherche :`);
    for (const manquement of manquementsIndex) console.error(`  - ${manquement}`);
    jugements.push({ nom: 'index-de-recherche', code: ISSUES.ANOMALIE });
  } else {
    console.log(`✔ ${resumeIndex(SORTIE, pages)}`);
    jugements.push({ nom: 'index-de-recherche', code: ISSUES.CONFORME });
  }
} catch (erreur) {
  // Pagefind qui ne trouve rien a indexer, ou qui n ecrit pas : la preuve n a pas eu lieu
  // sur ce maillon. C est une INCAPACITE — le geste est de rendre la sortie indexable,
  // pas de chercher un defaut de pagination.
  console.error(`\n⛔ ${erreur.message}`);
  jugements.push({ nom: 'index-de-recherche', code: ISSUES.VERIFICATION_IMPOSSIBLE });
}

console.log('\n─────────────  VERIFICATEURS DE SORTIE, SUR LE CORPUS DE RECETTE  ─────────────\n');
const commandes = commandesDeJugement(
  JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')),
  SORTIE,
  ORIGINE,
);
const aveugle = incapacitesDuJugement(commandes, RACINE);
if (aveugle.length > 0) {
  // La derivation ne sait pas dire QUI doit juger : rien n a ete regarde.
  for (const ecart of aveugle) console.error(`  - ${ecart}`);
  jugements.push({ nom: 'verificateurs-de-sortie', code: ISSUES.VERIFICATION_IMPOSSIBLE });
} else {
  const resultats = [];
  for (const commande of commandes) {
    // Aucun arret au premier rouge : on veut la liste complete en une execution. C est la
    // meme raison qui a fait sauter la serie des pas du job `sortie` (tache 772ac0ac).
    resultats.push({ nom: commande.nom, code: await lancer('node', commande.arguments) });
  }
  const rendu = verdictDuJugement(resultats);
  for (const ligne of rendu.lignes) (rendu.issue === ISSUES.CONFORME ? console.log : console.error)(`  ${ligne}`);
  jugements.push({ nom: 'verificateurs-de-sortie', code: rendu.issue });
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

/**
 * UN SEUL VERDICT, RENDU A LA FIN — et pas un `process.exit` des la premiere trouvaille.
 *
 * Sortir sur les bornes ferait sauter le compte rendu du jugement de la sortie, et
 * inversement : on corrigerait une trouvaille, on relancerait, et on decouvrirait la
 * suivante. C est exactement le defaut que la tache 772ac0ac corrige au niveau du job
 * d integration continue ; le reproduire ici serait le refaire d un cran plus bas.
 *
 * L INCAPACITE PRIME, comme dans `juger-sortie.mjs` : tant qu on ne sait pas ce qui a ete
 * regarde, un `1` enverrait corriger le site sur une preuve qui n a pas eu lieu.
 */
if (echecs.length > 0) {
  console.error(`\n✖ ${echecs.length} borne(s) non tenue(s) :`);
  for (const echec of echecs) console.error(`  - ${echec}`);
}
jugements.push({ nom: 'bornes-et-bascule', code: echecs.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME });

const incapables = jugements.filter((j) => j.code === ISSUES.VERIFICATION_IMPOSSIBLE).map((j) => j.nom);
const fautifs = jugements.filter((j) => j.code === ISSUES.ANOMALIE).map((j) => j.nom);

if (incapables.length > 0) {
  console.error(`\n⛔ VERIFICATION IMPOSSIBLE — rien n a ete prouve par : ${incapables.join(', ')}`);
  if (fautifs.length > 0) console.error(`   (anomalies relevees par ailleurs : ${fautifs.join(', ')})`);
  process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
}
if (fautifs.length > 0) {
  console.error(`\n✖ La preuve a eu lieu, et a trouve : ${fautifs.join(', ')}`);
  process.exit(ISSUES.ANOMALIE);
}

console.log(
  `\n✔ ${constats.length} constats verts : bornes de pagination et bascule FR/EN prouvees sur ${routes.size} routes reellement emises,` +
    ` sur une sortie INDEXEE puis soumise aux ${commandes.length} verificateurs de sortie.\n`,
);
