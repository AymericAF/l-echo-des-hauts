/**
 * LE CORPUS DE RECETTE EST-IL SOUMIS AUX GARDES, OU SEULEMENT CONSTRUIT ?
 *
 * LE DEFAUT MESURE LE 2026-08-12 (tache da329cb3), troisieme forme du meme defaut que
 * `772ac0ac` et `da2975e2` : une garde dont l OBJET n est jamais soumis ne garde rien.
 *
 * `scripts/corpus-recette.mjs` existe pour exercer ce que le corpus editorial n atteint
 * pas : une page 2, une categorie a douze pile, un article non traduit, une rubrique sans
 * contrepartie anglaise, la 404. `preuve-pagination.mjs` le construit dans `dist-recette/`
 * — 54 routes le 2026-08-12 — et n en jugeait que les LIENS. Releves du meme jour :
 *
 *   - `dist-recette/pagefind/` n existait pas apres `npm run preuve:pagination`. Le corpus
 *     n etait pas indexe, donc la RE-INSPECTION que `index-pagefind.mjs` fait apres depot
 *     — la seule qui voie les octets ecrits APRES `astro build` — ne s exercait pas ;
 *   - les sept verificateurs derives, lances a la main sur ce meme `dist-recette/`, rendent
 *     TOUS `0`. Ils n avaient donc aucune raison d en etre tenus a l ecart : ils n y
 *     etaient simplement jamais lances.
 *
 * Un defaut qui ne se manifesterait QUE sur une page paginee, sur un article non traduit
 * ou sur la 404 passait donc au travers de tout le dispositif — y compris de la contrainte
 * dure « aucun JavaScript hors /recherche », qui est opposable.
 *
 * CE QUE CE FICHIER TIENT : la population jugee se DERIVE (jamais une seconde liste), le
 * verdict distingue l incapacite de l anomalie, et `preuve-pagination.mjs` fait vraiment
 * les deux gestes. Ce qu il ne prouve pas — que les sept restent verts sur le corpus — se
 * prouve en lancant la preuve, pas en lisant un fichier.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ISSUES } from '../scripts/issues.mjs';
import { commandesDeJugement, incapacitesDuJugement, verdictDuJugement } from '../scripts/juger-sortie.mjs';
import { verificateursALancer } from '../scripts/verificateurs-de-sortie.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function paquet(): { scripts: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
}

function preuvePagination(): string {
  return fs.readFileSync(path.join(RACINE, 'scripts', 'preuve-pagination.mjs'), 'utf8');
}

// ── 1. La population jugee est celle de la derivation, jamais une seconde liste ────────

test('la sortie de recette est jugee par TOUS les verificateurs derives, sans exception propre', () => {
  /* Une seconde liste diverge toujours de la premiere — c est le defaut du 2026-08-11 que
     la derivation a ferme pour l integration continue. Ici elle est REUTILISEE, pas
     refaite. */
  const commandes = commandesDeJugement(paquet(), 'dist-recette', 'https://echo.ayfiweb.fr');
  assert.deepEqual(
    commandes.map((c) => c.nom),
    verificateursALancer(paquet()),
    'la sortie de recette est jugee par une population differente de celle de dist/ : ' +
      'soit un verificateur y echappe, soit un autre y est ajoute sans etre declare',
  );
  assert.ok(commandes.length >= 7, `${commandes.length} verificateur(s) — la mesure du 2026-08-12 en comptait 7`);
});

test('chaque commande porte le repertoire jugé ET l origine — les trois qui la lisent en ont besoin', () => {
  for (const commande of commandesDeJugement(paquet(), 'dist-recette', 'https://exemple.test')) {
    assert.deepEqual(commande.arguments.slice(1), ['dist-recette', 'https://exemple.test'], commande.nom);
  }
});

test('tout script annonce existe sur le disque — sinon c est une INCAPACITE, pas un 127', () => {
  assert.deepEqual(incapacitesDuJugement(commandesDeJugement(paquet(), 'dist-recette', 'o'), RACINE), []);
});

