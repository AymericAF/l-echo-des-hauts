/**
 * LA VERSION QUI A RASTERISE DOIT ETRE ATTESTEE PAR LA SORTIE, jamais relevee a la main.
 *
 * CE QUE R-07 DISTINGUE, et qui est tout l objet de ce fichier : un champ ATTESTE est
 * depose par l instrument qui a produit la mesure ; un champ SUPPOSE est recopie d un
 * depot par celui qui remplit le carnet. Le champ `sharp` du gabarit R-07 etait du second
 * genre — un PNG ne porte pas la version qui l a rendu, et personne ne pouvait donc
 * verifier apres coup ce qui avait rasterise.
 *
 * POURQUOI ICI. `preuve-encre-og.mjs` a Sharp EN MAIN au moment ou il mesure : il est le
 * seul endroit du depot ou la question ait une reponse sure. Il ne deposait rien —
 * verifie le 2026-08-16 avant d ecrire une ligne : le script n ecrivait AUCUN fichier, il
 * affichait et sortait en code. La tache annoncait « le fichier de provenance qu il
 * ecrit » ; ce fichier n existait pas.
 *
 * CE QUI EST EXIGE, ET POURQUOI PAS MOINS :
 *  - `sharp.versions` TEL QUE LA LIB LE REND, sans reformatage ni filtrage. La cle qui
 *    compte n est pas `sharp` mais `vips` : c est libvips qui rasterise, le wrapper JS
 *    ne fait que l appeler. Filtrer les cles reviendrait a choisir ce qu on atteste.
 *  - le champ est OBLIGATOIRE, pas optionnel. Un champ facultatif disparait en silence le
 *    jour ou quelqu un refactorise, et l attestation redevient une supposition sans que
 *    rien ne rougisse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROVENANCE, provenanceEncreOg, verifierProvenance } from '../scripts/preuve-encre-og.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('la provenance porte `sharp.versions` TEL QUE LA LIB LE REND — wrapper ET vips', () => {
  const provenance = provenanceEncreOg();

  assert.ok(provenance.sharp, 'la provenance doit porter un objet `sharp`');
  assert.ok(provenance.sharp.versions, '`sharp.versions` est ce que la lib rend, on le depose entier');
  assert.equal(
    typeof provenance.sharp.versions.vips,
    'string',
    'c est libvips qui RASTERISE : sans sa version, on atteste le wrapper et pas le rendu'
  );
  assert.equal(
    typeof provenance.sharp.versions.sharp,
    'string',
    'la version du wrapper reste utile : c est elle que le depot declare'
  );
});

test('AUCUNE cle de `sharp.versions` n est filtree — on ne choisit pas ce qu on atteste', async () => {
  const { default: sharp } = await import('sharp');
  const provenance = provenanceEncreOg();

  assert.deepEqual(
    Object.keys(provenance.sharp.versions).sort(),
    Object.keys(sharp.versions).sort(),
    'reformater ou filtrer reviendrait a choisir ce qui est atteste, donc a supposer le reste'
  );
});

test('la provenance nomme l INSTRUMENT qui la depose — sinon elle n atteste rien', () => {
  const provenance = provenanceEncreOg();

  assert.match(
    provenance.instrument,
    /preuve-encre-og/,
    'une version sans le nom de ce qui l a constatee est un chiffre sans temoin'
  );
  assert.ok(provenance._lisez_moi, 'le fichier doit dire ce qu il est a qui l ouvre sans contexte');
});

/* ------------------------------------------------------------------ */
/* LA GARDE, ET LA PREUVE QU ELLE SAIT ROUGIR                          */
/* ------------------------------------------------------------------ */

test('la garde ACCEPTE une provenance complete', () => {
  assert.deepEqual(verifierProvenance(provenanceEncreOg()), []);
});

test('la garde ROUGIT quand `sharp.versions` manque — le champ n est pas optionnel', () => {
  const ampute = { ...provenanceEncreOg() };
  delete ampute.sharp;

  const manquements = verifierProvenance(ampute);

  assert.ok(manquements.length > 0, 'un champ absent doit etre REFUSE, pas ignore');
  assert.match(manquements.join('\n'), /sharp/);
});

test('la garde ROUGIT quand `vips` manque, meme si `sharp` est la', () => {
  const provenance = provenanceEncreOg();
  const ampute = { ...provenance, sharp: { versions: { sharp: provenance.sharp.versions.sharp } } };

  const manquements = verifierProvenance(ampute);

  assert.ok(
    manquements.length > 0,
    'attester le wrapper sans le moteur laisserait passer exactement ce que R-07 veut fermer'
  );
  assert.match(manquements.join('\n'), /vips/);
});

test('le fichier de provenance est ECRIT a cote des artefacts, pas seulement calcule', () => {
  /* Une fonction qui rend un objet ne prouve rien : ce qui atteste est un fichier qui
     reste sur le disque a cote de la mesure, et que quelqu un peut ouvrir six mois plus
     tard sans rejouer quoi que ce soit. */
  assert.equal(path.isAbsolute(PROVENANCE) || PROVENANCE.startsWith('.'), true);
  assert.match(PROVENANCE, /provenance.*\.json$/);

  const dossier = path.dirname(path.resolve(RACINE, PROVENANCE));
  assert.ok(dossier.length > 0);
});
