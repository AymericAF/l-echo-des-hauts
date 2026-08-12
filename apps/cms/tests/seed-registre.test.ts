/**
 * LE REGISTRE DES CREDITS — condition 1 de la garde du §6.7.
 *
 * Ce qui se prouve ici n'est pas la mise en forme : c'est que `CREDITS.md`
 * VERSIONNE est celui que le corpus produit. Sans ce test, le registre serait
 * une photographie datee du jour ou quelqu'un l'a lance — donc une seconde
 * source de verite, exactement ce que le derivation existe pour eviter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { composerRegistre, lignesRegistre } from '../scripts/seed/registre.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');
const CHEMIN_CREDITS = path.join(ICI, '..', '..', '..', 'CREDITS.md');

test('CREDITS.md existe a la racine du depot — le §6.7 le demande nommement', () => {
  assert.ok(fs.existsSync(CHEMIN_CREDITS), `absent : ${CHEMIN_CREDITS}`);
});

/**
 * La FIN DE LIGNE n'est pas le sujet. Git materialise ce fichier en CRLF sur un
 * poste Windows (`core.autocrlf`) et en LF sur le runner : comparer les octets
 * bruts ferait rougir le crochet local pour une raison qui n'est pas la sienne,
 * et un crochet qui rougit a tort se fait desactiver dans la semaine.
 */
const normaliser = (texte: string): string => texte.replace(/\r\n/g, '\n');

test('CREDITS.md versionne est EXACTEMENT celui que le corpus produit', () => {
  const attendu = composerRegistre(chargerCorpus(DATA_REEL));
  const surDisque = normaliser(fs.readFileSync(CHEMIN_CREDITS, 'utf8'));
  assert.equal(
    surDisque,
    attendu,
    'CREDITS.md a diverge du corpus. Il se DERIVE : `npm run credits --prefix apps/cms`.'
  );
});

test('le registre porte une ligne par media, sans trou ni doublon', () => {
  const corpus = chargerCorpus(DATA_REEL);
  const lignes = lignesRegistre(corpus);
  assert.equal(lignes.length, corpus.medias.length);
  assert.equal(new Set(lignes.map((l) => l.fichier)).size, lignes.length);
  assert.deepEqual(
    corpus.medias.map((m) => m.cle).sort((a, b) => a.localeCompare(b, 'fr')),
    lignes.map((l) => l.fichier)
  );
});

test('chaque ligne nomme AU MOINS une entite : un media sans emploi ne peut pas y entrer', () => {
  const vides = lignesRegistre(chargerCorpus(DATA_REEL)).filter((l) => l.entites.trim() === '');
  assert.deepEqual(vides, []);
});

test('la composition est DETERMINISTE : deux appels rendent le meme texte', () => {
  const corpus = chargerCorpus(DATA_REEL);
  assert.equal(composerRegistre(corpus), composerRegistre(chargerCorpus(DATA_REEL)));
});

test('aucune ligne ne porte de licence vide, ni d alternative vide, ni de credit vide', () => {
  const fautives = lignesRegistre(chargerCorpus(DATA_REEL)).filter(
    (l) => !l.licence.trim() || !l.alternativeText.trim() || !l.caption.trim()
  );
  assert.deepEqual(fautives, []);
});

test('les colonnes de relevee sont SANS OBJET en voie B — aucune date inventee', () => {
  // Ecrire une date de relevee sur un fichier dont nous sommes l ayant droit
  // fabriquerait une diligence qui n a pas eu lieu, et le registre ne servirait
  // plus a distinguer ce qui a ete releve de ce qui ne l a pas ete.
  for (const ligne of lignesRegistre(chargerCorpus(DATA_REEL))) {
    if (ligne.voie !== 'B') continue;
    assert.equal(ligne.url, '—', ligne.fichier);
    assert.equal(ligne.dateReleve, '—', ligne.fichier);
    assert.equal(ligne.parQui, '—', ligne.fichier);
  }
});
