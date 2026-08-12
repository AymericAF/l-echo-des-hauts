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

// --- Famille 2 bis : l EXCEPTION TYPEE du JSON-LD, et surtout sa BORNE ----------------
//
// §5.1 du cahier exige des donnees structurees sur toutes les pages indexables, et il
// n existe qu une facon de les servir : un `<script type="application/ld+json">`. La
// garde s ouvre donc — et c est le moment ou elle peut se percer.
//
// CE QUI REND L EXCEPTION SURE, ET QU AUCUN DES DEUX SEUL NE SUFFIT :
//   1. le TYPE est compare EXACTEMENT a `application/ld+json` — aucun prefixe, aucun
//      parametre MIME, aucune autre valeur ;
//   2. le CONTENU est PARSE. Sans cela, `<script type="application/ld+json">alert(1)`
//      passerait : le type ne dit pas ce que le navigateur executera, il dit ce que
//      l auteur pretend. Un tunnel a JavaScript deguise, ouvert par la garde elle-meme.
//
// Ce bloc de tests est la preuve que l ouverture ne perce pas. Chaque cas refuse ici
// etait accepte par une garde qui se contenterait de lire le `type`.

const LD_VALIDE =
  '{"@context":"https://schema.org","@type":"WebSite","name":"L Echo des Hauts"}';

const pageLd = (attributs: string, contenu = LD_VALIDE): string =>
  `<!DOCTYPE html><html lang="fr"><head><script${attributs}>${contenu}</script></head><body></body></html>`;

test('un <script type="application/ld+json"> au contenu JSON valide est ACCEPTE', () => {
  const rapport = inspecterSortie(dist({ 'index.html': pageLd(' type="application/ld+json"') }));
  assert.deepEqual(rapport.manquements, []);
});

test('la comparaison du type est insensible a la casse', () => {
  const rapport = inspecterSortie(dist({ 'index.html': pageLd(' TYPE="Application/LD+JSON"') }));
  assert.deepEqual(rapport.manquements, []);
});

test('les espaces autour du type et de l egal sont normalises', () => {
  const rapport = inspecterSortie(
    dist({ 'index.html': pageLd(' type =  "  application/ld+json\n" ') }),
  );
  assert.deepEqual(rapport.manquements, []);
});

test('un JSON-LD en tableau, ou sur plusieurs lignes, reste accepte', () => {
  const contenu = '[\n  {"@context":"https://schema.org","@type":"BreadcrumbList"}\n]';
  const rapport = inspecterSortie(dist({ 'index.html': pageLd(' type="application/ld+json"', contenu) }));
  assert.deepEqual(rapport.manquements, []);
});

