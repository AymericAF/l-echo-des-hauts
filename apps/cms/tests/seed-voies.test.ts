/**
 * LA VOIE D'ACQUISITION, et les quatre conditions de la garde du §6.7 qu'elle
 * rend exprimables.
 *
 * Ce fichier juge le MODULE. Ce que la garde attrape sur le chemin que le seed
 * emprunte reellement se prouve dans `seed-corpus.test.ts` : un format juste
 * dans un module que personne n'appelle ne garde rien.
 *
 * Chaque condition est exercee DANS LES DEUX SENS — le cas fautif refuse en
 * NOMMANT le media et ce qui manque, le cas conforme accepte. Une garde dont on
 * n'a vu que le vert ne prouve rien : elle peut etre branchee sur rien.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AYANT_DROIT_PROJET,
  LICENCES_VOIE_D,
  QUALIFICATIONS,
  cheminSidecar,
  deriverVoie,
  verifierPlacementVoieC,
  verifierPortraitAuteur,
  verifierSidecarVoieC,
} from '../scripts/seed/voies.ts';

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

function racineTemporaire(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'echo-voies-'));
}

/** Ecrit un sidecar au chemin que la garde ira lire, et rend la racine. */
function avecSidecar(cle: string, contenu: unknown): string {
  const racine = racineTemporaire();
  const chemin = cheminSidecar(racine, cle);
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, JSON.stringify(contenu), 'utf8');
  return racine;
}

const SIDECAR_C_COMPLET = {
  urlFichier: 'https://exemple.test/fichiers/registre-1910.jpg',
  urlPage: 'https://exemple.test/pieces/registre-1910',
  licence: 'Public Domain Mark 1.0',
  dateReleve: '2026-08-12',
  parQui: 'Aymeric Filliot',
  sha256: 'a'.repeat(64),
};

const SIDECAR_D_COMPLET = {
  ...SIDECAR_C_COMPLET,
  licence: 'CC0 1.0',
  qualification: 'Q1',
  preuve: 'Fichier ouvert en pleine resolution : cadrage sur les mains, visage hors champ.',
};

function motifDe(verdict: { conforme: boolean; motif?: string }): string {
  assert.equal(verdict.conforme, false, 'la garde a ACCEPTE ce cas : elle ne le juge pas');
  return (verdict as { motif: string }).motif;
}

/* ------------------------------------------------------------------ */
/* LA VOIE — derivee, jamais ressaisie                                 */
/* ------------------------------------------------------------------ */

test('la voie B se DERIVE de l ayant droit : aucune saisie sur les medias du projet', () => {
  assert.equal(
    deriverVoie({ ayantDroit: AYANT_DROIT_PROJET, licence: 'CC0 1.0' }, 'couvertures/A01.svg'),
    'B'
  );
});

test('une voie non derivable est REFUSEE en nommant le media — elle ne se devine pas', () => {
  assert.throws(
    () => deriverVoie({ ayantDroit: 'Jeanne Aubry', licence: 'CC BY 4.0' }, 'blocs/A23-registre.svg'),
    (e: unknown) => {
      assert.match((e as Error).message, /blocs\/A23-registre\.svg/, 'doit NOMMER le media');
      assert.match((e as Error).message, /voie/i);
      assert.match((e as Error).message, /A.*B.*C.*D|\bC\b.*\bD\b/s, 'doit dire quoi declarer');
      return true;
    }
  );
});

test('une voie declaree explicitement est retenue telle quelle', () => {
  for (const voie of ['A', 'C', 'D'] as const) {
    assert.equal(deriverVoie({ ayantDroit: 'Jeanne Aubry', licence: 'CC0 1.0', voie }, 'x.svg'), voie);
  }
});

test('une voie declaree HORS de l ensemble des quatre est refusee', () => {
  assert.throws(
    () => deriverVoie({ ayantDroit: 'Jeanne Aubry', licence: 'CC0 1.0', voie: 'E' }, 'x.svg'),
    /x\.svg[\s\S]*"E"/
  );
});

test('la voie declaree doit COINCIDER avec l ayant droit, dans les deux sens', () => {
  // Se dire tiers en etant l ayant droit : la voie C/D declencherait des
  // obligations sur un fichier qui n en a aucune, et l inverse les eteindrait.
  assert.throws(
    () => deriverVoie({ ayantDroit: AYANT_DROIT_PROJET, licence: 'CC0 1.0', voie: 'C' }, 'g/A09-1.svg'),
    /g\/A09-1\.svg[\s\S]*Œuvre du projet/
  );
  assert.throws(
    () => deriverVoie({ ayantDroit: 'Jeanne Aubry', licence: 'CC0 1.0', voie: 'B' }, 'g/A09-2.svg'),
    /g\/A09-2\.svg[\s\S]*Œuvre du projet/
  );
});

