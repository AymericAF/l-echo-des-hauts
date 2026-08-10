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

import { SIGNATURES, TYPES, articlesDuBanc, inspecterBlocs } from '../scripts/couverture-blocs.mjs';
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
