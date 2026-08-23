/**
 * Tests du telechargement des medias dans la sortie — le geste que T-01 demande.
 *
 * T-01 (`docs/arbitrages-techniques.md`) : « l image de vignette servie depuis notre
 * propre domaine, TELECHARGEE AU BUILD ». `src/lib/media.ts` tient la moitie du contrat
 * — le chemin ecrit dans la page — et ce module tient l autre : les octets deposes sous
 * ce chemin. Sans lui, la correction remplacerait une image interdite par une image
 * absente, ce qui donne exactement le meme ecran.
 *
 * CE QUE LES TESTS EXERCENT, et pourquoi chacun : la LISTE se derive de la sortie reelle
 * (aucun registre a tenir a jour, donc rien a oublier), le telechargement ECHOUE FORT
 * (un 404 silencieux rendrait le meme site sans images), et rien n est telecharge deux
 * fois (l accueil reference la meme couverture que la page de rubrique).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadEnv } from 'vite';

import { chargerEnvDuBuild } from '../scripts/env-du-build.mjs';
import { localiserMedias, referencesMediasDe } from '../scripts/medias-locaux.mjs';

import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';

/* Les bacs de ce fichier se referment : nettoyage dans `after()`, bac du cas fautif
   conservé avec sa raison. Cf. `outils/bac-jetable.mjs`. */
brancherLesBacs();

function dist(fichiers: Record<string, string>): string {
  const racine = bacJetable('medias-locaux');
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

/** Un `fetch` de substitution : { url: corps } ; toute autre URL rend 404. */
function recuperateur(reponses: Record<string, string>, journal: string[] = []) {
  return async (url: string) => {
    journal.push(url);
    const corps = reponses[url];
    if (corps === undefined) return { ok: false, status: 404, octets: null };
    return { ok: true, status: 200, octets: Buffer.from(corps) };
  };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const BASE = 'https://echoback.ayfiweb.fr';

// --- Famille 1 : la liste se derive de la sortie ---------------------------------------

test('les references sont relevees dans le HTML produit', () => {
  const arbre = dist({ 'index.html': '<img src="/medias/A01.svg"><img src="/medias/A02.svg">' });
  assert.deepEqual(referencesMediasDe(arbre), ['/medias/A01.svg', '/medias/A02.svg']);
});

test('une meme reference sur deux pages n est comptee qu une fois', () => {
  const arbre = dist({
    'index.html': '<img src="/medias/A01.svg">',
    'categorie/x/index.html': '<img src="/medias/A01.svg">',
  });
  assert.deepEqual(referencesMediasDe(arbre), ['/medias/A01.svg']);
});

test('les references des flux et des sitemaps comptent aussi', () => {
  // Un `og:image` vit dans le HTML, mais une enclosure RSS vit dans le XML : ne scanner
  // que le HTML laisserait un fichier reference sans octets.
  const arbre = dist({ 'rss.xml': '<enclosure url="https://echo.ayfiweb.fr/medias/A03.svg"/>' });
  assert.deepEqual(referencesMediasDe(arbre), ['/medias/A03.svg']);
});

test('les fichiers deja deposes sous medias/ ne se scannent pas eux-memes', () => {
  const arbre = dist({ 'medias/A01.svg': '<svg>/medias/piege.svg</svg>' });
  assert.deepEqual(referencesMediasDe(arbre), []);
});

test('un chemin qui ressemble a un media sans en etre un n est pas releve', () => {
  const arbre = dist({ 'index.html': '<a href="/mediastheque/x">x</a>' });
  assert.deepEqual(referencesMediasDe(arbre), []);
});

// --- Famille 2 : le telechargement ------------------------------------------------------

test('chaque reference est telechargee sous son chemin, depuis /uploads/', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/A01.svg">' });
  const journal: string[] = [];
  const rapport = await localiserMedias(arbre, BASE, {
    recuperer: recuperateur({ [`${BASE}/uploads/A01.svg`]: SVG }, journal),
  });

  assert.deepEqual(journal, [`${BASE}/uploads/A01.svg`]);
  assert.deepEqual(rapport.echecs, []);
  assert.equal(rapport.telecharges, 1);
  assert.equal(fs.readFileSync(path.join(arbre, 'medias', 'A01.svg'), 'utf8'), SVG);
});

test('un sous-chemin de la mediatheque est recree dans la sortie', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/2026/08/x.png">' });
  await localiserMedias(arbre, BASE, {
    recuperer: recuperateur({ [`${BASE}/uploads/2026/08/x.png`]: SVG }),
  });
  assert.ok(fs.existsSync(path.join(arbre, 'medias', '2026', '08', 'x.png')));
});

test('un media introuvable est un ECHEC nomme, jamais un silence', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/absent.svg">' });
  const rapport = await localiserMedias(arbre, BASE, { recuperer: recuperateur({}) });
  assert.equal(rapport.echecs.length, 1);
  assert.match(rapport.echecs[0], /absent\.svg/);
  assert.match(rapport.echecs[0], /404/);
});

test('une reponse vide est un echec : un fichier de zero octet est une image cassee', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/vide.svg">' });
  const rapport = await localiserMedias(arbre, BASE, {
    recuperer: async () => ({ ok: true, status: 200, octets: Buffer.alloc(0) }),
  });
  assert.equal(rapport.echecs.length, 1);
  assert.match(rapport.echecs[0], /vide/);
  assert.equal(fs.existsSync(path.join(arbre, 'medias', 'vide.svg')), false);
});

test('une sortie sans aucun media ne telecharge rien et ne se plaint pas', async () => {
  const arbre = dist({ 'index.html': '<p>Bonjour</p>' });
  const rapport = await localiserMedias(arbre, BASE, {
    recuperer: async () => {
      throw new Error('aucun appel ne devrait avoir lieu');
    },
  });
  assert.equal(rapport.telecharges, 0);
  assert.deepEqual(rapport.echecs, []);
});

