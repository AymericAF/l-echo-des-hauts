/**
 * Deux executions consecutives ne doublent rien.
 *
 * Le test tourne sur le CORPUS REEL du depot, contre un faux client Strapi
 * qui imite le modele documentaire de Strapi 5 (un documentId, une entree par
 * locale). Il ne remplace pas la preuve contre une vraie instance — il la
 * precede, et il tourne partout, sans reseau.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { executerSeed } from '../scripts/seed/seed.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DATA_REEL = path.join(ICI, '..', 'data');

import { FauxStrapi } from './fixtures/faux-strapi.ts';


/* ------------------------------------------------------------------ */

test('deux executions consecutives : la seconde ne cree rien et le comptage ne bouge pas', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();

  const premier = await executerSeed(faux, corpus);
  const comptage1 = faux.comptageTotal();

  const second = await executerSeed(faux, corpus);
  const comptage2 = faux.comptageTotal();

  // Le premier passage cree ; le second ne cree rien du tout.
  assert.ok(
    Object.values(premier.crees).some((n) => n > 0),
    'la premiere execution doit creer quelque chose'
  );
  assert.deepEqual(
    Object.entries(second.crees).filter(([, n]) => n > 0),
    [],
    'la seconde execution ne doit rien creer'
  );
  assert.deepEqual(comptage2, comptage1, 'le comptage doit etre identique entre les deux passages');
});

test('la seconde execution ne reteleverse aucun media', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();

  await executerSeed(faux, corpus);
  const uploads1 = faux.journal.filter((l) => l.startsWith('upload')).length;
  await executerSeed(faux, corpus);
  const uploads2 = faux.journal.filter((l) => l.startsWith('upload')).length;

  assert.ok(uploads1 > 0, 'le premier passage doit televerser');
  assert.equal(uploads2, uploads1, 'le second passage ne doit televerser aucun fichier de plus');
});

test('le seed ecrit une localisation EN pour chaque entite qui en porte une au corpus', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const compterLocale = (plural: string, locale: string) => {
    let n = 0;
    for (const locales of faux.documents.get(plural)?.values() ?? []) if (locales.has(locale)) n++;
    return n;
  };

  assert.equal(compterLocale('categories', 'en'), 6);
  assert.equal(compterLocale('tags', 'en'), 20);
  assert.equal(compterLocale('dossiers', 'en'), 2);
  assert.equal(compterLocale('auteurs', 'en'), 5);
  assert.equal(compterLocale('articles', 'en'), 8);
});

test('les relations d un article EN sont ecrites sur la localisation EN, pas sur la FR', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  for (const locales of faux.documents.get('articles')!.values()) {
    const en = locales.get('en');
    if (!en) continue;
    assert.ok(en.auteur, 'l article EN doit porter un auteur (requis)');
    assert.ok(en.categorie, 'l article EN doit porter une categorie (requise)');
  }
});

/* ------------------------------------------------------------------ */
/* La LIGNE DE CREDIT d'un media DEJA televerse                         */
/*                                                                      */
/* Le rapprochement se fait sur le nom de fichier, et se contentait de   */
/* retenir l'id : un media deja present gardait SES metadonnees, pour    */
/* toujours. Corriger le manifeste ne changeait donc RIEN a ce qui est   */
/* publie — et c'est precisement le cas ou l'on corrige : les legendes   */
/* ne creditaient rien, et elles etaient deja dans la mediatheque.       */
/* ------------------------------------------------------------------ */

test('un media deja televerse voit sa ligne de credit REMISE A JOUR', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  // On simule l'etat constate le 2026-08-10 : le fichier est en place, mais sa
  // legende ne credite rien.
  const portrait = corpus.medias.find((m) => m.cle === 'auteurs/camille-fournier-braud.svg')!;
  const enBase = faux.medias.get(portrait.nom)!;
  enBase.caption = "Portrait graphique genere ; aucune personne reelle n'est representee";
  enBase.alternativeText = 'perime';

  const avant = faux.journal.filter((l) => l.startsWith('upload')).length;
  await executerSeed(faux, corpus);

  assert.equal(
    faux.journal.filter((l) => l.startsWith('upload')).length,
    avant,
    'la remise a jour ne doit pas reteleverser le fichier'
  );
  assert.equal(faux.medias.get(portrait.nom)!.caption, portrait.caption);
  assert.equal(faux.medias.get(portrait.nom)!.alternativeText, portrait.alternativeText);
});

/* ------------------------------------------------------------------ */
/* AUCUNE ECRITURE A CORPUS INCHANGE                                    */
/*                                                                      */
/* « Ne rien creer » ne suffit pas : le seed REECRIVAIT les 40 articles  */
/* FR, les 8 EN et les 21 liens avec `?status=published`, et Strapi 5    */
/* REPUBLIE un document meme quand rien ne change. Chaque republication  */
/* tire le webhook `publish_to_coolify`, donc un deploiement — 26 en     */
/* serie le 2026-08-10. L'assertion porte donc sur les ECRITURES EMISES, */
/* pas sur le comptage en base, qui ne bougeait deja pas.                */
/* ------------------------------------------------------------------ */

