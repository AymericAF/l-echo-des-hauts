/**
 * La PREUVE du seuil de la garde des images OG — sa partie decidable.
 *
 * POURQUOI CE FICHIER EXISTE. Le 2026-08-11, `npm run preuve:encre-og` a rendu DEUX
 * verdicts opposes sur le meme commit `328f7f5` : echec a la premiere tentative du run
 * 31534444682 (« sans fonte, un cas atteint 21 px »), succes a la seconde, sans qu'une
 * ligne ait bouge. Rien dans le depot ne pouvait attraper ca : le script n'avait aucun
 * test, et sa decision etait melee a ses entrees/sorties.
 *
 * CE QUI EST TESTABLE ICI, ET CE QUI NE L'EST PAS. La rasterisation sans fonte depend de
 * la pile graphique de la machine et n'est PAS deterministe (mesure : 280 tirages sur le
 * runner GitHub rendent 0, 12 ou 13 px pour un meme cas, et la queue de distribution est
 * montee a 18 px sur le poste et 21 px sur le runner). On ne teste donc pas la mesure, on
 * teste les fonctions PURES qui en tirent un verdict.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FOSSE_PLEIN,
  TIRAGES_SANS_FONTE,
  agregerTirages,
  gardeAttrape,
  verdictFosseSonde,
  verdictPlein,
} from '../scripts/preuve-encre-og.mjs';

/** Un tirage = les mesures du corpus entier, dans l'ordre du corpus. */
const tirage = (hauteurs: number[]) =>
  hauteurs.map((hauteur, index) => ({
    nom: `cas ${index}`,
    taille: 44,
    lignes: 4,
    hauteur,
    ecartType: 0,
  }));

/** Une sonde qui passe : l'encre suit le corps. */
const sondeSaine = { grand: { corps: 66, hauteur: 65 }, petit: { corps: 44, hauteur: 44 }, ratio: 65 / 44 };
/** Une sonde de build sans fonte : le tofu garde sa taille quel que soit le corps. */
const sondeTofu = { grand: { corps: 66, hauteur: 12 }, petit: { corps: 44, hauteur: 12 }, ratio: 1 };

// --- l'agregation voit la queue de distribution, pas seulement le premier tirage -----

test('le plafond se prend sur TOUS les tirages, jamais sur un seul', () => {
  /* Le cas 1 sort a 21 px au deuxieme tirage seulement : c'est exactement l'evenement du
     run 31534444682. Un plafond calcule sur le premier tirage rendrait 12 et laisserait
     croire a un fosse qui n'existe pas. */
  const agrege = agregerTirages([tirage([12, 12]), tirage([12, 21]), tirage([0, 13])]);
  assert.equal(agrege.plafond, 21, 'le plafond doit remonter la valeur la plus haute vue');
  assert.equal(agrege.cas[1].max, 21);
  assert.equal(agrege.cas[0].max, 12);
});

test('le plancher se prend sur TOUS les tirages, jamais sur un seul', () => {
  assert.equal(agregerTirages([tirage([65, 44]), tirage([65, 41]), tirage([63, 44])]).plancher, 41);
});

test('chaque cas conserve sa distribution complete, pour que la queue se voie', () => {
  const agrege = agregerTirages([tirage([12]), tirage([0]), tirage([12]), tirage([21])]);
  assert.deepEqual(
    [...agrege.cas[0].distribution.entries()].sort((a, b) => a[0] - b[0]),
    [
      [0, 1],
      [12, 2],
      [21, 1],
    ],
  );
  assert.equal(agrege.tirages, 4);
});

test('agreger zero tirage est une INCAPACITE, pas un plafond de zero', () => {
  assert.throws(() => agregerTirages([]), /aucun tirage/);
});

test('la preuve tire le vide plusieurs fois — un tirage unique etait le defaut', () => {
  assert.ok(
    TIRAGES_SANS_FONTE >= 10,
    `TIRAGES_SANS_FONTE vaut ${TIRAGES_SANS_FONTE} : sous 10, la queue de distribution ` +
      'redevient invisible et le verdict redevient une loterie',
  );
});

// --- le verdict porte sur la garde ENTIERE, tirage par tirage -----------------------

test('un build sans fonte est attrape, tofu de douze pixels ou pas', () => {
  assert.equal(gardeAttrape({ hauteurs: [12, 0, 13, 12, 12, 12, 12], sonde: sondeTofu }, 20), true);
});

test("le cas exact du 2026-08-11 est attrape : un tofu a 21 px franchit le seuil, la sonde le voit", () => {
  /* Toutes les images au-dessus du seuil absolu : la jambe 1 est defaite. La jambe 2 rougit
     quand meme, parce que 21 px au corps 66 comme au corps 44, ce n'est pas du texte. */
  const sonde21 = { grand: { corps: 66, hauteur: 21 }, petit: { corps: 44, hauteur: 21 }, ratio: 1 };
  assert.equal(gardeAttrape({ hauteurs: [21, 21, 21, 21, 21, 21, 21], sonde: sonde21 }, 20), true);
});

test('une seule image sous le seuil suffit a attraper le build', () => {
  assert.equal(gardeAttrape({ hauteurs: [65, 65, 19, 65], sonde: sondeSaine }, 20), true);
});

test('un build sain n est PAS attrape — sinon la garde rougirait a tort', () => {
  assert.equal(gardeAttrape({ hauteurs: [65, 65, 44, 23], sonde: sondeSaine }, 20), false);
});

test('une sonde illisible est attrapee, jamais confondue avec un rasteriseur sain', () => {
  assert.equal(gardeAttrape({ hauteurs: [65, 65], sonde: null }, 20), true);
});

// --- les deux fosses, chacun sur la grandeur ou il a un sens ------------------------

test('le fosse de la sonde separe les valeurs mesurees le 2026-08-11', () => {
  const { ok } = verdictFosseSonde({ ratioVideMax: 1.083, ratioPleinMin: 1.477, seuilRatio: 1.25 });
  assert.equal(ok, true);
});

test('une sonde vide qui franchit le minimum est refusee, et le rapport est nomme', () => {
  const { ok, echecs } = verdictFosseSonde({ ratioVideMax: 1.3, ratioPleinMin: 1.477, seuilRatio: 1.25 });
  assert.equal(ok, false);
  assert.match(echecs.join(' | '), /1\.30/);
});

test('une sonde pleine qui descend sous le minimum est refusee — faux positif imminent', () => {
  const { ok, echecs } = verdictFosseSonde({ ratioVideMax: 1.0, ratioPleinMin: 1.2, seuilRatio: 1.25 });
  assert.equal(ok, false);
  assert.match(echecs.join(' | '), /rougir la garde a tort/);
});

test('le plancher du plein garde sa marge au-dessus du seuil', () => {
  assert.equal(verdictPlein({ plancherPlein: 22, seuil: 20 }).ok, true);
  assert.equal(verdictPlein({ plancherPlein: 21, seuil: 20 }).ok, false);
});

test('un plein qui passe SOUS le seuil est refuse, et c est un defaut du gabarit', () => {
  const { ok, echecs } = verdictPlein({ plancherPlein: 18, seuil: 20 });
  assert.equal(ok, false);
  assert.match(echecs.join(' | '), /rougir la garde a tort/);
});

test('la marge du cote plein est une valeur nommee, jamais un litteral epars', () => {
  assert.ok(FOSSE_PLEIN >= 1, 'FOSSE_PLEIN est un ecart en pixels');
});
