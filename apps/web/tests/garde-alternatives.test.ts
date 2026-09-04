/**
 * LA GARDE DES ALTERNATIVES, PROUVEE EN CASSANT — dans les deux sens, et sur les trois
 * pieges qui rendaient une garde naive PIRE QUE RIEN.
 *
 * CE QU AUCUN VERIFICATEUR NE REGARDAIT AVANT LE 2026-08-12 : l attribut `alt` du HTML
 * SERVI. `verifier-images` lit `width`, `height`, `loading`, `fetchpriority` et jamais
 * `alt` ; `verifier-origine-medias` lit `src` ; axe-core, lui, voit tout — mais il
 * n intervient qu en campagne P2, c est-a-dire trop tard et trop rarement. Les deux
 * defauts d alternatives corriges le 2026-08-11 (`alt="   "` servi par un optionnel fait
 * de blancs ; 36 alternatives nommant la FORME du dessin) ont tous deux vecu la.
 *
 * ── PIEGE 1 : ASTRO EMET UN ATTRIBUT `alt` NU, PAS `alt=""` ──────────────────────────
 * Mesure du 2026-08-11 sur le HTML reellement produit :
 *     <img src="/medias/galerie_1_aa11.jpg" alt width="1200" height="800" loading="lazy">
 * Les deux formes sont la MEME chose pour un analyseur HTML — donc pour axe-core, qui
 * travaille sur le DOM. Mais un `grep 'alt=""'` sur `dist/` ne trouverait RIEN : une
 * garde ecrite ainsi passerait au vert en ne voyant AUCUNE image decorative. La famille
 * « lecture de l attribut » ci-dessous tient ce sens, et le sens inverse — `altura="x"`
 * ne doit pas se lire comme un `alt` nu.
 *
 * ── PIEGE 2 : EXIGER UN `alt` NON VIDE SERAIT PIRE QUE RIEN ─────────────────────────
 * Une telle regle validerait « Diagramme en barres » — presente et inutile — et
 * REFUSERAIT les 22 galeries legitimement vides. Ce qui se verifie est la COHERENCE avec
 * la declaration `decoratif` du manifeste : vide si et seulement si declare decoratif.
 *
 * ── PIEGE 3, MESURE ICI ET NON ANNONCE : LE VIDE PEUT ETRE UNE DECISION DE POSITION ──
 * `CarteArticle.astro` ecrit `alt=""` EN DUR sur la couverture d une carte, et il a
 * raison : le titre de la carte est le lien, repeter l alternative de la couverture ferait
 * du bruit. Le meme media sort donc VIDE en carte et PARLANT sur la page de l article —
 * mesure du 2026-08-12 sur le build de fixtures : 67 images, dont 20 a `alt` vide, aucune
 * sans `alt`. Une regle « ce media est declare parlant, donc chacune de ses balises doit
 * porter une alternative » rougirait sur vingt images SAINES a chaque build, et serait
 * desarmee dans la semaine.
 * D ou la regle de CORPUS, et non de position : un media declare parlant doit voir son
 * alternative servie AU MOINS UNE FOIS ; un media declare decoratif ne doit JAMAIS en
 * porter une. Le vide contextuel reste libre, le vide TOTAL ne l est pas.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ISSUES } from '../scripts/issues.mjs';

import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';

/* Les bacs de ce fichier se referment : nettoyage dans `after()`, bac du cas fautif
   conservé avec sa raison. Cf. `outils/bac-jetable.mjs`. */
brancherLesBacs();
import {
  alternativeDe,
  estBlanche,
  inspecterAlternatives,
  lireManifeste,
  normaliserNom,
  MANIFESTE_PAR_DEFAUT,
  resumeAlternatives,
} from '../scripts/verifier-alternatives.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function arborescence(fichiers: Record<string, string>): string {
  const racine = bacJetable('echo-alternatives');
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

function page(corps: string): string {
  return `<!doctype html><html lang="fr"><head><title>t</title></head><body>${corps}</body></html>`;
}

