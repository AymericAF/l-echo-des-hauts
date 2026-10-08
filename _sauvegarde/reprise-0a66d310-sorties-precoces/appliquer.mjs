import fs from 'node:fs';
import path from 'node:path';

const CIBLE = 'C:/Users/aymer/projects/echo-code/apps/web/scripts/preuve-rendu.mjs';
const SCRATCH =
  'C:/Users/aymer/AppData/Local/Temp/claude/C--Users-aymer--claude/83358187-7dba-4918-ae32-4dd0532d0856/scratchpad';

const lignes = fs.readFileSync(CIBLE, 'utf8').split('\n');

/** Remplace [debut..fin] (1-indexe, inclus) apres avoir verifie les deux bornes. */
function splice1(debut, fin, attenduDebut, attenduFin, nom) {
  const d = lignes[debut - 1];
  const f = lignes[fin - 1];
  if (!d.includes(attenduDebut)) throw new Error(`${nom} : ligne ${debut} = « ${d} »`);
  if (!f.includes(attenduFin)) throw new Error(`${nom} : ligne ${fin} = « ${f} »`);
  const bloc = fs.readFileSync(path.join(SCRATCH, `bloc-${nom}.txt`), 'utf8').replace(/\n$/, '');
  lignes.splice(debut - 1, fin - debut + 1, ...bloc.split('\n'));
  console.log(`bloc ${nom} : lignes ${debut}-${fin} remplacees`);
}

// DU BAS VERS LE HAUT, pour que les numeros restent valides.
splice1(700, 702, 'if (blocs.site.length > 0) process.exit', 'controle13.issue !== ISSUES.CONFORME', 'E');
splice1(691, 694, 'LES AUTRES SORTIES PRECOCES RESTENT', 'cascade — du bruit qui fait desactiver', 'D');
splice1(578, 613, 'if (rapport.manquements.length > 0) {', '}', 'C');
splice1(566, 576, 'L ATTENDU DU PIED reste passe explicitement', ');', 'B');
splice1(519, 529, 'const configurationReference = await source.configuration', 'const reseauxDeReference =', 'A');

fs.writeFileSync(CIBLE, lignes.join('\n'));
console.log('ecrit —', lignes.length, 'lignes');
