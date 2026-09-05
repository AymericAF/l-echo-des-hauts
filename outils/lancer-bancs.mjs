#!/usr/bin/env node
// LANCEUR DE BANCS — `node --test`, plus UN PLANCHER : un banc qui n a execute AUCUN cas ne
// rend plus un vert. Point d entree du `npm test` de chaque application.
//
// LE DEFAUT, MESURE AVANT D ETRE FERME (2026-09-05, Node 24.14.0) :
//
//     $ echo '// aucun cas' > tests/vide.test.ts && node --test tests/vide.test.ts ; echo $?
//     ℹ tests 1   ℹ pass 1   ℹ fail 0
//     0
//
// Un banc qui n execute aucun cas ne sort pas seulement en 0 : il est compte comme UN TEST QUI
// PASSE. Le vert ne dit alors rien du code que ce fichier etait cense couvrir — il le VALIDE
// en silence. C est la forme d echec que ce depot traque depuis le debut (une incapacite qui
// rend la meme sortie qu un succes), un cran plus haut que les `.recette.mjs` : ici la
// collection vide est la collection des CAS DE TEST, et ce qu elle blanchit est toute la
// couverture du fichier.
//
// LE PLANCHER EST ICI, PAS DANS LES 105 BANCS. Faire declarer a chaque fichier le nombre de
// cas qu il attend, ce sont 105 compteurs a tenir a jour et un rouge a chaque test ajoute :
// une garde qui rougit a tort se fait desactiver, et on perdrait la couverture EN PLUS du
// plancher.
//
// CODES DE SORTIE, ceux du depot et du parc :
//   0 verifie conforme · 1 verifie, anomalie (un test a echoue) · 2 la verification n a PAS
//   eu lieu (un banc n a rien collecte, ou le releve du compteur est illisible).
// Un banc rouge reste en 1 : on ne maquille pas un echec en « pas mesure ».
//
// Usage : node outils/lancer-bancs.mjs tests/a.test.ts tests/b.test.ts …

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const COMPTEUR = pathToFileURL(join(ICI, 'compteur-collecte.mjs')).href;

const CONFORME = 0;
const ANOMALIE = 1;
const COLLECTE_VIDE = 2;

// `spec` est le rapporteur que node choisit ici de lui-meme. On le renomme explicitement parce
// que brancher un rapporteur en remplace le defaut ; l affichage reste identique.
const RAPPORTEUR_HUMAIN = 'spec';

const cibles = process.argv.slice(2);
if (cibles.length === 0) {
  console.error('ABANDON [lancer-bancs] — VERIFICATION IMPOSSIBLE : aucun banc a lancer.');
  console.error('  Aucun verdict rendu : une liste vide n est pas « tout va bien ».');
  process.exit(COLLECTE_VIDE);
}

const releve = join(tmpdir(), `echo-collecte-${process.pid}-${Date.now()}.jsonl`);

/**
 * Rend les bancs qui n ont execute AUCUN cas, ou `null` si le releve est illisible.
 * Un releve absent n est jamais traite comme « tout va bien » : une garde qui s efface
 * quand son moteur est absent ne garde rien.
 * @returns {string[] | null}
 */
function bancsSansAucunCas() {
  let brut;
  try {
    brut = readFileSync(releve, 'utf8');
  } catch {
    return null;
  }
  const vides = [];
  for (const ligne of brut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    let e;
    try { e = JSON.parse(ligne); } catch { return null; }
    if (typeof e?.fichier !== 'string' || !Number.isFinite(e?.cas)) return null;
    if (e.cas === 0) vides.push(e.fichier);
  }
  return vides;
}

const enfant = spawn(process.execPath, [
  '--test',
  `--test-reporter=${RAPPORTEUR_HUMAIN}`, '--test-reporter-destination=stdout',
  `--test-reporter=${COMPTEUR}`, `--test-reporter-destination=${releve}`,
  ...cibles,
], { stdio: 'inherit' });

enfant.on('error', (e) => {
  console.error(`ABANDON [lancer-bancs] — VERIFICATION IMPOSSIBLE : ${e.message}`);
  process.exitCode = COLLECTE_VIDE;
});

enfant.on('exit', (code, signal) => {
  let sortie = signal ? 130 : (code ?? ANOMALIE);
  if (!signal) {
    const vides = bancsSansAucunCas();
    if (vides === null) {
      console.error(`\nABANDON [lancer-bancs] — VERIFICATION IMPOSSIBLE : releve de collecte absent ou illisible (${releve}).`);
      console.error('  Impossible de dire si les bancs ont execute leurs cas — aucun verdict rendu.');
      if (sortie === CONFORME) sortie = COLLECTE_VIDE;
    } else if (vides.length) {
      console.error(`\nABANDON [lancer-bancs] — VERIFICATION IMPOSSIBLE : ${vides.length} banc(s) n ont execute AUCUN cas.`);
      console.error('  Aucun verdict rendu sur ce qu ils couvrent : ce n est PAS « rien a signaler ».');
      for (const f of vides) console.error(`  - ${basename(f)}   (${f})`);
      console.error('  -> rends-lui ses cas, ou retire le fichier ; un banc muet valide tout ce qu il couvre.');
      // Une suite deja rouge le reste avec SON code : l echec est plus actionnable que
      // l abandon, et l ecraser ferait perdre l information.
      if (sortie === CONFORME) sortie = COLLECTE_VIDE;
    }
  }
  process.exitCode = sortie;
});