/** Un manifeste jetable, ecrit sur disque — le module en lit un CHEMIN, jamais un objet. */
function manifesteFactice(declarations: Record<string, unknown>): string {
  const racine = bacJetable('echo-manifeste');
  const chemin = path.join(racine, 'manifeste.json');
  fs.writeFileSync(chemin, JSON.stringify(declarations), 'utf8');
  return chemin;
}

/** Le manifeste minimal des deux natures : une parlante, une decorative. */
const DEUX_NATURES = {
  'couvertures/A01.svg': { alternativeText: 'Les courbes du col des Trois-Vents' },
  'galeries/A09-1.svg': { alternativeText: '', decoratif: true },
};

// ── Famille 1 : LIRE L ATTRIBUT — le piege du `alt` NU, et son symetrique ─────────────

test('alternativeDe : un `alt` NU est PRESENT et VIDE, comme `alt=""`', () => {
  assert.deepEqual(alternativeDe('<img src="/a.svg" alt width="10">'), {
    presente: true,
    valeur: '',
  });
  assert.deepEqual(alternativeDe('<img src="/a.svg" alt="" width="10">'), {
    presente: true,
    valeur: '',
  });
  /* Le `alt` nu en DERNIERE position, juste avant le chevron ou le slash : la forme que
     produit un attribut booleen en fin de balise. */
  assert.deepEqual(alternativeDe('<img src="/a.svg" alt>'), { presente: true, valeur: '' });
  assert.deepEqual(alternativeDe('<img src="/a.svg" alt/>'), { presente: true, valeur: '' });
});

test('alternativeDe : les trois formes de valeur se lisent, et une balise sans alt le dit', () => {
  assert.equal(alternativeDe('<img alt="un viaduc">').valeur, 'un viaduc');
  assert.equal(alternativeDe("<img alt='un viaduc'>").valeur, 'un viaduc');
  assert.equal(alternativeDe('<img alt=viaduc>').valeur, 'viaduc');
  assert.deepEqual(alternativeDe('<img src="/a.svg" width="10">'), {
    presente: false,
    valeur: '',
  });
});

test('alternativeDe : un attribut qui COMMENCE par alt n est pas un `alt` nu', () => {
  /* Sans la borne de fin de nom, `\salt` se satisfait de `altura` et la balise passerait
     pour une image decorative declaree. La garde dirait vide sur une image qui n a
     AUCUNE alternative — le laissez-passer exact que le piege 1 fabrique. */
  assert.equal(alternativeDe('<img src="/a.svg" altura="x">').presente, false);
  assert.equal(alternativeDe('<img src="/a.svg" data-alt="x">').presente, false);
});

// ── Famille 2 : NI VIDE NI PARLANTE — l alternative faite de blancs ───────────────────

test('estBlanche : une chaine vide n est pas blanche, une chaine de blancs l est', () => {
  assert.equal(estBlanche(''), false);
  assert.equal(estBlanche('x'), false);
  assert.equal(estBlanche('   '), true);
  /* L alphabet mesure le 2026-08-11 : espace, insecable, largeur nulle, espace. Aucun ne
     se voit a l ecran, et axe-core compte l ensemble comme une description valide. */
  assert.equal(estBlanche(' \u00A0\u200B '), true);
  assert.equal(estBlanche('\t\n\r\f\v'), true);
  assert.equal(estBlanche('\u2002\u2003\u3000\uFEFF'), true);
});

