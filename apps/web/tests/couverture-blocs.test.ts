/**
 * Le controle des huit types de blocs regarde-t-il TOUTES les locales, et sait-il dire
 * LAQUELLE a perdu QUEL bloc ?
 *
 * CE QUE CE FICHIER FERME. Jusqu au 2026-08-10, `scripts/preuve-rendu.mjs` listait les
 * pages article en lisant `dist/article/` — le repertoire FRANCAIS, et lui seul. Mesure
 * du meme jour sur le `dist/` de `npm run preuve:rendu` : « Pages article generees : 2 »,
 * quand la sortie en portait TROIS (`dist/en/article/…` existait et rendait bien ses huit
 * blocs). Un bloc qui aurait cesse de rendre EN ANGLAIS SEUL laissait la preuve VERTE :
 * elle regardait ailleurs. Angle mort asymetrique, meme forme que celui du pied de page
 * ferme le matin meme — un cote couvert, l autre non, et rien ne signalait la difference.
 *
 * POURQUOI LE CRITERE N EST PAS « LES MEMES HUIT DES DEUX COTES ». Le cadrage prevoit
 * moins d articles anglais que francais (§6 : 8 traductions sur 40). Un controle qui
 * exigerait l egalite des volumetries rougirait a tort en permanence, donc serait
 * desarme dans la semaine. Le critere porte sur CE QUI EXISTE dans chaque locale : pour
 * chaque article DU BANC, les blocs que le banc lui pose sont ceux que sa page rend.
 * Aucune comparaison d une locale a l autre n intervient.
 *
 * DEUX FAMILLES D ECARTS, PARCE QU ELLES N ACCUSENT PAS LE MEME COUPABLE. Un banc qui
 * n exercerait pas les huit types dans une locale ferait rougir un site sain — c est
 * `banc`, et le message le dit. Une page qui ne rend pas un bloc que le banc lui pose,
 * c est `site`. Les confondre ferait chercher un defaut la ou il n y en a pas.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SIGNATURES,
  TYPES,
  articlesDuBanc,
  inspecterBlocs,
  verdictPageComplete,
} from '../scripts/couverture-blocs.mjs';
import { ISSUES } from '../scripts/issues.mjs';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';
import { cheminArticle } from '../src/lib/routes/chemins.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(ICI, 'fixtures');

/** Une page qui rend les classes demandees, dans une enveloppe plausible. */
function page(types: string[]): string {
  const corps = types.map((type) => `<div class="${SIGNATURES[type]}">…</div>`).join('\n');
  return `<html><body><article>${corps}</article></body></html>`;
}

function article(locale: string, slug: string, blocs: string[]) {
  return { slug, route: cheminArticle(locale as never, slug), blocs };
}

/** Un lecteur de sortie fabrique : { route: html }. */
function lecteur(pages: Record<string, string>) {
  return (route: string) => pages[route] ?? null;
}

const HUIT = [...TYPES];

// ---------------------------------------------------------------------------
// 1. Les huit signatures, et l ensemble des locales
// ---------------------------------------------------------------------------

test('les huit types du §3.6 sont declares, chacun avec sa signature de classe', () => {
  assert.equal(TYPES.length, 8, `${TYPES.length} type(s) declare(s) la ou le §3.6 en compte 8`);
  assert.equal(new Set(Object.values(SIGNATURES)).size, 8, 'deux types partagent une signature');
});

test('le banc et le site designent les MEMES locales — sinon l un des deux garde le vide', () => {
  // Le garde-fou contre le retrecissement SILENCIEUX du controle. Les locales sont
  // derivees de `LOCALES_SITE` : retirer une locale de cette liste ferait cesser de
  // l inspecter sans qu aucun test ne rougisse. Les fixtures presentes sont la seconde
  // source, independante ; les confronter force une decision.
  const duBanc = fs
    .readdirSync(FIXTURES)
    .map((nom) => /^articles-([a-z-]+)\.json$/.exec(nom)?.[1])
    .filter((locale): locale is string => locale !== undefined)
    .sort();

  assert.deepEqual(
    duBanc,
    [...LOCALES_SITE].sort(),
    'les locales du site et celles du banc divergent : une locale declaree sans fixture n est ' +
      'gardee par rien, une fixture sans locale declaree ne garde rien',
  );
});

