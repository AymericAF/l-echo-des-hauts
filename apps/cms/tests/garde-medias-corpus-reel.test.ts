/**
 * LA GARDE DU §6.7, PROUVEE EN CASSANT LE CORPUS REEL.
 *
 * POURQUOI CE FICHIER EXISTE EN PLUS DES DEUX AUTRES. `seed-voies.test.ts` juge
 * le module ; `seed-corpus.test.ts` juge un corpus MINIMAL fabrique pour
 * l'occasion. Ni l'un ni l'autre ne dit ce qui arriverait aux 94 medias
 * VERSIONNES — et c'est la seule question qui compte le jour ou quelqu'un pose
 * un fichier tiers dans ce depot. Un corpus de test est toujours conforme :
 * c'est celui qu'on a ecrit pour l'etre.
 *
 * COMMENT. Le corpus reel est COPIE en zone temporaire, la copie est abimee,
 * jamais l'original. Chaque cas doit rougir EN NOMMANT le media fautif : un
 * refus qui ne dit pas sur quel fichier il porte oblige a chercher sur une
 * centaine d'entrees, et c'est ce qui fait desarmer une garde.
 *
 * Le dernier cas est le TEMOIN. Sans lui, une garde qui refuserait TOUT
 * passerait ce fichier au vert : « le cas fautif est refuse » se prouve avec son
 * inverse, jamais seul.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { ErreurCorpus } from '../scripts/seed/erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

/** Une copie jetable du corpus reel — l'original n'est jamais touche. */
function copierCorpusReel(): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-garde-'));
  fs.cpSync(DATA_REEL, racine, { recursive: true });
  return racine;
}

function remplacerAuManifeste(racine: string, cle: string, meta: Record<string, unknown>): void {
  const chemin = path.join(racine, 'medias/manifeste.json');
  const manifeste = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  assert.ok(manifeste[cle], `le corpus reel ne porte plus "${cle}" : ce test vise un fichier absent`);
  manifeste[cle] = meta;
  fs.writeFileSync(chemin, JSON.stringify(manifeste, null, 2));
}

function poserSidecar(racine: string, cle: string, contenu: unknown): void {
  const chemin = path.join(racine, 'medias/sources', `${path.basename(cle)}.json`);
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, JSON.stringify(contenu), 'utf8');
}

const RELEVEE = {
  urlFichier: 'https://exemple.test/f/piece-1910.jpg',
  urlPage: 'https://exemple.test/p/piece-1910',
  licence: 'Public Domain Mark 1.0',
  dateReleve: '2026-08-12',
  parQui: 'Aymeric Filliot',
  sha256: 'c'.repeat(64),
};

/** Charge la copie abimee et rend le message de refus. */
function refusDe(racine: string): string {
  try {
    chargerCorpus(racine);
  } catch (e) {
    assert.ok(e instanceof ErreurCorpus, 'doit etre une ErreurCorpus');
    return (e as Error).message;
  } finally {
    fs.rmSync(racine, { recursive: true, force: true });
  }
  return assert.fail('le corpus abime a ete ACCEPTE : la garde ne juge pas ce cas');
}

/* ------------------------------------------------------------------ */

test('TEMOIN — le corpus reel INTACT passe la garde entiere', () => {
  const corpus = chargerCorpus(DATA_REEL);
  assert.ok(corpus.medias.length > 0);
  assert.deepEqual(
    corpus.medias.filter((m) => m.placements.length === 0).map((m) => m.cle),
    [],
    'tout media versionne porte au moins un placement'
  );
});

test('CASSE — un document du domaine public pose sur une COUVERTURE reelle est refuse', () => {
  const racine = copierCorpusReel();
  remplacerAuManifeste(racine, 'couvertures/A25.svg', {
    alternativeText: 'Gravure du viaduc de l Ambre, vers 1901',
    ayantDroit: 'Bibliotheque de Val-d Ambre',
    licence: 'Public Domain Mark 1.0',
    voie: 'C',
  });
  poserSidecar(racine, 'couvertures/A25.svg', RELEVEE);

  const message = refusDe(racine);
  assert.match(message, /couvertures\/A25\.svg/, 'doit NOMMER le media fautif');
  assert.match(message, /couverture/);
  assert.match(message, /voie C/i);
});

