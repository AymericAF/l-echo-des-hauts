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
 *   npm run preuve:encre-og            (25 tirages du cas vide)
 *   npm run preuve:encre-og -- --tirages=100
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
 * ------------------------------------------------------------------------------------
 * CE QUI A CHANGE LE 2026-08-11, ET POURQUOI (tache b2b1603d)
 *
 * LE DEFAUT. Ce script a rendu DEUX VERDICTS OPPOSES SUR LE MEME COMMIT `328f7f5`, sans
 * qu une ligne ait bouge : run GitHub 31534444682, tentative 1 en ECHEC
 * (« sans fonte, un cas atteint 21 px : il passerait la garde »), tentative 2 en SUCCES.
 * Le cas fautif etait « titre le plus long (plus petit palier) », corps 44, a 21 px —
 * contre un seuil de 20 et un plancher du plein de 22.
 *
 * SA CAUSE, MESUREE ET NON SUPPOSEE. Le rendu sans fonte n est pas deterministe : sur le
 * runner GitHub, 40 tirages du corpus entier (280 mesures) rendent 0, 12 ou 13 px pour un
 * meme cas, dans un desordre complet, et JAMAIS 21 — la valeur de 21 px est une queue de
 * distribution qui ne s est pas reproduite en 280 tirages. Ce n est pas un defaut de
 * configuration : poser en plus `FONTCONFIG_FILE` sur le meme fichier ne change rien
 * (mesure du 2026-08-11, 10 tirages dans chaque etat). Le tirage 0 px n est pas non plus
 * un artefact de cadrage — les lignes de titre tombent toutes dans la bande.
 *
 * OR CE SCRIPT DECIDAIT SUR **UN SEUL TIRAGE PAR CAS**. Sept tirages, une queue de
 * distribution qui atteint au moins 21 px, un seuil a 20 : le verdict etait une loterie,
 * et son ancien en-tete se trompait en concluant que « le verdict ne porte que sur le
 * PLAFOND » — le maximum de sept tirages d une variable aleatoire est lui-meme aleatoire,
 * et biaise vers le bas.
 *
 * POURQUOI « TIRER PLUS » NE SUFFISAIT PAS — et c est le contre-sens qu il faut eviter en
 * relisant ce fichier. Augmenter le nombre de tirages rend la queue VISIBLE, mais rend le
 * verdict PLUS souvent rouge, pas plus stable : sur 5 executions a 25 tirages, le poste
 * Windows a sorti un cas a 18 px. Un echantillon plus grand ne stabilise pas un verdict
 * assis sur une queue de distribution, il l expose. Et le seuil ne peut pas etre releve
 * pour couvrir 21 px : le plancher legitime est a 22 px (hauteur d x d un titre sans
 * capitale, sans accent ni jambage, au plus petit palier). Les deux populations SE
 * TOUCHENT sur cette grandeur.
 *
 * CE QUI CORRIGE VRAIMENT LE DEFAUT — en deux temps, et le second est l essentiel.
 *
 *   1. La garde a gagne une SECONDE JAMBE (`sonderRasteriseur`, `verifier-seo.mjs`), qui
 *      mesure la PROPORTIONNALITE de l encre au corps demande. Un texte dessine grandit
 *      avec son corps, un tofu garde sa taille : le rapport separe donc par construction,
 *      quelle que soit la taille du tofu de ce processus-la. Mesure du 2026-08-11 : 0 a
 *      1,083 sur 25 processus sans fonte, 1,478 aux 5 tirages avec fontes. La premiere
 *      jambe n est PAS retiree — les deux se cumulent, une garde ne se remplace pas.
 *   2. Le verdict de ce script n est plus « le plafond de sept tirages tombe-t-il du bon
 *      cote d une constante », mais « la garde ENTIERE attrape-t-elle CHACUN des tirages
 *      sans fonte » (`gardeAttrape`). C est son predicat reel, exerce `TIRAGES_SANS_FONTE`
 *      fois. Il ne bouge plus, parce que la jambe 2 ne depend pas de la queue.
 *
 * CE QUE CE SCRIPT NE TRANCHE PAS. Le seuil absolu de 20 px reste franchissable par un
 * tofu de 21 px, et le script l ECRIT quand il le voit au lieu de rougir : c est la jambe
 * 2 qui attrape ce cas-la. Refermer ce fosse-la demanderait de toucher `TAILLES_TITRE`
 * (relever le plus petit palier), c est-a-dire la mise en page du gabarit — un arbitrage,
 * pas un reglage.
 * ------------------------------------------------------------------------------------
 *
 * CE QU IL NE PROUVE PAS. Le rendu sans fonte est celui de la pile graphique de LA
 * MACHINE qui execute le script ; la taille du rectangle de remplacement peut differer
 * sous une autre pile. Le script mesure donc ce plafond a chaque execution plutot que de
 * le supposer — c est ce que fait le verdict ci-dessous.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { dispositionOg, svgOg, TAILLES_TITRE } from '../src/lib/seo/gabarit-og.ts';
