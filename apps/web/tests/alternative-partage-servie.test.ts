/**
 * L ALTERNATIVE DE LA CARTE DE PARTAGE SORT-ELLE VRAIMENT DANS LE HTML CONSTRUIT ?
 *
 * ── CE QUE CE FICHIER CORRIGE (2026-08-20, tache `dce99a37`) ──────────────────────────
 *
 * `tests/banc-surcharge-partage-en.test.ts` (ajoute la veille) juge la bonne valeur par le
 * mauvais chemin : il REJOUE A LA MAIN la cascade de `src/layouts/Base.astro` — il
 * reconstruit `imageSurchargee` (huit lignes recopiees), pose `article: null`, et appelle
 * `metadonneesSeo` lui-meme. Le run qui l a ecrit l a signale de lui-meme, et le fait
 * mesure ici le confirme : **sa copie DIVERGE DEJA du gabarit**. Le gabarit ecrit
 * `url: urlMedia(seo.imagePartage)`, la copie ecrit `url: seo.imagePartage.url`. Deux
 * jours d existence ont suffi.
 *
 * Consequence : si la cascade du gabarit change, ce test reste VERT. Il n atteste plus que
 * sa propre copie du raisonnement.
 *
 * ── CE QUE CELUI-CI FAIT A LA PLACE ───────────────────────────────────────────────────
 *
 * Il ne rejoue rien. `inspecterAlternativesPartage` confronte DEUX sources reelles :
 *
 *   - ce que la SOURCE pose (fixtures du banc, ou instance reelle sur `--reel`), lu par
 *     `mapperArticle` — la fonction que le site appelle, pas une seconde copie de ses
 *     regles (surcharge blanche = pas de surcharge, `alternativePartage` prime sur
 *     l `alternativeText` de la mediatheque) ;
 *   - ce que le HTML CONSTRUIT sert, dans `og:image:alt` et `twitter:image:alt`.
 *
 * Le gabarit peut donc etre reecrit de fond en comble : tant que la page servie porte la
 * bonne valeur, le controle est vert ; des qu elle ne la porte plus, il rougit. C est
 * `scripts/preuve-rendu.mjs` qui lui fournit le HTML — apres un `npm run build` reel.
 *
 * ── CE QU IL NE PROUVE PAS, ET QUI LE TIENT ───────────────────────────────────────────
 *
 * L attendu passe par `mapperArticle` : un defaut DANS LE MAPPING deplacerait les deux
 * cotes ensemble et ce controle resterait vert. C est assume — ce maillon-la est tenu par
 * `tests/alternative-localisee.test.ts`, qui l exerce dans les deux sens sur les memes
 * fixtures. Le maillon qu AUCUN test n atteignait est celui du gabarit, et c est celui-ci
 * que ce fichier ferme.
 *
 * Les cas ci-dessous fabriquent le HTML : c est le seul moyen de prouver que l inspecteur
 * MORD sans casser le site. La preuve sur la sortie REELLE, elle, se fait en cassant la
 * cascade de `Base.astro` et en relancant `npm run preuve:rendu` — elle est consignee dans
 * le message du commit qui accompagne ce fichier.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cartesPoseesParLaSource,
  inspecterAlternativesPartage,
} from '../scripts/alternative-partage-servie.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));

/** Une copie profonde d une fixture du banc : les cas la retouchent sans se contaminer. */
function fixture(nom: string): any {
  return JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', `${nom}.json`), 'utf8'));
}

const ALT_FR = 'Carte de partage : le viaduc rouvert, vu depuis la rive';
const ALT_EN = 'Sharing card: the reopened viaduct, seen from the riverbank';

/** Le HTML d une page, reduit a ce que l inspecteur lit. */
function pageAvec(ogAlt: string | null, twitterAlt: string | null = ogAlt): string {
  const balises = [
    '<meta property="og:image" content="https://echo.test/medias/carte.jpg">',
    ogAlt === null ? '' : `<meta property="og:image:alt" content="${ogAlt}">`,
    twitterAlt === null ? '' : `<meta name="twitter:image:alt" content="${twitterAlt}">`,
  ];
  return `<!doctype html><html><head>${balises.join('')}</head><body></body></html>`;
}

