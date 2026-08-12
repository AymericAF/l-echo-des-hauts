/**
 * CE QUI EST SERVI SOUS `pagefind/` DOIT ETRE CE QUE LA PAGE CHARGE — rien de plus.
 *
 * CE QUI A ETE MESURE (2026-08-12, sur `dist/` reellement indexe, 24 pages). Pagefind
 * depose neuf fichiers `.js`/`.css` dans `dist/pagefind/`. La page n en charge que DEUX :
 *
 *   pagefind.js          45 555 o  seule adresse ecrite dans `src/lib/seo/recherche.ts`,
 *                                  portee par `data-bundle` et importee dynamiquement ;
 *   pagefind-worker.js   41 255 o  que le premier demarre — `new Worker(workerUrl)`, avec
 *                                  `workerUrl = \`${basePath}pagefind-worker.js\``.
 *
 * LES SEPT AUTRES SONT SERVIS PUBLIQUEMENT ET CHARGES PAR RIEN — mesure : zero page HTML
 * de `dist/` les cite, et `pagefind.js` ne contient aucune de leurs adresses (comptage :
 * 0 occurrence pour `pagefind-ui`, `pagefind-component-ui`, `pagefind-modular-ui`,
 * `pagefind-highlight`, contre 1 pour `pagefind-worker`) :
 *
 *   pagefind-component-ui.js  175 488 o     pagefind-component-ui.css   43 339 o
 *   pagefind-ui.js            119 987 o     pagefind-ui.css             14 482 o
 *   pagefind-highlight.js      44 352 o     pagefind-modular-ui.css      7 549 o
 *   pagefind-modular-ui.js     14 634 o
 *
 * Soit 419 831 octets — 410,0 Kio — servis et jamais lus, sur un site dont la contrainte
 * dure du §1 est « zero JavaScript servi hors /recherche ».
 *
 * CE QUE CELA COUTE AU-DELA DU POIDS, et c est le vrai motif : `pagefind-highlight.js` est
 * LE SEUL des six bundles a fabriquer une feuille de style a l execution (mesure : un
 * `createElement("style")`, zero dans tous les autres). C est exactement l injection que la
 * mesure `eba89df5` a prouvee ABSENTE, et sur laquelle repose la decision « `style-src` :
 * rien a ouvrir ». Ce fichier n etait pas charge. Il etait servi. Une ligne suffisait.
 *
 * POURQUOI AUCUNE GARDE NE LE VOYAIT — et pourquoi la correction n est PAS une liste de
 * noms. L exemption T-09 etait `^(en\/)?pagefind\/[^/]+\.(js|mjs|cjs)$` : un MOTIF DE
 * CHEMIN, qui laisse passer tout `.js` pose a plat sous `pagefind/`, quel qu il soit et
 * quel que soit leur nombre. La remplacer par une liste de noms attendus fermerait le cas
 * et perimerait au premier renommage — Pagefind versionne ses bundles, et une garde
 * perimee se contourne en ajoutant un nom, c est-a-dire jamais.
 *
 * LE CRITERE EST DONC L ATTEIGNABILITE, qui est un motif et non une liste : un `.js` servi
 * sous `pagefind/` est legal s il est ATTEINT depuis une page exemptee, directement ou par
 * la chaine des references. Renommer un bundle charge ne casse rien (la reference suit) ;
 * en deposer un nouveau que rien ne charge est refuse ; et le jour ou un bundle CHARGE se
 * met a injecter du style, la garde le dit en nommant la decision qui se rouvre.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { bundlesPagefindNonCharges, inspecterSortie } from '../scripts/verifier-sortie.mjs';
import { retirerBundlesNonCharges } from '../scripts/index-pagefind.mjs';

/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-pagefind-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

/** La page /recherche telle qu elle sort REELLEMENT du build : elle NOMME son bundle. */
function pageRecherche(bundle = '/pagefind/pagefind.js'): string {
  return (
    '<!DOCTYPE html><html lang="fr"><body>' +
    `<div id="recherche" data-bundle="${bundle}"></div>` +
    "<script type=\"module\">import(document.getElementById('recherche').dataset.bundle)</script>" +
    '</body></html>'
  );
}

/** Le bundle d entree, qui demarre son worker — la seule reference indirecte reelle. */
const BUNDLE = 'const workerUrl = `${basePath}pagefind-worker.js`; new Worker(workerUrl);';