test('une alternative faite de blancs est une ANOMALIE — presente, et inutile', () => {
  const dist = arborescence({
    'index.html': page('<img src="/medias/A02_1234abcd56.svg" alt=" &#160;&#8203; ">'),
  });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /ni vide ni parlante/i);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('une image SANS attribut alt est une ANOMALIE, et le message la nomme', () => {
  const dist = arborescence({ 'index.html': page('<img src="/medias/A02_1234abcd56.svg">') });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /attribut alt absent/i);
  assert.match(rapport.manquements.join('\n'), /A02_1234abcd56\.svg/);
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── Famille 3 : LA COHERENCE AVEC LE MANIFESTE, dans les DEUX sens ────────────────────

test('un media DECORATIF servi avec une alternative est une ANOMALIE', () => {
  const dist = arborescence({
    'index.html': page('<img src="/medias/A09_1_aa11bb22cc.svg" alt="Un seau de traite">'),
  });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /declare decoratif/i);
  assert.match(rapport.manquements.join('\n'), /galeries\/A09-1\.svg/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un media PARLANT servi VIDE PARTOUT est une ANOMALIE — son alternative n atteint aucune page', () => {
  const dist = arborescence({
    'index.html': page('<img src="/medias/A01_8f2c1a4b7d.svg" alt>'),
    'categorie/index.html': page('<img src="/medias/A01_8f2c1a4b7d.svg" alt="">'),
  });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /jamais servie/i);
  assert.match(rapport.manquements.join('\n'), /couvertures\/A01\.svg/);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('PIEGE 3 : le meme media vide en carte et parlant sur sa page reste CONFORME', () => {
  /* Le comportement REEL de `CarteArticle.astro`. Une garde de position rougirait ici sur
     un site sain — vingt fois par build, mesure du 2026-08-12. */
  const dist = arborescence({
    'index.html': page('<img src="/medias/A01_8f2c1a4b7d.svg" alt>'),
    'article/x/index.html': page(
      '<img src="/medias/A01_8f2c1a4b7d.svg" alt="Les courbes du col des Trois-Vents">',
    ),
    'galerie.html': page('<img src="/medias/A09_1_aa11bb22cc.svg" alt>'),
  });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.mediasJuges, 2);
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── Famille 4 : LE RAPPROCHEMENT — sur le nom de fichier, jamais sur la devinette ─────

test('le nom se normalise comme Strapi le renomme — MESURE, pas suppose', () => {
  /* Mesure du 2026-08-12 : `@strapi/upload@5.51.x` (`generateFileName`) televerse sous
     `nameToSlug(basename, { separator: '_', lowercase: false }) + '_' + 10 hex`, et
     `@sindresorhus/slugify@1.1.0` — la dependance que `@strapi/utils` declare — rend
     `A01-poste-source` -> `A01_poste_source`. Comparer les noms BRUTS ferait donc manquer
     tous les medias a tiret, soit la moitie du corpus, et la garde rendrait un vert sur ce
     qu elle n aurait pas su rattacher. */
  assert.equal(normaliserNom('A01.svg'), 'a01');
  assert.equal(normaliserNom('A01-poste-source.svg'), 'a01_poste_source');
  assert.equal(normaliserNom('A01_poste_source_9b7d0e1f2a.svg'), 'a01_poste_source_9b7d0e1f2a');
  assert.equal(normaliserNom('logo-sombre.svg'), 'logo_sombre');
});

test('le rapprochement accepte le suffixe que Strapi ajoute, et rien de plus', () => {
  const dist = arborescence({
    // `A01.svg` -> `/uploads/A01_<10 hex>.svg` (provider local de Strapi).
    'index.html': page(
      '<img src="/medias/A01_8f2c1a4b7d.svg" alt="Les courbes du col des Trois-Vents">' +
        /* LE PIEGE DU RAPPROCHEMENT : `A01-poste-source.svg` sort en
           `A01_poste_source_<10 hex>`, et « A01 » en est un prefixe suivi d un `_`. Sans la
           borne « le suffixe fait DIX caracteres hexadecimaux », la garde jugerait ce BLOC
           contre la declaration de la COUVERTURE — un verdict sur la mauvaise entree, ce
           qui est pire que pas de verdict. */
        '<img src="/medias/A01_poste_source_9b7d0e1f2a.svg" alt="Un extrait de dossier">',
    ),
  });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.mediasJuges, 1, 'seul A01.svg est rattache au manifeste');
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un suffixe qui n est PAS celui de Strapi ne rapproche rien', () => {
  /* Le faux rapprochement mesure le 2026-08-12 sur le dist/ de fixtures :
     `/medias/logo_clair_3344.svg` etait rattache a `identite/logo.svg` — meme prefixe,
     meme `_`, mais « clair_3344 » n est pas un suffixe de Strapi. */
  const dist = arborescence({
    'index.html': page('<img src="/medias/logo_clair_3344.svg" alt="Un logo quelconque">'),
  });
  const rapport = inspecterAlternatives(
    dist,
    manifesteFactice({ 'identite/logo.svg': { alternativeText: 'Le logo du magazine' } }),
  );
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.mediasJuges, 0);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un media servi que le manifeste ignore n est PAS juge, et ne rougit pas', () => {
  const dist = arborescence({
    'index.html': page('<img src="/medias/viaduc_aube_8f2c1a.jpg" alt="Un viaduc">'),
  });
  const rapport = inspecterAlternatives(dist, manifesteFactice(DEUX_NATURES));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.mediasJuges, 0);
  /* ET LE COMPTE RENDU LE DIT. Un « ✔ » qui tairait le zero ferait rendre au corpus non
     rattache la meme sortie qu a une coherence reellement exercee. */
  assert.match(resumeAlternatives(rapport), /aucun media du manifeste/i);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('deux entrees du manifeste qui se rattachent au MEME fichier servi sont une ANOMALIE', () => {
  const dist = arborescence({ 'index.html': page('<img src="/medias/A01_8f2c1a4b7d.svg" alt="x">') });
  const chemin = manifesteFactice({
    'couvertures/A01.svg': { alternativeText: 'La couverture' },
    'blocs/A01.svg': { alternativeText: 'Le bloc' },
  });
  const rapport = inspecterAlternatives(dist, chemin);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /deux entrees du manifeste/i);
  fs.rmSync(dist, { recursive: true, force: true });
});

// ── Famille 5 : LES INCAPACITES — code 2, jamais le vert ni l accusation ──────────────

test('un manifeste ABSENT est une INCAPACITE, pas un vert sur zero coherence', () => {
  const dist = arborescence({ 'index.html': page('<img src="/a.svg" alt="x">') });
  const nullePart = path.join(os.tmpdir(), 'echo-manifeste-inexistant-22321b37.json');
  assert.equal(fs.existsSync(nullePart), false);

  const lecture = lireManifeste(nullePart);
  assert.equal(lecture.lisible, false);
  assert.equal(lecture.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(lecture.manquement.includes(nullePart));

  const rapport = inspecterAlternatives(dist, nullePart);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.doesNotMatch(rapport.manquements.join('\n'), /attribut alt/i);
  fs.rmSync(dist, { recursive: true, force: true });
});

test('un manifeste illisible ou vide est une INCAPACITE, et le motif est nomme', () => {
  const racine = bacJetable('echo-manifeste');

  const casse = path.join(racine, 'casse.json');
  fs.writeFileSync(casse, '{ ceci n est pas du JSON', 'utf8');
  assert.equal(lireManifeste(casse).issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(lireManifeste(casse).manquement, /JSON invalide/i);

  const vide = path.join(racine, 'vide.json');
  fs.writeFileSync(vide, '{}', 'utf8');
  assert.equal(lireManifeste(vide).issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(lireManifeste(vide).manquement, /aucune declaration/i);

  const tableau = path.join(racine, 'tableau.json');
  fs.writeFileSync(tableau, '[]', 'utf8');
  assert.equal(lireManifeste(tableau).issue, ISSUES.VERIFICATION_IMPOSSIBLE);

  fs.rmSync(racine, { recursive: true, force: true });
});

test('le manifeste par defaut du depot se lit, et il porte les medias du corpus', () => {
  /* Le chemin par defaut TRAVERSE les deux applications (`apps/web` -> `apps/cms`). Le
     jour ou il se casse, la garde rendrait 2 partout sans que rien ne dise pourquoi. */
  const lecture = lireManifeste(MANIFESTE_PAR_DEFAUT);
  assert.equal(lecture.lisible, true, lecture.manquement);
  assert.ok(lecture.declarations.size >= 90, `${lecture.declarations.size} declaration(s)`);
});

// ── Famille 6 : LA LIGNE DE COMMANDE — la porte de la recette ─────────────────────────

function enLigneDeCommande(dist: string, manifeste?: string) {
  const arguments_ = [path.join(RACINE, 'scripts', 'verifier-alternatives.mjs'), dist];
  if (manifeste !== undefined) arguments_.push(`--manifeste=${manifeste}`);
  return spawnSync(process.execPath, arguments_, { encoding: 'utf8' });
}

test('en ligne de commande : conforme -> 0, anomalie -> 1, incapacite -> 2', () => {
  const manifeste = manifesteFactice(DEUX_NATURES);

  const sain = arborescence({
    'index.html': page('<img src="/medias/A01_8f2c1a4b7d.svg" alt="Les courbes du col des Trois-Vents">'),
  });
  const vert = enLigneDeCommande(sain, manifeste);
  assert.equal(vert.status, ISSUES.CONFORME, vert.stderr);
  assert.match(vert.stdout, /✔/);

  const fautif = arborescence({ 'index.html': page('<img src="/medias/A01_8f2c1a4b7d.svg">') });
  const rouge = enLigneDeCommande(fautif, manifeste);
  assert.equal(rouge.status, ISSUES.ANOMALIE, rouge.stderr);
  assert.match(rouge.stderr, /manquement/i);
  assert.doesNotMatch(rouge.stderr, /VERIFICATION IMPOSSIBLE/i);

  const nullePart = path.join(os.tmpdir(), 'echo-dist-inexistant-22321b37');
  const impossible = enLigneDeCommande(nullePart, manifeste);
  assert.equal(impossible.status, ISSUES.VERIFICATION_IMPOSSIBLE, impossible.stderr);
  assert.match(impossible.stderr, /VERIFICATION IMPOSSIBLE/i);
  assert.doesNotMatch(impossible.stdout, /✔/);

  fs.rmSync(sain, { recursive: true, force: true });
  fs.rmSync(fautif, { recursive: true, force: true });
});

test('en ligne de commande, un second argument positionnel n est PAS pris pour un manifeste', () => {
  /* `tests/verificateurs-incapacite.test.ts` lance TOUS les verificateurs sous la forme
     `script <dist> <origine>`. Si l origine etait lue comme un chemin de manifeste, cette
     garde-ci rendrait 2 la ou le tableau attend 0 et 1 — et on la retirerait du tableau
     plutot que de corriger la cause. Le manifeste se passe NOMME, jamais par position. */
  const sain = arborescence({ 'index.html': page('<img src="/a.svg" alt="x">') });
  const resultat = spawnSync(
    process.execPath,
    [path.join(RACINE, 'scripts', 'verifier-alternatives.mjs'), sain, 'https://echo.ayfiweb.fr'],
    { encoding: 'utf8' },
  );
  assert.equal(resultat.status, ISSUES.CONFORME, resultat.stderr);
  fs.rmSync(sain, { recursive: true, force: true });
});

// ── Famille 7 : LE SITE REELLEMENT CONSTRUIT, quand il est la ─────────────────────────

test('sur le dist/ du depot, s il existe, la garde ne rougit pas', () => {
  const dist = path.join(RACINE, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return; // rien a juger : pas un echec.
  const rapport = inspecterAlternatives(dist, MANIFESTE_PAR_DEFAUT);
  assert.deepEqual(rapport.manquements, [], resumeAlternatives(rapport));
  assert.equal(rapport.issue, ISSUES.CONFORME);
});
