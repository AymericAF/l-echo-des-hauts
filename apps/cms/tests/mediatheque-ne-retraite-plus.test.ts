/**
 * CE SUR QUOI REPOSE LA COMPARAISON D'OCTETS DU SEED — EXERCE, PAS SUPPOSE.
 *
 * Depuis le 2026-08-19, `scripts/seed/seed.ts` compare les octets de TOUS les medias,
 * sans exemption. Cela ne tient que si un fait de `@strapi/upload` reste vrai : avec
 * `sizeOptimization:false` et `autoOrientation:false`, la mediatheque stocke le fichier
 * qu'on lui donne, a l'octet. Si ce fait tombe — mise a jour du plugin, drapeau qui
 * derive — le seed remplacera les memes fichiers a CHAQUE passage.
 *
 * Un commentaire ne garde pas ce fait ; ce test le fait TOURNER. Il appelle le code
 * installe (`@strapi/upload@5.51.1`, version EPINGLEE au `package.json`, pas en `^`) sur
 * les vraies images du corpus, avec les reglages que `src/reglages-medias.ts` pose.
 *
 * ── LE SECOND FAIT, CELUI QUI A FAILLI COUTER CHER ────────────────────────────────────
 *
 * `generateThumbnail` n'est gardee par AUCUN reglage. Elle ne depend que du format et de
 * `width > 245 || height > 156`. Les deux PNG du corpus font 1200x630 : leur fiche
 * PORTERA une vignette apres chaque televersement ET apres chaque remplacement, meme
 * `responsiveDimensions:false`. C'est pour cela que la correction n'a pas ete d'inverser
 * la lecture de `formats` — « fiche AVEC formats = reliquat, donc remplacer » aurait
 * remplace ces deux fichiers indefiniment — mais de RETIRER le signal.
 *
 * Ce test garde donc les deux moities : que les octets convergent, et que `formats` ne
 * se vide PAS pour autant. La seconde est contre-intuitive : sans elle, quelqu'un
 * reintroduirait la lecture de `formats` en croyant qu'elle finit par se taire.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

import { REGLAGES_EXIGES } from '../src/reglages-medias.ts';

const CMS = path.join(import.meta.dirname, '..');
const MEDIAS = path.join(CMS, 'data', 'medias');
const require_ = createRequire(path.join(CMS, 'package.json'));

/** Les deux cartes de partage — les seules images matricielles du corpus (A-27). */
const MATRICIELS = ['identite/partage-defaut.png', 'partage/A01-col-des-trois-vents.png'];

/**
 * Le service de la mediatheque, avec les reglages qu'on veut lui faire lire.
 *
 * Le bouchon `strapi` est reduit a ce que `image-manipulation.js` appelle :
 * `getSettings()` par `plugin('upload').service('upload')`, et `config.get` pour les
 * points de rupture. Aucune instance n'est demarree, aucune ecriture ne part.
 */
function mediatheque(reglages: Record<string, boolean>) {
  (globalThis as any).strapi = {
    plugin: () => ({ service: () => ({ getSettings: async () => reglages }) }),
    config: { get: (_cle: string, defaut: unknown) => defaut },
  };
  return require_(
    path.join(CMS, 'node_modules/@strapi/upload/dist/server/services/image-manipulation.js'),
  );
}

/** Un fichier tel que le plugin le recoit — chemin sur disque, flux, repertoire de travail. */
function recu(rel: string, tmp: string) {
  const source = path.join(MEDIAS, rel);
  const nom = path.basename(rel);
  const travail = path.join(tmp, nom);
  fs.copyFileSync(source, travail);
  return {
    source,
    fichier: {
      name: nom,
      hash: nom.replace(/\W/g, '_'),
      ext: path.extname(nom),
      filepath: travail,
      tmpWorkingDirectory: tmp,
      getStream: () => fs.createReadStream(travail),
      size: fs.statSync(travail).size / 1024,
    } as any,
  };
}

function jetable(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mediatheque-'));
}

test('REGLAGES POSES — la mediatheque stocke le fichier du depot, a l octet', async () => {
  const { optimize, getDimensions } = mediatheque({ ...REGLAGES_EXIGES });
  const tmp = jetable();
  try {
    for (const rel of MATRICIELS) {
      const { source, fichier } = recu(rel, tmp);
      Object.assign(fichier, await getDimensions(fichier));
      const optimise = await optimize(fichier);
      assert.deepEqual(
        fs.readFileSync(optimise.filepath ?? fichier.filepath),
        fs.readFileSync(source),
        `${rel} : la mediatheque a retouche les octets — la comparaison du seed ne peut plus converger`,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('PREUVE EN CASSANT — avec sizeOptimization, les octets stockes NE SONT PLUS ceux du depot', async () => {
  const { optimize, getDimensions } = mediatheque({
    ...REGLAGES_EXIGES,
    sizeOptimization: true,
  });
  const tmp = jetable();
  try {
    const { source, fichier } = recu(MATRICIELS[0], tmp);
    Object.assign(fichier, await getDimensions(fichier));
    const optimise = await optimize(fichier);
    assert.notDeepEqual(
      fs.readFileSync(optimise.filepath ?? fichier.filepath),
      fs.readFileSync(source),
      'si les deux reglages rendaient les MEMES octets, le test precedent ne prouverait rien',
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('REGLAGES POSES — aucun format DERIVE n est genere', async () => {
  const { generateResponsiveFormats, getDimensions } = mediatheque({ ...REGLAGES_EXIGES });
  const tmp = jetable();
  try {
    for (const rel of MATRICIELS) {
      const { fichier } = recu(rel, tmp);
      Object.assign(fichier, await getDimensions(fichier));
      assert.deepEqual(await generateResponsiveFormats(fichier), [], `${rel} : un derive est ne`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('MAIS LA VIGNETTE, ELLE, EST TOUJOURS GENEREE — aucun reglage ne la garde', async () => {
  const { generateThumbnail, isResizableImage, getDimensions } = mediatheque({
    ...REGLAGES_EXIGES,
  });
  const tmp = jetable();
  try {
    for (const rel of MATRICIELS) {
      const { fichier } = recu(rel, tmp);
      Object.assign(fichier, await getDimensions(fichier));
      assert.ok(await isResizableImage(fichier), `${rel} devrait etre redimensionnable`);
      assert.ok(
        await generateThumbnail(fichier),
        `${rel} : PAS de vignette. Si ce fait change, la fiche finira par ne plus porter aucun ` +
          'format — et quelqu un pourrait alors relire `formats` comme un signal. Revenir a ' +
          'scripts/seed/seed.ts avant de le faire : le seed ne doit PAS en dependre',
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('LA VIGNETTE NE DEPEND QUE DE LA TAILLE — sous 245x156, il n y en a pas', async () => {
  /* Le seuil, exerce des deux cotes. C'est lui, et rien d'autre, qui decide : une image
     minuscule n'obtient AUCUN format, une grande en obtient un — quel que soit le reglage.
     `formats` mesure donc la taille de l'image, jamais ce que la mediatheque a retouche. */
  const { generateThumbnail } = mediatheque({ ...REGLAGES_EXIGES });
  const minuscule = { name: 'p.png', hash: 'p', width: 8, height: 8 } as any;
  assert.equal(await generateThumbnail(minuscule), null, 'une image de 8x8 n a pas de vignette');
});
