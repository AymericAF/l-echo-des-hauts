/**
 * LE COMPTE DU §1, RECOMPTE A LA SOURCE — jamais derive d un recit.
 *
 * POURQUOI CE FICHIER EXISTE. Le §1 de `docs/modele-donnees.md` et l `INVENTAIRE` de
 * `tests/spec-modele-donnees.ts` portent tous deux un nombre de schemas et un nombre de
 * champs. Jusqu au 2026-08-19, les deux etaient tenus a la main et se confrontaient
 * l un a l autre : `inventaire §1` comparait la SPEC a la SPEC, donc un chiffre recopie a
 * son propre recopiage. Deux erreurs concordantes passaient vertes.
 *
 * Ce module lit `src/api/ ** /schema.json` et `src/components/ ** / *.json`, c est-a-dire ce
 * que le depot porte REELLEMENT. `tests/modele-donnees.test.ts` y confronte l `INVENTAIRE`,
 * et le §1 du document se recopie de sa sortie.
 *
 * LES BLOCS DE LA DYNAMIC ZONE SE LISENT SUR LA ZONE, jamais sur le dossier : un component
 * `bloc.*` peut etre IMBRIQUE sans etre un bloc (`bloc.chiffre-entree`, `bloc.image-galerie`).
 * Compter les fichiers de `src/components/bloc/` rendrait la borne CDC 8.3 fausse a chaque
 * ajout de component imbrique — c est precisement la confusion que la borne interdit.
 *
 *   node scripts/compter-modele.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const RACINE_DEFAUT = path.join(import.meta.dirname, '..', 'src');

const lire = (chemin) => JSON.parse(fs.readFileSync(chemin, 'utf8'));

export function compterModele(racine = RACINE_DEFAUT) {
  const types = [];
  for (const api of fs.readdirSync(path.join(racine, 'api'))) {
    const dossier = path.join(racine, 'api', api, 'content-types');
    if (!fs.existsSync(dossier)) continue;
    for (const ct of fs.readdirSync(dossier)) {
      const chemin = path.join(dossier, ct, 'schema.json');
      if (fs.existsSync(chemin)) types.push({ chemin, schema: lire(chemin) });
    }
  }

  const components = [];
  for (const categorie of fs.readdirSync(path.join(racine, 'components'))) {
    const dossier = path.join(racine, 'components', categorie);
    if (!fs.statSync(dossier).isDirectory()) continue;
    for (const fichier of fs.readdirSync(dossier)) {
      if (!fichier.endsWith('.json')) continue;
      const chemin = path.join(dossier, fichier);
      components.push({ uid: `${categorie}.${fichier.replace(/\.json$/, '')}`, chemin, schema: lire(chemin) });
    }
  }

  const nbChamps = (s) => Object.keys(s.attributes ?? {}).length;

  const article = types.find((t) => t.schema.info?.singularName === 'article');
  if (article === undefined) throw new Error('aucun content type `article` : la Dynamic Zone est introuvable');
  const blocs = article.schema.attributes.contenu.components;
  const dansLaZone = new Set(blocs);

  const imbriques = components.filter((c) => c.uid.startsWith('bloc.') && !dansLaZone.has(c.uid));
  const partages = components.filter((c) => !c.uid.startsWith('bloc.'));

  return {
    collectionTypes: types.filter((t) => t.schema.kind === 'collectionType').length,
    singleTypes: types.filter((t) => t.schema.kind === 'singleType').length,
    blocsDynamicZone: blocs.length,
    blocs,
    componentImbrique: imbriques.length,
    imbriques: imbriques.map((c) => c.uid).sort(),
    componentsPartages: partages.length,
    schemas: types.length + components.length,
    champs:
      types.reduce((n, t) => n + nbChamps(t.schema), 0) +
      components.reduce((n, c) => n + nbChamps(c.schema), 0),
    detail: Object.fromEntries(
      [
        ...types.map((t) => [t.schema.info.singularName, nbChamps(t.schema)]),
        ...components.map((c) => [c.uid, nbChamps(c.schema)]),
      ].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

/* Execution directe : `node scripts/compter-modele.mjs`. */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  console.log(JSON.stringify(compterModele(), null, 2));
}
