/**
 * PREUVE du seuil de la garde des images OG : les deux distributions, mesurees, ici.
 *
 * POURQUOI CE SCRIPT EXISTE. Le seuil precedent (`ENCRE_MINIMALE = 8`, sur l ecart-type
 * des pixels) avait ete pose a vue, a partir d UNE valeur observee. Au premier
 * deploiement reel, 21 vignettes sont sorties vides et une seule a rougi : le seuil ne
 * tombait pas au milieu d un fosse, il tombait AU MILIEU DE LA POPULATION VIDE. Un seuil
 * dont la justification tient dans un commentaire se fait rabaisser au premier faux
 * positif ; un seuil dont la justification se REJOUE en une commande, non.
 *
 *   npm run preuve:encre-og
 *
 * CE QU IL FAIT. Il rasterise le gabarit reel (`src/lib/seo/gabarit-og.ts`) sur un corpus
 * de titres choisi pour couvrir les quatre paliers de corps et les deux extremes de
 * longueur, DANS LES DEUX ETATS :
 *
 *   - avec les fontes de la machine ;
 *   - sans AUCUNE fonte, en relancant ce meme script dans un processus fils dont le
 *     `FONTCONFIG_PATH` pointe une configuration fontconfig qui ne declare aucun
 *     repertoire de polices. C est l etat exact de l image Nixpacks avant `4b0895b`
 *     (`fc-list | wc -l` -> 0), reproduit sans conteneur.
 *
 * Puis il confronte les deux distributions au seuil et SORT EN CODE NON NUL si elles ne
 * sont pas separees — dans un sens comme dans l autre.
 *
 * CE QU IL NE PROUVE PAS. Le rendu sans fonte est celui de la pile graphique de LA
 * MACHINE qui execute le script ; la taille du rectangle de remplacement peut differer
 * sous une autre pile. Le script mesure donc ce plafond a chaque execution plutot que de
 * le supposer — c est ce que fait le verdict ci-dessous. Il n est pas non plus
 * deterministe : sans fonte, un meme titre rend tantot 0 px, tantot une douzaine. Le
 * verdict ne porte donc que sur le PLAFOND de la population vide, jamais sur une valeur.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { dispositionOg, svgOg, TAILLES_TITRE } from '../src/lib/seo/gabarit-og.ts';
import { HAUTEUR_MINIMALE_GLYPHES, mesurerBandeTitre } from './verifier-seo.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Le corpus de calibration. Il n est PAS tire du site : un corpus qui suivrait le contenu
 * reel ferait varier la preuve avec l actualite de la redaction. Il est choisi pour
 * encadrer la population « avec fontes » par en dessous — les deux dernieres entrees sont
 * les pires cas typographiques que le gabarit puisse produire, pas les plus frequents.
 */
const CORPUS = [
  ['un seul mot', 'Eau'],
  ['titre court', 'Le lac de la Fauge a 41 %'],
  ['titre moyen', 'Le budget 2027 de la communaute des Hauts'],
  ['titre long', 'Monteclair 1450 : le compte d exploitation d une station qui ne neige plus'],
  [
    'titre tres long (palier intermediaire)',
    'Scolytes, secheresse, tempetes : trois cents hectares d epicea abattus sur le versant nord du plateau',
  ],
  [
    'titre le plus long (plus petit palier)',
    'Une enquete publique de six mois, quatre recours au tribunal administratif et un million ' +
      'quatre cent vingt mille euros plus tard, le chantier de restauration du clocher reprend enfin',
  ],
  [
    'pire cas typographique (ni capitale, ni accent, ni jambage)',
    Array.from(
      { length: 30 },
      (_, index) =>
        ['anse', 'ourse', 'somme', 'venue', 'course', 'rose', 'zone', 'ecran', 'nommer', 'annonce'][index % 10],
    ).join(' '),
  ],
];

const GABARIT = { rubrique: 'Territoire', auteur: 'Noelle Vasseur', nomSite: 'L Echo des Hauts', couleurAccent: null };

/** Rasterise le corpus dans un dossier temporaire et rend les mesures, dans l ordre. */
async function mesurerLeCorpus() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-encre-og-'));
  const mesures = [];
  for (const [nom, titre] of CORPUS) {
    const gabarit = { ...GABARIT, titre };
    const fichier = path.join(dossier, `${mesures.length}.png`);
    fs.writeFileSync(fichier, await sharp(Buffer.from(svgOg(gabarit))).png().toBuffer());
    const mesure = await mesurerBandeTitre(fichier);
    const disposition = dispositionOg(gabarit);
    mesures.push({
      nom,
      taille: disposition.tailleTitre,
      lignes: disposition.lignes.length,
      hauteur: mesure === null ? -1 : mesure.hauteurGlyphes,
      ecartType: mesure === null ? -1 : mesure.ecartType,
    });
  }
  fs.rmSync(dossier, { recursive: true, force: true });
  return mesures;
}

