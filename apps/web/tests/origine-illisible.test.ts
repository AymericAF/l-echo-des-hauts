/**
 * Une ORIGINE ILLISIBLE ne doit plus valoir laissez-passer.
 *
 * CE QUI S EST MESURE LE 2026-08-10, avant toute correction, sur le `dist/` du depot
 * (22 pages, 425 liens, 114 d entre eux absolus vers notre propre origine) :
 *
 *   node scripts/verifier-liens.mjs dist "https://echo.ayfiweb.fr"
 *     -> ✔ 425 lien(s) interne(s) sur 22 route(s) : tous aboutissent dans dist/.   [code 0]
 *   node scripts/verifier-liens.mjs dist ""
 *     -> ✔ 311 lien(s) interne(s) sur 22 route(s) : tous aboutissent dans dist/.   [code 0]
 *
 * Meme coche, meme code de sortie, meme phrase — et 114 liens en moins, silencieusement
 * retires de la garde. `verifier-seo.mjs` faisait pire : sa sortie etait IDENTIQUE au
 * caractere pres, parce que son test d origine (`hote !== null && …`) se desactive en
 * entier quand l origine ne se lit pas, et que toute URL, meme etrangere, redevient
 * alors « interne ».
 *
 * LA CLASSE : une INCAPACITE A LIRE LA REFERENCE rendue sous la forme d une reponse
 * plausible (« il n y a rien d interne a verifier »). C est celle que `banc-absences`
 * a fermee sur les donnees de banc ; ici ce n est pas une donnee de test qui manque,
 * c est la reference meme contre laquelle les verificateurs jugent.
 *
 * LE PIEGE SYMETRIQUE, garde par les tests « cas normal » de ce fichier : un lien
 * REELLEMENT externe doit rester hors garde, et le rester SILENCIEUSEMENT. Un
 * verificateur qui rougirait sur les liens sortants legitimes serait desarme dans la
 * semaine. Le critere n est pas « il y a un `continue` » mais « ce `continue`
 * fait-il passer une incapacite pour une reponse ».
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

import gardeLiens from '../integrations/garde-liens.mjs';
import gardeOrigineMedias from '../integrations/garde-origine-medias.mjs';
import gardeSeo from '../integrations/garde-seo.mjs';
import { ISSUES } from '../scripts/issues.mjs';
import { lireOrigine } from '../scripts/origine.mjs';
import { ISSUES as ISSUES_REEXPORTEES } from '../scripts/serveur-fixtures.mjs';
import { inspecterLiens } from '../scripts/verifier-liens.mjs';
import { inspecterOrigineMedias } from '../scripts/verifier-origine-medias.mjs';
import { inspecterSeo } from '../scripts/verifier-seo.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINE = 'https://echo.ayfiweb.fr';
const ETRANGERE = 'https://un-autre-site.example';

/** Toutes les formes qui font echouer `new URL()`, plus celle qui ne l echoue PAS. */
const ILLISIBLES: unknown[] = ['', 'pas-une-url', 'echo.ayfiweb.fr', '//echo.ayfiweb.fr', 'foo:bar', undefined, null];