test('une population VIDE est une incapacite, jamais un silence vert', () => {
  const ecarts = incapacitesDuJugement([], RACINE);
  assert.ok(ecarts.length > 0);
  assert.match(ecarts.join('\n'), /vide|vert/);
});

test('un script annonce mais absent du disque est nomme', () => {
  const ecarts = incapacitesDuJugement([{ nom: 'fantome', script: 'scripts/verifier-fantome.mjs' }], RACINE);
  assert.match(ecarts.join('\n'), /verifier-fantome\.mjs/);
});

// ── 2. Le verdict : l incapacite prime, et les deux familles ne se confondent pas ──────

test('tous conformes : issue 0', () => {
  const rendu = verdictDuJugement([
    { nom: 'sortie', code: 0 },
    { nom: 'liens', code: 0 },
  ]);
  assert.equal(rendu.issue, ISSUES.CONFORME);
});

test('une anomalie : issue 1, et c est le SITE qu on envoie corriger', () => {
  const rendu = verdictDuJugement([
    { nom: 'sortie', code: 1 },
    { nom: 'liens', code: 0 },
  ]);
  assert.equal(rendu.issue, ISSUES.ANOMALIE);
  assert.match(rendu.lignes.join('\n'), /Corriger le SITE.*sortie/);
});

test('une incapacite PRIME sur une anomalie : les 0 des voisins ne couvrent plus rien', () => {
  /* Quand un verificateur n a rien pu juger, on ne sait plus ce qui a ete regarde :
     rendre 1 enverrait corriger le site alors que le geste est de rendre la sortie
     jugeable. */
  const rendu = verdictDuJugement([
    { nom: 'sortie', code: 1 },
    { nom: 'seo', code: 2 },
  ]);
  assert.equal(rendu.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  const texte = rendu.lignes.join('\n');
  assert.match(texte, /Corriger l ENVIRONNEMENT.*seo/);
  assert.match(texte, /Corriger le SITE.*sortie/);
});

// ── 3. La preuve fait-elle vraiment les deux gestes ? ─────────────────────────────────

test('preuve-pagination DEPOSE l index de recherche sur le corpus de recette', () => {
  /* LE PREMIER DES DEUX GESTES MANQUANTS. `dist-recette/pagefind/` n existait pas le
     2026-08-12. Sans index, la re-inspection d `index-pagefind.mjs` — la seule qui voie
     les octets ecrits APRES `astro build` — ne s exercait pas sur ce corpus. */
  const source = preuvePagination();
  assert.match(
    source,
    /from '\.\/index-pagefind\.mjs'/,
    'preuve-pagination.mjs n importe pas index-pagefind.mjs : le corpus de recette reste ' +
      'le seul endroit du dispositif ou du JavaScript peut entrer sans passer devant la garde',
  );
  assert.match(source, /indexer\(/, 'l index n est pas depose sur dist-recette/');
  assert.match(
    source,
    /manquementsDepot\(/,
    're-inspection absente : deposer l index sans le re-inspecter laisse le trou ouvert',
  );
});

test('preuve-pagination SOUMET la sortie de recette aux verificateurs derives', () => {
  const source = preuvePagination();
  assert.match(
    source,
    /from '\.\/juger-sortie\.mjs'/,
    'preuve-pagination.mjs ne soumet pas dist-recette/ aux verificateurs de sortie : la ' +
      'page 2, l article non traduit et la 404 ne sont juges par personne',
  );
  assert.match(source, /commandesDeJugement\(/);
  assert.match(source, /verdictDuJugement\(/);
});

test('la population jugee ne se recopie PAS dans preuve-pagination', () => {
  /* Le defaut du 2026-08-11, reproduit ici serait une troisieme liste. Aucun nom de
     verificateur ne doit apparaitre en dur dans ce fichier. */
  const source = preuvePagination();
  for (const nom of verificateursALancer(paquet())) {
    assert.doesNotMatch(
      source,
      new RegExp(`['"\`]verifier[:-]${nom}`),
      `« ${nom} » est ecrit en dur dans preuve-pagination.mjs : la liste redivergera`,
    );
  }
});
