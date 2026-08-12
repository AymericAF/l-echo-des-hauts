/**
 * ILS SONT SEPT DEPUIS LE 2026-08-11, ET NON PLUS SIX. `verifier-cascade-titres.mjs` a
 * rejoint le tableau avec la garde du meme nom (defaut `heading-order`, campagne du
 * 2026-08-10). Le texte ci-dessous CONSERVE son chiffre : il rapporte une mesure datee du
 * 2026-08-10, qui portait bien sur six fichiers, et la reecrire ferait mentir la mesure.
 * Le nombre reel se lit dans `VERIFICATEURS`, et la garde de couverture le tient — c est
 * exactement ce qu elle a fait le 2026-08-11, en refusant le septieme non declare.
 *
 * LES SIX VERIFICATEURS DISTINGUENT UNE INCAPACITE D UNE ANOMALIE — tous les six, et
 * partout dans leur propre code.
 *
 * CE QUI S EST MESURE LE 2026-08-10, avant toute correction, en ECARTANT `apps/web/dist`
 * puis en lancant `npm run verifier:<v>` sur chacun (meme cause, meme phrase,
 * `sortie absente : …\dist`) :
 *
 *   verifier:sortie          -> code 1     verifier:origine-medias -> code 2
 *   verifier:images          -> code 1     verifier:seo            -> code 2
 *   verifier:liens           -> code 2     verifier:styles-en-ligne-> code 1
 *
 * Trois fichiers voisins rendaient l INCAPACITE avec le code de l ANOMALIE. « La sortie de
 * construction est absente » et « la sortie est presente et fautive » sortaient donc avec
 * le meme `1`, alors que les deux envoient a des gestes opposes : comprendre pourquoi rien
 * n a ete construit, ou corriger le site. Un dispositif a MOITIE converti est pire qu un
 * dispositif uniforme — on croit la regle appliquee partout.
 *
 * CE FICHIER TIENT L INVARIANT SUR LES SIX A LA FOIS, plutot que d ajouter trois assertions
 * dans trois fichiers de test separes. C est deliberé : l invariant n est pas « ce
 * verificateur-ci se comporte bien », c est « aucun des six ne s ecarte de la convention ».
 * Un septieme verificateur ajoute sans entree dans le tableau ci-dessous se voit — la garde
 * `couverture` (derniere famille) le refuse en nommant le fichier oublie.
 *
 * LES TROIS SENS SONT EXERCES, sur la FONCTION et sur la LIGNE DE COMMANDE :
 *   - sortie absente     -> `2`, et le message NOMME l incapacite ;
 *   - manquement reel    -> `1`, message d anomalie INCHANGE ;
 *   - sortie conforme    -> `0`.
 * Le second etage (ligne de commande, `spawnSync`) n est pas un doublon du premier : c est
 * la porte de la RECETTE et la seconde porte du job `sortie` de l integration continue.
 * Une fonction qui rend le bon `issue` mais un `process.exit()` qui l ignore laisserait le
 * defaut entier en place.
 *
 * QUI LIT CES CODES, mesure avant de les changer : le seul lecteur automatique du depot est
 * le job `sortie` de `.github/workflows/gardes-du-code.yml`. ~~Et il fait `|| echec=1` — il
 * aplatit donc TOUT code non nul sur un seul rouge. Le gain de ce fichier ne va pas a lui :
 * il va au lecteur en ligne de commande (recette, `queue-run`, poste d Aymeric)~~, et il va a
 * l uniformite, qui est ce qui rend un code lisible sans aller relire la source.
 *
 * MARQUE EN PLACE LE 2026-08-11 (tache 794ad120) : le passage barre ci-dessus a CESSE D ETRE
 * VRAI. Le job `sortie` capture desormais le code (`code=0` puis `... || code=$?`), le trie,
 * et nomme les deux natures dans son journal — « N ONT PAS PU JUGER (code 2) » et « ONT JUGE,
 * ET TROUVE (code 1) ». Le gain de ce fichier va donc AUSSI au lecteur du journal de CI. Le
 * VERDICT, lui, n a pas bouge : une incapacite fait toujours echouer le job.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ISSUES, manquementCorpusVide } from '../scripts/issues.mjs';
import { inspecterCascadeTitres } from '../scripts/verifier-cascade-titres.mjs';
import { inspecterImages } from '../scripts/verifier-images.mjs';
import { inspecterLangue } from '../scripts/verifier-langue.mjs';
import { inspecterLiens } from '../scripts/verifier-liens.mjs';
import { inspecterOrigineMedias } from '../scripts/verifier-origine-medias.mjs';
import { inspecterSeo } from '../scripts/verifier-seo.mjs';
import { inspecterSortie } from '../scripts/verifier-sortie.mjs';
import { inspecterStylesEnLigne } from '../scripts/verifier-styles-en-ligne.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINE = 'https://echo.ayfiweb.fr';
const ETRANGERE = 'https://un-autre-site.example';

function distFactice(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-incapacite-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

function page(tete: string, corps: string): string {
  return `<!doctype html><html lang="fr"><head><title>t</title>${tete}</head><body>${corps}</body></html>`;
}

/** Comme `page`, mais la LANGUE du document est choisie : c est l objet de `verifier-langue`. */
function pageLangue(lang: string, corps: string): string {
  return `<!doctype html><html lang="${lang}"><head><title>t</title></head><body>${corps}</body></html>`;
}

