/**
 * `scripts/seed/configuration-seule.ts` — ecrire le SEUL champ des mentions legales.
 *
 * CE QUE CES CAS PROTEGENT, et pourquoi ils existent. Le 2026-08-13, le merge des mentions
 * legales a ete pousse sans que le seed soit rejoue : le composant s est mis a rendre le
 * CHAMP de l instance, l instance portait encore l ancien texte, et la page publique a perdu
 * la clause hebergeur — mention obligatoire (LCEN art. 6 III 2°). Aucune garde n a rougi :
 * `mentions-obligatoires.mjs` juge la sortie construite sur les FIXTURES, pas le champ que
 * l instance sert. Ce module est le geste de rattrapage ; ces cas l empechent de mentir.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ecrireConfiguration,
  jugerLocale,
  plat,
  REPERE_HEBERGEUR,
} from '../scripts/seed/configuration-seule.ts';

/** Un champ blocks Strapi minimal, de la forme que rend l API. */
const blocs = (...paragraphes: string[]) =>
  paragraphes.map((texte) => ({ type: 'paragraph', children: [{ type: 'text', text: texte }] }));

const AVEC = blocs('Éditeur', 'Monsieur Aymeric Filliot EI, 230 rue Eloi Morel, 80000 Amiens.', 'Hébergement', 'Site hébergé par HOSTINGER INTERNATIONAL LTD, 61 Lordou Vironos Street, 6023 Larnaca, Chypre.');
const SANS = blocs('Éditeur', 'Monsieur Aymeric Filliot EI, 230 rue Eloi Morel, 80000 Amiens.');

function clientFactice(surInstance: Record<string, unknown>) {
  const appels = { lectures: 0, ecritures: [] as string[] };
  const etat = { ...surInstance };
  return {
    appels,
    async lireSingle(_s: string, p: { locale: string }) {
      appels.lectures += 1;
      return { mentionsLegales: etat[p.locale] ?? null };
    },
    async majSingle(_s: string, data: Record<string, any>, p: { locale: string }) {
      appels.ecritures.push(p.locale);
      etat[p.locale] = data.mentionsLegales;
      /* Le PUT ne rend QUE ce qu on lui a donne : ecrire un seul champ ne doit pas etre
         lu comme « les autres champs ont ete effaces ». */
      assert.deepEqual(Object.keys(data), ['mentionsLegales']);
      return { mentionsLegales: data.mentionsLegales };
    },
  };
}

test('plat rend le texte d un champ blocks, enfants compris', () => {
  assert.equal(plat(blocs('un', 'deux')), 'undeux');
  assert.equal(plat(null), '');
  assert.equal(plat([]), '');
});

test('jugerLocale voit la clause presente, absente, et sur les DEUX cotes', () => {
  const manque = jugerLocale(SANS, AVEC, 'fr');
  assert.equal(manque.clauseSurInstance, false);
  assert.equal(manque.clauseDansCorpus, true);
  assert.match(manque.titresCorpus, /Hébergement/);
  assert.doesNotMatch(manque.titresInstance, /Hébergement/);

  const conforme = jugerLocale(AVEC, AVEC, 'fr');
  assert.equal(conforme.clauseSurInstance, true);
});

test('LE REPERE EST LA VILLE, PAS LE TITRE DE SECTION — il ne se traduit pas', () => {
  /* « Hébergement » devient « Hosting » en anglais : un repere sur le titre aurait rendu
     la garde verte cote fr et rouge cote en, sans que rien ne manque. */
  const enAnglais = blocs('Hosting', 'Site hosted by HOSTINGER INTERNATIONAL LTD, 61 Lordou Vironos Street, 6023 Larnaca, Cyprus.');
  assert.equal(jugerLocale(enAnglais, enAnglais, 'en').clauseSurInstance, true);
  assert.ok(plat(enAnglais).includes(REPERE_HEBERGEUR));
});

test('--constater n ecrit RIEN — compte sur les appels, pas sur la sortie', async () => {
  const client = clientFactice({ fr: SANS, en: SANS });
  const rapport = await ecrireConfiguration(client, { fr: { mentionsLegales: AVEC }, en: { mentionsLegales: AVEC } }, { constater: true });
  assert.deepEqual(client.appels.ecritures, []);
  assert.deepEqual(rapport.ecrites, []);
  assert.equal(rapport.ecarts.length, 2);
  assert.equal(rapport.ecarts.every((e) => !e.clauseSurInstance), true);
});

test('l ecriture pose le champ dans les deux locales, et le RELIT pour le prouver', async () => {
  const client = clientFactice({ fr: SANS, en: SANS });
  const rapport = await ecrireConfiguration(client, { fr: { mentionsLegales: AVEC }, en: { mentionsLegales: AVEC } });
  assert.deepEqual(client.appels.ecritures, ['fr', 'en']);
  assert.deepEqual(rapport.apres, { fr: true, en: true });
  assert.equal(rapport.rouge, false);
});

test("ARRET si le CORPUS non plus ne porte pas la clause — ne pas remplacer un texte ampute par un autre", async () => {
  const client = clientFactice({ fr: SANS, en: SANS });
  const rapport = await ecrireConfiguration(client, { fr: { mentionsLegales: SANS }, en: { mentionsLegales: SANS } });
  assert.deepEqual(client.appels.ecritures, [], 'rien ne doit etre ecrit');
  assert.equal(rapport.rouge, true);
});

test('PREUVE EN CASSANT — une ecriture qui ne prend pas rend rouge, elle ne se declare pas verte', async () => {
  /* Instance qui accepte le PUT sans rien changer : succes apparent, effet nul. C est le
     mode d echec que la relecture existe pour attraper. */
  const sourd = {
    async lireSingle() {
      return { mentionsLegales: SANS };
    },
    async majSingle() {
      return {};
    },
  };
  const rapport = await ecrireConfiguration(sourd, { fr: { mentionsLegales: AVEC }, en: { mentionsLegales: AVEC } });
  assert.equal(rapport.rouge, true);
  assert.deepEqual(rapport.apres, { fr: false, en: false });
});

test('une locale absente du corpus est ignoree, pas ecrite a vide', async () => {
  const client = clientFactice({ fr: SANS, en: SANS });
  await ecrireConfiguration(client, { fr: { mentionsLegales: AVEC } });
  assert.deepEqual(client.appels.ecritures, ['fr']);
});
