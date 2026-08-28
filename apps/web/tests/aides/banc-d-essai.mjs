/**
 * LE BANC D ESSAI DU HARNAIS DE BACS — il n est jamais lance par `npm test`.
 *
 * Il est lance en PROCESSUS FILS par `tests/banc-jetable.test.ts`, une fois par regime, avec
 * `ECHO_BANCS` pointant une racine qui n appartient qu a cette execution. On ne peut pas
 * eprouver un `process.on('exit')` ni un `after()` depuis l interieur du processus qui les
 * porte : il faut regarder ce que le processus laisse APRES sa mort, donc de dehors.
 *
 * Il vit dans `tests/aides/` et non dans `tests/` : le declencheur de commit ne collecte que
 * `tests/*.test.ts` a plat, et le pas d integration « aucun fichier de test n est absent du
 * npm test » lit le meme dossier. Un fichier pose ici ne rejoint donc aucune des deux listes,
 * ce qui est exactement ce qu on veut d un banc qui DOIT rougir a la demande.
 *
 * REGIMES, lus dans `BANC_ESSAI_REGIME` :
 *   vert            — tous les cas passent. Le retrait est celui d `after()`.
 *   rouge           — un cas casse. `after()` joue quand meme : c est ce qui distingue un
 *                     retrait en `finally` d un retrait ecrit apres la boucle de cas.
 *   sortie-brutale  — un cas appelle `process.exit`. `after()` n est JAMAIS joue ; seul le
 *                     filet `process.on('exit')` peut encore retirer quelque chose.
 *   sans-harnais    — les bacs sont montes A LA MAIN, sans harnais et sans retrait. Ce regime
 *                     n eprouve pas le harnais : il eprouve LA MESURE. Sans lui, une racine
 *                     vide apres coup ne prouverait rien — elle pourrait l etre parce que
 *                     rien n a jamais ete cree, et le comparateur rendrait zero partout.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';

import { harnaisDeBacs, RACINE_DES_BANCS } from '../../../../outils/banc-jetable.mjs';

const REGIME = process.env.BANC_ESSAI_REGIME;
export const PREFIXE = 'essai-banc-';

/** Trois bacs, chacun portant un fichier : un bac vide et un bac peuple ne s effacent pas pareil. */
function peupler(creer) {
  for (let i = 0; i < 3; i++) {
    const bac = creer(PREFIXE);
    fs.mkdirSync(path.join(bac, 'sous', 'dossier'), { recursive: true });
    fs.writeFileSync(path.join(bac, 'sous', 'dossier', 'temoin.txt'), 'x');
  }
}

if (REGIME === 'sans-harnais') {
  test('sans harnais, les bacs restent — ce cas eprouve la MESURE, pas le harnais', () => {
    fs.mkdirSync(RACINE_DES_BANCS, { recursive: true });
    for (let i = 0; i < 3; i++) {
      const bac = fs.mkdtempSync(path.join(RACINE_DES_BANCS, PREFIXE));
      fs.writeFileSync(path.join(bac, 'temoin.txt'), 'x');
    }
    assert.ok(true);
  });
} else {
  const bacs = harnaisDeBacs();
  after(() => bacs.rendreCompte(bacs.nettoyer()));

  test('les bacs se montent', () => {
    peupler(bacs.creer);
    assert.ok(true);
  });

  if (REGIME === 'rouge') {
    test('ROUGE A DESSEIN — le retrait doit tourner malgre lui', () => {
      assert.fail('casse a dessein : c est le regime normal d une recette qui prouve en cassant');
    });
  }

  if (REGIME === 'sortie-brutale') {
    test('SORTIE BRUTALE A DESSEIN — `after()` ne sera jamais joue', () => {
      process.exit(3);
    });
  }
}
