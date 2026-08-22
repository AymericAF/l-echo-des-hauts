/**
 * LE COMPTE D EPISODES, CONFRONTE ENTRE LA SOURCE ET LA PAGE CONSTRUITE.
 *
 * ── CE QUI ETAIT TENU, ET CE QUI NE L ETAIT PAS ───────────────────────────────────────
 *
 * `compteDeLIndex` sait produire TROIS formes : rien a zero, le singulier a un, le
 * pluriel au-dela. `tests/compte-index.test.ts` les exerce toutes les trois — EN UNITE.
 *
 * Au rendu, une seule avait ete vue : le SINGULIER. Aucun dossier du banc n avait plus
 * d un article, donc « 5 épisodes » / « 5 episodes » n existait que dans une assertion.
 * C est la forme la moins risquee qui etait couverte : celle ou une substitution de mot
 * se voit, parce qu elle sort au singulier dans les deux langues.
 *
 * ── POURQUOI CE MODULE NE LIT PAS `libelles.ts` ───────────────────────────────────────
 *
 * C est le point sur lequel tout repose. Un controle qui derive son attendu de ce qu il
 * controle ne controle rien (`preuve-rendu.mjs`, meme phrase). S il appelait
 * `compteDeLIndex` ou `libelles(locale).nombreEpisodes`, casser le libelle pluriel
 * deplacerait LES DEUX COTES ensemble et il resterait VERT — une recette qui fabrique
 * les deux cotes de sa propre comparaison.
 *
 * Les quatre formes sont donc RECOPIEES dans `scripts/compte-episodes-servi.mjs`, et
 * cette recopie est assumee, comme celle de `tests/fixtures-locales.test.ts`. Le test
 * « le module ne s adosse a aucun libelle du site » plus bas empeche la recopie de se
 * refermer en silence sur l original.
 *
 * ── CE QUE CE FICHIER JUGE, ET CE QUE LE RENDU JUGE ───────────────────────────────────
 *
 * Ici : les deux fonctions pures, sur des entrees fabriquees — y compris les cas qu un
 * corpus sain ne produit pas. Dans `scripts/preuve-rendu.mjs` : les MEMES fonctions, sur
 * le HTML reellement construit. Aucune des deux ne remplace l autre.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  dossiersPosesParLaSource,
  inspecterComptesEpisodes,
} from '../scripts/compte-episodes-servi.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Un dossier de source, reduit a ce que le module lit. */
function dossier(slug: string, references: string[]) {
  return { slug, articles: references.map((documentId) => ({ documentId })) };
}

/** Les articles d une locale, reduits a leur `documentId`. */
function articles(...documentIds: string[]) {
  return documentIds.map((documentId) => ({ documentId }));
}

/** La page d un index qui rend `texte` dans son paragraphe de compte. */
function pageIndex(texte: string | null): string {
  const compte = texte === null ? '' : `<p class="index__compte" data-astro-cid-x>${texte}</p>`;
  return `<header><h1>Un dossier</h1>${compte}</header><section></section>`;
}

/** Un accueil dont chaque carte porte la route de son dossier et son compte. */
function accueil(cartes: { route: string; compte: string | null }[]): string {
  const items = cartes
    .map(
      ({ route, compte }) =>
        `<li data-astro-cid-y><h3><a href="${route}" data-astro-cid-y>Titre</a></h3>` +
        (compte === null ? '' : `<p data-astro-cid-y>${compte}</p>`) +
        '</li>',
    )
    .join('');
  return `<ul class="accueil__dossiers" data-astro-cid-y>${items}</ul>`;
}

/** Le lecteur de pages que `preuve-rendu.mjs` fournit : le HTML d une route, ou `null`. */
function lecteur(pages: Record<string, string>) {
  return (route: string) => pages[route] ?? null;
}

// ---------------------------------------------------------------------------
// 1. Ce que la SOURCE pose
// ---------------------------------------------------------------------------

test('le total d un dossier ne compte que les articles qui EXISTENT dans la locale', () => {
  /* `articlesDeDossier` (registre.ts) intersecte la relation avec le corpus. Une
     reference orpheline — article depublie, non traduit — ne rend aucune page et ne doit
     donc pas etre comptee : la compter ferait accuser le site d un compte qu il a juste. */
  const poses = dossiersPosesParLaSource(
    'fr',
    [dossier('serie', ['art-1', 'art-orphelin', 'art-2'])],
    articles('art-1', 'art-2'),
  ).poses;

  assert.equal(poses.length, 1);
  assert.equal(poses[0].total, 2);
});