function distFactice(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-origine-'));
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

// ── 1. La convention a trois issues : UNE seule definition, importee, pas reinventee ──

test('les trois issues sont celles du parc, et il n en existe qu une definition', () => {
  assert.deepEqual(ISSUES, { CONFORME: 0, ANOMALIE: 1, VERIFICATION_IMPOSSIBLE: 2 });
  /* `serveur-fixtures.mjs` les REEXPORTE : deux definitions divergeraient, et le jour
     ou elles divergent, un « 2 » d un cote vaudrait « anomalie » de l autre. */
  assert.equal(ISSUES_REEXPORTEES, ISSUES);
});

// ── 2. La lecture de l origine declare son incapacite au lieu de rendre `null` ────────

test('une origine lisible rend son hote, sans slash ni chemin', () => {
  assert.deepEqual(lireOrigine(ORIGINE), { lisible: true, issue: ISSUES.CONFORME, hote: ORIGINE });
  assert.equal(lireOrigine('https://echo.ayfiweb.fr/un/chemin?x=1#y').hote, ORIGINE);
  assert.equal(lireOrigine('http://127.0.0.1:4321').hote, 'http://127.0.0.1:4321');
});

test('chaque forme illisible est DECLAREE, et la valeur recue est nommee dans le message', () => {
  for (const valeur of ILLISIBLES) {
    const lecture = lireOrigine(valeur as string);
    assert.equal(lecture.lisible, false, `${JSON.stringify(valeur)} aurait du etre declaree illisible`);
    assert.equal(lecture.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    assert.match(lecture.manquement!, /origine/i);
    /* Le message doit permettre de reconnaitre CE QUI a ete recu : sans cela, on
       cherche un defaut de site la ou il y a un defaut de variable d environnement. */
    const attendu = valeur === '' ? /vide/i : valeur == null ? /(absente|nulle)/i : new RegExp(String(valeur).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
    assert.match(lecture.manquement!, attendu);
  }
});

test('`foo:bar` ne throw PAS et rend une origine opaque : elle est illisible quand meme', () => {
  // `new URL('foo:bar').origin` rend la CHAINE 'null'. Un `try/catch` seul ne la voit pas.
  assert.equal(new URL('foo:bar').origin, 'null');
  assert.equal(lireOrigine('foo:bar').lisible, false);
});

// ── 3. verifier-liens ────────────────────────────────────────────────────────────────

const LIENS_ABSOLUS = {
  'index.html': page(
    `<link rel="canonical" href="${ORIGINE}/">`,
    `<a href="${ORIGINE}/page-qui-n-existe-pas">morte</a><a href="${ETRANGERE}/x">sortant</a>`,
  ),
};

test('verifier-liens : origine illisible -> VERIFICATION IMPOSSIBLE, jamais un vert', () => {
  const dist = distFactice(LIENS_ABSOLUS);
  for (const valeur of ILLISIBLES) {
    const rapport = inspecterLiens(dist, valeur as string);
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE, `origine ${JSON.stringify(valeur)}`);
    assert.equal(rapport.manquements.length, 1);
    assert.match(rapport.manquements[0], /origine/i);
    /* Et surtout : AUCUN compte rassurant. C est le chiffre « 311 lien(s) interne(s) »
       qui a rendu le defaut invisible — il faut qu il ne puisse plus etre imprime. */
    assert.equal(rapport.liens, 0);
  }
  fs.rmSync(dist, { recursive: true, force: true });
});

test('verifier-liens : origine LISIBLE -> le lien absolu vers notre origine est bien juge', () => {
  const dist = distFactice(LIENS_ABSOLUS);
  const rapport = inspecterLiens(dist, ORIGINE);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /page-qui-n-existe-pas/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('verifier-liens : PIEGE SYMETRIQUE — un lien vraiment externe reste hors garde, en silence', () => {
  const dist = distFactice({
    'index.html': page(
      `<link rel="canonical" href="${ORIGINE}/">`,
      `<a href="${ETRANGERE}/une/page/absente">sortant</a>` +
        `<a href="https://exemple.invalid/echodeshauts">reseau</a>` +
        `<a href="mailto:x@y.z">mail</a>`,
    ),
  });
  const rapport = inspecterLiens(dist, ORIGINE);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── 4. verifier-origine-medias ───────────────────────────────────────────────────────

const MEDIAS = {
  'index.html': page('', `<img src="${ORIGINE}/medias/a.svg" alt="x">`),
  'medias/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
};

test('verifier-origine-medias : origine illisible -> incapacite NOMMEE, pas 44 fausses accusations', () => {
  const dist = distFactice(MEDIAS);
  const rapport = inspecterOrigineMedias(dist, '');
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /origine/i);
  /* Le defaut mesure le 2026-08-10 : il accusait NOTRE PROPRE origine d etre « hors du
     site », parce que `new URL(url, 'https://invalide.invalid')` rendait un hote
     fabrique. Un message qui denonce le site lui-meme envoie corriger le mauvais objet. */
  assert.doesNotMatch(rapport.manquements[0], /hors du site/i);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('verifier-origine-medias : origine LISIBLE — notre origine passe, une etrangere non', () => {
  const bon = distFactice(MEDIAS);
  assert.deepEqual(inspecterOrigineMedias(bon, ORIGINE).manquements, []);
  assert.equal(inspecterOrigineMedias(bon, ORIGINE).issue, ISSUES.CONFORME);
  fs.rmSync(bon, { recursive: true, force: true });

  const mauvais = distFactice({ 'index.html': page('', `<img src="${ETRANGERE}/a.jpg" alt="x">`) });
  const rapport = inspecterOrigineMedias(mauvais, ORIGINE);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements[0], /hors du site/i);
  assert.match(rapport.manquements[0], /un-autre-site\.example/);
  fs.rmSync(mauvais, { recursive: true, force: true });
});

// ── 5. verifier-seo ──────────────────────────────────────────────────────────────────

function distSeo(locSegment: string) {
  return distFactice({
    'index.html': page(
      `<link rel="canonical" href="${ORIGINE}/">` +
        `<meta property="og:title" content="t"><meta property="og:description" content="d">` +
        `<meta property="og:type" content="website"><meta property="og:url" content="${ORIGINE}/">` +
        `<meta property="og:locale" content="fr_FR">` +
        `<meta property="og:image" content="${ORIGINE}/partage/a.png"><meta name="twitter:card" content="summary">`,
      'x',
    ),
    'partage/a.png': 'octets',
    'sitemap-index.xml': `<?xml version="1.0"?><sitemapindex><sitemap><loc>${ORIGINE}/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
    'sitemap-pages.xml': `<?xml version="1.0"?><urlset><url><loc>${locSegment}</loc></url></urlset>`,
  });
}

test('verifier-seo : origine illisible -> VERIFICATION IMPOSSIBLE (et non la sortie verte identique)', () => {
  const dist = distSeo(`${ORIGINE}/`);
  return inspecterSeo(dist, '').then((rapport) => {
    assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
    assert.equal(rapport.manquements.length, 1);
    assert.match(rapport.manquements[0], /origine/i);
    assert.equal(rapport.urlsSitemap, 0);
    fs.rmSync(dist, { recursive: true, force: true });
  });
});

test('verifier-seo : origine illisible — une <loc> ETRANGERE ne doit plus etre lue comme interne', async () => {
  /* Le mode d echec exact : `hote !== null && …` desactivait le test d origine EN
     ENTIER. Un sitemap declarant une URL d un autre site voyait son seul chemin
     confronte a dist/ — et passait au vert s il s y trouvait par hasard. */
  const dist = distSeo(`${ETRANGERE}/`);
  const rapport = await inspecterSeo(dist, '');
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.doesNotMatch(JSON.stringify(rapport.manquements), /un-autre-site/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('verifier-seo : origine LISIBLE — le site sain reste vert, la <loc> etrangere rougit', async () => {
  const sain = distSeo(`${ORIGINE}/`);
  const vert = await inspecterSeo(sain, ORIGINE);
  assert.deepEqual(vert.manquements, []);
  assert.equal(vert.issue, ISSUES.CONFORME);
  fs.rmSync(sain, { recursive: true, force: true });

  const etranger = distSeo(`${ETRANGERE}/`);
  const rouge = await inspecterSeo(etranger, ORIGINE);
  assert.equal(rouge.issue, ISSUES.ANOMALIE);
  assert.match(JSON.stringify(rouge.manquements), /hors du site/i);
  fs.rmSync(etranger, { recursive: true, force: true });
});

// ── 6. Une sortie absente est du meme genre : la preuve n a pas eu lieu ───────────────

test('une sortie absente est une VERIFICATION IMPOSSIBLE, pas une anomalie', async () => {
  const nulle_part = path.join(os.tmpdir(), 'echo-dist-inexistant-d64d6a07');
  assert.equal(inspecterLiens(nulle_part, ORIGINE).issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(inspecterOrigineMedias(nulle_part, ORIGINE).issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal((await inspecterSeo(nulle_part, ORIGINE)).issue, ISSUES.VERIFICATION_IMPOSSIBLE);
});

// ── 7. Les codes de sortie en ligne de commande — la porte de la recette ─────────────

test('en ligne de commande, une origine illisible sort en 2 et le cas normal en 0', () => {
  const dist = distFactice({
    'index.html': page(`<link rel="canonical" href="${ORIGINE}/">`, `<a href="${ETRANGERE}/x">sortant</a>`),
  });
  const script = path.join(RACINE, 'scripts', 'verifier-liens.mjs');

  const impossible = spawnSync(process.execPath, [script, dist, ''], { encoding: 'utf8' });
  assert.equal(impossible.status, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(impossible.stderr, /origine/i);
  assert.doesNotMatch(impossible.stdout, /✔/);

  const conforme = spawnSync(process.execPath, [script, dist, ORIGINE], { encoding: 'utf8' });
  assert.equal(conforme.status, ISSUES.CONFORME);
  assert.match(conforme.stdout, /✔/);

  fs.rmSync(dist, { recursive: true, force: true });
});

// ── 8. Les trois gardes de build refusent de construire sur une origine illisible ─────

test('les trois gardes du build ECHOUENT quand ECHO_SITE_URL ne se lit pas', async () => {
  const dist = distFactice({
    'index.html': page(`<link rel="canonical" href="${ORIGINE}/">`, `<img src="${ORIGINE}/medias/a.svg" alt="x">`),
    'medias/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'sitemap-index.xml': `<?xml version="1.0"?><sitemapindex></sitemapindex>`,
  });
  const dir = pathToFileURL(`${dist}${path.sep}`);
  const logger = { info: () => {} };
  const avant = process.env.ECHO_SITE_URL;
  process.env.ECHO_SITE_URL = ''; // <- exactement ce qu une variable vide produit
  try {
    for (const garde of [gardeLiens(), gardeOrigineMedias(), gardeSeo()]) {
      const hook = garde.hooks['astro:build:done']!;
      await assert.rejects(
        async () => hook({ dir, logger } as never),
        /VERIFICATION IMPOSSIBLE/,
        `${garde.name} a laisse le build continuer`,
      );
    }
  } finally {
    if (avant === undefined) delete process.env.ECHO_SITE_URL;
    else process.env.ECHO_SITE_URL = avant;
  }
  fs.rmSync(dist, { recursive: true, force: true });
});