/* ------------------------------------------------------------------ */
/* 1. CE QUE LA SOURCE POSE — derive, jamais recopie                    */
/* ------------------------------------------------------------------ */

test('la source pose une carte : l attendu est la SURCHARGE quand elle existe', () => {
  const { posees } = cartesPoseesParLaSource('en', fixture('articles-en').data);
  assert.equal(posees.length, 1, 'le banc anglais pose exactement une carte de partage');
  assert.equal(posees[0].attendu, ALT_EN);
  assert.equal(posees[0].origine, 'surcharge');
  assert.equal(posees[0].route, '/en/article/viaduct-reopens-after-eighteen-months-of-works');
});

test('sans surcharge, l attendu est l alternativeText de la mediatheque — et il est FRANCAIS', () => {
  const { posees } = cartesPoseesParLaSource('fr', fixture('articles-fr').data);
  assert.equal(posees.length, 1);
  assert.equal(posees[0].attendu, ALT_FR);
  assert.equal(posees[0].origine, 'mediatheque');
});

test('un article sans carte de partage n est pas juge — il est COMPTE a part', () => {
  /* Le banc francais porte un article sans `seo` du tout : le gabarit lui sert alors la
     carte GENEREE au build, dont l alternative ne vient pas de la source. La juger ici
     reviendrait a rejouer `texteAlternatifOg` — soit exactement le defaut corrige. */
  const entrees = fixture('articles-fr').data;
  assert.ok(entrees.length > 1, 'le banc francais doit porter plus d un article');
  const rapport = inspecterAlternativesPartage({ fr: cartesPoseesParLaSource('fr', entrees) }, () =>
    pageAvec(ALT_FR),
  );
  assert.equal(rapport.controles, 1);
  assert.equal(rapport.sansCarte, entrees.length - 1);
});

test('une surcharge BLANCHE ne remplace rien — la regle est LUE, pas recopiee', () => {
  const entrees = fixture('articles-en').data;
  for (const blanc of ['', '   ', '\t\n']) {
    entrees[0].seo.alternativePartage = blanc;
    const { posees } = cartesPoseesParLaSource('en', entrees);
    assert.equal(posees[0].attendu, ALT_FR, `« ${JSON.stringify(blanc)} » a ete pris pour une surcharge`);
    assert.equal(posees[0].origine, 'mediatheque');
  }
});

/* ------------------------------------------------------------------ */
/* 2. L INSPECTEUR MORD — succes et echec ne rendent pas la meme sortie */
/* ------------------------------------------------------------------ */

const POSEES_EN = () => ({ en: cartesPoseesParLaSource('en', fixture('articles-en').data) });

test('la page qui sert la bonne valeur ne produit AUCUN ecart', () => {
  const rapport = inspecterAlternativesPartage(POSEES_EN(), () => pageAvec(ALT_EN));
  assert.deepEqual(rapport.ecarts, []);
  assert.equal(rapport.controles, 1);
});

test('LE CAS DU 2026-08-14 : la page anglaise qui sert le FRANCAIS produit un ecart nomme', () => {
  const rapport = inspecterAlternativesPartage(POSEES_EN(), () => pageAvec(ALT_FR));
  assert.equal(rapport.ecarts.length, 1);
  assert.match(rapport.ecarts[0], /og:image:alt/);
  assert.ok(rapport.ecarts[0].includes(ALT_FR), 'l ecart doit citer ce qui est SERVI');
  assert.ok(rapport.ecarts[0].includes(ALT_EN), 'l ecart doit citer ce qui etait ATTENDU');
});

test('une page qui ne porte AUCUN og:image:alt produit un ecart, pas un vert', () => {
  const rapport = inspecterAlternativesPartage(POSEES_EN(), () => pageAvec(null, null));
  assert.equal(rapport.ecarts.length, 1);
  assert.match(rapport.ecarts[0], /RIEN/);
});