const ecrituresSur = (faux: FauxStrapi, plural: string) =>
  faux.journal.filter((l) => l.startsWith(`creer ${plural} `) || l.startsWith(`majr ${plural} `));

test('la seconde execution n emet AUCUNE ecriture sur les articles', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();

  await executerSeed(faux, corpus);
  const apresPremier = ecrituresSur(faux, 'articles').length;
  assert.ok(apresPremier > 0, 'le premier passage doit ecrire des articles');

  await executerSeed(faux, corpus);
  assert.deepEqual(
    ecrituresSur(faux, 'articles').slice(apresPremier),
    [],
    'la seconde execution ne doit emettre ni creer ni mettreAJour sur articles'
  );
});

test('la seconde execution n emet aucune ecriture, sur AUCUNE famille', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();

  await executerSeed(faux, corpus);
  const avant = faux.journal.length;
  const second = await executerSeed(faux, corpus);

  assert.deepEqual(faux.journal.slice(avant), [], 'aucune ecriture au second passage');
  assert.ok(
    Object.values(second.inchanges).reduce((a, b) => a + b, 0) > 0,
    'les entrees sautees doivent etre comptees en « inchanges »'
  );
  assert.deepEqual(
    Object.entries(second.misAJour).filter(([, n]) => n > 0),
    [],
    'une ecriture SAUTEE ne se compte pas en mise a jour — sinon le comptage ment'
  );
});

/* ------------------------------------------------------------------ */
/* ... ET UNE ECRITURE REELLEMENT NECESSAIRE PART TOUJOURS              */
/*                                                                      */
/* Sans ce second cas, le precedent serait satisfait par un seed qui     */
/* n'ecrit plus rien du tout.                                           */
/* ------------------------------------------------------------------ */

test('un article dont le TITRE change au corpus est bien reecrit', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const cible = corpus.articles[0];
  cible.fr.titre = `${cible.fr.titre} (revu)`;

  const avant = ecrituresSur(faux, 'articles').length;
  await executerSeed(faux, corpus);
  const nouvelles = ecrituresSur(faux, 'articles').slice(avant);

  assert.deepEqual(
    nouvelles,
    [`majr articles fr ${cible.fr.slug}`],
    'seul l article modifie doit etre reecrit'
  );
});

test('un article dont une RELATION change au corpus est bien reecrit', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const cible = corpus.articles.find(
    (a) => a.fr.categorie !== corpus.categories[0].fr.slug
  )!;
  cible.fr.categorie = corpus.categories[0].fr.slug;

  const avant = ecrituresSur(faux, 'articles').length;
  await executerSeed(faux, corpus);

  assert.deepEqual(
    ecrituresSur(faux, 'articles').slice(avant),
    [`majr articles fr ${cible.fr.slug}`],
    'un changement de rubrique doit repartir en ecriture'
  );
});

test('un article dont le CONTENU change au corpus est bien reecrit', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const cible = corpus.articles.find((a) =>
    a.fr.contenu.some((b) => b.__component === 'bloc.texte')
  )!;
  const bloc = cible.fr.contenu.find((b) => b.__component === 'bloc.texte')!;
  bloc.contenu = [{ type: 'paragraph', children: [{ type: 'text', text: 'Ajout tardif.' }] }];

  const avant = ecrituresSur(faux, 'articles').length;
  await executerSeed(faux, corpus);

  assert.deepEqual(
    ecrituresSur(faux, 'articles').slice(avant),
    [`majr articles fr ${cible.fr.slug}`],
    'un changement dans la zone dynamique doit repartir en ecriture'
  );
});

test('une entree dont la localisation EN manque encore est bien ecrite', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  // On efface la localisation EN d une categorie : le passage suivant doit la
  // recreer, et surtout ne pas la « sauter » au motif que le document existe.
  const cible = corpus.categories.find((c) => c.en)!;
  for (const locales of faux.documents.get('categories')!.values()) {
    if (locales.get('en')?.slug === cible.en!.slug) locales.delete('en');
  }

  const avant = ecrituresSur(faux, 'categories').length;
  await executerSeed(faux, corpus);

  assert.deepEqual(
    ecrituresSur(faux, 'categories').slice(avant),
    [`majr categories en ${cible.en!.slug}`],
    'la localisation EN absente doit etre reecrite'
  );
});

test('un media deja conforme n est PAS reecrit — la remise a jour reste idempotente', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const faux = new FauxStrapi();
  await executerSeed(faux, corpus);

  const avant = faux.journal.filter((l) => l.startsWith('infos')).length;
  await executerSeed(faux, corpus);
  assert.equal(
    faux.journal.filter((l) => l.startsWith('infos')).length,
    avant,
    'aucune ecriture de metadonnees quand rien ne differe'
  );
});
