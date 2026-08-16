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

import { chargerCorpus } from '../scripts/seed/corpus.ts';
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
