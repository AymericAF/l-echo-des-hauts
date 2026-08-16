/**
 * AUCUNE FORME NE SORT DE SON CADRE — sur TOUT le corpus, pas seulement les paires.
 *
 * Pourquoi ce fichier existe (2026-08-16, tache `7352bbe7`). Deux couvertures francaises
 * portaient cinq etiquettes hors cadre, et aucune garde ne les voyait, pour DEUX raisons
 * distinctes qu il faut tenir separees :
 *
 *  1. **la portee** — la garde de debordement existante (`visuels-localises.test.ts`,
 *     GARDE 2) ne parcourt que les visuels qui ont une PAIRE francais/anglais, soit 22
 *     fichiers sur 123. `A04.svg` et `A20.svg` n ont pas de version anglaise : ils
 *     n etaient couverts par rien ;
 *  2. **la nature** — `largeurEstimee` ne mesure que les `<text>`. La dixieme vitrine de
 *     `A20.svg` etait un `<rect>` pose a `x="1596"` sur 156 de large, coupe net par le
 *     bord a 1600, sur un graphique dont le titre annonce « dix locaux ». Aucune mesure
 *     de texte ne pouvait le voir.
 *
 * Ce fichier ferme la seconde, sur toute l etendue du corpus. La premiere reste ouverte :
 * etendre la mesure de TEXTE aux 123 fichiers ferait rougir la CI sur quinze titres qui,
 * mesures au rendu reel, tiennent — l estimation les majore de 8 a 25 %. C est un travail
 * de reglage de seuil, pas un elargissement de portee, et il ne se fait pas ici.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { formesHorsCadre } from '../scripts/seed/visuels.ts';

const MEDIAS = path.join(import.meta.dirname, '..', 'data', 'medias');

/**
 * PLUS AUCUNE EXEMPTION — et c est la garde qui a impose son retrait.
 *
 * `A22-emplacements.svg` en a porte une du 2026-08-16 au meme jour : sa colonne de 19
 * emplacements descendait jusqu a y=1018 pour un cadre de 900. Elle etait accompagnee
 * d un test qui exigeait que le defaut exempte EXISTE encore ; quand la colonne a ete
 * recomposee (tache `8334c17d`), ce test a rougi et a force le nettoyage — ce pour quoi
 * il avait ete ecrit. L ensemble vide est garde volontairement plutot que supprime : la
 * prochaine exemption devra passer par ce meme couple, jamais par un test restreint.
 */
const EXEMPTES = new Set<string>();

function tousLesVisuels(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const chemin = path.join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...tousLesVisuels(chemin));
    else if (entree.name.endsWith('.svg')) trouves.push(chemin);
  }
  return trouves;
}

test('aucune forme ne sort de son cadre, sur les 123 visuels du corpus', () => {
  const visuels = tousLesVisuels(MEDIAS);
  assert.ok(visuels.length > 100, `corpus attendu complet, ${visuels.length} fichier(s) lus`);

  const sortants: string[] = [];
  for (const visuel of visuels) {
    const relatif = path.relative(MEDIAS, visuel).replace(/\\/g, '/');
    if (EXEMPTES.has(relatif)) continue;
    for (const forme of formesHorsCadre(visuel)) {
      sortants.push(`${relatif} — finit a ${forme.droite},${forme.bas}`);
    }
  }

  assert.deepEqual(sortants, []);
});

/**
 * UNE EXEMPTION N EST JAMAIS UN CHEQUE EN BLANC : le defaut qu elle couvre doit EXISTER.
 * Sans cette garde, une exemption survit a sa cause et masque le prochain defaut du meme
 * fichier. Elle ne juge rien tant que `EXEMPTES` est vide — ce qui est le cas depuis que
 * A22-emplacements a ete recompose, et c est precisement elle qui l a fait retirer.
 */
function exemptionsPerimees(exemptes: Iterable<string>): string[] {
  const perimees: string[] = [];
  for (const relatif of exemptes) {
    if (formesHorsCadre(path.join(MEDIAS, relatif)).length === 0) perimees.push(relatif);
  }
  return perimees;
}

test('aucune exemption ne survit au defaut qu elle couvre', () => {
  assert.deepEqual(exemptionsPerimees(EXEMPTES), [], 'ces fichiers ne debordent plus : retirer leur exemption');
});

/**
 * PREUVE EN CASSANT — sans elle, la garde ci-dessus serait verte pour la seule raison que
 * `EXEMPTES` est vide, et le resterait le jour ou une exemption periee y dormirait.
 */
test('PREUVE EN CASSANT — une exemption posee sur un fichier SAIN est vue comme perimee', () => {
  assert.deepEqual(exemptionsPerimees(['couvertures/A04.svg']), ['couvertures/A04.svg']);
});

/**
 * PREUVE EN CASSANT — sans elle, le test ci-dessus serait vert meme si la garde ne
 * regardait rien. On rejoue le defaut REEL, celui de `A20.svg` avant correction : la
 * dixieme vitrine et sa vitre, posees au-dela du bord.
 */
test('PREUVE EN CASSANT — la dixieme vitrine de A20, telle qu elle etait, est vue', () => {
  const sain = fs.readFileSync(path.join(MEDIAS, 'couvertures', 'A20.svg'), 'utf8');
  const defectueux = sain.replace(
    /<rect x="1356" y="395" width="129"/,
    '<rect x="1596" y="395" width="156"',
  );
  assert.notEqual(defectueux, sain, 'le defaut doit avoir ete injecte pour que le test prouve quelque chose');

  const provisoire = path.join(MEDIAS, 'couvertures', '.A20-defectueux.svg');
  fs.writeFileSync(provisoire, defectueux);
  try {
    const vues = formesHorsCadre(provisoire);
    assert.equal(vues.length, 1);
    assert.equal(vues[0].droite, 1752);
  } finally {
    fs.unlinkSync(provisoire);
  }
});

/**
 * ET ELLE NE CRIE PAS A TORT : une forme qui touche EXACTEMENT le bord est dans le cadre.
 * Sans ce cas, un seuil pose en `>=` rendrait rouge la moitie des visuels — le fond de
 * chacun d eux est un `<rect>` qui remplit le cadre au pixel pres.
 */
test('une forme qui affleure le bord n est PAS un debordement', () => {
  const affleurant = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <rect width="1600" height="900" fill="#FBFAF7"/>
  <rect x="1400" y="800" width="200" height="100" fill="#000"/>
  <line x1="0" y1="900" x2="1600" y2="900" stroke="#000"/>
</svg>`;
  const provisoire = path.join(MEDIAS, '.affleurant.svg');
  fs.writeFileSync(provisoire, affleurant);
  try {
    assert.deepEqual(formesHorsCadre(provisoire), []);
  } finally {
    fs.unlinkSync(provisoire);
  }
});
