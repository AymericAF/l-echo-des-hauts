/**
 * LES ALTERNATIVES FRANCAISES DU MANIFESTE PORTENT LEURS ACCENTS.
 *
 * CE QUE CE FICHIER PROTEGE, et pourquoi il ne ressemble a aucune autre garde
 * du depot. L `alternativeText` n est pas une chaine interne : c est ce qu une
 * SYNTHESE VOCALE PRONONCE a la place de l image. Un lecteur d ecran ne lit pas
 * un mot, il lit des lettres et des accents — « le debit de la source » et « le
 * debit » sans accent ne sortent pas du meme moteur, et « capacite residuelle »
 * nu s articule autrement que « capacite residuelle » accentue. Le defaut ne se
 * voit donc PAS a l ecran : il s ENTEND, et seulement chez les personnes qui
 * n ont que ce canal. C est exactement la classe de defaut qu aucune relecture
 * visuelle n attrape.
 *
 * POURQUOI UNE LISTE EXPLICITE, ET JAMAIS UNE HEURISTIQUE. La tentation est
 * d ecrire « tout mot sans accent dont la forme accentuee existe est fautif ».
 * Elle produit des FAUX ROUGES a la chaine, parce que le francais est plein de
 * paires ou les deux orthographes sont valides et disent deux choses :
 *
 *   `ferme`  la ferme (A09, EN : « no farm in the family ») ≠ ferme (clos)
 *   `cote`   la cote de la retenue (A29, EN : « the level of the reservoir »)
 *            ≠ la cote (rivage) ≠ le cote (flanc)
 *   `figure` il figure / une figure ≠ figure (represente)
 *   `pale`   pale (couleur) ≠ la pale (d une helice)
 *   `tache`  une tache ≠ une tache (travail)
 *
 * Une garde qui trancherait ces cas a la table de substitution ecrirait des
 * CONTRESENS dans ce que la voix prononce — c est-a-dire pire que le defaut
 * qu elle corrige. Elle ne juge donc QUE des formes nues qui ne sont un mot
 * francais dans AUCUN contexte : `debit`, `annee`, `aout`, `metres`… Les paires
 * ambigues restent hors de sa portee, et c est ecrit plutot que comble
 * (`MOTS_GARDES_NUS` ci-dessous les nomme une par une, avec leur raison).
 *
 * CE QU ELLE NE JUGE PAS, ET QUE RIEN D AUTRE NE JUGE. Les mots d une seule
 * lettre ou de deux (`a`/`a`, `ou`/`ou`) ne peuvent pas entrer dans une liste :
 * les deux formes sont valides et frequentes. Leur accentuation reste une
 * decision de lecture, exercee par personne ici. Idem pour les alternatives
 * ANGLAISES (cles `*.en.*`), volontairement hors corpus : « the pale bars »
 * n a pas d accent a porter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MANIFESTE = path.join(ICI, '..', 'data', 'medias', 'manifeste.json');

/**
 * LES FORMES NUES REFUSEES — cle : la forme sans accent telle qu elle ne doit
 * jamais paraitre ; valeur : ce qu elle aurait du etre. Toutes verifiees une par
 * une : aucune n est un mot francais valide sous cette orthographe, dans aucun
 * contexte. Ajouter une entree ici est une DECISION, pas un reflexe — si les
 * deux orthographes existent, elle va dans `MOTS_GARDES_NUS`.
 */
