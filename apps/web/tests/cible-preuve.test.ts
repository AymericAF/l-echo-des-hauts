/**
 * LA PREUVE DE RENDU PEUT-ELLE VISER L INSTANCE — ET LE MODE PAR DEFAUT RESTE-T-IL LE BANC ?
 *
 * CE QUE CE FICHIER FERME, mesure avant toute correction le 2026-08-12 (tache 7b96216a).
 * `preuve-rendu.mjs` lancait le build ainsi :
 *
 *     spawn('npm', ['run', 'build'], { env: { ...process.env, ...env } })
 *
 * `env` portant l URL du Strapi de substitution, la surcouche gagnait TOUJOURS. Constat
 * rejoue tel quel avant de toucher au code :
 *
 *     ECHO_STRAPI_URL=https://echoback.ayfiweb.fr npm run preuve:rendu
 *     -> « Strapi de substitution : http://127.0.0.1:54860 (fixtures de tests/fixtures/) »
 *     -> 24 page(s), code 0.
 *
 * Un VERT DE BANC, avec l URL de l instance sous les yeux, et rien dans la sortie pour
 * dire que l instance n avait pas ete touchee. Le critere « les huit types de blocs » ne
 * pouvait donc s exercer que sur des donnees ecrites a la main.
 *
 * LES DEUX PIEGES SONT GARDES ICI, ET IL FAUT LES DEUX. Inverser la precedence aurait
 * ferme le premier en ouvrant le second, PIRE parce que silencieux : un `ECHO_STRAPI_URL`
 * qui traine dans un shell — il vit dans `~/.claude/.env` — ferait viser l instance a un
 * run qui se croit sur fixtures. Les tests « le banc ignore l environnement » et
 * « l instance ne surcharge rien » sont donc les DEUX faces d un meme correctif ; en
 * retirer un rouvre exactement la moitie du defaut.
 *
 * LE TROISIEME PIEGE, ET LE PLUS SOURNOIS : le repli. Un mot de cible non reconnu qui
 * retomberait en silence sur le banc rendrait le defaut d origine a l identique, avec la
 * benediction d une faute de frappe. Il est refuse — `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CIBLES,
  MOTS_DE_CIBLE,
  VARIABLES_DE_L_INSTANCE,
  VARIABLE_DE_CIBLE,
  cibleDemandee,
  manquesDeLInstance,
  sourceBanc,
  sourceInstance,
  sourcePourCible,
} from '../scripts/cible-preuve.mjs';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';

const INSTANCE = {
  ECHO_STRAPI_URL: 'https://echoback.ayfiweb.fr',
  ECHO_STRAPI_API_TOKEN_READONLY: 'jeton-de-lecture', // secret-ok : valeur inventee, aucun appel reseau
};

// ---------------------------------------------------------------------------
// 1. Le choix de la cible
// ---------------------------------------------------------------------------

test('sans rien : la cible est le BANC — c est le mode par defaut, et il doit le rester', () => {
  const choix = cibleDemandee([], {});
  assert.equal(choix.cible, CIBLES.BANC);
  assert.equal(choix.origine, 'defaut');
});

test("un ECHO_STRAPI_URL qui traine dans l environnement ne change PAS la cible", () => {
  /* LE PIEGE INVERSE, garde ici. Une URL d instance presente dans le shell ne DEMANDE
     rien : elle est la parce que `~/.claude/.env` a ete charge. Si elle suffisait a
     detourner la cible, un run de banc mesurerait l instance sans qu une ligne le dise. */
  const choix = cibleDemandee([], { ...INSTANCE });
  assert.equal(choix.cible, CIBLES.BANC, 'seule une demande explicite change de cible');
});

test('--reel vise l instance', () => {
  assert.equal(cibleDemandee(['--reel'], {}).cible, CIBLES.INSTANCE);
});

