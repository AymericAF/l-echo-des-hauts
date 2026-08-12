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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assurerLocales,
  journalLocales,
  poserLocales,
  LOCALE_PAR_DEFAUT,
  LOCALE_MIROIR,
  type ServiceLocales,
} from '../src/locales.ts';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Imite `strapi.plugin('i18n').service('locales')` sur sa part utile.
 *
 * @param noms Le nom PORTE PAR L'INSTANCE pour un code donne, quand il differe de
 *   celui que le depot declare — c'est le cas reel de `echoback.ayfiweb.fr`, dont
 *   la locale `fr` s'appelle « French (fr) » parce qu'elle a ete posee a la main.
 */
function fauxService(
  codesExistants: string[],
  defaut: string | null,
  noms: Record<string, string> = {},
) {
  const codes = new Set(codesExistants);
  const appels: string[] = [];
  let defautCourant = defaut;
  const service: ServiceLocales = {
    async findByCode(code) {
      return codes.has(code) ? { code, name: noms[code] } : null;
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

// ---------------------------------------------------------------------------
// LE PASSAGE DU BOOTSTRAP SE CONSTATE — sinon il n'a jamais tourne, faute de preuve
// ---------------------------------------------------------------------------
/**
 * CE QUE CETTE SECTION FERME, et la mesure qui l'a ouverte (2026-08-12, tache
 * f30fc73e). `index.ts` journalisait sous DEUX conditions — « des locales ont ete
 * creees » et « le defaut a ete pose ». Sur une instance deja conforme, les deux
 * sont fausses : le bootstrap ecrivait alors ZERO ligne, exactement comme un
 * bootstrap qui n'aurait jamais tourne.
 *
 * Constat sur l'instance en service, le 2026-08-12 : conteneur `echo-strapi`
 * (Coolify `ydaghuigfanqwdof0nru2ysk`, image `3c430ab`, demarre le 2026-08-10 a
 * 21:25:56 UTC), `docker logs | grep -c 'locales]'` = **0** sur 4717 lignes, pour
 * un unique « Strapi started successfully » — et `/opt/app/dist/src/locales.js`
 * bien present dans l'image. Il n'existait AUCUN moyen de dire si le maillon
 * avait ete exerce. `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 */

test('une instance DEJA CONFORME journalise quand meme : c est le cas qui manquait', () => {
  const rapport = {
    constats: [
      { code: 'fr', creee: false, nomTrouve: 'Francais (fr)', nomDeclare: 'Francais (fr)' },
      { code: 'en', creee: false, nomTrouve: 'English (en)', nomDeclare: 'English (en)' },
    ],
    creees: [],
    defautAvant: 'fr',
    defautApres: 'fr',
    defautPose: false,
  };
  const lignes = journalLocales(rapport);

  assert.ok(lignes.length > 0, 'le cas « rien a faire » doit produire au moins une ligne');
  assert.match(lignes[0], /bootstrap exerce/);
  assert.match(lignes[0], /fr/);
  assert.match(lignes[0], /en/);
  assert.match(lignes[0], /inchangee/);
});

test('le journal existe dans les QUATRE etats, jamais vide', async () => {
  const etats: Array<[string, string[], string | null]> = [
    ['instance vierge', [], null],
    ['instance fraiche (en seule)', ['en'], 'en'],
    ['fr presente mais defaut ailleurs', ['fr', 'en'], 'en'],
    ['instance conforme', ['fr', 'en'], 'fr'],
  ];
  for (const [intitule, codes, defaut] of etats) {
    const f = fauxService(codes, defaut);
    const lignes = journalLocales(await assurerLocales(f.service));
    assert.ok(lignes.length > 0 && lignes[0].trim().length > 0, `${intitule} : journal vide`);
    for (const code of ['fr', 'en']) {
      assert.match(lignes[0], new RegExp(`\\b${code}\\b`), `${intitule} : ${code} non nomme`);
    }
  }
});

test('un nom divergent est SIGNALE, et la locale n est PAS renommee', async () => {
  /* Le cas reel de `echoback.ayfiweb.fr` : `fr` s'appelle « French (fr) », le nom du
     selecteur ISO de l'admin, la ou ce depot declare « Francais (fr) ». C'est la
     signature d'une locale posee A LA MAIN — c'est par elle qu'on a su que le maillon
     `bootstrap -> fr` n'avait jamais ete exerce sur l'instance. */
  const f = fauxService(['fr', 'en'], 'fr', { fr: 'French (fr)', en: 'English (en)' });
  const rapport = await assurerLocales(f.service);
  const ligne = journalLocales(rapport)[0];

  assert.match(ligne, /French \(fr\)/);
  assert.match(ligne, /Francais \(fr\)/);
  assert.match(ligne, /main/, 'le journal doit dire QUE cela veut dire, pas seulement l ecart');
  assert.deepEqual(f.appels, [], 'aucune ecriture : renommer serait une ecriture non demandee');
});

test('le journal distingue une CREATION d une locale deja presente', async () => {
  const ligne = journalLocales(await assurerLocales(fauxService(['en'], 'en').service))[0];
  assert.match(ligne, /fr CREEE/);
  assert.match(ligne, /en deja presente/);
  assert.match(ligne, /POSEE sur « fr »/);
});

test('poserLocales() ECRIT la ligne, y compris quand il n a rien fait', async () => {
  /* LE CABLAGE, pas seulement la fonction de journal. Une fonction parfaite derriere une
     condition se tait tout autant : c'est exactement ce qui s'etait produit. Ce test
     appelle le bootstrap COMPLET avec un faux Strapi. */
  const f = fauxService(['fr', 'en'], 'fr');
  const journalises: string[] = [];

  await poserLocales({
    plugin: () => ({ service: () => f.service }),
    log: { info: (message: string) => journalises.push(message) },
  });

  assert.equal(f.appels.length, 0, 'instance conforme : aucune ecriture attendue');
  assert.ok(
    journalises.length > 0,
    'poserLocales() n a rien journalise sur une instance conforme : le passage du maillon ' +
      'redevient indistinguable d une absence de passage',
  );
  assert.match(journalises[0], /\[locales\] bootstrap exerce/);
});

test('poserLocales() journalise dans les QUATRE etats, sans exception', async () => {
  for (const [codes, defaut] of [
    [[], null],
    [['en'], 'en'],
    [['fr', 'en'], 'en'],
    [['fr', 'en'], 'fr'],
  ] as Array<[string[], string | null]>) {
    const f = fauxService(codes, defaut);
    const journalises: string[] = [];
    await poserLocales({
      plugin: () => ({ service: () => f.service }),
      log: { info: (message: string) => journalises.push(message) },
    });
    assert.equal(journalises.length, 1, `codes=[${codes}] defaut=${defaut} : ${journalises.length} ligne(s)`);
  }
});

test('src/index.ts ne porte AUCUNE logique de bootstrap : elle serait gardee par rien', () => {
  /* Strapi importe `./locales` SANS extension : le lanceur de tests de Node ne resout
     pas cet import, donc aucun test ne peut atteindre `index.ts`. Le defaut du
     2026-08-12 s'etait loge exactement la — deux `if` dans le seul fichier que personne
     ne pouvait exercer. Ce controle est mecanique : `index.ts` delegue, et ne
     journalise pas lui-meme. */
  const source = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  assert.match(code, /poserLocales\(strapi\)/, 'index.ts doit deleguer a poserLocales');
  assert.doesNotMatch(code, /strapi\.log/, 'aucun journal dans index.ts : il serait hors garde');
  assert.doesNotMatch(code, /\bif\b/, 'aucune condition dans index.ts : elle serait hors garde');
  assert.doesNotMatch(code, /assurerLocales|journalLocales/, 'index.ts ne rassemble plus les pieces');
});
