/**
 * Le bootstrap des locales : `fr` par defaut, `en` en miroir, idempotent.
 *
 * Une instance fraiche n'a que `en`, et `en` est par defaut. Sans ce bootstrap,
 * le seed ecrirait tout le corpus francais dans la locale anglaise, sans qu'une
 * seule erreur ne monte — le mode d'echec silencieux que le controle 12 du plan
 * editorial poursuit, une couche plus bas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assurerLocales,
  LOCALE_PAR_DEFAUT,
  LOCALE_MIROIR,
  type ServiceLocales,
} from '../src/locales.ts';

/** Imite `strapi.plugin('i18n').service('locales')` sur sa part utile. */
function fauxService(codesExistants: string[], defaut: string | null) {
  const codes = new Set(codesExistants);
  const appels: string[] = [];
  let defautCourant = defaut;
  const service: ServiceLocales = {
    async findByCode(code) {
      return codes.has(code) ? { code } : null;
    },
    async create(locale) {
      appels.push(`create:${locale.code}`);
      codes.add(locale.code);
      return locale;
    },
    async getDefaultLocale() {
      return defautCourant;
    },
    async setDefaultLocale({ code }) {
      appels.push(`defaut:${code}`);
      defautCourant = code;
      return code;
    },
  };
  return { service, appels, codes, defaut: () => defautCourant };
}

test('instance fraiche (en seule, en par defaut) : fr est cree et devient la locale par defaut', async () => {
  const f = fauxService(['en'], 'en');
  const rapport = await assurerLocales(f.service);

  assert.deepEqual(rapport.creees, [LOCALE_PAR_DEFAUT.code]);
  assert.equal(rapport.defautPose, true);
  assert.equal(f.defaut(), 'fr');
  assert.deepEqual(f.appels, ['create:fr', 'defaut:fr']);
});

test('instance vierge de toute locale : fr et en sont crees', async () => {
  const f = fauxService([], null);
  const rapport = await assurerLocales(f.service);

  assert.deepEqual(rapport.creees, [LOCALE_PAR_DEFAUT.code, LOCALE_MIROIR.code]);
  assert.equal(f.defaut(), 'fr');
});

test('instance deja conforme : rien n est cree, le defaut n est pas retouche', async () => {
  const f = fauxService(['fr', 'en'], 'fr');
  const rapport = await assurerLocales(f.service);

  assert.deepEqual(rapport.creees, []);
  assert.equal(rapport.defautPose, false);
  assert.deepEqual(f.appels, [], 'aucune ecriture ne doit avoir lieu');
});

test('le bootstrap est idempotent : deux passages, un seul jeu d ecritures', async () => {
  const f = fauxService(['en'], 'en');
  await assurerLocales(f.service);
  const apresPremier = [...f.appels];
  await assurerLocales(f.service);

  assert.deepEqual(f.appels, apresPremier, 'le second passage ne doit rien ecrire');
});