test('LE TUNNEL DEGUISE — un type ld+json dont le contenu n est PAS du JSON est refuse', () => {
  // C est le cas qui justifie de parser plutot que de lire l etiquette. Sans lui,
  // l exception typee devient la porte d entree du JavaScript qu elle etait censee
  // fermer : il suffit d ecrire le bon `type` au-dessus de n importe quel code.
  const rapport = inspecterSortie(
    dist({ 'index.html': pageLd(' type="application/ld+json"', 'alert(1)') }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /JSON/i);
});

test('LE TUNNEL DEGUISE — une IIFE sous etiquette ld+json est refusee', () => {
  const rapport = inspecterSortie(
    dist({ 'index.html': pageLd(' type="application/ld+json"', '(function(){document.cookie})()') }),
  );
  assert.equal(rapport.manquements.length, 1);
});

test('un ld+json vide est refuse : la chaine vide n est pas du JSON', () => {
  assert.equal(inspecterSortie(dist({ 'index.html': pageLd(' type="application/ld+json"', '') })).manquements.length, 1);
});

test('un ld+json scalaire est refuse : un graphe est un objet ou un tableau', () => {
  // `42` et `"alert(1)"` sont du JSON PARFAITEMENT valide. Ils sont inertes, donc sans
  // danger — mais ils ne sont pas un graphe, et les accepter reviendrait a dire que la
  // garde ne sait pas ce qu elle laisse passer.
  assert.equal(inspecterSortie(dist({ 'index.html': pageLd(' type="application/ld+json"', '42') })).manquements.length, 1);
  assert.equal(
    inspecterSortie(dist({ 'index.html': pageLd(' type="application/ld+json"', '"alert(1)"') })).manquements.length,
    1,
  );
});

test('un ld+json non ferme est refuse : sans balise fermante, rien n a ete juge', () => {
  const html = `<html><head><script type="application/ld+json">${LD_VALIDE}</head></html>`;
  const rapport = inspecterSortie(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /fermee|fermante/i);
});

test('LA SORTIE PAR LA FERMETURE — un </script> a l interieur du JSON est refuse', () => {
  // Une valeur de graphe qui contient litteralement `</script>` ferme la balise pour
  // l analyseur du navigateur, et ce qui suit redevient du HTML — donc du JavaScript
  // executable. Le JSON restant est tronque, donc invalide : la garde le voit.
  const contenu = '{"@type":"Article","headline":"</script><script>alert(1)</script>"}';
  const rapport = inspecterSortie(dist({ 'index.html': pageLd(' type="application/ld+json"', contenu) }));
  assert.ok(rapport.manquements.length >= 1);
});

test('CE QUI DOIT CONTINUER A ECHOUER — les quatre types executables et le type absent', () => {
  // La liste vient de la consigne d ouverture de la garde, mot pour mot. Chacun de ces
  // quatre cas est un script que le navigateur EXECUTE.
  for (const attributs of [
    '',
    ' type="module"',
    ' type="text/javascript"',
    ' type="application/javascript"',
  ]) {
    const rapport = inspecterSortie(dist({ 'index.html': pageLd(attributs, 'alert(1)') }));
    assert.equal(rapport.manquements.length, 1, `accepte a tort : <script${attributs}>`);
    assert.match(rapport.manquements[0], /script/i);
  }
});

test('un type VOISIN de ld+json est refuse : la comparaison est exacte, pas par prefixe', () => {
  // `application/json` n est pas `application/ld+json`, et surtout : un parametre MIME
  // (`; charset=utf-8`) ou un suffixe arbitraire ne doivent pas suffire a entrer. Une
  // comparaison par `startsWith` ou par expression reguliere laxiste passerait ici.
  for (const type of [
    'application/json',
    'application/ld+jsonp',
    'application/ld+json; charset=utf-8',
    'xapplication/ld+json',
    'application/ld + json',
    'text/application/ld+json',
  ]) {
    const rapport = inspecterSortie(dist({ 'index.html': pageLd(` type="${type}"`) }));
    assert.equal(rapport.manquements.length, 1, `accepte a tort : type="${type}"`);
  }
});

test('un data-type ne se fait pas passer pour un type', () => {
  const rapport = inspecterSortie(
    dist({ 'index.html': pageLd(' data-type="application/ld+json"', 'alert(1)') }),
  );
  assert.equal(rapport.manquements.length, 1);
});

test('un attribut on*= sur la balise ld+json elle-meme reste refuse', () => {
  // L exception porte sur le TYPE du script, jamais sur la balise entiere.
  const rapport = inspecterSortie(
    dist({ 'index.html': pageLd(' type="application/ld+json" onload="v()"') }),
  );
  assert.ok(rapport.manquements.some((m) => /evenement inline/.test(m)));
});

test('deux blocs ld+json valides sur une meme page sont acceptes, un troisieme fautif est vu', () => {
  // Le second bloc ne doit pas etre avale par la lecture du premier : c est le defaut
  // classique d une expression reguliere gloutonne, et il rendrait la garde aveugle a
  // tout ce qui suit le premier JSON-LD de la page.
  const html =
    '<html><head>' +
    `<script type="application/ld+json">${LD_VALIDE}</script>` +
    `<script type="application/ld+json">${LD_VALIDE}</script>` +
    '<script>alert(1)</script>' +
    '</head></html>';
  const rapport = inspecterSortie(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /<script>/);
});

test('un script executable CACHE derriere un premier bloc ld+json est vu', () => {
  // Meme piege, pris par l autre bout : si la lecture du bloc ld+json consommait
  // jusqu au DERNIER `</script>` de la page, le script du milieu disparaitrait.
  const html =
    '<html><head>' +
    `<script type="application/ld+json">${LD_VALIDE}</script>` +
    '<script type="text/javascript">document.write(1)</script>' +
    '</head></html>';
  const rapport = inspecterSortie(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /text\/javascript/);
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

/**
 * La page /recherche telle qu elle sort REELLEMENT du build : elle NOMME son bundle, dans
 * un `data-bundle` importe dynamiquement.
 *
 * CE QUE CES DEUX FIXTURES DISAIENT AVANT LE 2026-08-12, et pourquoi il a fallu les
 * corriger : elles posaient un `pagefind/pagefind.js` que la page ne nommait PAS, et
 * l exemption les acceptait quand meme — parce qu elle portait sur le REPERTOIRE. Depuis
 * que le critere est l atteignabilite (tache cf33a689), une fixture ou rien ne charge le
 * bundle decrit un site ou 45 Kio de JavaScript sont servis pour personne : la garde a
 * raison de la refuser, et c est la fixture qui mentait sur la sortie reelle.
 */
const PAGE_RECHERCHE_REELLE = (bundle: string) =>
  `<!DOCTYPE html><html lang="fr"><body><div data-bundle="${bundle}"></div>` +
  '<script type="module">import(zone.dataset.bundle)</script></body></html>';

test('la page /recherche a le droit de charger du JavaScript', () => {
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': PAGE_RECHERCHE_REELLE('/pagefind/pagefind.js'),
      'pagefind/pagefind.js': 'export{}',
    }),
  );
  assert.deepEqual(rapport.manquements, []);
});

test('le miroir anglais /en/recherche beneficie de la meme exception', () => {
  const rapport = inspecterSortie(
    dist({
      'en/recherche/index.html': PAGE_RECHERCHE_REELLE('/en/pagefind/pagefind.js'),
      'en/pagefind/pagefind.js': 'export{}',
    }),
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
