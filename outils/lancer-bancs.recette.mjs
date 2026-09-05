#!/usr/bin/env node
// Recette du lanceur de bancs — elle le PROUVE EN LE CASSANT : un banc qui n execute
// AUCUN cas doit rougir en le DISANT, et un banc plein doit rester vert.
//
// LE DEFAUT QU ELLE FERME, MESURE AVANT D ETRE CORRIGE (2026-09-05, Node 24.14.0) :
//
//     $ echo '// aucun cas' > tests/vide.test.ts && node --test tests/vide.test.ts ; echo $?
//     ℹ tests 1   ℹ pass 1   ℹ fail 0
//     0
//
// `node --test` ne se contente pas de sortir en 0 sur un fichier sans aucun cas : il le
// COMPTE COMME UN TEST QUI PASSE. Un banc vide — une garde d environnement qui court-circuite
// le chargement, un `describe` dont les `it` ont disparu a un merge — est donc indiscernable
// d un banc qui a tout verifie. Et ce vert la ne dit rien du code : il VALIDE en silence tout
// ce que le fichier etait cense couvrir. C est exactement la forme d echec que ce depot
// traque — une incapacite qui rend la meme sortie qu un succes — un cran plus haut que les
// `.recette.mjs`, qui savent deja rendre 2 quand elles n ont rien pu jouer.
//
// TROIS ISSUES, celles du depot et du parc (`~/.claude/scripts/lib/verdict.sh`) :
//   0 verifie conforme · 1 verifie, anomalie · 2 la verification n A PAS EU LIEU.
//
// Usage : node outils/lancer-bancs.recette.mjs

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const LANCEUR = join(ICI, 'lancer-bancs.mjs');

const CONFORME = 0;
const ANOMALIE = 1;
const NON_JOUEE = 2;

let echecs = 0;
let joues = 0;

function cas(intitule, fn) {
  joues += 1;
  try {
    fn();
    console.log(`  ok   ${intitule}`);
  } catch (e) {
    echecs += 1;
    console.log(`  KO   ${intitule}`);
    console.log(`       ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Ecrit un banc jetable dans un dossier temporaire et rend son chemin. */
function banc(nom, contenu) {
  const dossier = mkdtempSync(join(tmpdir(), 'echo-plancher-'));
  const p = join(dossier, `${nom}.test.ts`);
  writeFileSync(p, contenu, 'utf8');
  return p;
}

function lancer(fichiers) {
  const r = spawnSync(process.execPath, [LANCEUR, ...fichiers], { encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const VIDE = '// aucun cas ici\nexport const x = 1;\n';
const PLEIN = "import test from 'node:test';\ntest('un vrai cas', () => {});\n";
const ROUGE = "import test from 'node:test';\nimport a from 'node:assert';\ntest('ko', () => a.equal(1, 2));\n";
const GROUPE_VIDE = "import { describe } from 'node:test';\ndescribe('groupe vide de ses cas', () => {});\n";

console.log('Recette du lanceur de bancs (plancher de collecte)');

cas('un banc a 0 cas sort en 2 et NOMME le fichier', () => {
  const f = banc('vide', VIDE);
  const r = lancer([f]);
  assert(r.code === NON_JOUEE, `attendu ${NON_JOUEE}, obtenu ${r.code} — ${r.sortie.slice(-400)}`);
  assert(/VERIFICATION IMPOSSIBLE/.test(r.sortie), 'la sortie doit dire que rien n a ete mesure');
  assert(r.sortie.includes(basename(f)), 'la sortie doit nommer le banc vide');
});

cas('un groupe vide de ses cas est un banc vide — du code n est pas un cas', () => {
  const f = banc('groupe-vide', GROUPE_VIDE);
  const r = lancer([f]);
  assert(r.code === NON_JOUEE, `attendu ${NON_JOUEE}, obtenu ${r.code} — ${r.sortie.slice(-400)}`);
});

cas('un banc plein reste VERT — la garde ne rend personne bavard', () => {
  const f = banc('plein', PLEIN);
  const r = lancer([f]);
  assert(r.code === CONFORME, `attendu 0, obtenu ${r.code} — ${r.sortie.slice(-400)}`);
  assert(!/VERIFICATION IMPOSSIBLE/.test(r.sortie), 'aucune alarme sur un banc sain');
});

cas('un banc rouge reste rouge en 1 — un echec n est pas maquille en « pas mesure »', () => {
  const f = banc('rouge', ROUGE);
  const r = lancer([f]);
  assert(r.code === ANOMALIE, `attendu 1, obtenu ${r.code} — ${r.sortie.slice(-400)}`);
});

cas('plein + vide : rouge, et seul le vide est denonce', () => {
  const plein = banc('plein2', PLEIN);
  const vide = banc('vide2', VIDE);
  const r = lancer([plein, vide]);
  assert(r.code === NON_JOUEE, `attendu ${NON_JOUEE}, obtenu ${r.code} — ${r.sortie.slice(-400)}`);
  const bloc = r.sortie.slice(r.sortie.indexOf('VERIFICATION IMPOSSIBLE'));
  assert(bloc.includes(basename(vide)), 'le banc vide doit etre nomme');
  assert(!bloc.includes(basename(plein)), 'un banc sain ne doit jamais etre accuse');
});

// Un plancher sur la recette elle-meme : si aucun cas n a ete joue, elle ne rend pas 0.
if (joues === 0) {
  console.error('NON JOUEE : aucun cas exerce — cette recette ne prouve rien.');
  process.exit(NON_JOUEE);
}

if (echecs) {
  console.error(`\nROUGE : ${echecs} cas sur ${joues}.`);
  process.exit(ANOMALIE);
}
console.log(`\nCONFORME : ${joues} cas joues, aucune anomalie.`);
process.exit(CONFORME);