/** Le squelette SEO minimal qui passe au vert, avec la `<loc>` qu on lui donne. */
function fichiersSeo(loc: string): Record<string, string> {
  return {
    'index.html': page(
      `<link rel="canonical" href="${ORIGINE}/">` +
        '<meta property="og:title" content="t"><meta property="og:description" content="d">' +
        `<meta property="og:type" content="website"><meta property="og:url" content="${ORIGINE}/">` +
        '<meta property="og:locale" content="fr_FR">' +
        `<meta property="og:image" content="${ORIGINE}/partage/a.png"><meta name="twitter:card" content="summary">` +
        /* Depuis le controle 8 (§5.1), une page INDEXABLE sans donnees structurees est un
           manquement. Ce squelette est le temoin SAIN du verificateur SEO : il doit donc
           en porter, sinon la preuve d incapacite rougirait pour une autre raison que la
           sienne — et un banc qui rougit a cote de sa cible ne prouve plus rien. */
        '<script type="application/ld+json">' +
        '{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"t"}]}' +
        '</script>',
      'x',
    ),
    'partage/a.png': 'octets',
    'sitemap-index.xml': `<?xml version="1.0"?><sitemapindex><sitemap><loc>${ORIGINE}/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
    'sitemap-pages.xml': `<?xml version="1.0"?><urlset><url><loc>${loc}</loc></url></urlset>`,
  };
}

/**
 * LE TABLEAU DES SIX. Chaque entree porte de quoi exercer les trois sens sur ce
 * verificateur-la, et rien de plus : la fonction, le script, une sortie conforme, une
 * sortie REELLEMENT fautive (le manquement propre a son objet), et le motif que son
 * message d anomalie doit continuer de porter.
 *
 * `objetVide` porte le PIEGE SYMETRIQUE : une sortie qui a de vraies pages, mais dans
 * laquelle l objet propre du verificateur est LEGITIMEMENT absent (aucune image, aucun
 * lien, aucune reference de media, aucun style en ligne). Ce cas-la doit rester VERT
 * apres le correctif : le jour ou un correctif d incapacite le fait rougir, la preuve
 * rougit en permanence, et une preuve rouge en permanence est une preuve morte.
 */
const VERIFICATEURS: {
  nom: string;
  script: string;
  inspecter: (dist: string, origine: string) => Promise<{ issue: number; manquements: string[] }>;
  conforme: Record<string, string>;
  fautif: Record<string, string>;
  objetVide: Record<string, string>;
  motifAnomalie: RegExp;
}[] = [
  {
    nom: 'sortie',
    script: 'verifier-sortie.mjs',
    inspecter: async (dist) => inspecterSortie(dist),
    conforme: { 'index.html': page('', '<p>x</p>'), '_astro/style.css': 'p{}' },
    fautif: { 'index.html': page('', '<p>x</p>'), 'app.js': 'alert(1)' },
    // Une page reelle, et aucun fichier servi hors du HTML : rien a reprocher.
    objetVide: { 'index.html': page('', '<p>x</p>') },
    motifAnomalie: /fichier JavaScript servi/i,
  },
  {
    nom: 'images',
    script: 'verifier-images.mjs',
    inspecter: async (dist) => inspecterImages(dist),
    conforme: {
      'index.html': page('', '<img src="/a.svg" width="10" height="10" loading="lazy" alt="x">'),
    },
    fautif: { 'index.html': page('', '<img src="/a.svg" alt="x">') },
    // Une page sans une seule <img> : zero image jugee, et pourtant rien de fautif.
    objetVide: { 'index.html': page('', '<p>aucune image sur cette page</p>') },
    motifAnomalie: /dimensions non explicites/i,
  },
  {
    nom: 'langue',
    script: 'verifier-langue.mjs',
    inspecter: async (dist) => inspecterLangue(dist),
    conforme: { 'en/index.html': pageLangue('en', '<nav aria-label="Follow the newsroom"></nav>') },
    /* Le defaut fondateur, tel qu il sortait le 2026-08-10 : une etiquette d accessibilite
       francaise dans le pied de page d une page declaree anglaise. */
    fautif: { 'en/index.html': pageLangue('en', '<nav aria-label="Reseaux du journal"></nav>') },
    // Une page reelle qui ne porte AUCUNE chaine du dictionnaire : rien a juger, et
    // pourtant rien de fautif — c est le cas d une page de corpus pur.
    objetVide: { 'en/index.html': pageLangue('en', '<p>only corpus text here</p>') },
    motifAnomalie: /mauvaise langue|Reseaux du journal/i,
  },
  {
    nom: 'liens',
    script: 'verifier-liens.mjs',
    inspecter: async (dist, origine) => inspecterLiens(dist, origine),
    conforme: { 'index.html': page('', '<a href="/">accueil</a>') },
    fautif: { 'index.html': page('', '<a href="/nulle-part">mort</a>') },
    // Une page sans un seul <a> ni <link> : zero lien juge, aucun lien mort.
    objetVide: { 'index.html': page('', '<p>aucun lien sur cette page</p>') },
    motifAnomalie: /lien mort/i,
  },
  {
    nom: 'origine-medias',
    script: 'verifier-origine-medias.mjs',
    inspecter: async (dist, origine) => inspecterOrigineMedias(dist, origine),
    conforme: {
      'index.html': page('', `<img src="${ORIGINE}/medias/a.svg" alt="x">`),
      'medias/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    },
    fautif: { 'index.html': page('', `<img src="${ETRANGERE}/a.jpg" alt="x">`) },
    // Une page sans une seule reference d image : zero origine a juger.
    objetVide: { 'index.html': page('', '<p>aucun media sur cette page</p>') },
    motifAnomalie: /hors du site/i,
  },
  {
    nom: 'seo',
    script: 'verifier-seo.mjs',
    inspecter: (dist, origine) => inspecterSeo(dist, origine),
    conforme: fichiersSeo(`${ORIGINE}/`),
    fautif: fichiersSeo(`${ETRANGERE}/`),
    /* Le seul objet de ce verificateur qui peut manquer sans faute est la population
       `og/*.png` : la sortie conforme n en porte aucune, et rend deja `0`. */
    objetVide: fichiersSeo(`${ORIGINE}/`),
    motifAnomalie: /hors du site/i,
  },
  {
    nom: 'styles-en-ligne',
    script: 'verifier-styles-en-ligne.mjs',
    inspecter: async (dist) => inspecterStylesEnLigne(dist),
    conforme: { 'index.html': page('', '<p>x</p>') },
    fautif: { 'index.html': page('<style>p{color:red}</style>', '<p>x</p>') },
    // Une page sans bloc <style> ni attribut style= : zero style juge, et c est conforme.
    objetVide: { 'index.html': page('', '<p>aucun style en ligne</p>') },
    motifAnomalie: /bloc <style>/i,
  },
  {
    nom: 'cascade-titres',
    script: 'verifier-cascade-titres.mjs',
    inspecter: async (dist) => inspecterCascadeTitres(dist),
    conforme: { 'index.html': page('', '<h1>a</h1><h2>b</h2><h3>c</h3>') },
    // Le defaut MESURE le 2026-08-10, dans sa forme exacte : un h4 pose apres un h2.
    fautif: { 'index.html': page('', '<h1>a</h1><h2>b</h2><h4>c</h4>') },
    // Une page sans un seul titre : zero cascade jugee, et pourtant rien de fautif.
    objetVide: { 'index.html': page('', '<p>aucun titre sur cette page</p>') },
    motifAnomalie: /niveau\(x\) saute\(s\)/i,
  },
];