test('chaque mot declare designe bien sa cible, en drapeau comme en variable', () => {
  for (const [cible, mots] of Object.entries(MOTS_DE_CIBLE)) {
    for (const mot of mots) {
      assert.equal(cibleDemandee([`--${mot}`], {}).cible, cible, `--${mot}`);
      assert.equal(
        cibleDemandee([], { [VARIABLE_DE_CIBLE]: mot }).cible,
        cible,
        `${VARIABLE_DE_CIBLE}=${mot}`,
      );
    }
  }
});

test("PREUVE_CIBLE mal orthographiee est REFUSEE, elle ne retombe pas sur le banc", () => {
  /* Le cas qui compte : `distan` au lieu de `distant`. Un repli rendrait un vert de banc
     a qui croit mesurer l instance — le defaut d origine, offert par une coquille. */
  const choix = cibleDemandee([], { [VARIABLE_DE_CIBLE]: 'distan' });
  assert.equal(choix.cible, undefined, 'aucune cible ne doit etre choisie');
  assert.match(choix.refus, /distan/);
  assert.match(choix.refus, /instance/);
});

test('une PREUVE_CIBLE vide vaut absence, pas refus', () => {
  assert.equal(cibleDemandee([], { [VARIABLE_DE_CIBLE]: '' }).cible, CIBLES.BANC);
});

test('un drapeau inconnu est refuse, en nommant les cibles acceptees', () => {
  const choix = cibleDemandee(['--production'], {});
  assert.match(choix.refus, /--production/);
  assert.match(choix.refus, /banc/);
});

test('drapeau et variable qui se contredisent : refus, jamais un arbitrage silencieux', () => {
  const choix = cibleDemandee(['--reel'], { [VARIABLE_DE_CIBLE]: 'banc' });
  assert.equal(choix.cible, undefined);
  assert.match(choix.refus, /instance/);
  assert.match(choix.refus, /banc/);
});

test('deux drapeaux de cibles differentes : refus', () => {
  assert.match(cibleDemandee(['--reel', '--banc'], {}).refus, /contradictoires/);
});

test('drapeau et variable qui disent la MEME chose : accepte', () => {
  assert.equal(
    cibleDemandee(['--reel'], { [VARIABLE_DE_CIBLE]: 'instance' }).cible,
    CIBLES.INSTANCE,
  );
});

// ---------------------------------------------------------------------------
// 2. La surcouche d environnement — le coeur du correctif
// ---------------------------------------------------------------------------

test('le BANC surcharge l environnement, et c est desormais DELIBERE', async () => {
  const source = sourceBanc([...LOCALES_SITE]);
  const ouverture = await source.ouvrir();
  try {
    assert.equal(ouverture.incapacite, undefined, ouverture.incapacite);
    assert.match(
      ouverture.surcouche.ECHO_STRAPI_URL,
      /^http:\/\/127\.0\.0\.1:\d+$/,
      'le build de banc doit viser le serveur local, quoi que dise l environnement',
    );
    assert.equal(ouverture.surcouche.ECHO_STRAPI_API_TOKEN_READONLY, 'jeton-de-fixture');
  } finally {
    await ouverture.fermer?.();
  }
});

test("l INSTANCE ne surcharge RIEN : c est la ligne qui repare le defaut", async () => {
  /* CE TEST EST LE CORRECTIF. Tant que la surcouche portait une URL, `{...process.env,
     ...surcouche}` ecrasait l environnement quelle que soit la cible demandee. Une
     surcouche vide laisse le build lire `ECHO_STRAPI_URL` du processus — c est-a-dire
     l instance. Y remettre une seule des deux cles rouvre le defaut. */
  const source = sourceInstance({ ...INSTANCE });
  const ouverture = await source.ouvrir();

  assert.equal(ouverture.incapacite, undefined);
  for (const nom of VARIABLES_DE_L_INSTANCE) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(ouverture.surcouche, nom),
      false,
      `${nom} ne doit JAMAIS figurer dans la surcouche du mode instance : elle ecraserait ` +
        "l environnement, et le run mesurerait autre chose que ce qu il annonce",
    );
  }
  assert.deepEqual(Object.keys(ouverture.surcouche), []);
  assert.equal(ouverture.adresse, INSTANCE.ECHO_STRAPI_URL);
  await ouverture.fermer();
});

