/**
 * UN MEDIA REDESSINE SOUS LE MEME NOM DOIT REMPLACER CELUI DE LA MEDIATHEQUE.
 *
 * LE DEFAUT, MESURE LE 2026-08-16 SUR LA PRODUCTION (tache `9faa4193`). Les quinze
 * fac-similes redessines etaient dans `main` depuis le 2026-08-14, CI verte, et
 * AUCUN n etait servi en ligne. Le seed avait pourtant tourne : il rend
 * « creations : 0 — mises a jour : 5 — inchanges : 257 », et les quinze sont dans
 * les 257.
 *
 * POURQUOI. Le rapprochement des medias se fait sur le NOM DE FICHIER. Retrouve, le
 * media voit ses METADONNEES comparees — `alternativeText` et `caption` — et rien
 * d autre. Les OCTETS ne sont jamais compares, donc jamais remplaces : un fichier
 * televerse une fois reste celui-la pour toujours, quoi qu on redessine dans le
 * depot. C est le meme angle mort que celui corrige le 2026-08-10 sur les legendes,
 * un cran plus bas — on avait alors ouvert la comparaison aux metadonnees, pas au
 * contenu.
 *
 * CE QUE LE DEFAUT COUTE, et pourquoi il ne se voit pas. Rien ne rougit : le seed
 * dit « inchange », la CI est verte, le site se reconstruit, et il sert l ancien
 * dessin. Le travail dort dans le depot avec tous les signaux au vert par-dessus —
 * exactement la forme d echec que ce projet traque, le succes declare qui ment.
 *
 * CE QUI EST COMPARE, ET POURQUOI PAS LA TAILLE. Les octets, entiers. Deux dessins
 * peuvent avoir la meme taille a l octet pres sans etre le meme dessin, et l API ne
 * publie aucune empreinte du CONTENU : le `hash` de Strapi est le nom hache a
 * l upload, pas une somme du fichier. Comparer la taille laisserait une classe de
 * changements invisible, et c est precisement l invisibilite qu on ferme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus, type Corpus } from '../scripts/seed/corpus.ts';
import { executerSeed } from '../scripts/seed/seed.ts';
import { FauxStrapi } from './fixtures/faux-strapi.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

const uploads = (faux: FauxStrapi) => faux.journal.filter((l) => l.startsWith('upload')).length;
const remplacements = (faux: FauxStrapi) => faux.journal.filter((l) => l.startsWith('octets')).length;

test('un media dont les OCTETS ont change est REMPLACE, pas declare inchange', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  /* L etat exact de la production le 2026-08-16 : le fichier est en place sous le bon
     nom, avec les bonnes metadonnees, et ses octets sont ceux d AVANT le redessin. */
  const redessine = corpus.medias.find((m) => m.cle === 'blocs/A23-registre.svg')!;
  const enBase = faux.medias.get(redessine.nom)!;
  enBase.octets = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><!-- gabarit --></svg>');

  const avantUploads = uploads(faux);
  await executerSeed(faux, corpus);

  assert.equal(
    remplacements(faux),
    1,
    'le media redessine doit voir ses octets REMPLACES — sans quoi le site sert l ancien dessin'
  );
  assert.equal(
    uploads(faux),
    avantUploads,
    'remplacer n est pas televerser : le media garde son id, donc les entrees qui le citent'
  );
  assert.deepEqual(
    faux.medias.get(redessine.nom)!.octets,
    fs.readFileSync(path.join(DATA_REEL, 'medias', redessine.cle)),
    'les octets en base doivent etre EXACTEMENT ceux du depot'
  );
});

test('le remplacement des octets ne touche NI l id NI les metadonnees', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const redessine = corpus.medias.find((m) => m.cle === 'blocs/A23-registre.svg')!;
  const enBase = faux.medias.get(redessine.nom)!;
  const idAvant = enBase.id;
  enBase.octets = Buffer.from('<svg/>');

  await executerSeed(faux, corpus);

  const apres = faux.medias.get(redessine.nom)!;
  assert.equal(apres.id, idAvant, 'un id qui change casserait toutes les entrees qui pointent ce media');
  assert.equal(apres.alternativeText, redessine.alternativeText);
  assert.equal(apres.caption, redessine.caption);
});