import {
  HAUTEUR_MINIMALE_GLYPHES,
  SONDE_RATIO_MINIMAL,
  mesurerBandeTitre,
  sonderRasteriseur,
  verdictSonde,
} from './verifier-seo.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Nombre de tirages de la population VIDE.
 *
 * Un seul tirage par cas etait le defaut du 2026-08-11 : la population vide n est pas
 * deterministe, et le maximum d un echantillon de sept est lui-meme aleatoire. 25 tirages
 * du corpus entier coutent environ 3 s sur le runner, pour 175 mesures au lieu de 7.
 */
export const TIRAGES_SANS_FONTE = 25;

/**
 * Nombre de tirages de la population PLEINE.
 *
 * Elle est deterministe sur les machines mesurees (10 executions identiques au pixel pres,
 * poste Windows comme runner GitHub) — on la tire quand meme plusieurs fois plutot que de
 * le supposer, et on retient le plancher sur l ensemble.
 */
export const TIRAGES_AVEC_FONTES = 3;

/**
 * Le seuil doit se tenir au moins `FOSSE_PLEIN` pixels sous le plancher du plein.
 *
 * Deux pixels, et c est exactement la marge dont on dispose aujourd hui (plancher 22 px
 * sur le runner, seuil 20 px). Elle est mince, et ce script l imprime a chaque execution
 * plutot que de la laisser dans un commentaire : c est elle qui se refermera en premier
 * si un palier plus petit entre dans `TAILLES_TITRE`.
 */
export const FOSSE_PLEIN = 2;

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

/**
 * Reduit une serie de tirages du corpus a ce sur quoi le verdict porte.
 *
 * PURE, ET EXPORTEE POUR ETRE TESTEE. C est ici que vivait le defaut : le plafond doit se
 * prendre sur TOUS les tirages, pas sur le premier. `tests/preuve-encre-og.test.ts` exerce
 * exactement ce point avec un tirage a 21 px en deuxieme position.
 *
 * @param {Array<Array<{nom: string, taille: number, lignes: number, hauteur: number, ecartType: number}>>} tirages
 */
export function agregerTirages(tirages) {
  if (tirages.length === 0) {
    throw new Error('aucun tirage a agreger : un plafond de zero se confondrait avec un vide mesure');
  }
  const cas = tirages[0].map((premier) => ({
    nom: premier.nom,
    taille: premier.taille,
    lignes: premier.lignes,
    distribution: new Map(),
    max: -Infinity,
    min: Infinity,
    ecartTypeMax: -Infinity,
    ecartTypeMin: Infinity,
  }));

  for (const tirage of tirages) {
    tirage.forEach((mesure, index) => {
      const agrege = cas[index];
      agrege.distribution.set(mesure.hauteur, (agrege.distribution.get(mesure.hauteur) ?? 0) + 1);
      if (mesure.hauteur > agrege.max) agrege.max = mesure.hauteur;
      if (mesure.hauteur < agrege.min) agrege.min = mesure.hauteur;
      if (mesure.ecartType > agrege.ecartTypeMax) agrege.ecartTypeMax = mesure.ecartType;
      if (mesure.ecartType < agrege.ecartTypeMin) agrege.ecartTypeMin = mesure.ecartType;
    });
  }

  return {
    tirages: tirages.length,
    cas,
    plafond: Math.max(...cas.map((agrege) => agrege.max)),
    plancher: Math.min(...cas.map((agrege) => agrege.min)),
    ecartTypeMax: Math.max(...cas.map((agrege) => agrege.ecartTypeMax)),
    ecartTypeMin: Math.min(...cas.map((agrege) => agrege.ecartTypeMin)),
  };
}

/**
 * LA question, posee tirage par tirage : la garde attraperait-elle CE build sans fonte ?
 *
 * PURE, ET EXPORTEE POUR ETRE TESTEE. C est la reformulation qui rend le verdict stable.
 * L ancienne version comparait le PLAFOND d un echantillon de sept a une constante — un
 * maximum d echantillon est lui-meme aleatoire. Celle-ci exerce le predicat REEL de la
 * garde sur chaque tirage : elle attrape si l une de ses deux jambes rougit, c est-a-dire
 * si la sonde du rasteriseur rougit OU si une seule image tombe sous le seuil (une seule
 * suffit : le build sort alors en code non nul et rien n est publie).
 */