test('l attendu prend le SINGULIER a un, le PLURIEL au-dela, et RIEN a zero', () => {
  const un = dossiersPosesParLaSource('fr', [dossier('a', ['x'])], articles('x')).poses[0];
  const deux = dossiersPosesParLaSource('fr', [dossier('a', ['x', 'y'])], articles('x', 'y'))
    .poses[0];
  const zero = dossiersPosesParLaSource('fr', [dossier('a', [])], articles()).poses[0];

  assert.equal(un.attendu, '1 épisode');
  assert.equal(deux.attendu, '2 épisodes');
  assert.equal(zero.attendu, null);
});

test('la locale anglaise a ses propres formes, et la route porte son prefixe', () => {
  const poses = dossiersPosesParLaSource(
    'en',
    [dossier('the-series', ['x', 'y', 'z'])],
    articles('x', 'y', 'z'),
  ).poses;

  assert.equal(poses[0].attendu, '3 episodes');
  assert.equal(poses[0].route, '/en/dossier/the-series');
});

test('un dossier de la source qui n est pas lisible est une INCAPACITE, jamais un zero', () => {
  /* Un `articles` absent n est pas « un dossier vide » : c est une relation non peuplee.
     La confondre avec zero ferait exiger l ABSENCE d une page qui doit peut-etre exister. */
  const rendu = dossiersPosesParLaSource('fr', [{ slug: 'casse' }], articles('x'));
  assert.equal(rendu.poses.length, 0);
  assert.equal(rendu.incapacites.length, 1);
  assert.match(rendu.incapacites[0], /casse/);
});

// ---------------------------------------------------------------------------
// 2. Ce que la PAGE sert
// ---------------------------------------------------------------------------

const POSES_PLURIEL = {
  fr: dossiersPosesParLaSource('fr', [dossier('serie', ['x', 'y'])], articles('x', 'y')),
};

test('un compte conforme sur les deux surfaces ne rend aucun ecart, et le pluriel est COMPTE', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_PLURIEL,
    lecteur({
      '/dossier/serie': pageIndex('2 épisodes'),
      '': accueil([{ route: '/dossier/serie', compte: '2 épisodes' }]),
    }),
  );

  assert.deepEqual(rendu.ecarts, []);
  assert.equal(rendu.controles, 1);
  assert.equal(rendu.exerces.pluriel, 1);
  assert.equal(rendu.exerces.singulier, 0);
});

test('LE PLURIEL CASSE ROUGIT, et le message nomme le mot servi ET le mot attendu', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_PLURIEL,
    lecteur({
      '/dossier/serie': pageIndex('2 épisode'),
      '': accueil([{ route: '/dossier/serie', compte: '2 épisodes' }]),
    }),
  );

  assert.equal(rendu.ecarts.length, 1);
  assert.match(rendu.ecarts[0], /2 épisode\b/);
  assert.match(rendu.ecarts[0], /2 épisodes/);
  assert.match(rendu.ecarts[0], /\/dossier\/serie/);
});

test('L ACCUEIL est juge SEPAREMENT : il a deja compte autrement que la page du dossier', () => {
  /* Le defaut du 2026-08-20 : la carte disait « 1 article » quand la page, a un clic,
     disait « 1 épisode ». Ne juger que la page du dossier laisserait ce cas passer. */
  const rendu = inspecterComptesEpisodes(
    POSES_PLURIEL,
    lecteur({
      '/dossier/serie': pageIndex('2 épisodes'),
      '': accueil([{ route: '/dossier/serie', compte: '2 articles' }]),
    }),
  );

  assert.equal(rendu.ecarts.length, 1);
  assert.match(rendu.ecarts[0], /accueil/);
  assert.match(rendu.ecarts[0], /2 articles/);
});

test('une carte d accueil MANQUANTE pour un dossier compte est un ecart', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_PLURIEL,
    lecteur({ '/dossier/serie': pageIndex('2 épisodes'), '': accueil([]) }),
  );
  assert.equal(rendu.ecarts.length, 1);
  assert.match(rendu.ecarts[0], /carte/);
});

test('une page de dossier absente de la sortie est un ecart, pas un silence', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_PLURIEL,
    lecteur({ '': accueil([{ route: '/dossier/serie', compte: '2 épisodes' }]) }),
  );
  assert.equal(rendu.ecarts.length, 1);
  assert.match(rendu.ecarts[0], /absente/);
});

