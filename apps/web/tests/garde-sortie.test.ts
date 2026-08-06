/**
 * Tests de la garde T-09.
 *
 * Ce qui est teste ici, c est la DECISION de la garde (ce qu elle refuse, ce qu elle
 * laisse passer), sur des arborescences fabriquees. Que le build echoue vraiment quand
 * la garde refuse se prouve autrement — en cassant le build pour de vrai, et en lisant
 * son code de sortie. Un test qui n a jamais vu le rouge ne prouve rien.
 *
 * L essentiel de ce fichier porte sur la BORNE de l exception `/recherche` : c est le
 * seul endroit ou la garde a le droit de dire oui, donc le seul endroit ou elle peut
 * fuir sur le reste du site.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspecterSortie } from '../scripts/verifier-sortie.mjs';
import { manquementsConfig, manquementsRoutes } from '../integrations/garde-t09.mjs';

/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'garde-t09-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

const PAGE_NUE = '<!DOCTYPE html><html lang="fr"><body><p>Bonjour</p></body></html>';
const PAGE_SCRIPT = '<!DOCTYPE html><html lang="fr"><body><script>alert(1)</script></body></html>';
const PAGE_ONCLICK = '<!DOCTYPE html><html lang="fr"><body><button onclick="v()">Lire</button></body></html>';

test('une sortie sans JavaScript ne remonte aucun manquement', () => {
  const rapport = inspecterSortie(dist({ 'index.html': PAGE_NUE, '_astro/style.css': 'p{}' }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.pages, 1);
});

// --- Famille 1 : un fichier JavaScript emis -------------------------------------------

test('un fichier .js servi hors /recherche est refuse', () => {
  const rapport = inspecterSortie(dist({ 'index.html': PAGE_NUE, '_astro/hydrate.js': 'export{}' }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /_astro\/hydrate\.js/);
});

test('les extensions .mjs et .cjs sont refusees au meme titre que .js', () => {
  const rapport = inspecterSortie(dist({ 'a/x.mjs': 'export{}', 'b/y.cjs': 'module.exports={}' }));
  assert.equal(rapport.manquements.length, 2);
});

// --- Famille 2 : une balise <script> --------------------------------------------------

test('une balise <script> dans une page est refusee', () => {
  const rapport = inspecterSortie(dist({ 'index.html': PAGE_SCRIPT }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /<script>/);
});

test('un <script type="application/ld+json"> reste refuse : il se lit dans dist, pas dans l intention', () => {
  const html = '<html><head><script type="application/ld+json">{}</script></head></html>';
  assert.equal(inspecterSortie(dist({ 'index.html': html })).manquements.length, 1);
});

// --- Famille 3 : un attribut d evenement inline ---------------------------------------

test('un attribut on*= inline est refuse', () => {
  const rapport = inspecterSortie(dist({ 'index.html': PAGE_ONCLICK }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /evenement inline/);
});

test('le texte d un article n est pas confondu avec un attribut', () => {
  // Chercher ` on...=` dans le document entier remonterait « one = 1 » ecrit en toutes
  // lettres dans un article. Un faux positif sur une garde dure finit toujours de la meme
  // facon : on la desactive. La recherche se fait donc dans les balises ouvrantes.
  const html = '<html><body><p>Dans ce langage, one = 1 et none = 0.</p></body></html>';
  assert.deepEqual(inspecterSortie(dist({ 'index.html': html })).manquements, []);
});

test('un attribut data-* qui contient « on » ne declenche rien', () => {
  const html = '<html><body><div data-once="1" data-onglet="a"></div></body></html>';
  assert.deepEqual(inspecterSortie(dist({ 'index.html': html })).manquements, []);
});

test('tout attribut de l espace on*= est refuse, meme inconnu du developpeur', () => {
  // La garde ne tient PAS une liste de gestionnaires connus : le HTML reserve l espace
  // de noms `on*` aux gestionnaires d evenement, et la liste s allonge a chaque version
  // de la specification. Enumerer, c est se garantir un trou a la prochaine addition.
  const html = '<html><body><div onbeforetoggle="v()"></div></body></html>';
  assert.equal(inspecterSortie(dist({ 'index.html': html })).manquements.length, 1);
});

// --- Famille 4 : sortie serveur -------------------------------------------------------

test('un _worker.js a la racine de dist est refuse', () => {
  const rapport = inspecterSortie(dist({ '_worker.js': 'export default {}' }));
  assert.ok(rapport.manquements.some((m) => /sortie serveur/.test(m)));
});

test('un repertoire server/ ou functions/ est refuse', () => {
  const rapport = inspecterSortie(dist({ 'server/entry.txt': 'x', 'functions/api.txt': 'x' }));
  assert.equal(rapport.manquements.filter((m) => /sortie serveur/.test(m)).length, 2);
});

// --- L exception /recherche, et surtout sa BORNE --------------------------------------

test('la page /recherche a le droit de charger du JavaScript', () => {
  const rapport = inspecterSortie(
    dist({ 'recherche/index.html': PAGE_SCRIPT, 'pagefind/pagefind.js': 'export{}' }),
  );
  assert.deepEqual(rapport.manquements, []);
});

test('le miroir anglais /en/recherche beneficie de la meme exception', () => {
  const rapport = inspecterSortie(
    dist({ 'en/recherche/index.html': PAGE_SCRIPT, 'en/pagefind/pagefind.js': 'export{}' }),
  );
  assert.deepEqual(rapport.manquements, []);
});

test('FUITE — une page enfant de /recherche n est PAS exemptee', () => {
  // `recherche/` n est pas un sous-arbre franc : seule la page /recherche est exemptee
  // (§0 des arbitrages : « /recherche est une page, et c est la seule exemptee »).
  const rapport = inspecterSortie(dist({ 'recherche/avancee/index.html': PAGE_SCRIPT }));
  assert.equal(rapport.manquements.length, 1);
});

test('FUITE — une page dont le chemin CONTIENT recherche n est pas exemptee', () => {
  const rapport = inspecterSortie(
    dist({ 'articles/recherche/index.html': PAGE_SCRIPT, 'recherche-avancee/index.html': PAGE_ONCLICK }),
  );
  assert.equal(rapport.manquements.length, 2);
});

test('FUITE — un bundle partage _astro/ reste refuse meme si /recherche existe', () => {
  // C est le vrai vecteur de fuite : `_astro/` est servi a TOUTES les pages. Exempter
  // le repertoire parce que /recherche s en sert ouvrirait le site entier.
  const rapport = inspecterSortie(
    dist({ 'recherche/index.html': PAGE_SCRIPT, '_astro/pagefind.CAFE1234.js': 'export{}' }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /_astro\/pagefind/);
});

test('FUITE — un .js pose a cote de /recherche mais un cran au-dessus reste refuse', () => {
  const rapport = inspecterSortie(dist({ 'recherche.js': 'export{}', 'pagefind.js': 'export{}' }));
  assert.equal(rapport.manquements.length, 2);
});

// --- Conditions T-09 lues sur la configuration et les routes --------------------------

test('un adaptateur configure est refuse', () => {
  const m = manquementsConfig({ adapter: { name: '@astrojs/node' }, buildOutput: 'static' });
  assert.equal(m.length, 1);
  assert.match(m[0], /adaptateur/);
});

test('une sortie de build « server » est refusee', () => {
  const m = manquementsConfig({ adapter: undefined, buildOutput: 'server' });
  assert.equal(m.length, 1);
  assert.match(m[0], /buildOutput/);
});

test('une configuration statique sans adaptateur passe', () => {
  assert.deepEqual(manquementsConfig({ adapter: undefined, buildOutput: 'static' }), []);
});

test('une route non prerendue est refusee et nommee par son entrypoint', () => {
  const m = manquementsRoutes([
    { pattern: '/', entrypoint: 'src/pages/index.astro', isPrerendered: true, type: 'page', origin: 'project' },
    { pattern: '/api/preview', entrypoint: 'src/pages/api/preview.ts', isPrerendered: false, type: 'endpoint', origin: 'project' },
  ]);
  assert.equal(m.length, 1);
  assert.match(m[0], /src\/pages\/api\/preview\.ts/);
  assert.match(m[0], /prerender = false/);
});

test('les routes de redirection ne sont pas comptees comme non prerendues', () => {
  const m = manquementsRoutes([
    { pattern: '/vieux', entrypoint: '', isPrerendered: false, type: 'redirect', origin: 'project' },
  ]);
  assert.deepEqual(m, []);
});

test('la plomberie interne d Astro n est pas comptee comme une bascule serveur', () => {
  // Constate le 2026-08-07 sur un build SAIN : Astro declare ces routes non prerendues
  // dans tout build. Sans cette exclusion, la garde refusait le build de reference.
  const m = manquementsRoutes([
    { pattern: '/_server-islands/[name]', entrypoint: '_server-islands.astro', isPrerendered: false, type: 'page', origin: 'internal' },
    { pattern: '/404', entrypoint: 'astro-default-404.astro', isPrerendered: false, type: 'page', origin: 'internal' },
    { pattern: '/_image', entrypoint: 'node_modules/astro/dist/assets/endpoint/dev.js', isPrerendered: false, type: 'endpoint', origin: 'internal' },
  ]);
  assert.deepEqual(m, []);
});

test('FUITE — une route serveur injectee par une integration reste refusee', () => {
  // `origin: 'external'` = injectee via `injectRoute`. C est le seul chemin par lequel une
  // route serveur peut entrer sans qu aucun fichier du projet ne la montre : elle reste
  // sous la garde, sinon l exclusion de la plomberie interne ouvrirait une porte.
  const m = manquementsRoutes([
    { pattern: '/api/preview', entrypoint: 'node_modules/un-plugin/preview.js', isPrerendered: false, type: 'endpoint', origin: 'external' },
  ]);
  assert.equal(m.length, 1);
});