export function gardeAttrape({ hauteurs, sonde }, seuil) {
  if (verdictSonde(sonde).length > 0) return true;
  return hauteurs.some((hauteur) => hauteur < seuil);
}

/**
 * Le plancher de la population PLEINE reste-t-il au-dessus du seuil, avec sa marge ?
 *
 * Ce cote-la EST deterministe (mesure : 3 tirages identiques au pixel pres, poste Windows
 * comme runner). Une marge y a donc un sens, la ou elle n en avait aucun cote vide.
 */
export function verdictPlein({ plancherPlein, seuil }) {
  if (plancherPlein - seuil >= FOSSE_PLEIN) return { ok: true, echecs: [] };
  const sous = plancherPlein < seuil;
  return {
    ok: false,
    echecs: [
      `avec fontes, un cas legitime tombe a ${plancherPlein} px : ` +
        (sous
          ? 'il ferait rougir la garde a tort'
          : `il n est plus qu a ${plancherPlein - seuil} px au-dessus du seuil ${seuil}, ` +
            `sous le fosse exige de ${FOSSE_PLEIN} px — il ferait bientot rougir la garde a tort`),
    ],
  };
}

/**
 * Le rapport de la sonde separe-t-il encore les deux populations, avec son fosse ?
 *
 * C est la jambe sur laquelle le verdict tient : le rapport ne depend pas de la TAILLE du
 * tofu, seulement du fait qu il ne grandit pas avec le corps.
 */
export function verdictFosseSonde({ ratioVideMax, ratioPleinMin, seuilRatio }) {
  const echecs = [];
  if (ratioVideMax >= seuilRatio) {
    echecs.push(
      `sans fonte, la sonde monte a un rapport de ${ratioVideMax.toFixed(2)} : elle franchit le ` +
        `minimum exige de ${seuilRatio} et laisserait passer un build sans fonte`,
    );
  }
  if (ratioPleinMin < seuilRatio) {
    echecs.push(
      `avec fontes, la sonde descend a un rapport de ${ratioPleinMin.toFixed(2)}, sous le minimum ` +
        `exige de ${seuilRatio} : elle ferait rougir la garde a tort`,
    );
  }
  return { ok: echecs.length === 0, echecs };
}

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
  return { mesures, sonde: await sonderRasteriseur() };
}

/**
 * Relance ce script dans un processus fils prive de toute fonte.
 *
 * `FONTCONFIG_PATH` designe le repertoire ou fontconfig cherche `fonts.conf` ; on lui en
 * donne un qui ne declare AUCUN `<dir>`. Le processus fils ne peut donc resoudre aucune
 * famille, quelle que soit la pile de polices demandee par le gabarit.
 *
 * Le dossier est NEUF a chaque tirage : un cache fontconfig partage entre les tirages
 * ferait varier le premier d entre eux et rendrait la serie inexploitable.
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

/** La distribution d un cas, sous la forme « 0px x9 12px x24 13px x7 ». */
function distributionLisible(distribution) {
  return [...distribution.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hauteur, compte]) => `${hauteur}px x${compte}`)
    .join(' ');
}

function tableau(titre, agrege) {
  console.log(`\n${titre} — ${agrege.tirages} tirage(s) du corpus`);
  console.log('  corps  lignes  hauteur  distribution des hauteurs        cas');
  for (const cas of agrege.cas) {
    const plage = cas.min === cas.max ? `${cas.max}` : `${cas.min}-${cas.max}`;
    console.log(
      `  ${String(cas.taille).padStart(5)}  ${String(cas.lignes).padStart(6)}  ${plage.padStart(7)}  ` +
        `${distributionLisible(cas.distribution).padEnd(31)}  ${cas.nom}`,
    );
  }
}