/* ------------------------------------------------------------------ */
/* CONDITION 5 — voie C en couverture ou en galerie                    */
/* ------------------------------------------------------------------ */

test('CONDITION 5 — une voie C en couverture est refusee, en nommant le placement', () => {
  const motif = motifDe(verifierPlacementVoieC('C', ['couverture'], 'couvertures/A25.svg'));
  assert.match(motif, /couverture/);
  assert.match(motif, /§6\.1|credit/i, 'doit dire POURQUOI : la couverture n a pas de champ de credit');
});

test('CONDITION 5 — une voie C en galerie est refusee, en nommant le placement', () => {
  const motif = motifDe(verifierPlacementVoieC('C', ['galerie'], 'galeries/A23-2.svg'));
  assert.match(motif, /galerie/);
});

test('CONDITION 5 — une voie C dans `bloc.image-legendee` PASSE : c est son seul placement', () => {
  assert.deepEqual(verifierPlacementVoieC('C', ['image-legendee'], 'blocs/A23-registre.svg'), {
    conforme: true,
  });
});

test('CONDITION 5 — les voies A, B et D ne sont PAS bornees par ce placement', () => {
  for (const voie of ['A', 'B', 'D'] as const) {
    assert.deepEqual(verifierPlacementVoieC(voie, ['couverture', 'galerie'], 'x.svg'), {
      conforme: true,
    });
  }
});

/* ------------------------------------------------------------------ */
/* CONDITION 6 — voie C sans sidecar                                   */
/* ------------------------------------------------------------------ */

test('CONDITION 6 — une voie C SANS sidecar est refusee, en nommant le chemin attendu', () => {
  const racine = racineTemporaire();
  const motif = motifDe(verifierSidecarVoieC('C', 'blocs/A23-registre.svg', racine, 'Public Domain Mark 1.0'));
  assert.match(motif, /blocs\/A23-registre\.svg|A23-registre\.svg/);
  assert.match(motif, /sources[\\/]A23-registre\.svg\.json/, 'doit nommer le chemin attendu');
});

test('CONDITION 6 — un sidecar incomplet est refuse en nommant LE champ manquant', () => {
  for (const champ of ['urlFichier', 'urlPage', 'licence', 'sha256'] as const) {
    const ampute: Record<string, unknown> = { ...SIDECAR_C_COMPLET };
    delete ampute[champ];
    const racine = avecSidecar('blocs/A23-registre.svg', ampute);
    const motif = motifDe(
      verifierSidecarVoieC('C', 'blocs/A23-registre.svg', racine, 'Public Domain Mark 1.0')
    );
    assert.match(motif, new RegExp(champ), `doit nommer le champ ${champ}`);
  }
});

test('CONDITION 6 — un sidecar qui contredit la licence du manifeste est refuse', () => {
  const racine = avecSidecar('blocs/A23-registre.svg', SIDECAR_C_COMPLET);
  const motif = motifDe(verifierSidecarVoieC('C', 'blocs/A23-registre.svg', racine, 'CC0 1.0'));
  assert.match(motif, /Public Domain Mark 1\.0/);
  assert.match(motif, /CC0 1\.0/);
});

test('CONDITION 6 — un sidecar complet et coherent PASSE', () => {
  const racine = avecSidecar('blocs/A23-registre.svg', SIDECAR_C_COMPLET);
  assert.deepEqual(
    verifierSidecarVoieC('C', 'blocs/A23-registre.svg', racine, 'Public Domain Mark 1.0'),
    { conforme: true }
  );
});

test('CONDITION 6 — un sidecar illisible est refuse comme tel, pas ignore', () => {
  const racine = racineTemporaire();
  const chemin = cheminSidecar(racine, 'blocs/A23-registre.svg');
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, '{ pas du json', 'utf8');
  assert.match(
    motifDe(verifierSidecarVoieC('C', 'blocs/A23-registre.svg', racine, 'CC0 1.0')),
    /JSON/i
  );
});

test('CONDITION 6 — les voies A, B et D ne sont pas jugees par cette condition', () => {
  const racine = racineTemporaire();
  for (const voie of ['A', 'B', 'D'] as const) {
    assert.deepEqual(verifierSidecarVoieC(voie, 'x.svg', racine, 'CC0 1.0'), { conforme: true });
  }
});

/* ------------------------------------------------------------------ */
/* CONDITION 7 — le portrait d auteur                                  */
/* ------------------------------------------------------------------ */

test('CONDITION 7 — un avatar genere (voie B) passe PAR CONSTRUCTION, sans sidecar', () => {
  const racine = racineTemporaire();
  assert.deepEqual(
    verifierPortraitAuteur('B', 'CC0 1.0', ['auteur-photo'], 'auteurs/theo-brissac.svg', racine),
    { conforme: true }
  );
});