/** Lance le script en ligne de commande, exactement comme la recette le ferait. */
function enLigneDeCommande(script: string, dist: string, origine: string) {
  return spawnSync(process.execPath, [path.join(RACINE, 'scripts', script), dist, origine], {
    encoding: 'utf8',
  });
}

// ── Famille 1 : sortie ABSENTE -> VERIFICATION IMPOSSIBLE, sur la fonction ────────────

for (const v of VERIFICATEURS) {
  test(`${v.nom} : une sortie absente est une VERIFICATION IMPOSSIBLE, pas une anomalie`, async () => {
    const nullePart = path.join(os.tmpdir(), `echo-dist-inexistant-efe5564a-${v.nom}`);
    assert.equal(fs.existsSync(nullePart), false);

    const rapport = await v.inspecter(nullePart, ORIGINE);
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    /* Le message doit NOMMER ce qui manque : « sortie absente : <chemin> ». Un code 2 sans
       nom renvoie chercher dans le mauvais objet aussi surement qu un code 1. */
    assert.equal(rapport.manquements.length, 1);
    assert.match(rapport.manquements[0], /sortie absente/i);
    assert.ok(rapport.manquements[0].includes(nullePart));
  });
}

// ── Famille 2 : les trois sens, EN LIGNE DE COMMANDE (la porte de la recette) ─────────