const MOTS_DESACCENTUES = new Map<string, string>([
  ['annee', 'année'],
  ['annees', 'années'],
  ['apres', 'après'],
  ['aout', 'août'],
  ['arrivee', 'arrivée'],
  ['boites', 'boîtes'],
  ['capacite', 'capacité'],
  ['captee', 'captée'],
  ['carres', 'carrés'],
  ['chere', 'chère'],
  ['chiffrees', 'chiffrées'],
  ['cinema', 'cinéma'],
  ['cinquieme', 'cinquième'],
  ['classees', 'classées'],
  ['communaute', 'communauté'],
  ['comptabilite', 'comptabilité'],
  ['cout', 'coût'],
  ['creme', 'crème'],
  ['crete', 'crête'],
  ['culees', 'culées'],
  ['debit', 'débit'],
  ['decennie', 'décennie'],
  ['decouverte', 'découverte'],
  ['defaut', 'défaut'],
  ['deliberation', 'délibération'],
  ['denivele', 'dénivelé'],
  ['depart', 'départ'],
  ['depenses', 'dépenses'],
  ['derniere', 'dernière'],
  ['detaillee', 'détaillée'],
  ['deuxieme', 'deuxième'],
  ['echarmes', 'Écharmes'],
  ['echo', 'Écho'],
  ['ecart', 'écart'],
  ['editions', 'éditions'],
  ['eglise', 'Église'],
  ['emergence', 'émergence'],
  ['emportee', 'emportée'],
  ['entrees', 'entrées'],
  ['eoliennes', 'éoliennes'],
  ['epicea', 'épicéa'],
  ['epicerie', 'épicerie'],
  ['etable', 'étable'],
  ['etals', 'étals'],
  ['ete', 'été'],
  ['etoffe', 'étoffe'],
  ['evidee', 'évidée'],
  ['fetes', 'fêtes'],
  ['fevrier', 'février'],
  ['flechees', 'fléchées'],
  ['generaliste', 'généraliste'],
  ['gue', 'gué'],
  ['itinerant', 'itinérant'],
  ['journee', 'journée'],
  ['journees', 'journées'],
  ['kilometre', 'kilomètre'],
  ['kilometres', 'kilomètres'],
  ['medecin', 'médecin'],
  ['medical', 'médical'],
  ['meme', 'même'],
  ['metres', 'mètres'],
  ['modifies', 'modifiés'],
  ['noelle', 'Noëlle'],
  ['occupees', 'occupées'],
  ['perimetre', 'périmètre'],
  ['perimetres', 'périmètres'],
  ['pese', 'pèse'],
  ['pieces', 'pièces'],
  ['premiere', 'première'],
  ['proces', 'procès'],
  ['recu', 'reçu'],
  ['recues', 'reçues'],
  ['regle', 'règle'],
  ['reglement', 'règlement'],
  ['releve', 'relevé'],
  ['releves', 'relevés'],
  ['reliees', 'reliées'],
  ['renseignees', 'renseignées'],
  ['rentrees', 'rentrées'],
  ['renvoye', 'renvoyé'],
  ['repartition', 'répartition'],
  ['repondu', 'répondu'],
  ['residences', 'résidences'],
  ['residuelle', 'résiduelle'],
  ['sante', 'santé'],
  ['seances', 'séances'],
  ['semees', 'semées'],
  ['serie', 'série'],
  ['simile', 'similé'],
  ['sondees', 'sondées'],
  ['superposees', 'superposées'],
  ['surcout', 'surcoût'],
  ['theo', 'Théo'],
  ['tournee', 'tournée'],
  ['traversees', 'traversées'],
  ['tres', 'très'],
  ['troisieme', 'troisième'],
  ['vehicules', 'véhicules'],
  ['zero', 'zéro'],
]);

/**
 * LES MOTS QUI RESTENT NUS, ET POURQUOI — la moitie utile du dispositif. Chacun
 * a ete tranche en lisant l image et, quand elle existe, l alternative ANGLAISE
 * du meme visuel, qui est la seule source non ambigue du sens voulu. Les mettre
 * dans la liste ci-dessus ecrirait un contresens dans ce que la voix prononce.
 */
const MOTS_GARDES_NUS = new Map<string, string>([
  [
    'ferme',
    'A09 « ni ferme dans la famille » — le batiment, pas le participe. ' +
      'EN : « no farm in the family ».',
  ],
  [
    'cote',
    'A29 « la cote de la retenue » — le niveau d eau, terme hydraulique. ' +
      'EN : « the level of the Fauge reservoir ». Ni cote (rivage) ni cote (flanc).',
  ],
  [
    'figurent',
    'heros/rubrique-vies-d-ici « cinq enclos qui figurent des hameaux » — le verbe. ' +
      'EN : « five enclosures standing for hamlets ».',
  ],
  [
    'cotation',
    'A25 « cotation des six piles » — la notation d etat d ouvrage, sans accent.',
  ],
  [
    'monteclair',
    'Toponyme invente du corpus : 24 occurrences dans data/articles, toutes nues. ' +
      'L accentuer ici seul ferait diverger le manifeste du corpus.',
  ],
]);

/** Les cles ANGLAISES du manifeste — hors corpus juge, elles n ont rien a accentuer. */
function estAnglaise(cle: string): boolean {
  return /\.en\.[a-z0-9]+$/i.test(cle);
}

/**
 * Les mots d un texte, apostrophes et traits d union coupes. `A-Za-z` seul ne
 * suffirait pas : un mot DEJA accentue doit ressortir entier, sinon « débit »
 * rendrait le fragment `bit` et la garde jugerait des morceaux.
 */
