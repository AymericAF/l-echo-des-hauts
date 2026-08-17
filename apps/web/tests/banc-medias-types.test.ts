/**
 * LE STRAPI DE SUBSTITUTION DOIT SERVIR UN MEDIA QUE LE NAVIGATEUR SAIT DECODER.
 *
 * LE DEFAUT, MESURE LE 2026-08-14 (tache `c094568d`, puis `a974c024`). `servirMedia`
 * servait UN SEUL SVG pour tout `/uploads/…`, quel que soit le nom demande. Depose par
 * T-01 sous `dist/medias/viaduc_aube_8f2c1a.jpg`, il partait en `Content-Type:
 * image/jpeg` — et Chromium refusait de le decoder : `naturalWidth === 0`. Sur le banc,
 * **86 des 134 images declarees n etaient jamais peintes**, soit 64 %, contre **0 sur
 * 1328** en production. La seule image qui se peignait sur chaque page etait le logo,
 * seul media dont l extension `.svg` disait la verite.
 *
 * CE QUE CE N EST PAS, et il faut le dire : dans la passe du 2026-08-14, l effet sur le
 * profil de regles etait NUL — les 89 memes regles evaluees des deux cotes, `image-alt`
 * passant sur 48/48. C est un RISQUE CONNU, pas un defaut constate. Ce qui le rend
 * traitable quand meme : un banc dont 64 % des images ne sont jamais peintes ne peut pas
 * servir de terrain a une regle qui dependrait du RENDU, et la colonne `img_non_peintes`
 * existe precisement pour ne pas confondre « rien a signaler » et « rien vu ».
 *
 * CE QUI EST VERIFIE ICI : que les octets servis portent la SIGNATURE du format annonce.
 * Un `content-type` juste sur des octets qui ne le sont pas reproduirait le defaut a
 * l identique — c est exactement ce qui se passait, l en-tete etait deja `image/jpeg`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { servirMedia } from '../scripts/serveur-fixtures.mjs';

/** Une reponse HTTP reduite a ce que `servirMedia` en utilise, qui retient tout. */
function fausseReponse() {
  return {
    code: 0,
    entetes: {} as Record<string, string>,
    corps: Buffer.alloc(0),
    writeHead(code: number, entetes: Record<string, string>) {
      this.code = code;
      this.entetes = entetes;
    },
    end(corps: Buffer) {
      this.corps = corps;
    },
  };
}

function servir(chemin: string) {
  const reponse = fausseReponse();
  const rendu = servirMedia({ url: chemin }, reponse);
  return { rendu, ...reponse };
}

/* Les signatures, telles qu un decodeur les lit — pas telles qu un nom de fichier les
   promet. C est toute la difference entre ce banc avant et apres. */
const SIGNATURES: Record<string, { type: string; debut: number[] }> = {
  '.jpg': { type: 'image/jpeg', debut: [0xff, 0xd8, 0xff] },
  '.jpeg': { type: 'image/jpeg', debut: [0xff, 0xd8, 0xff] },
  '.png': { type: 'image/png', debut: [0x89, 0x50, 0x4e, 0x47] },
};

for (const [extension, attendu] of Object.entries(SIGNATURES)) {
  test(`un media \`${extension}\` est servi en ${attendu.type}, avec les OCTETS de ce format`, () => {
    const { rendu, code, entetes, corps } = servir(`/uploads/viaduc_aube_8f2c1a${extension}`);

    assert.equal(rendu, true, 'la route /uploads/ doit rester servie');
    assert.equal(code, 200);
    assert.equal(entetes['content-type'], attendu.type);
    assert.deepEqual(
      [...corps.subarray(0, attendu.debut.length)],
      attendu.debut,
      `les octets doivent porter la signature ${attendu.type} — un content-type juste sur des ` +
        'octets qui ne le sont pas reproduit le defaut a l identique, c est ce qui se passait'
    );
    assert.ok(corps.length > 0, 'un corps vide ne se peint pas davantage');
  });
}

test('un media `.svg` reste servi en SVG — le comportement d origine est intact', () => {
  const { rendu, entetes, corps } = servir('/uploads/logo_1d14a56cdc.svg');

  assert.equal(rendu, true);
  assert.equal(entetes['content-type'], 'image/svg+xml');
  assert.match(corps.toString('utf8'), /^<svg /);
});

test('une extension INCONNUE retombe sur le SVG, et la requete aboutit quand meme', () => {
  /* T-01 telecharge ce que la sortie reference : une requete non servie ferait echouer
     TOUT build sur fixtures. Mieux vaut un media que le navigateur ignore qu une 404 qui
     arrete le build — l aboutissement de la requete est ce qui est exerce ici. */
  const { rendu, code, corps } = servir('/uploads/quelque_chose.avif');

  assert.equal(rendu, true);
  assert.equal(code, 200);
  assert.ok(corps.length > 0);
});

test('ce qui ne vise pas /uploads/ n est toujours PAS servi par cette route', () => {
  assert.equal(servir('/api/articles').rendu, false);
  assert.equal(servir('/').rendu, false);
});