for (const v of VERIFICATEURS) {
  test(`${v.nom} : en ligne de commande, absence -> 2, anomalie -> 1, conforme -> 0`, () => {
    const nullePart = path.join(os.tmpdir(), `echo-cli-inexistant-efe5564a-${v.nom}`);
    const impossible = enLigneDeCommande(v.script, nullePart, ORIGINE);
    assert.equal(impossible.status, ISSUES.VERIFICATION_IMPOSSIBLE, impossible.stderr);
    assert.match(impossible.stderr, /VERIFICATION IMPOSSIBLE/i);
    assert.doesNotMatch(impossible.stdout, /✔/);

    /* LE CODE DE L ANOMALIE NE BOUGE PAS. C est la contrainte dure de ce travail : ce qui
       lit ces verificateurs aujourd hui doit continuer de voir `1` sur un manquement reel,
       avec le meme message. Seul le code de l incapacite change. */
    const fautif = distFactice(v.fautif);
    const anomalie = enLigneDeCommande(v.script, fautif, ORIGINE);
    assert.equal(anomalie.status, ISSUES.ANOMALIE, anomalie.stderr);
    assert.match(anomalie.stderr, /manquement|mort/i);
    assert.match(anomalie.stderr, v.motifAnomalie);
    assert.doesNotMatch(anomalie.stderr, /VERIFICATION IMPOSSIBLE/i);
    fs.rmSync(fautif, { recursive: true, force: true });

    const sain = distFactice(v.conforme);
    const conforme = enLigneDeCommande(v.script, sain, ORIGINE);
    assert.equal(conforme.status, ISSUES.CONFORME, conforme.stderr);
    assert.match(conforme.stdout, /✔/);
    fs.rmSync(sain, { recursive: true, force: true });
  });
}

// ── Famille 3 : la fonction rend AUSSI 1 et 0, et le message d anomalie est intact ────

for (const v of VERIFICATEURS) {
  test(`${v.nom} : un manquement reel rend ANOMALIE, une sortie saine rend CONFORME`, async () => {
    const fautif = distFactice(v.fautif);
    const rouge = await v.inspecter(fautif, ORIGINE);
    assert.equal(rouge.issue, ISSUES.ANOMALIE);
    assert.ok(rouge.manquements.length > 0);
    assert.match(rouge.manquements.join('\n'), v.motifAnomalie);
    assert.doesNotMatch(rouge.manquements.join('\n'), /sortie absente/i);
    fs.rmSync(fautif, { recursive: true, force: true });

    const sain = distFactice(v.conforme);
    const vert = await v.inspecter(sain, ORIGINE);
    assert.deepEqual(vert.manquements, []);
    assert.equal(vert.issue, ISSUES.CONFORME);
    fs.rmSync(sain, { recursive: true, force: true });
  });
}

// ── Famille 4 : l autre incapacite deja NOMMEE dans le code, et mal codee ─────────────