function mots(texte: string): string[] {
  return texte.split(/[^A-Za-zÀ-ɏ]+/u).filter((m) => m.length > 0);
}

/** Les formes refusees d un texte, dans l ordre ou elles y paraissent. */
function formesRefusees(texte: string): { nu: string; attendu: string }[] {
  const trouves: { nu: string; attendu: string }[] = [];
  for (const mot of mots(texte)) {
    const attendu = MOTS_DESACCENTUES.get(mot.toLowerCase());
    if (attendu !== undefined) trouves.push({ nu: mot, attendu });
  }
  return trouves;
}

function lireManifeste(): Record<string, { alternativeText?: unknown }> {
  return JSON.parse(fs.readFileSync(MANIFESTE, 'utf8'));
}

test('le corpus juge n est pas vide — un manifeste illisible n est jamais un succes', () => {
  const manifeste = lireManifeste();
  const cles = Object.keys(manifeste);
  assert.ok(cles.length >= 100, `manifeste a ${cles.length} entrees : trop peu pour etre le corpus reel`);

  const francaises = cles.filter((c) => !estAnglaise(c));
  const anglaises = cles.filter(estAnglaise);
  assert.ok(francaises.length >= 80, `${francaises.length} alternatives francaises : corpus vide ou tronque`);
  assert.ok(anglaises.length >= 1, 'aucune cle anglaise : le filtre de locale ne juge plus rien');
});

test("aucune alternative francaise ne porte de mot desaccentue", () => {
  const manifeste = lireManifeste();
  const fautes: string[] = [];

  for (const [cle, meta] of Object.entries(manifeste)) {
    if (estAnglaise(cle)) continue;
    const alt = meta?.alternativeText;
    if (typeof alt !== 'string' || alt === '') continue;

    for (const { nu, attendu } of formesRefusees(alt)) {
      fautes.push(`  ${cle} : "${nu}" devrait s ecrire "${attendu}"`);
    }
  }

  assert.deepEqual(
    fautes,
    [],
    `des alternatives francaises sortent desaccentuees vers la synthese vocale :\n${fautes.join('\n')}`
  );
});

test('LE CAS QUI COMPTE — la garde sait rougir, et sait se taire', () => {
  // Sans ce temoin, une garde qui ne detecterait plus RIEN passerait au vert.
  const abime = "Le debit releve en aout, capacite residuelle du poste source";
  const refuses = formesRefusees(abime).map((f) => f.nu);
  assert.deepEqual(refuses, ['debit', 'releve', 'aout', 'capacite', 'residuelle']);

  // Et son inverse : la meme phrase accentuee ne doit rien declencher.
  const propre = 'Le débit relevé en août, capacité résiduelle du poste source';
  assert.deepEqual(formesRefusees(propre), []);
});

test("une alternative ANGLAISE n est jamais jugee", () => {
  // La forme nue `pale` d une phrase anglaise ne doit pas remonter, et une cle
  // anglaise est ecartee AVANT toute lecture de son texte.
  assert.equal(estAnglaise('couvertures/A18.en.svg'), true);
  assert.equal(estAnglaise('couvertures/A18.svg'), false);
  assert.equal(estAnglaise('blocs/A29-cote-retenue.en.svg'), true);
});

test('les mots ambigus restent HORS de la liste — un contresens vaut pire que le defaut', () => {
  for (const [mot, raison] of MOTS_GARDES_NUS) {
    assert.equal(
      MOTS_DESACCENTUES.has(mot),
      false,
      `"${mot}" a ete ajoute a la liste des formes refusees, alors qu il est garde nu : ${raison}`
    );
    assert.equal(formesRefusees(mot).length, 0, `"${mot}" est refuse alors qu il doit passer : ${raison}`);
  }
});

test('la liste des formes refusees ne porte aucune forme DEJA accentuee', () => {
  // Une cle accentuee ne matcherait jamais : elle donnerait une entree morte,
  // c est-a-dire une regle qu on croit posee et qui ne juge rien.
  for (const [nu, attendu] of MOTS_DESACCENTUES) {
    assert.equal(nu, nu.normalize('NFD').replace(/[̀-ͯ]/g, ''), `"${nu}" porte deja un accent`);
    assert.notEqual(nu, attendu.toLowerCase(), `"${nu}" ne corrige rien : la forme attendue lui est identique`);
  }
});
