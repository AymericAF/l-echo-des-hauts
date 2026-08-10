/**
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
 * le job `sortie` de `.github/workflows/gardes-du-code.yml`, et il fait `|| echec=1` — il
 * aplatit donc TOUT code non nul sur un seul rouge. Le gain de ce fichier ne va pas a lui :
 * il va au lecteur en ligne de commande (recette, `queue-run`, poste d Aymeric), et il va a
 * l uniformite, qui est ce qui rend un code lisible sans aller relire la source.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ISSUES } from '../scripts/issues.mjs';
import { inspecterImages } from '../scripts/verifier-images.mjs';
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

/** Le squelette SEO minimal qui passe au vert, avec la `<loc>` qu on lui donne. */
function fichiersSeo(loc: string): Record<string, string> {
  return {
    'index.html': page(
      `<link rel="canonical" href="${ORIGINE}/">` +
        '<meta property="og:title" content="t"><meta property="og:description" content="d">' +
        `<meta property="og:type" content="website"><meta property="og:url" content="${ORIGINE}/">` +
        '<meta property="og:locale" content="fr_FR">' +
        `<meta property="og:image" content="${ORIGINE}/partage/a.png"><meta name="twitter:card" content="summary">`,
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
 */
const VERIFICATEURS: {
  nom: string;
  script: string;
  inspecter: (dist: string, origine: string) => Promise<{ issue: number; manquements: string[] }>;
  conforme: Record<string, string>;
  fautif: Record<string, string>;
  motifAnomalie: RegExp;
}[] = [
  {
    nom: 'sortie',
    script: 'verifier-sortie.mjs',
    inspecter: async (dist) => inspecterSortie(dist),
    conforme: { 'index.html': page('', '<p>x</p>'), '_astro/style.css': 'p{}' },
    fautif: { 'index.html': page('', '<p>x</p>'), 'app.js': 'alert(1)' },
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
    motifAnomalie: /dimensions non explicites/i,
  },
  {
    nom: 'liens',
    script: 'verifier-liens.mjs',
    inspecter: async (dist, origine) => inspecterLiens(dist, origine),
    conforme: { 'index.html': page('', '<a href="/">accueil</a>') },
    fautif: { 'index.html': page('', '<a href="/nulle-part">mort</a>') },
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
    motifAnomalie: /hors du site/i,
  },
  {
    nom: 'seo',
    script: 'verifier-seo.mjs',
    inspecter: (dist, origine) => inspecterSeo(dist, origine),
    conforme: fichiersSeo(`${ORIGINE}/`),
    fautif: fichiersSeo(`${ETRANGERE}/`),
    motifAnomalie: /hors du site/i,
  },
  {
    nom: 'styles-en-ligne',
    script: 'verifier-styles-en-ligne.mjs',
    inspecter: async (dist) => inspecterStylesEnLigne(dist),
    conforme: { 'index.html': page('', '<p>x</p>') },
    fautif: { 'index.html': page('<style>p{color:red}</style>', '<p>x</p>') },
    motifAnomalie: /bloc <style>/i,
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

test('les six importent la convention du module dedie, aucun ne la redefinit', () => {
  for (const v of VERIFICATEURS) {
    const source = fs.readFileSync(path.join(RACINE, 'scripts', v.script), 'utf8');
    assert.match(source, /from '\.\/issues\.mjs'/, `${v.nom} n importe pas ./issues.mjs`);
    /* Une SECONDE definition divergerait, et le jour ou elle diverge un « 2 » d un cote
       vaudrait « anomalie » de l autre. Le seul domicile est `scripts/issues.mjs`. */
    assert.doesNotMatch(source, /VERIFICATION_IMPOSSIBLE\s*:/, `${v.nom} redefinit la convention`);
  }
});

test('couverture : tout scripts/verifier-*.mjs figure dans le tableau des six', () => {
  const surDisque = fs
    .readdirSync(path.join(RACINE, 'scripts'))
    .filter((f) => /^verifier-.+\.mjs$/.test(f))
    .sort();
  const declares = VERIFICATEURS.map((v) => v.script).sort();
  assert.deepEqual(
    surDisque,
    declares,
    'un verificateur echappe a la convention : ajoute-le au tableau de ce fichier',
  );
});