/** Ce que fait `pagefind-highlight.js`, et lui seul : une feuille de style a l execution. */
const BUNDLE_QUI_INJECTE = 'const s = document.createElement("style"); document.head.append(s);';

// ── 1. LE CAS NORMAL : ce qui est charge passe, y compris par la chaine ───────────────

test('le bundle nomme par la page et le worker qu il demarre sont tous deux legaux', () => {
  const rapport = inspecterSortie(
    dist({
      'index.html': '<!DOCTYPE html><html lang="fr"><body><p>Bonjour</p></body></html>',
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': BUNDLE,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/pagefind-entry.json': '{}',
      'pagefind/wasm.fr.pagefind': 'binaire',
      'pagefind/fragment/fr_abc.pf_fragment': 'binaire',
    }),
  );
  assert.deepEqual(rapport.manquements, []);
});

test('le miroir anglais beneficie de la meme chaine', () => {
  const rapport = inspecterSortie(
    dist({
      'en/recherche/index.html': pageRecherche('/en/pagefind/pagefind.js'),
      'en/pagefind/pagefind.js': BUNDLE,
      'en/pagefind/pagefind-worker.js': 'onmessage = () => {};',
    }),
  );
  assert.deepEqual(rapport.manquements, []);
});

// ── 2. LE DEFAUT MESURE : servi, jamais charge ────────────────────────────────────────

test('un bundle servi que RIEN ne charge est refuse, et nomme', () => {
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': BUNDLE,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/pagefind-ui.js': 'export{}',
    }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /pagefind\/pagefind-ui\.js/);
  assert.match(rapport.manquements[0], /charg/i);
});

test('les six bundles reellement mesures sont tous refuses, aucun n en rachete un autre', () => {
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': BUNDLE,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/pagefind-ui.js': 'export{}',
      'pagefind/pagefind-component-ui.js': 'export{}',
      'pagefind/pagefind-modular-ui.js': 'export{}',
      'pagefind/pagefind-highlight.js': 'export{}',
    }),
  );
  assert.equal(rapport.manquements.length, 4);
});

// ── 3. UN MOTIF, PAS UNE LISTE : le renommage ne doit RIEN changer ────────────────────

test('un bundle charge sous un NOM INCONNU est legal — le critere est la reference, pas le nom', () => {
  // Une montee de version de Pagefind qui empreinterait ses fichiers ne doit pas faire
  // rougir un site sain : une liste de noms attendus se serait perimee ici.
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche('/pagefind/pagefind.a1b2c3.js'),
      'pagefind/pagefind.a1b2c3.js': 'const w = `${b}pagefind-worker.d4e5f6.js`; new Worker(w);',
      'pagefind/pagefind-worker.d4e5f6.js': 'onmessage = () => {};',
    }),
  );
  assert.deepEqual(rapport.manquements, []);
});

test('un bundle NON charge sous un nom inconnu reste refuse — une liste l aurait laisse passer', () => {
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': BUNDLE,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/pagefind-ui-v2-nouveau.js': 'export{}',
    }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /pagefind-ui-v2-nouveau\.js/);
});

// ── 4. LES BORNES DEJA TENUES NE BOUGENT PAS ─────────────────────────────────────────

test('FUITE — un chunk IMBRIQUE sous pagefind/ reste refuse', () => {
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': BUNDLE,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/interne/chunk.js': 'export{}',
    }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /pagefind\/interne\/chunk\.js/);
});

test('FUITE — une page ORDINAIRE qui nomme un bundle ne le rend PAS atteignable', () => {
  // Sinon la contrainte tomberait par ou elle est censee tenir : une page indexee dans
  // laquelle Pagefind injecterait son interface legaliserait le bundle qu elle charge.
  const racine = dist({
    'index.html': '<!DOCTYPE html><html lang="fr"><body><p>voir /pagefind/pagefind-ui.js</p></body></html>',
    'recherche/index.html': pageRecherche(),
    'pagefind/pagefind.js': BUNDLE,
    'pagefind/pagefind-worker.js': 'onmessage = () => {};',
    'pagefind/pagefind-ui.js': 'export{}',
  });
  assert.deepEqual(bundlesPagefindNonCharges(racine), ['pagefind/pagefind-ui.js']);
});