test('A CORPUS INCHANGE, aucun media n est remplace — la comparaison ne declenche pas a vide', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const avant = remplacements(faux);
  await executerSeed(faux, corpus);

  assert.equal(
    remplacements(faux),
    avant,
    'un second passage sur un corpus identique ne doit remplacer AUCUN fichier'
  );
});

test('le remplacement compte comme une MISE A JOUR, pas comme un inchange', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const redessine = corpus.medias.find((m) => m.cle === 'blocs/A23-registre.svg')!;
  faux.medias.get(redessine.nom)!.octets = Buffer.from('<svg/>');

  const rapport = await executerSeed(faux, corpus);

  /* Le comptage est le SEUL retour que lit celui qui seede. S il annonce « inchange »
     sur un fichier qu il vient de remplacer, il ment dans le sens le plus couteux :
     on croit n avoir rien fait alors qu on a publie. */
  assert.ok(
    (rapport.misAJour?.media ?? 0) >= 1,
    'le rapport doit compter le remplacement parmi les mises a jour'
  );
});

/* ------------------------------------------------------------------ */
/* `formats` N EST PAS LE SIGNAL — IL NE L A JAMAIS ETE                 */
/*                                                                      */
/* CE QUI ETAIT EN PLACE JUSQU AU 2026-08-19. Le seed exemptait de la    */
/* comparaison d octets toute fiche portant des formats derives :        */
/* « la mediatheque retraite ce fichier, ses octets ne sont pas          */
/* comparables ». C etait vrai tant que `sizeOptimization` valait `true` */
/* — `partage-defaut.png` pesait 21 660 octets ici et 6 835 servis.      */
/*                                                                      */
/* CE QUE LE REGLAGE DU 2026-08-16 A CHANGE (tache `e1f8115c`).          */
/* `src/reglages-medias.ts` pose `sizeOptimization:false` ET             */
/* `autoOrientation:false` a chaque demarrage. La branche                */
/* `if ((sizeOptimization || autoOrientation) && isOptimizableFormat())` */
/* d `image-manipulation.js` (l. 121) est alors SAUTEE : le fichier n    */
/* entre jamais dans sharp, et les octets stockes sont CEUX DU DEPOT.    */
/* La comparaison d octets redevient donc valable pour TOUS les medias,  */
/* matriciels compris — l exemption n a plus d objet.                    */
/*                                                                      */
/* POURQUOI ON NE SE CONTENTE PAS D INVERSER LA LECTURE DU SIGNAL. La    */
/* correction evidente etait de lire « fiche AVEC formats + reglage a    */
/* false = RELIQUAT, donc remplacer ». Elle est FAUSSE, et le mode d     */
/* echec est celui que l exemption evitait : `generateThumbnail` n est   */
/* gardee par AUCUN reglage (upload.js l. 222 ; image-manipulation.js    */
/* l. 104-111). Elle ne depend que du format et de la taille —           */
/* `width > 245 || height > 156`. Les deux PNG du corpus font 1200x630 : */
/* leur fiche portera `formats.thumbnail` APRES CHAQUE REMPLACEMENT.     */
/* Une garde qui lit « formats non vide » comme un reliquat les          */
/* remplacerait donc a chaque passage, indefiniment.                     */
/*                                                                      */
/* CE QUI REMPLACE LE PROXY. Rien : on compare les octets du fichier     */
/* PRINCIPAL, toujours, et on CONSTATE la convergence apres avoir        */
/* remplace. Un fichier qui ne converge pas est NOMME au journal —       */
/* c est le seul cas ou la mediatheque retraite encore, et il se voit.   */
/* Ce faisant, le trou du proxy se referme aussi dans l autre sens : une */
/* image plus petite que tous les points de rupture n obtient AUCUN      */
/* format derive et etait donc jugee « comparable » alors qu elle avait  */
/* pu etre recompressee. Elle n a plus de statut a part.                 */
/* ------------------------------------------------------------------ */

const PNG = (corpus: Corpus) => corpus.medias.find((m) => m.nom.endsWith('.png'))!;

