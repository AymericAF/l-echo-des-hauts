/**
 * LE CONTEXTE DE BUILD NE TRANSPORTE PAS DE PRODUIT DE BUILD.
 *
 * Le `Dockerfile` fait `COPY . .` puis `npm run build` : TOUT ce qui traine dans
 * `apps/cms` au moment du build entre dans l'image AVANT que la compilation ne
 * tourne. Or `tsconfig.json` compile en INCREMENTAL (`"incremental": true`,
 * `"outDir": "dist"`) : un `dist/tsconfig.tsbuildinfo` embarque suffit a
 * convaincre tsc qu'il n'a rien a recompiler. L'image tourne alors sur un
 * `dist/src/index.js` ANTERIEUR, sans erreur, sans log, avec une suite verte —
 * exactement le symptome cherche le 2026-08-17 : `src/index.ts` appelle
 * `poserReglagesMedias`, et la ligne `[medias]` n'apparait dans aucun log.
 *
 * TROIS ARTEFACTS SE PRODUISENT LOCALEMENT ET N'ONT AUCUNE RAISON DE VOYAGER :
 * `dist/` (sortie de tsc), `types/` (`strapi ts:generate-types`) et `.strapi/`
 * (cache du CLI). Aucun n'est versionne — `git ls-files` ne les connait pas —
 * donc un clone frais n'en a pas, et les deploiements passes prouvent que le
 * build n'en depend pas. Les exclure ne retire donc rien au build ; ca lui retire
 * seulement la possibilite de se croire a jour.
 *
 * Le second sens compte autant : une garde qui exclurait tout serait verte et
 * inutile. Les sources doivent RESTER dans le contexte.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const RACINE = path.join(import.meta.dirname, '..');

/** Les motifs du `.dockerignore`, commentaires et lignes vides retires. */
function motifsDuContexte(): string[] {
  return fs
    .readFileSync(path.join(RACINE, '.dockerignore'), 'utf8')
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith('#'));
}

/**
 * Un chemin est-il tenu hors du contexte par ces motifs ?
 *
 * On ne reimplemente pas Docker : on couvre la seule forme employee ici — un
 * chemin, avec ou sans `/` final, qui exclut l'entree et tout ce qu'elle contient.
 */
function estExclu(motifs: string[], chemin: string): boolean {
  const segments = chemin.split('/');
  return motifs.some((motif) => {
    const attendu = motif.replace(/\/+$/, '').split('/');
    return attendu.every((segment, i) => segments[i] === segment);
  });
}

/* ------------------------------------------------------------------ */
/* SENS 1 — les produits de build restent dehors                       */
/* ------------------------------------------------------------------ */

/** Artefact local, ce qui le produit, et le fichier par lequel il nuit. */
const PRODUITS = [
  { entree: 'dist', producteur: 'tsc (outDir)', temoin: 'dist/tsconfig.tsbuildinfo' },
  { entree: 'dist', producteur: 'tsc (outDir)', temoin: 'dist/src/index.js' },
  { entree: 'types', producteur: 'strapi ts:generate-types', temoin: 'types/generated/contentTypes.d.ts' },
  { entree: '.strapi', producteur: 'le CLI Strapi', temoin: '.strapi/client/app.js' },
];

for (const { entree, producteur, temoin } of PRODUITS) {
  test(`\`${entree}\` (produit par ${producteur}) ne voyage pas dans le contexte`, () => {
    const motifs = motifsDuContexte();
    assert.ok(
      estExclu(motifs, temoin),
      `${temoin} entre dans l'image avant \`npm run build\` : ajoute \`${entree}/\` au .dockerignore`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* SENS 2 — les sources, elles, entrent bien                           */
/* ------------------------------------------------------------------ */

for (const source of ['src/index.ts', 'src/reglages-medias.ts', 'package.json', 'tsconfig.json']) {
  test(`\`${source}\` reste dans le contexte de build`, () => {
    assert.equal(estExclu(motifsDuContexte(), source), false);
  });
}

/* ------------------------------------------------------------------ */
/* LA RAISON — si le Dockerfile change, cette garde doit etre relue    */
/* ------------------------------------------------------------------ */

test('le stage de build copie TOUT le contexte puis compile — c est ce qui fonde la garde', () => {
  const dockerfile = fs.readFileSync(path.join(RACINE, 'Dockerfile'), 'utf8');
  const copieTout = /^COPY \. \.$/m.test(dockerfile);
  const compile = /^RUN npm run build$/m.test(dockerfile);
  assert.ok(
    copieTout && compile,
    'le Dockerfile ne fait plus « COPY . . » puis « npm run build » : relis pourquoi ces exclusions existent avant de les garder telles quelles',
  );
});

test('la compilation est INCREMENTALE — sans quoi un dist embarque serait inoffensif', () => {
  const tsconfig = fs.readFileSync(path.join(RACINE, 'tsconfig.json'), 'utf8');
  assert.match(tsconfig, /"incremental"\s*:\s*true/);
  assert.match(tsconfig, /"outDir"\s*:\s*"dist"/);
});