test('CASSE — le meme document pose dans une GALERIE reelle est refuse', () => {
  const racine = copierCorpusReel();
  remplacerAuManifeste(racine, 'galeries/A23-2.svg', {
    alternativeText: 'Atelier de filature, vers 1910',
    ayantDroit: 'Bibliotheque de Val-d Ambre',
    licence: 'Public Domain Mark 1.0',
    voie: 'C',
  });
  poserSidecar(racine, 'galeries/A23-2.svg', RELEVEE);

  const message = refusDe(racine);
  assert.match(message, /galeries\/A23-2\.svg/);
  assert.match(message, /galerie/);
});

test('CASSE — un document de voie C dans son SEUL placement legitime, mais sans sidecar', () => {
  const racine = copierCorpusReel();
  remplacerAuManifeste(racine, 'blocs/A23-registre.svg', {
    alternativeText: 'Page de registre d atelier, juin 1983',
    ayantDroit: 'Bibliotheque de Val-d Ambre',
    licence: 'Public Domain Mark 1.0',
    voie: 'C',
  });

  const message = refusDe(racine);
  assert.match(message, /A23-registre\.svg/);
  assert.match(message, /sources[\\/]A23-registre\.svg\.json/, 'doit nommer le chemin attendu');
});

test('CASSE — un portrait de voie D dont TOUT le facile est vert, sauf la personne representee', () => {
  // C'est le cas qui compte : licence CC0 relevee, sidecar present et complet.
  // Ce qui manque est le SECOND relevee, celui que la licence ne couvre jamais.
  const racine = copierCorpusReel();
  remplacerAuManifeste(racine, 'auteurs/noelle-vasseur.svg', {
    alternativeText: 'Portrait de trois quarts a la fenetre d un atelier',
    ayantDroit: 'Jeanne Aubry',
    licence: 'CC0 1.0',
    voie: 'D',
  });
  poserSidecar(racine, 'auteurs/noelle-vasseur.svg', { ...RELEVEE, licence: 'CC0 1.0' });

  const message = refusDe(racine);
  assert.match(message, /auteurs\/noelle-vasseur\.svg/);
  assert.match(message, /qualification/i);
  assert.match(message, /Q1/);
  assert.match(message, /Q2/);
  assert.match(message, /Q3/);
});

test('CASSE — un media tiers SANS voie declaree est refuse : la voie ne se devine pas', () => {
  const racine = copierCorpusReel();
  remplacerAuManifeste(racine, 'blocs/A28-fonds.svg', {
    alternativeText: 'Planche 4 du fonds de la mine de Combe-Roussel',
    ayantDroit: 'Archives departementales',
    licence: 'CC0 1.0',
  });

  const message = refusDe(racine);
  assert.match(message, /blocs\/A28-fonds\.svg/);
  assert.match(message, /voie/i);
});

test('CASSE — les trois conditions DEJA en place mordent encore sur le corpus reel', () => {
  const sansAlt = copierCorpusReel();
  remplacerAuManifeste(sansAlt, 'couvertures/A01.svg', {
    alternativeText: '   ',
    ayantDroit: 'Œuvre du projet',
    licence: 'CC0 1.0',
  });
  assert.match(refusDe(sansAlt), /couvertures\/A01\.svg[\s\S]*alternativeText/);

  const horsListe = copierCorpusReel();
  remplacerAuManifeste(horsListe, 'couvertures/A01.svg', {
    alternativeText: 'Courbes de niveau du col',
    ayantDroit: 'Œuvre du projet',
    licence: 'CC BY-SA 4.0',
  });
  assert.match(refusDe(horsListe), /couvertures\/A01\.svg[\s\S]*liste blanche/);

  const sansCredit = copierCorpusReel();
  remplacerAuManifeste(sansCredit, 'couvertures/A01.svg', {
    alternativeText: 'Courbes de niveau du col',
    ayantDroit: 'Œuvre du projet',
  });
  assert.match(refusDe(sansCredit), /couvertures\/A01\.svg[\s\S]*licence/);
});