test('une fiche qui porte des formats derives est COMPAREE, plus exemptee', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  /* L etat exact des deux PNG sur l instance : octets de l ancien reglage (recompresses),
     et les quatre formats derives poses a l upload d avant le 2026-08-16. */
  const matriciel = PNG(corpus);
  const enBase = faux.medias.get(matriciel.nom)!;
  enBase.octets = Buffer.from('octets RECOMPRESSES par le reglage d avant');
  enBase.formats = { thumbnail: {}, small: {}, medium: {}, large: {} };

  const avant = remplacements(faux);
  await executerSeed(faux, corpus);

  assert.equal(
    remplacements(faux),
    avant + 1,
    'la fiche portait des formats : elle etait exemptee A VIE, et ce sont les deux cartes de partage — ' +
      'exactement les fichiers qu on retouche quand un chiffre change'
  );
  assert.deepEqual(
    faux.medias.get(matriciel.nom)!.octets,
    fs.readFileSync(matriciel.chemin),
    'les octets servis doivent etre EXACTEMENT ceux du depot'
  );
});

test('DEUX PASSAGES CONSECUTIFS — le remplacement ne se rejoue pas, vignette regeneree comprise', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const matriciel = PNG(corpus);
  faux.medias.get(matriciel.nom)!.octets = Buffer.from('octets de l ancien reglage');

  const depart = remplacements(faux);
  await executerSeed(faux, corpus);
  const apresPremier = remplacements(faux);
  await executerSeed(faux, corpus);
  const apresSecond = remplacements(faux);

  assert.equal(apresPremier, depart + 1, 'le premier passage doit remplacer le fichier reliquat');
  assert.equal(
    apresSecond,
    apresPremier,
    'LE SECOND PASSAGE NE DOIT RIEN REMPLACER. C est le mode d echec que l exemption evitait : ' +
      'une garde qui lirait « formats non vide = reliquat » rejouerait le remplacement a l infini, ' +
      'puisque la vignette est REGENEREE a chaque remplacement'
  );
  assert.ok(
    Object.keys(faux.medias.get(matriciel.nom)!.formats ?? {}).length > 0,
    'et la fiche porte TOUJOURS un format derive apres remplacement — sans quoi ce test ne prouverait rien'
  );
});

test('un media SANS aucun format retombe sur la comparaison d octets', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  /* Le cas du SVG, et celui de l image plus petite que tous les points de rupture. */
  const vectoriel = corpus.medias.find((m) => m.nom.endsWith('.svg'))!;
  const enBase = faux.medias.get(vectoriel.nom)!;
  assert.deepEqual(enBase.formats, {}, 'la mediatheque ne pose aucun format sur un SVG');
  enBase.octets = Buffer.from('<svg/>');

  const avant = remplacements(faux);
  await executerSeed(faux, corpus);

  assert.equal(remplacements(faux), avant + 1);
});

test('PREUVE EN CASSANT — un fichier qui NE CONVERGE PAS est NOMME, pas remplace en silence', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  /* L instance dont les reglages ont derive : `sizeOptimization` repasse a `true`, la
     mediatheque re-encode, et AUCUN passage ne peut converger. Sans cette ligne de journal,
     le seed remplacerait les memes fichiers a chaque passage sans que rien ne le dise —
     le comptage annoncerait « mises a jour : 2 » pour un corpus que personne n a touche. */
  faux.recompresse = true;
  faux.medias.get(PNG(corpus).nom)!.octets = Buffer.from('octets qui ne sont pas ceux du depot');

  const lignes: string[] = [];
  await executerSeed(faux, corpus, (l) => lignes.push(l));

  assert.ok(
    lignes.some((l) => l.includes(PNG(corpus).cle) && /converg/i.test(l)),
    'le seed doit DIRE que ce fichier ne converge pas — sinon le remplacement se rejoue en silence'
  );
});

test('et il se TAIT quand la convergence est atteinte — les deux etats ne rendent pas la meme sortie', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  faux.medias.get(PNG(corpus).nom)!.octets = Buffer.from('octets de l ancien reglage');

  const lignes: string[] = [];
  await executerSeed(faux, corpus, (l) => lignes.push(l));

  assert.ok(
    lignes.some((l) => l.includes(PNG(corpus).cle) && /REDESSINE/.test(l)),
    'le remplacement lui-meme doit rester journalise'
  );
  assert.equal(
    lignes.filter((l) => /converg/i.test(l)).length,
    0,
    'une alerte de non-convergence sur un fichier qui a converge rendrait l alerte illisible'
  );
});