test('une base absente est un echec explicite, pas une URL bancale', async () => {
  const arbre = dist({ 'index.html': '<img src="/medias/A01.svg">' });
  await assert.rejects(
    () => localiserMedias(arbre, '', { recuperer: recuperateur({}) }),
    /ECHO_STRAPI_URL/,
  );
});

// --- Famille 3 : le DEPOSEUR et le PRODUCTEUR lisent-ils la meme ECHO_STRAPI_URL ? -----
//
// LA QUESTION, ET POURQUOI ELLE SE POSE. `integrations/medias-locaux.mjs` depose les
// octets d apres `process.env.ECHO_STRAPI_URL` ; le PRODUCTEUR des chemins — le loader
// Content Layer, via `src/lib/strapi/client.ts` — lit `import.meta.env[nom] ?? process.env[nom]`,
// donc VITE D ABORD. Deux lectures differentes de la meme variable : c est la forme exacte
// du defaut ferme le 2026-08-11 sur `ECHO_SITE_URL` (commit b6805ac), ou trois gardes
// jugeaient contre `process.env` quand le producteur suivait la configuration resolue.
//
// CE QUE LA MESURE DU 2026-08-14 A ETABLI (tache b863b636), et qui REFUTE le soupcon :
// les deux convergent TOUJOURS, et par un mecanisme precis en deux temps —
//
//   1. `astro.config.mjs` s execute AVANT tout : il resout les variables et POUSSE dans
//      `process.env` toute cle `ECHO_` qui n y est pas encore (`chargerEnvDuBuild`) ;
//   2. Vite resout ensuite `loadEnv(mode, root, '')`, qui donne la PRIORITE a `process.env`
//      sur les fichiers `.env*`. Le producteur voit donc exactement la valeur du temps 1.
//
// Mesure de bout en bout, sur des builds reels : `.env` portant `https://bidon.invalid` et
// `.env.staging` la vraie instance, `npx astro build --mode staging` echoue au « Syncing
// content » sur `ENOTFOUND bidon.invalid` — c est le PRODUCTEUR qui a suivi `process.env`,
// pas son fichier de mode. Idem avec la variable posee par le shell.
//
// CE QUE CES TESTS TIENNENT. La convergence n est ecrite NULLE PART : elle tient a
// l enchainement ci-dessus. Retirer la poussee, la borner a d autres prefixes, ou une
// version de Vite qui cesserait de preferer `process.env` la romprait EN SILENCE — et le
// site servirait alors les octets d une instance et les chemins d une autre, toutes deux
// en 200, donc build VERT. Les deux temps sont donc verrouilles ici.

test('TEMPS 1 — la resolution du build pousse les variables ECHO_ dans process.env', () => {
  const env = { ECHO_STRAPI_URL: 'https://mediatheque.test', AUTRE: 'x' };
  const cible: Record<string, string | undefined> = {};
  chargerEnvDuBuild(env, cible);
  assert.equal(cible.ECHO_STRAPI_URL, 'https://mediatheque.test');
});

test('TEMPS 1 — ce qui n est pas prefixe ECHO_ n est PAS pousse', () => {
  // La borne du prefixe est ce qui empeche la resolution du build de deverser dans
  // `process.env` tout ce qui traine dans un `.env` de poste.
  const cible: Record<string, string | undefined> = {};
  chargerEnvDuBuild({ AUTRE: 'x', PATH: 'pirate' }, cible);
  assert.deepEqual(cible, {});
});

test('TEMPS 1 — une valeur DEJA posee par l environnement n est jamais ecrasee', () => {
  // Le conteneur Coolify passe ses variables par l environnement du processus : les
  // ecraser avec un `.env` de poste ferait construire contre la mauvaise instance.
  const cible: Record<string, string | undefined> = { ECHO_STRAPI_URL: 'https://coolify.test' };
  chargerEnvDuBuild({ ECHO_STRAPI_URL: 'https://poste.test' }, cible);
  assert.equal(cible.ECHO_STRAPI_URL, 'https://coolify.test');
});

test('TEMPS 2 — process.env l emporte sur un fichier de mode, donc les deux convergent', () => {
  /* LE COEUR DE LA CONVERGENCE. Si Vite preferait un jour son fichier `.env.<mode>` a
     `process.env`, le producteur lirait une instance et le deposeur une autre — sans que
     rien ne rougisse. Ce test exerce la vraie fonction de Vite, pas une reconstitution. */
  const racine = bacJetable('env-du-build');
  fs.writeFileSync(path.join(racine, '.env'), 'ECHO_STRAPI_URL=https://du-fichier.test\n');
  fs.writeFileSync(path.join(racine, '.env.staging'), 'ECHO_STRAPI_URL=https://du-mode.test\n');

  // Sans rien dans l environnement, le fichier de mode gagne — c est le comportement normal.
  assert.equal(loadEnv('staging', racine, '').ECHO_STRAPI_URL, 'https://du-mode.test');

  // Des que la resolution du build a pousse sa valeur, c est ELLE que le producteur lit.
  const precedente = process.env.ECHO_STRAPI_URL;
  try {
    process.env.ECHO_STRAPI_URL = 'https://pousse-par-le-build.test';
    assert.equal(
      loadEnv('staging', racine, '').ECHO_STRAPI_URL,
      'https://pousse-par-le-build.test',
    );
  } finally {
    if (precedente === undefined) delete process.env.ECHO_STRAPI_URL;
    else process.env.ECHO_STRAPI_URL = precedente;
  }
});