// ---------------------------------------------------------------------------
// 2. Le banc, lu dans une fixture
// ---------------------------------------------------------------------------

test('les blocs d un article se lisent dans `contenu`, dans l ordre, sans dedoublonner', () => {
  const donnees = {
    data: [
      { slug: 'a', contenu: [{ __component: 'bloc.texte' }, { __component: 'bloc.citation' }, { __component: 'bloc.texte' }] },
      { slug: 'b', contenu: [] },
      { slug: 'c' },
    ],
  };
  assert.deepEqual(articlesDuBanc('fr', donnees), [
    { slug: 'a', route: '/article/a', blocs: ['bloc.texte', 'bloc.citation', 'bloc.texte'] },
    { slug: 'b', route: '/article/b', blocs: [] },
    { slug: 'c', route: '/article/c', blocs: [] },
  ]);
});

test('la route se DERIVE de cheminArticle — le prefixe de locale n est ecrit nulle part ici', () => {
  const donnees = { data: [{ slug: 'x', contenu: [] }] };
  assert.equal(articlesDuBanc('en', donnees)[0].route, cheminArticle('en', 'x'));
  assert.equal(articlesDuBanc('fr', donnees)[0].route, cheminArticle('fr', 'x'));
});

// ---------------------------------------------------------------------------
// 3. Le cas normal : deux volumetries differentes, et rien ne rougit
// ---------------------------------------------------------------------------

test('volumetries differentes entre locales : AUCUN ecart', () => {
  const banc = {
    fr: [article('fr', 'complet', HUIT), article('fr', 'maigre', ['bloc.texte'])],
    en: [article('en', 'full', HUIT)],
  };
  const rapport = inspecterBlocs(
    banc,
    lecteur({
      '/article/complet': page(HUIT),
      '/article/maigre': page(['bloc.texte']),
      '/en/article/full': page(HUIT),
    }),
  );

  assert.deepEqual(rapport.site, []);
  assert.deepEqual(rapport.banc, []);
  assert.equal(rapport.inspectees.fr.pages, 2);
  assert.equal(rapport.inspectees.en.pages, 1);
});

test('un article sans aucun bloc n exige rien de sa page', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', HUIT), article('fr', 'vide', [])] },
    lecteur({ '/article/complet': page(HUIT), '/article/vide': page([]) }),
  );
  assert.deepEqual(rapport.site, []);
});

// ---------------------------------------------------------------------------
// 4. La regression attrapee, DANS LES DEUX SENS, en nommant la langue et le bloc
// ---------------------------------------------------------------------------

test('un bloc qui cesse de rendre EN ANGLAIS SEUL est attrape, et le message nomme la locale et le bloc', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', HUIT)], en: [article('en', 'full', HUIT)] },
    lecteur({
      '/article/complet': page(HUIT),
      '/en/article/full': page(HUIT.filter((type) => type !== 'bloc.galerie')),
    }),
  );

  assert.equal(rapport.site.length, 1, rapport.site.join(' | '));
  assert.match(rapport.site[0], /\[en\]/, 'le message ne nomme pas la locale');
  assert.match(rapport.site[0], /bloc\.galerie/, 'le message ne nomme pas le bloc');
  assert.match(rapport.site[0], /\/en\/article\/full/, 'le message ne nomme pas la page');
  assert.deepEqual(rapport.banc, [], 'le banc est complet : il ne doit pas etre accuse');
});

test('un bloc qui cesse de rendre EN FRANCAIS SEUL est attrape de la meme facon', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', HUIT)], en: [article('en', 'full', HUIT)] },
    lecteur({
      '/article/complet': page(HUIT.filter((type) => type !== 'bloc.video')),
      '/en/article/full': page(HUIT),
    }),
  );

  assert.equal(rapport.site.length, 1, rapport.site.join(' | '));
  assert.match(rapport.site[0], /\[fr\]/);
  assert.match(rapport.site[0], /bloc\.video/);
});

