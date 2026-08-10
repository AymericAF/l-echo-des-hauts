/**
 * `/recherche` — la SEULE page du site autorisee a charger du JavaScript (§5.4, §0 des
 * arbitrages techniques, garde T-09).
 *
 * Ce fichier n exerce pas « la recherche marche » : cela se lit dans un navigateur, sur
 * un `dist/` indexe, et rien ici ne peut en tenir lieu. Il exerce les trois decisions
 * qui, elles, se prennent dans le code et se cassent en silence :
 *
 *   1. `/recherche` et `/en/recherche` sont des routes REELLEMENT emises — sinon la
 *      bascule FR/EN de T-04 pointerait une page inexistante, et `garde-liens` ne le
 *      dirait qu au premier build ou un lien y mene.
 *   2. Ce qui entre dans l index de recherche se DERIVE d une seule regle
 *      (`src/lib/seo/recherche.ts`), pas d un attribut recopie de page en page.
 *   3. Ce que Pagefind DEPOSE dans la sortie tient dans l exemption de la garde T-09 —
 *      exemption bornee a des chemins exacts. C est le controle qui empeche l index de
 *      recherche d ouvrir le site entier au JavaScript.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { auteur, categorie, localisation, referenceAuteur, referenceCategorie, serieArticles } from './aides/corpus-factice.ts';
import { PAGES_STATIQUES, cheminStatique } from '../src/lib/routes/chemins.ts';
import { contrepartie } from '../src/lib/routes/contrepartie.ts';
import { construireRegistre, type CorpusRoutes } from '../src/lib/routes/registre.ts';
import { CHEMIN_BUNDLE_PAGEFIND, indexableParRecherche } from '../src/lib/seo/recherche.ts';
import { manquementsDepot } from '../scripts/index-pagefind.mjs';

// --- 1. La route existe, dans les deux locales ----------------------------------------

test('« recherche » est une page statique du site, dans les deux locales', () => {
  assert.ok(PAGES_STATIQUES.includes('recherche'));
  assert.equal(cheminStatique('fr', 'recherche'), '/recherche');
  assert.equal(cheminStatique('en', 'recherche'), '/en/recherche');
});

const cat = categorie('cat-1', 'fr', 'Territoire', 'territoire', []);
const aut = auteur('aut-1', 'fr', 'Hakim Zerrouki', 'hakim-zerrouki', []);
const corpus: CorpusRoutes = {
  articles: serieArticles(2, {
    prefixe: 'fr-a',
    locale: 'fr',
    categorie: referenceCategorie(cat),
    auteur: referenceAuteur(aut),
    tags: [],
  }),
  categories: [cat],
  tags: [],
  auteurs: [aut],
  dossiers: [],
};

test('le registre emet les deux pages de recherche, meme sans article anglais', () => {
  const registre = construireRegistre(corpus);
  assert.ok(registre.contient('/recherche'));
  assert.ok(registre.contient('/en/recherche'));
});

test('la bascule FR/EN de /recherche est une contrepartie EXACTE', () => {
  // T-05 : `/recherche` est l une des rares routes derivables par prefixage — elle ne
  // porte aucun slug localise. Le `hreflang` a donc le droit de sortir.
  const registre = construireRegistre(corpus);
  const cible = contrepartie(registre, { genre: 'statique', locale: 'fr', nom: 'recherche' });
  assert.deepEqual(cible, { chemin: '/en/recherche', locale: 'en', exact: true });
});

// --- 2. Ce qui entre dans l index -----------------------------------------------------

test('une page indexable par les moteurs entre dans l index de recherche', () => {
  assert.equal(indexableParRecherche({ genre: 'accueil', locale: 'fr' }, false), true);
  assert.equal(
    indexableParRecherche({ genre: 'statique', locale: 'fr', nom: 'a-propos' }, false),
    true,
  );
});

test('une page en noindex n entre PAS dans l index de recherche', () => {
  // Proposer dans une recherche interne ce qu on demande aux moteurs d ignorer serait
  // deux politiques d indexation pour un seul site. La regle se derive du `noindex`
  // deja calcule (A-29), elle ne se recopie pas.
  assert.equal(indexableParRecherche({ genre: 'statique', locale: 'fr', nom: '404' }, true), false);
  assert.equal(indexableParRecherche({ genre: 'article', locale: 'fr', article: corpus.articles[0] }, true), false);
});

test('la page de recherche ne s indexe pas elle-meme', () => {
  // Elle est indexable par les moteurs (elle est au sitemap, cf. la table de volumetrie
  // du protocole de mesure) : son exclusion ne peut donc pas se deduire du `noindex`.
  assert.equal(
    indexableParRecherche({ genre: 'statique', locale: 'fr', nom: 'recherche' }, false),
    false,
  );
  assert.equal(
    indexableParRecherche({ genre: 'statique', locale: 'en', nom: 'recherche' }, false),
    false,
  );
});

test('le bundle charge par la page est celui que la garde T-09 exempte', () => {
  assert.equal(CHEMIN_BUNDLE_PAGEFIND, '/pagefind/pagefind.js');
});

// --- 3. Ce que Pagefind depose reste dans l exemption T-09 ----------------------------

/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefind-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

const PAGE_RECHERCHE = '<!DOCTYPE html><html lang="fr"><body><script type="module">1</script></body></html>';

test('un depot Pagefind conforme ne remonte aucun manquement', () => {
  const racine = dist({
    'index.html': '<!DOCTYPE html><html lang="fr"><body><p>Bonjour</p></body></html>',
    'recherche/index.html': PAGE_RECHERCHE,
    'pagefind/pagefind.js': 'export{}',
    'pagefind/pagefind-ui.js': 'export{}',
    'pagefind/pagefind-entry.json': '{}',
    'pagefind/wasm.fr.pagefind': 'binaire',
    'pagefind/fragment/fr_abc.pf_fragment': 'binaire',
  });
  assert.deepEqual(manquementsDepot(racine), []);
});

test('FUITE — un chunk Pagefind IMBRIQUE est refuse : l exemption porte sur des chemins exacts', () => {
  // C est le mode d echec qui compte : la garde T-09 exempte `pagefind/<fichier>.js`,
  // jamais un sous-arbre. Un jour ou Pagefind rangerait son JavaScript un cran plus bas,
  // le build doit rougir plutot que servir un repertoire ouvert.
  const racine = dist({
    'recherche/index.html': PAGE_RECHERCHE,
    'pagefind/pagefind.js': 'export{}',
    'pagefind/interne/chunk.js': 'export{}',
  });
  const manquements = manquementsDepot(racine);
  assert.equal(manquements.length, 1);
  assert.match(manquements[0], /pagefind\/interne\/chunk\.js/);
});

test('FUITE — du JavaScript depose hors du repertoire pagefind reste refuse', () => {
  const racine = dist({
    'recherche/index.html': PAGE_RECHERCHE,
    '_astro/recherche.CAFE1234.js': 'export{}',
  });
  assert.equal(manquementsDepot(racine).length, 1);
});

test('FUITE — une balise <script> injectee dans une page ORDINAIRE reste refusee', () => {
  // Pagefind sait injecter son interface dans les pages indexees ; s il le faisait ici,
  // la contrainte zero-JS tomberait sur tout le site sans qu aucun fichier ne bouge.
  const racine = dist({
    'index.html': '<!DOCTYPE html><html lang="fr"><body><script src="/pagefind/pagefind-ui.js"></script></body></html>',
    'pagefind/pagefind.js': 'export{}',
  });
  assert.equal(manquementsDepot(racine).length, 1);
});