test('un accueil introuvable est une INCAPACITE, pas une accusation du compte', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_PLURIEL,
    lecteur({ '/dossier/serie': pageIndex('2 épisodes') }),
  );
  assert.deepEqual(rendu.ecarts, []);
  assert.equal(rendu.incapacites.length, 1);
  assert.match(rendu.incapacites[0], /accueil/);
});

// ---------------------------------------------------------------------------
// 3. Le cas a ZERO — ce que la PRODUCTION en montre, et rien de plus
// ---------------------------------------------------------------------------

const POSES_VIDE = { fr: dossiersPosesParLaSource('fr', [dossier('vide', [])], articles('x')) };

test('un dossier vide ABSENT de la sortie est conforme, et il est COMPTE', () => {
  const rendu = inspecterComptesEpisodes(POSES_VIDE, lecteur({ '': accueil([]) }));
  assert.deepEqual(rendu.ecarts, []);
  assert.equal(rendu.vides, 1);
  assert.equal(rendu.controles, 0);
});

test('un dossier vide dont la PAGE existe est un ecart : le registre ne doit pas l emettre', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_VIDE,
    lecteur({ '/dossier/vide': pageIndex(null), '': accueil([]) }),
  );
  assert.equal(rendu.ecarts.length, 1);
  assert.match(rendu.ecarts[0], /vide/);
});

test('un dossier vide qui porte une CARTE sur l accueil est un ecart', () => {
  const rendu = inspecterComptesEpisodes(
    POSES_VIDE,
    lecteur({ '': accueil([{ route: '/dossier/vide', compte: '0 épisode' }]) }),
  );
  assert.equal(rendu.ecarts.length, 1);
  assert.match(rendu.ecarts[0], /accueil/);
});

// ---------------------------------------------------------------------------
// 4. Le controle ne peut pas se desarmer en silence
// ---------------------------------------------------------------------------

test('un corpus sans dossier PLURIEL ne rend aucun ecart — et le dit, au lieu d un vert', () => {
  /* C est l etat exact du banc avant le 2026-08-22 : quatre pages vertes, et la forme
     qui casse le plus volontiers jamais rendue. Le compte a zero est ce qui permet a
     `preuve-rendu.mjs` de sortir en 2 — le corpus, pas le site. */
  const poses = { fr: dossiersPosesParLaSource('fr', [dossier('a', ['x'])], articles('x')) };
  const rendu = inspecterComptesEpisodes(
    poses,
    lecteur({
      '/dossier/a': pageIndex('1 épisode'),
      '': accueil([{ route: '/dossier/a', compte: '1 épisode' }]),
    }),
  );

  assert.deepEqual(rendu.ecarts, []);
  assert.equal(rendu.exerces.singulier, 1);
  assert.equal(rendu.exerces.pluriel, 0);
});

test('le module ne s adosse a AUCUN libelle du site — sinon casser le mot le laisserait vert', () => {
  /* La garde de la garde. Le jour ou ce module importera `libelles` ou `compteDeLIndex`,
     il comparera le site a lui-meme : le pluriel pourra devenir « 2 chapitres » des deux
     cotes a la fois sans qu une seule ligne rougisse. */
  /* Ce qui est interdit est l IMPORT et l APPEL, pas la mention : l en-tete du module
     NOMME `compteDeLIndex` pour dire de quoi il se tient a distance, et une garde qui
     rougirait sur sa propre explication se ferait desarmer par la premiere personne
     qu elle derange. Les trois motifs ci-dessous attrapent toute forme utilisable —
     import nomme, import de module, appel — et aucune forme de prose. */
  const source = fs.readFileSync(path.join(RACINE, 'scripts', 'compte-episodes-servi.mjs'), 'utf8');
  const interdits: [RegExp, string][] = [
    [/from\s+'[^']*i18n\/libelles[^']*'/, 'il importe le module des libelles'],
    [/from\s+'[^']*routes\/compte-index[^']*'/, 'il importe le module du compte'],
    [/\blibelles\s*\(/, 'il appelle `libelles()`'],
    [/\bcompteDeLIndex\s*\(/, 'il appelle `compteDeLIndex()`'],
  ];
  for (const [motif, faute] of interdits) {
    assert.ok(
      !motif.test(source),
      `compte-episodes-servi.mjs : ${faute}. Son attendu viendrait alors du mot qu il est ` +
        'cense juger — casser ce mot deplacerait les deux cotes et le laisserait VERT.',
    );
  }
});