test('chaque bloc perdu compte pour un ecart — le message ne s arrete pas au premier', () => {
  const rapport = inspecterBlocs(
    { en: [article('en', 'full', HUIT)] },
    lecteur({ '/en/article/full': page(['bloc.texte']) }),
  );
  assert.equal(rapport.site.length, 7);
});

test('une page article absente de la sortie est un ecart du SITE, pas du banc', () => {
  const rapport = inspecterBlocs(
    { en: [article('en', 'full', HUIT)] },
    lecteur({}),
  );
  assert.equal(rapport.site.length, 1);
  assert.match(rapport.site[0], /absente de la sortie/);
  assert.match(rapport.site[0], /\[en\]/);
  assert.equal(rapport.inspectees.en.pages, 0);
});

test('un bloc rendu que le banc ne pose PAS est un ecart : le repartiteur a rendu autre chose', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', HUIT), article('fr', 'maigre', ['bloc.texte'])] },
    lecteur({ '/article/complet': page(HUIT), '/article/maigre': page(['bloc.texte', 'bloc.video']) }),
  );
  assert.equal(rapport.site.length, 1, rapport.site.join(' | '));
  assert.match(rapport.site[0], /bloc\.video/);
  assert.match(rapport.site[0], /que le banc ne pose pas/);
});

// ---------------------------------------------------------------------------
// 5. Le banc incomplet accuse LE BANC — jamais le site
// ---------------------------------------------------------------------------

test('une locale dont le banc n exerce pas les huit types accuse le BANC, et nomme les types manquants', () => {
  const partiel = HUIT.filter((type) => type !== 'bloc.chiffres-cles');
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', HUIT)], en: [article('en', 'partiel', partiel)] },
    lecteur({ '/article/complet': page(HUIT), '/en/article/partiel': page(partiel) }),
  );

  assert.deepEqual(rapport.site, [], 'le site rend tout ce que le banc pose : il ne doit pas etre accuse');
  assert.equal(rapport.banc.length, 1, rapport.banc.join(' | '));
  assert.match(rapport.banc[0], /« en »/);
  assert.match(rapport.banc[0], /bloc\.chiffres-cles/);
});

test('une locale sans fixture d articles accuse le BANC', () => {
  const rapport = inspecterBlocs({ fr: [article('fr', 'complet', HUIT)], en: null }, lecteur({ '/article/complet': page(HUIT) }));
  assert.deepEqual(rapport.site, []);
  assert.equal(rapport.banc.length, 1);
  assert.match(rapport.banc[0], /« en »/);
  assert.match(rapport.banc[0], /n est garde par rien/);
});

test('un type de bloc inconnu dans le banc accuse le BANC : sa signature manque', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', [...HUIT, 'bloc.carte'])] },
    lecteur({ '/article/complet': page(HUIT) }),
  );
  assert.equal(rapport.site.length, 0, rapport.site.join(' | '));
  assert.equal(rapport.banc.length, 1);
  assert.match(rapport.banc[0], /bloc\.carte/);
});

test('aucune locale du tout : le controle le DECLARE au lieu de rendre vert sur zero page', () => {
  const rapport = inspecterBlocs({}, lecteur({}));
  assert.equal(rapport.banc.length, 1);
  assert.match(rapport.banc[0], /aucune locale/);
});