test('un .js hors de tout repertoire pagefind/ reste refuse', () => {
  const rapport = inspecterSortie(
    dist({ 'recherche/index.html': pageRecherche(), '_astro/hydrate.js': 'export{}' }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /_astro\/hydrate\.js/);
});

// ── 5. CE QUI DOIT ETRE VU PLUTOT QU ABSORBE : un bundle CHARGE qui injecte du style ──

test('un bundle CHARGE qui fabrique une feuille de style rougit, en nommant la decision', () => {
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': `${BUNDLE} import('./pagefind-highlight.js');`,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/pagefind-highlight.js': BUNDLE_QUI_INJECTE,
    }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /pagefind-highlight\.js/);
  assert.match(rapport.manquements[0], /style-src/);
});

test('un bundle NON charge qui injecterait du style est refuse pour la premiere raison', () => {
  // Il l est parce qu il n est pas charge — pas parce qu il injecte. Confondre les deux
  // ferait croire la seconde garde exercee alors que la premiere a repondu.
  const rapport = inspecterSortie(
    dist({
      'recherche/index.html': pageRecherche(),
      'pagefind/pagefind.js': BUNDLE,
      'pagefind/pagefind-worker.js': 'onmessage = () => {};',
      'pagefind/pagefind-highlight.js': BUNDLE_QUI_INJECTE,
    }),
  );
  assert.equal(rapport.manquements.length, 1);
  assert.doesNotMatch(rapport.manquements[0], /style-src/);
});

// ── 6. LE RETRAIT : il enleve les bundles morts, et RIEN de ce que la recherche lit ───

test('le retrait enleve les bundles et feuilles non charges, et JAMAIS les donnees de l index', () => {
  const racine = dist({
    'recherche/index.html': pageRecherche(),
    'pagefind/pagefind.js': BUNDLE,
    'pagefind/pagefind-worker.js': 'onmessage = () => {};',
    'pagefind/pagefind-ui.js': 'export{}',
    'pagefind/pagefind-ui.css': '.pagefind-ui{}',
    'pagefind/pagefind-component-ui.js': 'export{}',
    'pagefind/pagefind-entry.json': '{}',
    'pagefind/wasm.fr.pagefind': 'binaire',
    'pagefind/pagefind.fr_abc.pf_meta': 'binaire',
    'pagefind/index/fr_abc.pf_index': 'binaire',
    'pagefind/fragment/fr_abc.pf_fragment': 'binaire',
  });

  const retires = retirerBundlesNonCharges(racine);
  assert.deepEqual(
    retires.map((r) => r.relatif).sort(),
    ['pagefind/pagefind-component-ui.js', 'pagefind/pagefind-ui.css', 'pagefind/pagefind-ui.js'],
  );
  assert.ok(
    retires.every((r) => r.octets > 0),
    'le retrait doit dire ce qu il a enleve ET son poids : sans le poids, personne ne le lit',
  );

  // CE QUI RESTE, ET QUI EST TOUT CE QUE LA RECHERCHE LIT A L EXECUTION. Ces fichiers-la
  // sont demandes par des URL CALCULEES : aucune analyse statique ne les voit, et les
  // retirer rendrait la page /recherche muette en repondant 200 partout.
  for (const survivant of [
    'pagefind/pagefind.js',
    'pagefind/pagefind-worker.js',
    'pagefind/pagefind-entry.json',
    'pagefind/wasm.fr.pagefind',
    'pagefind/pagefind.fr_abc.pf_meta',
    'pagefind/index/fr_abc.pf_index',
    'pagefind/fragment/fr_abc.pf_fragment',
  ]) {
    assert.ok(fs.existsSync(path.join(racine, survivant)), `${survivant} a ete retire a tort`);
  }

  // Et la sortie ainsi nettoyee passe la garde : c est le meme critere des deux cotes.
  assert.deepEqual(inspecterSortie(racine).manquements, []);
});

test('le retrait est stable : rejoue sur une sortie deja nettoyee, il n enleve rien', () => {
  const racine = dist({
    'recherche/index.html': pageRecherche(),
    'pagefind/pagefind.js': BUNDLE,
    'pagefind/pagefind-worker.js': 'onmessage = () => {};',
  });
  assert.deepEqual(retirerBundlesNonCharges(racine), []);
});