test('CONDITION 7 — elle ne juge QUE ce qui est place en `Auteur.photo`', () => {
  const racine = racineTemporaire();
  assert.deepEqual(
    verifierPortraitAuteur('D', 'CC BY-SA 4.0', ['image-legendee'], 'blocs/x.svg', racine),
    { conforme: true }
  );
});

test('CONDITION 7a — une licence hors de la liste D.3 est refusee, en la citant', () => {
  const racine = avecSidecar('auteurs/x.svg', SIDECAR_D_COMPLET);
  const motif = motifDe(
    verifierPortraitAuteur('D', "Photographie d'Aymeric Filliot", ['auteur-photo'], 'auteurs/x.svg', racine)
  );
  assert.match(motif, /auteurs\/x\.svg/);
  assert.match(motif, /Photographie d'Aymeric Filliot/);
  assert.match(motif, /D\.3/);
  for (const admise of LICENCES_VOIE_D) assert.match(motif, new RegExp(admise.replace(/\./g, '\\.')));
});

test('CONDITION 7a — les quatre licences admises en D.3 passent, CC BY 4.0 comprise', () => {
  const racine = avecSidecar('auteurs/x.svg', SIDECAR_D_COMPLET);
  for (const licence of LICENCES_VOIE_D) {
    const sidecar = { ...SIDECAR_D_COMPLET, licence };
    const r = avecSidecar('auteurs/x.svg', sidecar);
    assert.deepEqual(
      verifierPortraitAuteur('D', licence, ['auteur-photo'], 'auteurs/x.svg', r),
      { conforme: true },
      licence
    );
  }
  assert.ok(racine);
});

test('CONDITION 7b — un portrait de voie D sans sidecar est refuse', () => {
  const racine = racineTemporaire();
  const motif = motifDe(verifierPortraitAuteur('D', 'CC0 1.0', ['auteur-photo'], 'auteurs/x.svg', racine));
  assert.match(motif, /sources[\\/]x\.svg\.json/);
});

test('CONDITION 7c — un sidecar SANS qualification de la personne est refuse', () => {
  const sans = { ...SIDECAR_D_COMPLET };
  delete (sans as Record<string, unknown>).qualification;
  const racine = avecSidecar('auteurs/x.svg', sans);
  const motif = motifDe(verifierPortraitAuteur('D', 'CC0 1.0', ['auteur-photo'], 'auteurs/x.svg', racine));
  assert.match(motif, /auteurs\/x\.svg/);
  assert.match(motif, /qualification/i);
  for (const q of QUALIFICATIONS) assert.match(motif, new RegExp(q));
});

test('CONDITION 7c — une qualification HORS des trois valeurs est refusee : pas de « non applicable »', () => {
  for (const valeur of ['', '   ', 'Q4', 'non applicable', 'N/A']) {
    const racine = avecSidecar('auteurs/x.svg', { ...SIDECAR_D_COMPLET, qualification: valeur });
    const motif = motifDe(
      verifierPortraitAuteur('D', 'CC0 1.0', ['auteur-photo'], 'auteurs/x.svg', racine)
    );
    assert.match(motif, /qualification/i, `valeur refusee : "${valeur}"`);
  }
});

test('CONDITION 7c — une qualification SANS sa preuve est refusee : la preuve est la moitie de la regle', () => {
  const racine = avecSidecar('auteurs/x.svg', { ...SIDECAR_D_COMPLET, preuve: '  ' });
  const motif = motifDe(verifierPortraitAuteur('D', 'CC0 1.0', ['auteur-photo'], 'auteurs/x.svg', racine));
  assert.match(motif, /preuve/i);
});

test('CONDITION 7 — un portrait de voie D complet PASSE', () => {
  const racine = avecSidecar('auteurs/x.svg', SIDECAR_D_COMPLET);
  assert.deepEqual(
    verifierPortraitAuteur('D', 'CC0 1.0', ['auteur-photo'], 'auteurs/x.svg', racine),
    { conforme: true }
  );
});

test('CONDITION 7 — une photo d Aymeric (voie A) en portrait passe par les MEMES Q1/Q2/Q3', () => {
  // §6.3, rappel de D.2 : etre l ayant droit du FICHIER ne donne aucun droit sur
  // l image de la personne. Seule la voie B est exemptee, et par construction.
  const racine = racineTemporaire();
  const motif = motifDe(
    verifierPortraitAuteur('A', 'CC0 1.0', ['auteur-photo'], 'auteurs/x.svg', racine)
  );
  assert.match(motif, /sources[\\/]x\.svg\.json/);
});