/**
 * Relance ce script dans un processus fils prive de toute fonte.
 *
 * `FONTCONFIG_PATH` designe le repertoire ou fontconfig cherche `fonts.conf` ; on lui en
 * donne un qui ne declare AUCUN `<dir>`. Le processus fils ne peut donc resoudre aucune
 * famille, quelle que soit la pile de polices demandee par le gabarit.
 */
function mesurerSansFonte() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-fc-vide-'));
  fs.writeFileSync(
    path.join(dossier, 'fonts.conf'),
    '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n' +
      `<fontconfig>\n  <cachedir>${path.join(dossier, 'cache')}</cachedir>\n</fontconfig>\n`,
  );
  fs.mkdirSync(path.join(dossier, 'cache'), { recursive: true });

  return new Promise((resoudre, rejeter) => {
    const fils = spawn(process.execPath, [fileURLToPath(import.meta.url), '--mesures-json'], {
      cwd: RACINE,
      env: { ...process.env, FONTCONFIG_PATH: dossier, ECHO_SANS_FONTE: '1' },
    });
    let sortie = '';
    let erreur = '';
    fils.stdout.on('data', (morceau) => (sortie += morceau));
    fils.stderr.on('data', (morceau) => (erreur += morceau));
    fils.on('close', (code) => {
      fs.rmSync(dossier, { recursive: true, force: true });
      if (code !== 0) return rejeter(new Error(`processus sans fonte sorti en ${code} :\n${erreur}`));
      try {
        resoudre(JSON.parse(sortie));
      } catch {
        rejeter(new Error(`sortie illisible du processus sans fonte :\n${sortie}\n${erreur}`));
      }
    });
  });
}

function tableau(titre, mesures) {
  console.log(`\n${titre}`);
  console.log('  corps  lignes  hauteur  ecart-type  cas');
  for (const mesure of mesures) {
    console.log(
      `  ${String(mesure.taille).padStart(5)}  ${String(mesure.lignes).padStart(6)}  ` +
        `${String(mesure.hauteur).padStart(7)}  ${mesure.ecartType.toFixed(2).padStart(10)}  ${mesure.nom}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--mesures-json')) {
    // Mode processus fils : on ne rend que les mesures, sur la sortie standard.
    process.stdout.write(JSON.stringify(await mesurerLeCorpus()));
  } else {
    const avec = await mesurerLeCorpus();
    const sans = await mesurerSansFonte();

    tableau('AVEC les fontes de la machine', avec);
    tableau('SANS aucune fonte (FONTCONFIG_PATH sur une configuration vide)', sans);

    const plancherPlein = Math.min(...avec.map((mesure) => mesure.hauteur));
    const plafondVide = Math.max(...sans.map((mesure) => mesure.hauteur));
    const ecartTypePleinMin = Math.min(...avec.map((mesure) => mesure.ecartType));
    const ecartTypeVideMax = Math.max(...sans.map((mesure) => mesure.ecartType));

    console.log(
      `\nHAUTEUR DES GLYPHES  plafond du vide ${plafondVide} px | seuil ${HAUTEUR_MINIMALE_GLYPHES} px | ` +
        `plancher du plein ${plancherPlein} px` +
        `\n                     (le plus petit palier de corps du gabarit est ${Math.min(...TAILLES_TITRE)} px)`,
    );
    console.log(
      `ECART-TYPE           plafond du vide ${ecartTypeVideMax.toFixed(2)} | ` +
        `plancher du plein ${ecartTypePleinMin.toFixed(2)}` +
        (ecartTypeVideMax >= ecartTypePleinMin
          ? '  <- les deux populations SE CHEVAUCHENT : aucun seuil sur cette grandeur ne les separe'
          : ''),
    );

    const echecs = [];
    if (plafondVide >= HAUTEUR_MINIMALE_GLYPHES) {
      echecs.push(
        `sans fonte, un cas atteint ${plafondVide} px : il passerait la garde (seuil ${HAUTEUR_MINIMALE_GLYPHES})`,
      );
    }
    if (plancherPlein < HAUTEUR_MINIMALE_GLYPHES) {
      echecs.push(
        `avec fontes, un cas legitime tombe a ${plancherPlein} px : il ferait rougir la garde a tort`,
      );
    }
    if (echecs.length > 0) {
      console.error('\n✖ le seuil ne separe plus les deux populations :');
      for (const echec of echecs) console.error(`  - ${echec}`);
      process.exit(1);
    }
    console.log(
      `\n✔ ${CORPUS.length} cas dans les deux etats : le seuil de ${HAUTEUR_MINIMALE_GLYPHES} px separe ` +
        `${plafondVide} px (vide) de ${plancherPlein} px (plein).`,
    );
  }
}