// ---------------------------------------------------------------------------
// 6. Le banc reel exerce bien les huit types, dans CHAQUE locale
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. « Une page les rend TOUS a elle seule » — le denominateur suit le CORPUS
//
// CE QUE CETTE SECTION FERME. Le controle 13 du §11 du plan editorial (avenant A11,
// ratifie le 2026-08-14) demande qu AU MOINS UNE page article rendue affiche les types
// de blocs AYANT UN PORTEUR au corpus. Jusqu ici `pagesCompletes` comparait `rendus.size`
// a `TYPES.length` = 8, `bloc.video` compris — or ce type n a plus aucun porteur depuis
// l avenant A5. Mesure du 2026-08-14 sur l instance : « 0 page(s) rendant les 8 » alors
// que DEUX pages rendaient les 7 types disponibles. Le chiffre etait juste sur son propre
// enonce et inconciliable avec un controle vert : qui lit ce rapport pour juger le
// controle 13 conclut l inverse du vrai.
//
// POURQUOI LE DENOMINATEUR SE DERIVE, ET N EST PAS ECRIT A 7. Ecrire 7 en dur rendrait le
// compte faux le jour ou `bloc.video` retrouve un porteur — exactement le mode d echec
// qu on vient de corriger, decale d un cran. Le denominateur est donc ce que le corpus
// EXERCE dans cette locale, deja calcule pour `typesExerces`.
// ---------------------------------------------------------------------------

test('une page compte comme complete si elle rend les types AYANT UN PORTEUR, meme quand un type du §3.6 n en a aucun', () => {
  const sansVideo = HUIT.filter((type) => type !== 'bloc.video');
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'riche', sansVideo), article('fr', 'maigre', ['bloc.texte'])] },
    lecteur({ '/article/riche': page(sansVideo), '/article/maigre': page(['bloc.texte']) }),
  );

  assert.deepEqual(rapport.site, [], rapport.site.join(' | '));
  assert.equal(rapport.inspectees.fr.typesExerces, 7);
  assert.equal(
    rapport.inspectees.fr.pagesCompletes,
    1,
    'la page qui rend les 7 types disponibles doit compter, meme si le §3.6 en declare 8',
  );
});

test('le denominateur SUIT le corpus : si les huit sont exerces, il faut les huit pour etre complete', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'complet', HUIT), article('fr', 'presque', HUIT.filter((t) => t !== 'bloc.video'))] },
    lecteur({
      '/article/complet': page(HUIT),
      '/article/presque': page(HUIT.filter((t) => t !== 'bloc.video')),
    }),
  );

  assert.equal(rapport.inspectees.fr.typesExerces, 8);
  assert.equal(
    rapport.inspectees.fr.pagesCompletes,
    1,
    'le denominateur est ecrit en dur a 7 : la page a 7 types ne doit PAS compter quand le corpus en exerce 8',
  );
});

test('une page a laquelle il manque UN type disponible ne compte pas', () => {
  const sansVideo = HUIT.filter((type) => type !== 'bloc.video');
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'six', sansVideo.filter((t) => t !== 'bloc.galerie')), article('fr', 'sept', sansVideo)] },
    lecteur({
      '/article/six': page(sansVideo.filter((t) => t !== 'bloc.galerie')),
      '/article/sept': page(sansVideo),
    }),
  );
  assert.equal(rapport.inspectees.fr.pagesCompletes, 1);
});

test('un corpus qui n exerce AUCUN type ne rend aucune page complete — sinon le vide passerait pour complet', () => {
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'vide', [])] },
    lecteur({ '/article/vide': page([]) }),
  );
  assert.equal(rapport.inspectees.fr.typesExerces, 0);
  assert.equal(rapport.inspectees.fr.pagesCompletes, 0);
});

test('les types SANS porteur sont nommes, pour que la ligne imprimee se lise sans le brief', () => {
  const sansVideo = HUIT.filter((type) => type !== 'bloc.video');
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'riche', sansVideo)] },
    lecteur({ '/article/riche': page(sansVideo) }),
  );
  assert.deepEqual(
    rapport.inspectees.fr.sansPorteur,
    ['bloc.video'],
    'sans cette liste, « 7/8 » n apprend pas QUEL type manque',
  );
});

test('le compte des pages completes se totalise sur TOUTES les locales — le controle 13 dit « au moins UNE page », pas « une par locale »', () => {
  const sansVideo = HUIT.filter((type) => type !== 'bloc.video');
  const rapport = inspecterBlocs(
    {
      fr: [article('fr', 'riche', sansVideo)],
      en: [article('en', 'maigre', sansVideo), article('en', 'autre', ['bloc.texte'])],
    },
    lecteur({
      '/article/riche': page(sansVideo),
      '/en/article/maigre': page(sansVideo),
      '/en/article/autre': page(['bloc.texte']),
    }),
  );
  const total = Object.values(rapport.inspectees).reduce((n, c) => n + c.pagesCompletes, 0);
  assert.equal(total, 2);
});

