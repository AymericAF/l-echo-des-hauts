/**
 * L ABSENCE ET `false` SONT LE MEME ETAT — le defaut que seule l instance pouvait montrer.
 *
 * CE QUI S EST PASSE, le 2026-08-14 (tache `cdebf977`). Le seed a ete rejoue DEUX FOIS de suite
 * contre `echoback.ayfiweb.fr`. La premiere passe a ecrit ce qui manquait ; la seconde, qui
 * devait n emettre aucune ecriture, a REECRIT cinq entrees, toutes avec le meme motif :
 * « composant seo entree 1 : champ noindex different ». Releve des deux cotes, sans deduction :
 *
 *   corpus  (`apps/cms/data/categories.json`, categorie « territoire ») : PAS de cle `noindex`
 *   instance (`GET /api/categories?...&populate=seo`)                    : `"noindex": false`
 *
 * Le corpus n ecrit `noindex` que lorsqu il vaut `true` — l ABSENCE est l information « pas de
 * noindex » (A-07). Strapi, lui, stocke le defaut du champ booleen. Compares en `scalaire`,
 * `undefined` et `false` rendent DIFFERENT : le seed reecrivait ces cinq entrees a chaque
 * passage, pour toujours. Avec le webhook `publish_to_coolify` arme, cela fait cinq
 * deploiements par seed — le meme mecanisme que l incident du 2026-08-10, en plus discret.
 *
 * POURQUOI AUCUN TEST NE POUVAIT L ATTRAPER AVANT. Le faux client du depot rend ce qu on lui a
 * donne ; il ne fabrique pas les DEFAUTS de Strapi. Un test qui ecrit `{}` relit `{}`, et la
 * comparaison est verte. Il fallait confronter l instance — c est tout l objet de la tache qui
 * a produit ce fichier, et c est pourquoi ces cas sont ecrits ici : la mesure ne se rejoue pas
 * a chaque commit, le test si.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { comparerCorps, parametresPopulate, type Natures } from '../scripts/seed/difference.ts';

const SANS_SLUG = () => undefined;
const NATURES: Natures = { noindex: 'booleen', metaTitre: 'scalaire' };

test('LE CAS MESURE : `noindex` absent du corpus contre `false` en base — IDENTIQUE', () => {
  const verdict = comparerCorps({ noindex: undefined }, { noindex: false }, NATURES, SANS_SLUG);
  assert.equal(
    verdict.identique,
    true,
    `le seed réécrirait à chaque passe — motif rendu : « ${verdict.motif} »`,
  );
});

test('`null` en base vaut aussi l absence — Strapi rend l un ou l autre selon le chemin', () => {
  assert.equal(comparerCorps({ noindex: undefined }, { noindex: null }, NATURES, SANS_SLUG).identique, true);
});

test('la nature garde encore quelque chose : `true` contre `false` reste DIFFERENT', () => {
  /* La contre-épreuve obligatoire. Une nature qui rendrait tout identique supprimerait le
     défaut en supprimant la garde — et `noindex` est justement le champ dont l'erreur coûte
     le plus cher dans les deux sens (A-29). */
  const verdict = comparerCorps({ noindex: true }, { noindex: false }, NATURES, SANS_SLUG);
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /noindex/);
});

test('`true` contre absent reste DIFFERENT — le sens qui met une page hors du sitemap', () => {
  assert.equal(comparerCorps({ noindex: true }, {}, NATURES, SANS_SLUG).identique, false);
});

test('`true` contre `true` est identique — aucune réécriture sur une page déjà noindex', () => {
  assert.equal(comparerCorps({ noindex: true }, { noindex: true }, NATURES, SANS_SLUG).identique, true);
});

test('la nature ne déteint pas sur les autres champs du même corps', () => {
  /* Un booléen tolérant à côté d'un scalaire strict : le second doit continuer de rougir,
     sinon la correction aurait élargi bien plus que le champ visé. */
  const verdict = comparerCorps(
    { noindex: undefined, metaTitre: 'Territoire' },
    { noindex: false, metaTitre: 'Autre chose' },
    NATURES,
    SANS_SLUG,
  );
  assert.equal(verdict.identique, false);
  assert.match(verdict.motif, /metaTitre/);
});

/* ------------------------------------------------------------------------ */
/* LE SECOND DEFAUT, introduit en corrigeant le premier                       */
/*                                                                            */
/* Ajouter la nature `booleen` sans l'ajouter a la liste des champs DEMANDES   */
/* a Strapi la rendait invisible : le champ n'etait plus rendu, la comparaison */
/* le lisait `undefined`, et l'article A40 — `noindex: true` des DEUX cotes —  */
/* etait reecrit a chaque passe. C'est mot pour mot ce que l'en-tete de la     */
/* section « populate » de `difference.ts` annonce, et il a fallu le refaire   */
/* pour le voir. D'ou ces deux cas : la prochaine nature simple ne coutera pas */
/* une nouvelle mesure contre l'instance.                                     */
/* ------------------------------------------------------------------------ */

test('un champ `booleen` est DEMANDE a Strapi, comme un scalaire — sinon il se lit absent', () => {
  const parametres = parametresPopulate({ seo: { repete: { noindex: 'booleen', metaTitre: 'scalaire' } } });
  const demandes = Object.entries(parametres)
    .filter(([cle]) => /\[fields\]\[\d+\]$/.test(cle))
    .map(([, valeur]) => valeur);
  assert.ok(
    demandes.includes('noindex'),
    `« noindex » n'est pas demandé — Strapi ne le rendrait pas, la comparaison le lirait absent, ` +
      `et le seed réécrirait pour toujours. Champs demandés : ${JSON.stringify(demandes)}`,
  );
});

test('les trois natures simples sont demandees ensemble, aucune oubliee', () => {
  const parametres = parametresPopulate({
    c: { repete: { b: 'booleen', s: 'scalaire', d: 'date', m: 'media' } },
  });
  const demandes = Object.entries(parametres)
    .filter(([cle]) => /\[fields\]\[\d+\]$/.test(cle))
    .map(([, valeur]) => valeur);
  for (const champ of ['b', 's', 'd']) {
    assert.ok(demandes.includes(champ), `« ${champ} » absent des champs demandés : ${JSON.stringify(demandes)}`);
  }
});