test('styles-en-ligne : zero page inspectee est une INCAPACITE, pas un manquement du site', () => {
  /* Ce verificateur etait le seul a voir le cas — « aucune page HTML dans <dist> : la garde
     n a rien inspecte » — et il le rendait avec le code d une anomalie. Le message etait
     juste, le code envoyait corriger le site. */
  const dist = distFactice({ 'rss.xml': '<rss/>' });
  const rapport = inspecterStylesEnLigne(dist);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(rapport.pages, 0);
  assert.match(rapport.manquements[0], /aucune page/i);

  const cli = enLigneDeCommande('verifier-styles-en-ligne.mjs', dist, ORIGINE);
  assert.equal(cli.status, ISSUES.VERIFICATION_IMPOSSIBLE, cli.stderr);
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── Famille 5 : la convention est IMPORTEE, jamais recopiee ───────────────────────────

test('tous importent la convention du module dedie, aucun ne la redefinit', () => {
  for (const v of VERIFICATEURS) {
    const source = fs.readFileSync(path.join(RACINE, 'scripts', v.script), 'utf8');
    assert.match(source, /from '\.\/issues\.mjs'/, `${v.nom} n importe pas ./issues.mjs`);
    /* Une SECONDE definition divergerait, et le jour ou elle diverge un « 2 » d un cote
       vaudrait « anomalie » de l autre. Le seul domicile est `scripts/issues.mjs`. */
    assert.doesNotMatch(source, /VERIFICATION_IMPOSSIBLE\s*:/, `${v.nom} redefinit la convention`);
  }
});

/**
 * LES VERIFICATEURS QUI NE JUGENT PAS LA SORTIE CONSTRUITE, et pourquoi ils ne peuvent pas
 * entrer dans le tableau ci-dessus.
 *
 * Le tableau tient un invariant precis : « recois un chemin de `dist/`, distingue une
 * sortie absente ou vide d une sortie fautive ». Les deux exemptes ne recoivent pas de
 * chemin : leur corpus est une REPONSE HTTP, et c est leur raison d etre — voir ce
 * qu aucune relecture de fichiers ne peut voir.
 *
 *   - `verifier-en-tetes.mjs` juge la reponse de la PRODUCTION : le 2026-08-10, les
 *     en-tetes poses en labels Traefik hors du depot ont disparu sans aucun signal.
 *   - `verifier-surface-publique.mjs` juge la reponse de l INSTANCE STRAPI : le meme jour,
 *     le role Public servait `/api/articles` — et `?status=draft` — sans aucun jeton. La
 *     permission vit dans la base de Strapi, pas dans ce depot ; une garde qui relirait des
 *     fichiers ne la verrait jamais.
 *
 * Les forcer dans le tableau demanderait de leur inventer un `dist/`, c est-a-dire de leur
 * faire juger un objet qu ils ne jugent pas.
 *
 * ILS RESTENT TENUS, mais par deux autres choses : la convention des trois issues est
 * verifiee ici meme (import, pas de redefinition), et leurs trois sens — conforme,
 * anomalie, incapacite — sont exerces dans `garde-en-tetes-securite.test.ts` et
 * `garde-surface-publique.test.ts`, sur leurs propres entrees. Ce qui ne doit PAS arriver,
 * et que la garde de couverture continue d empecher, c est qu un septieme verificateur de
 * SORTIE apparaisse sans entrer dans le tableau.
 */
const HORS_TABLEAU = ['verifier-en-tetes.mjs', 'verifier-surface-publique.mjs'];

test('couverture : tout scripts/verifier-*.mjs figure dans le tableau', () => {
  const surDisque = fs
    .readdirSync(path.join(RACINE, 'scripts'))
    .filter((f) => /^verifier-.+\.mjs$/.test(f))
    .filter((f) => !HORS_TABLEAU.includes(f))
    .sort();
  const declares = VERIFICATEURS.map((v) => v.script).sort();
  assert.deepEqual(
    surDisque,
    declares,
    'un verificateur echappe a la convention : ajoute-le au tableau de ce fichier',
  );
});

test('la liste des exceptions est VIVANTE, et chaque exception tient quand meme la convention', () => {
  for (const script of HORS_TABLEAU) {
    const chemin = path.join(RACINE, 'scripts', script);
    /* Une exception qui survit au fichier qu elle exempte elargit le trou en silence : le
       jour ou un verificateur de sortie prendrait ce nom, il entrerait par la porte
       laissee ouverte. */
    assert.equal(fs.existsSync(chemin), true, `${script} est exempte mais n existe pas`);
    const source = fs.readFileSync(chemin, 'utf8');
    assert.match(source, /from '\.\/issues\.mjs'/, `${script} n importe pas ./issues.mjs`);
    assert.doesNotMatch(source, /VERIFICATION_IMPOSSIBLE\s*:/, `${script} redefinit la convention`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * LA CLASSE INVERSE, ET ELLE EST PIRE : `dist/` EXISTE ET NE CONTIENT AUCUNE PAGE.
 *
 * CE QUI S EST MESURE LE 2026-08-10, apres le commit 64614b7 et AVANT ce correctif, en
 * lancant `node scripts/verifier-<v>.mjs <repertoire vide>` sur chacun des six :
 *
 *   sortie          -> 0  « ✔ 0 page(s) HTML, 0 fichier(s), 0.0 Kio : aucun JavaScript servi… »
 *   images          -> 0  « ✔ 0 image(s) sur 0 page(s) : dimensions explicites… »
 *   liens           -> 0  « ✔ 0 lien(s) interne(s) sur 0 route(s) : tous aboutissent dans dist/. »
 *   origine-medias  -> 0  « ✔ 0 reference(s) d image sur 0 page(s) : toutes servies par le site… »
 *   seo             -> 1  « sitemap index absent : sitemap-index.xml (§5.2…) »
 *   styles-en-ligne -> 2  « aucune page HTML dans <dist> : la garde n a rien inspecte. »
 *
 * QUATRE COCHES VERTES SUR RIEN DU TOUT. Ce n est plus « un rouge qui se trompe de cause »
 * — la classe fermee par 64614b7, ou personne n etait trompe sur le fond : ici une absence
 * TOTALE de contenu produit le signal du succes. Et contrairement au defaut precedent, il
 * n est PAS inerte pour l integration continue : le job `sortie` de
 * `.github/workflows/gardes-du-code.yml` aplatissait tout code non nul par `|| echec=1`, mais
 * il n aplatissait pas un zero. Un `dist/` vide passait la CI en vert sur quatre des six.
 * *(Imparfait depuis le 2026-08-11, tache 794ad120 : le job ne les aplatit plus, il les trie
 * et les nomme. Le constat de 2026-08-10 ci-dessus reste ce qu il etait, il ne se relit
 * simplement plus au present. Ce que le tri ne change pas : un zero reste un zero — c est
 * bien ce fichier-ci, et lui seul, qui empeche le vert sur rien du tout.)*
 *
 * OU LA FRONTIERE EST PLACEE, ET POURQUOI — c est la seule question de ce correctif.
 * Un `dist/` vide est une INCAPACITE (code 2), pas une anomalie (code 1) :
 *
 *   1. AUCUN des six ne sait qu un build a eu lieu. Ils recoivent un CHEMIN
 *      (`process.argv[2]`, defaut `apps/web/dist`) et n observent jamais la construction.
 *      Un repertoire est vide parce que rien n a ete construit, parce que l artefact
 *      d integration continue n a pas ete restaure, parce qu un pas de nettoyage l a
 *      recree, ou parce que ce n est pas le bon chemin. Rendre `1` — « le build a produit
 *      du vide » — serait une INFERENCE sans preuve, servie comme un verdict sur le SITE :
 *      exactement la faute de cause que ce depot a deja fermee deux fois (800a978, 64614b7).
 *   2. `dist/` ABSENT et `dist/` VIDE sont le MEME etat de connaissance : zero page jugee.
 *      L absent rend deja `2`. Faire dependre le code de l existence d un inode, et non de
 *      ce qui a ete juge, ferait dire au meme constat deux choses differentes.
 *   3. Le critere de la convention est le GESTE (`scripts/issues.mjs`) : `1` envoie corriger
 *      le site, `2` envoie corriger l environnement. Personne, devant un `dist/` vide, ne
 *      part editer un composant.
 *   4. `1` s accompagne d une liste de « N manquement(s) » du site. Il n y en a aucun : le
 *      rendre obligerait a FABRIQUER un manquement dont le site n est pas coupable.
 *   5. Le choix ne coute rien a la CI (le VERDICT y est le meme rouge pour 1 et pour 2) et
 *      rapporte tout au lecteur en ligne de commande — recette, `queue-run`, poste d Aymeric.
 *      *(2026-08-11, tache 794ad120 : il rapporte desormais AUSSI au lecteur du journal de
 *      CI, qui lit les deux natures nommees. Le verdict, lui, n a pas bouge — c est la
 *      contrainte dure du correctif, pas un effet de bord.)*
 *
 * CE QUE LA FRONTIERE NE DOIT PAS EMPORTER, et que la famille 8 tient : un objet
 * LEGITIMEMENT vide sur des pages REELLES (aucune image, aucun lien, aucun style) reste
 * VERT. Declencher sur « zero image trouvee » plutot que sur « zero page inspectee »
 * rendrait ces gardes rouges en permanence, et une preuve rouge en permanence est une
 * preuve morte — desarmee dans la semaine.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

/** Un `dist/` qui EXISTE et ne contient rien du tout. */
function distVide(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'echo-dist-vide-'));
}

// ── Famille 6 : `dist/` existe et est VIDE -> VERIFICATION IMPOSSIBLE, sur les six ────

for (const v of VERIFICATEURS) {
  test(`${v.nom} : un dist/ present mais VIDE est une INCAPACITE, jamais un vert`, async () => {
    const vide = distVide();
    assert.equal(fs.existsSync(vide), true, 'le repertoire doit EXISTER : c est tout le sujet');
    assert.deepEqual(fs.readdirSync(vide), []);

    const rapport = await v.inspecter(vide, ORIGINE);
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    /* Le message doit NOMMER le corpus vide et le chemin : un `2` muet renvoie chercher
       dans le mauvais objet aussi surement qu un `1`. */
    assert.equal(rapport.manquements.length, 1);
    assert.match(rapport.manquements[0], /aucune page HTML/i);
    assert.ok(rapport.manquements[0].includes(vide));

    const cli = enLigneDeCommande(v.script, vide, ORIGINE);
    assert.equal(cli.status, ISSUES.VERIFICATION_IMPOSSIBLE, cli.stderr);
    assert.match(cli.stderr, /VERIFICATION IMPOSSIBLE/i);
    assert.doesNotMatch(cli.stdout, /✔/);

    fs.rmSync(vide, { recursive: true, force: true });
  });
}

// ── Famille 7 : `dist/` non vide mais SANS UNE SEULE PAGE -> meme incapacite ──────────

for (const v of VERIFICATEURS) {
  test(`${v.nom} : une sortie sans une seule page HTML est une INCAPACITE`, async () => {
    /* Le cas le plus discret des deux : la sortie a des octets — un reste d assets, un
       flux, une feuille de style — donc elle n a pas l air vide. Elle l est pour la garde. */
    const dist = distFactice({ '_astro/style.css': 'p{}', 'rss.xml': '<rss version="2.0"/>' });
    const rapport = await v.inspecter(dist, ORIGINE);
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    assert.match(rapport.manquements[0], /aucune page HTML/i);
    // Le message COMPTE ce qu il a trouve : « vide » et « 2 fichiers, aucun en .html »
    // n envoient pas au meme endroit.
    assert.match(rapport.manquements[0], /2 fichier/);

    const cli = enLigneDeCommande(v.script, dist, ORIGINE);
    assert.equal(cli.status, ISSUES.VERIFICATION_IMPOSSIBLE, cli.stderr);
    fs.rmSync(dist, { recursive: true, force: true });
  });
}

// ── Famille 8 : LE PIEGE SYMETRIQUE — un objet legitimement vide reste VERT ───────────

for (const v of VERIFICATEURS) {
  test(`${v.nom} : zero objet a juger sur des pages REELLES reste CONFORME`, async () => {
    const dist = distFactice(v.objetVide);
    const rapport = await v.inspecter(dist, ORIGINE);
    assert.deepEqual(rapport.manquements, []);
    assert.equal(
      rapport.issue,
      ISSUES.CONFORME,
      'le correctif d incapacite ne doit pas rougir sur une absence LEGITIME',
    );

    const cli = enLigneDeCommande(v.script, dist, ORIGINE);
    assert.equal(cli.status, ISSUES.CONFORME, cli.stderr);
    assert.match(cli.stdout, /✔/);
    fs.rmSync(dist, { recursive: true, force: true });
  });
}

test('le piege symetrique, compteur par compteur : zero n est pas une faute', () => {
  /* UNE SEULE page, sans image, sans lien, sans style, sans media. Les quatre compteurs
     tombent a zero EN MEME TEMPS, et les cinq verificateurs concernes restent verts : ce
     qui declenche l incapacite est « zero PAGE inspectee », jamais « zero trouvaille ». */
  const dist = distFactice({ 'index.html': page('', '<p>une page, et rien a juger</p>') });

  const images = inspecterImages(dist);
  assert.equal(images.issue, ISSUES.CONFORME);
  assert.equal(images.images, 0);
  assert.equal(images.pages, 1);

  const liens = inspecterLiens(dist, ORIGINE);
  assert.equal(liens.issue, ISSUES.CONFORME);
  assert.equal(liens.liens, 0);

  const medias = inspecterOrigineMedias(dist, ORIGINE);
  assert.equal(medias.issue, ISSUES.CONFORME);
  assert.equal(medias.references, 0);
  assert.equal(medias.pages, 1);

  const styles = inspecterStylesEnLigne(dist);
  assert.equal(styles.issue, ISSUES.CONFORME);
  assert.equal(styles.blocs, 0);
  assert.equal(styles.attributs, 0);

  const sortie = inspecterSortie(dist);
  assert.equal(sortie.issue, ISSUES.CONFORME);
  assert.equal(sortie.pages, 1);

  fs.rmSync(dist, { recursive: true, force: true });
});

// ── Famille 9 : le message du corpus vide a UN SEUL domicile ──────────────────────────

test('tous importent le message du corpus vide, aucun ne le recopie', () => {
  for (const v of VERIFICATEURS) {
    const source = fs.readFileSync(path.join(RACINE, 'scripts', v.script), 'utf8');
    assert.match(
      source,
      /manquementCorpusVide/,
      `${v.nom} n appelle pas manquementCorpusVide de ./issues.mjs`,
    );
    /* Deux redactions de la meme incapacite finiraient par diverger, et le jour ou elles
       divergent, un lecteur croit avoir affaire a deux etats differents. */
    assert.doesNotMatch(
      source.replace(/manquementCorpusVide/g, ''),
      /aucune page HTML dans/,
      `${v.nom} recopie le message au lieu de l importer`,
    );
  }
});

// ── Famille 10 : la frontiere exacte — l incapacite n EFFACE PAS une trouvaille ───────

/* CE QUE LA PREMIERE ECRITURE DE CE CORRECTIF AVAIT CASSE, et qui a impose la regle
   definitive. Placer le controle de corpus vide EN TETE des six faisait tomber six tests
   de `garde-sortie.test.ts` : un `dist/` portant `_worker.js`, `app.js` ou `server/` et
   AUCUNE page devenait « verification impossible », alors que le verificateur avait
   parfaitement juge et parfaitement trouve. C etait le miroir exact du defaut qu on ferme
   — « voici le defaut, nomme » degrade en « je n ai pas su regarder ».

   LA REGLE EST DONC : NE JAMAIS RENDRE `0` SUR UN CORPUS VIDE. Le code de l ANOMALIE ne
   bouge pas, et `verifier-sortie` est le seul des six concerne, parce qu il est le seul
   dont une partie du jugement — fichiers JavaScript servis, marqueurs de sortie serveur —
   se lit sur l ARBORESCENCE et reste vraie sans une seule page. */

test('sortie : un manquement REEL sans aucune page reste une ANOMALIE, jamais une incapacite', () => {
  for (const fautif of [
    { '_worker.js': 'export default {}' },
    { 'app.js': 'alert(1)' },
    { 'server/entree.txt': 'x' },
  ]) {
    const dist = distFactice(fautif);
    assert.equal(
      fs.readdirSync(dist).length > 0 && !fs.existsSync(path.join(dist, 'index.html')),
      true,
    );

    const rapport = inspecterSortie(dist);
    assert.equal(rapport.pages, 0, 'le jeu ne porte volontairement aucune page');
    assert.equal(rapport.issue, ISSUES.ANOMALIE, JSON.stringify(rapport.manquements));
    assert.doesNotMatch(rapport.manquements.join('\n'), /aucune page HTML/i);

    const cli = enLigneDeCommande('verifier-sortie.mjs', dist, ORIGINE);
    assert.equal(cli.status, ISSUES.ANOMALIE, cli.stderr);
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('seo : sur une sortie vide, le sitemap manquant n est plus accuse a la place du build', async () => {
  /* Le seul des quatre a ne pas rendre un vert sur ce cas : il rendait `1`, « sitemap index
     absent : sitemap-index.xml (§5.2) » — un code et un message qui envoyaient corriger le
     SEO d un site dont aucune page n avait ete construite. Contrairement a `sortie`, AUCUN
     controle de ce fichier n est independant du corpus : tous decrivent la surface des
     pages produites. Sur zero page, « le sitemap manque » n est pas une trouvaille, c est
     « rien n a ete construit » deguise en defaut de site. */
  const vide = distVide();
  const rapport = await inspecterSeo(vide, ORIGINE);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.doesNotMatch(rapport.manquements.join('\n'), /sitemap index absent/i);
  fs.rmSync(vide, { recursive: true, force: true });
});

test('manquementCorpusVide nomme le chemin, et distingue le vide du sans-HTML', () => {
  const vide = manquementCorpusVide('/chemin/dist', 0);
  assert.match(vide, /aucune page HTML dans/);
  assert.ok(vide.includes('/chemin/dist'));
  assert.match(vide, /vide/i);

  const sansHtml = manquementCorpusVide('/chemin/dist', 7);
  assert.match(sansHtml, /7 fichier/);
  assert.doesNotMatch(sansHtml, /le repertoire est vide/i);
});