function nombreDeTirages(defaut, argv) {
  const drapeau = argv.find((argument) => argument.startsWith('--tirages='));
  if (drapeau === undefined) return defaut;
  const valeur = Number.parseInt(drapeau.slice('--tirages='.length), 10);
  if (!Number.isInteger(valeur) || valeur < 1) {
    console.error(`✖ --tirages attend un entier positif, recu « ${drapeau} »`);
    process.exit(2);
  }
  return valeur;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--mesures-json')) {
    // Mode processus fils : on ne rend que les mesures, sur la sortie standard.
    process.stdout.write(JSON.stringify(await mesurerLeCorpus()));
  } else {
    const tiragesVide = nombreDeTirages(TIRAGES_SANS_FONTE, process.argv);

    const avec = [];
    for (let tour = 0; tour < TIRAGES_AVEC_FONTES; tour += 1) avec.push(await mesurerLeCorpus());
    const sans = [];
    for (let tour = 0; tour < tiragesVide; tour += 1) sans.push(await mesurerSansFonte());

    const plein = agregerTirages(avec.map((tour) => tour.mesures));
    const vide = agregerTirages(sans.map((tour) => tour.mesures));

    tableau('AVEC les fontes de la machine', plein);
    tableau('SANS aucune fonte (FONTCONFIG_PATH sur une configuration vide)', vide);

    const plafondVide = vide.plafond;
    const plancherPlein = plein.plancher;
    const ratios = (tours) => tours.map((tour) => (tour.sonde === null ? 0 : tour.sonde.ratio));
    const ratioVideMax = Math.max(...ratios(sans));
    const ratioPleinMin = Math.min(...ratios(avec));

    console.log(
      `\nJAMBE 1 — HAUTEUR ABSOLUE   plafond du vide ${plafondVide} px | seuil ${HAUTEUR_MINIMALE_GLYPHES} px | ` +
        `plancher du plein ${plancherPlein} px` +
        `\n                            (le plus petit palier de corps du gabarit est ${Math.min(...TAILLES_TITRE)} px)`,
    );
    console.log(
      `JAMBE 2 — SONDE, RAPPORT    plafond du vide ${ratioVideMax.toFixed(2)} | minimum exige ` +
        `${SONDE_RATIO_MINIMAL} | plancher du plein ${ratioPleinMin.toFixed(2)}`,
    );
    console.log(
      `ECART-TYPE                  plafond du vide ${vide.ecartTypeMax.toFixed(2)} | ` +
        `plancher du plein ${plein.ecartTypeMin.toFixed(2)}` +
        (vide.ecartTypeMax >= plein.ecartTypeMin
          ? '  <- SE CHEVAUCHENT : aucun seuil sur cette grandeur ne les separe'
          : ''),
    );
    if (plein.cas.some((cas) => cas.min !== cas.max)) {
      console.log(
        'NOTE                        la population PLEINE a varie d un tirage a l autre — elle etait ' +
          'deterministe sur les machines mesurees le 2026-08-11.',
      );
    }
    if (plafondVide >= HAUTEUR_MINIMALE_GLYPHES) {
      console.log(
        `NOTE                        la jambe 1 est FRANCHIE a ${plafondVide} px sur cette serie ` +
          '(c etait deja le cas a 21 px le 2026-08-11) : c est la jambe 2 qui attrape.',
      );
    }

    /* Le verdict porte sur la garde ENTIERE, tirage par tirage — pas sur le plafond d un
       echantillon. C est ce qui le rend stable : la jambe 2 attrape chaque tirage sans
       fonte quelle que soit la taille du tofu de ce processus-la. */
    const echappes = sans
      .map((tour, index) => ({ index, ...tour }))
      .filter(
        (tour) =>
          !gardeAttrape(
            { hauteurs: tour.mesures.map((mesure) => mesure.hauteur), sonde: tour.sonde },
            HAUTEUR_MINIMALE_GLYPHES,
          ),
      );

    const echecs = [
      ...echappes.map(
        (tour) =>
          `tirage sans fonte n°${tour.index + 1} NON ATTRAPE : hauteurs ` +
          `${tour.mesures.map((mesure) => mesure.hauteur).join('/')} px, sonde ` +
          `${tour.sonde === null ? 'illisible' : tour.sonde.ratio.toFixed(2)}`,
      ),
      ...verdictFosseSonde({ ratioVideMax, ratioPleinMin, seuilRatio: SONDE_RATIO_MINIMAL }).echecs,
      ...verdictPlein({ plancherPlein, seuil: HAUTEUR_MINIMALE_GLYPHES }).echecs,
    ];

    if (echecs.length > 0) {
      console.error('\n✖ la garde ne separe plus les deux populations :');
      for (const echec of echecs) console.error(`  - ${echec}`);
      process.exit(1);
    }
    console.log(
      `\n✔ ${CORPUS.length} cas, ${TIRAGES_AVEC_FONTES} tirage(s) avec fontes et ${tiragesVide} sans : ` +
        `les ${tiragesVide} tirages sans fonte sont TOUS attrapes, la sonde separe ` +
        `${ratioVideMax.toFixed(2)} (vide) de ${ratioPleinMin.toFixed(2)} (plein), et le plancher du plein ` +
        `(${plancherPlein} px) reste a ${plancherPlein - HAUTEUR_MINIMALE_GLYPHES} px du seuil.`,
    );
  }
}