// ---------------------------------------------------------------------------
// 8. LE SEUIL DU CONTROLE 13, exerce DANS LES DEUX SENS
//
// La decision « zero page complete = anomalie » vit dans une fonction pure plutot que
// dans le corps de `preuve-rendu.mjs` : un `process.exit` enfoui dans un script de 580
// lignes qui construit le site ne se prouve pas en le cassant, et un seuil qu on ne peut
// pas exercer finit par ne plus rien garder.
// ---------------------------------------------------------------------------

test('zero page complete est une ANOMALIE (1) — la preuve a eu lieu et a trouve quelque chose', () => {
  const verdict = verdictPageComplete({ fr: { pagesCompletes: 0 }, en: { pagesCompletes: 0 } });
  assert.equal(verdict.pagesCompletes, 0);
  assert.equal(verdict.issue, ISSUES.ANOMALIE);
});

test('une seule page complete, dans une seule locale, SUFFIT — le controle 13 dit « au moins UNE »', () => {
  const verdict = verdictPageComplete({ fr: { pagesCompletes: 1 }, en: { pagesCompletes: 0 } });
  assert.equal(verdict.pagesCompletes, 1);
  assert.equal(verdict.issue, ISSUES.CONFORME);
});

test('le verdict totalise les locales', () => {
  assert.equal(verdictPageComplete({ fr: { pagesCompletes: 1 }, en: { pagesCompletes: 3 } }).pagesCompletes, 4);
});

test('une locale non inspectee ne compte pour rien, et ne fait pas planter le verdict', () => {
  const verdict = verdictPageComplete({ fr: { pagesCompletes: 1 }, en: undefined });
  assert.equal(verdict.pagesCompletes, 1);
  assert.equal(verdict.issue, ISSUES.CONFORME);
});

test('AUCUNE locale inspectee ne rend PAS vert : zero page sur zero locale ne prouve rien', () => {
  assert.equal(verdictPageComplete({}).issue, ISSUES.ANOMALIE);
});

test('le verdict se branche sur ce que `inspecterBlocs` rend, pas sur une forme inventee', () => {
  // Le couplage est le point : si `inspectees` cessait de porter `pagesCompletes`, ce
  // test rougirait ici plutot que de laisser le verdict compter des `undefined`.
  const sansVideo = HUIT.filter((type) => type !== 'bloc.video');
  const rapport = inspecterBlocs(
    { fr: [article('fr', 'riche', sansVideo)] },
    lecteur({ '/article/riche': page(sansVideo) }),
  );
  assert.equal(verdictPageComplete(rapport.inspectees).issue, ISSUES.CONFORME);

  const maigre = inspecterBlocs(
    { fr: [article('fr', 'pauvre', sansVideo)] },
    lecteur({ '/article/pauvre': page(sansVideo.filter((t) => t !== 'bloc.galerie')) }),
  );
  assert.equal(
    verdictPageComplete(maigre.inspectees).issue,
    ISSUES.ANOMALIE,
    'une page qui perd un bloc fait tomber le controle 13 : c est la marge nulle de O25',
  );
});

test('le banc de chaque locale exerce les huit types — sinon le controle ne peut rien dire de cette locale', () => {
  for (const locale of LOCALES_SITE) {
    const donnees = JSON.parse(fs.readFileSync(path.join(FIXTURES, `articles-${locale}.json`), 'utf8'));
    const exerces = new Set(articlesDuBanc(locale, donnees).flatMap((a) => a.blocs));
    const absents = TYPES.filter((type) => !exerces.has(type));
    assert.deepEqual(
      absents,
      [],
      `banc « ${locale} » : aucun article n exerce ${absents.join(', ')} — le rendu de ces ` +
        'types ne serait constate dans aucune page de cette locale',
    );
  }
});