test('twitter:image:alt qui DIVERGE de og:image:alt produit son propre ecart', () => {
  /* Les deux reseaux ne lisent pas la meme balise : les laisser diverger fait servir deux
     textes selon le reseau. Meme regle que `preuve-surcharge-seo.mjs`. */
  const rapport = inspecterAlternativesPartage(POSEES_EN(), () => pageAvec(ALT_EN, ALT_FR));
  assert.equal(rapport.ecarts.length, 1);
  assert.match(rapport.ecarts[0], /twitter:image:alt/);
});

test('une page ABSENTE de la sortie est un ecart, jamais un controle silencieusement saute', () => {
  const rapport = inspecterAlternativesPartage(POSEES_EN(), () => null);
  assert.equal(rapport.ecarts.length, 1);
  assert.match(rapport.ecarts[0], /absente de la sortie/);
  assert.equal(rapport.controles, 0);
});

/* ------------------------------------------------------------------ */
/* 3. LA PREUVE NE DOIT PAS ETRE DECORATIVE                             */
/* ------------------------------------------------------------------ */

test('le compte des surcharges HORS locale de reference est rendu — c est lui qui dit si on prouve quelque chose', () => {
  const posees = {
    fr: cartesPoseesParLaSource('fr', fixture('articles-fr').data),
    en: cartesPoseesParLaSource('en', fixture('articles-en').data),
  };
  const rapport = inspecterAlternativesPartage(posees, (route) =>
    pageAvec(route.startsWith('/en/') ? ALT_EN : ALT_FR),
  );
  assert.deepEqual(rapport.ecarts, []);
  assert.equal(rapport.surchargesHorsReference('fr'), 1, 'le banc anglais porte la seule surcharge');
  assert.equal(
    rapport.surchargesHorsReference('en'),
    0,
    'en tenant l anglais pour reference, plus aucune surcharge n est exercee : c est ce vide ' +
      'que la preuve doit savoir annoncer plutot que de rendre un vert',
  );
});

test('une source qui ne pose AUCUNE carte ne rend aucun controle — le vide se voit', () => {
  const vide = { posees: [], sansCarte: 0 };
  const rapport = inspecterAlternativesPartage({ fr: vide, en: vide }, () => pageAvec(ALT_FR));
  assert.equal(rapport.controles, 0);
  assert.equal(rapport.surchargesHorsReference('fr'), 0);
  assert.deepEqual(rapport.ecarts, []);
});

/* ------------------------------------------------------------------ */
/* 4. UNE LOCALE QUE LA SOURCE NE PEUPLE PAS                            */
/* ------------------------------------------------------------------ */

test('une locale sans entree au corpus ne fabrique ni ecart ni controle', () => {
  const rapport = inspecterAlternativesPartage({ fr: null, en: null }, () => pageAvec(ALT_FR));
  assert.equal(rapport.controles, 0);
  assert.deepEqual(rapport.ecarts, []);
});

test('une entree que le mapping REFUSE est une incapacite nommee, pas un plantage', () => {
  /* Sur la cible `--reel`, une entree malformee remonterait une `ValeurInattendueError` et
     emporterait tout le rapport. Elle se compte et se nomme, comme le reste. */
  const entrees = fixture('articles-en').data;
  entrees[0].seo.imagePartage.url = 42;
  const { posees } = cartesPoseesParLaSource('en', entrees);
  assert.equal(posees.length, 1);
  assert.equal(posees[0].attendu, null);
  assert.match(posees[0].incapacite ?? '', /viaduct-reopens/);
});

test('une entree illisible ressort en ecart d incapacite, et n est pas comptee comme jugee', () => {
  const entrees = fixture('articles-en').data;
  entrees[0].seo.imagePartage.url = 42;
  const rapport = inspecterAlternativesPartage({ en: cartesPoseesParLaSource('en', entrees) }, () =>
    pageAvec(ALT_EN),
  );
  assert.equal(rapport.controles, 0);
  assert.equal(rapport.incapacites.length, 1);
  assert.deepEqual(rapport.ecarts, []);
});