test("l instance annonce son adresse dans son libelle : un dist/ ne se lit pas sans savoir d ou il vient", () => {
  assert.match(sourceInstance({ ...INSTANCE }).libelle, /echoback\.ayfiweb\.fr/);
  assert.match(sourceBanc([...LOCALES_SITE]).libelle, /fixtures/);
});

// ---------------------------------------------------------------------------
// 3. L incapacite se declare, en nommant la variable
// ---------------------------------------------------------------------------

test('les variables requises absentes sont NOMMEES, une par une', () => {
  assert.deepEqual(manquesDeLInstance({}), VARIABLES_DE_L_INSTANCE);
  assert.deepEqual(manquesDeLInstance({ ...INSTANCE }), []);
});

test('une variable POSEE MAIS VIDE compte comme absente', () => {
  /* `ECHO_STRAPI_URL=` produirait une URL nulle ou un `Bearer ` vide : un echec qui
     accuse l instance a la place de la variable — la classe du defaut du 2026-08-04. */
  assert.deepEqual(manquesDeLInstance({ ...INSTANCE, ECHO_STRAPI_URL: '' }), ['ECHO_STRAPI_URL']);
});

test("sans variables, le mode instance DECLARE son incapacite et ne replie pas sur le banc", async () => {
  const ouverture = await sourceInstance({}).ouvrir();
  assert.notEqual(ouverture.incapacite, undefined);
  assert.equal(ouverture.surcouche, undefined, 'aucun build ne doit partir');
  for (const nom of VARIABLES_DE_L_INSTANCE) assert.match(ouverture.incapacite, new RegExp(nom));
  assert.match(ouverture.incapacite, /VERIFICATION IMPOSSIBLE/);
  assert.match(ouverture.incapacite, /repli/i);
});

// ---------------------------------------------------------------------------
// 4. Les deux sources rendent la MEME forme de donnees
// ---------------------------------------------------------------------------

test('les deux sources exposent le meme contrat : le script n a pas a savoir laquelle il tient', () => {
  const banc = sourcePourCible(CIBLES.BANC, [...LOCALES_SITE], {});
  const instance = sourcePourCible(CIBLES.INSTANCE, [...LOCALES_SITE], { ...INSTANCE });
  for (const membre of ['cible', 'libelle', 'poseur', 'ouvrir', 'articles', 'auteurs', 'configuration']) {
    assert.ok(banc[membre] !== undefined, `banc.${membre}`);
    assert.ok(instance[membre] !== undefined, `instance.${membre}`);
  }
  assert.notEqual(banc.poseur, instance.poseur, 'le journal doit pouvoir nommer qui pose les blocs');
});

test('le banc rend `null` pour une locale sans fixture — une absence n est pas une donnee', async () => {
  const source = sourceBanc([...LOCALES_SITE]);
  assert.equal(await source.articles('xx'), null);
  assert.equal(await source.auteurs('xx'), null);
  assert.equal(await source.configuration('xx'), null);
  for (const locale of LOCALES_SITE) {
    assert.ok(Array.isArray(await source.articles(locale)), `articles-${locale}`);
  }
});

test('la source instance passe par le lecteur qu on lui injecte, et par lui seul', async () => {
  const appels: string[] = [];
  const lecteur = {
    articles: async (locale: string) => (appels.push(`articles:${locale}`), []),
    auteurs: async (locale: string) => (appels.push(`auteurs:${locale}`), []),
    configuration: async (locale: string) => (appels.push(`configuration:${locale}`), null),
  };
  const source = sourceInstance({ ...INSTANCE }, lecteur);
  await source.articles('fr');
  await source.auteurs('en');
  await source.configuration('fr');
  assert.deepEqual(appels, ['articles:fr', 'auteurs:en', 'configuration:fr']);
});

test('une cible inconnue ne fabrique aucune source : elle leve', () => {
  assert.throws(() => sourcePourCible('production', [...LOCALES_SITE], {}), /cible inconnue/);
});
