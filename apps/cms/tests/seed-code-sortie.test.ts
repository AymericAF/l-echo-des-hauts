/**
 * Le CODE DE SORTIE de `scripts/seed/index.ts` — ce que lit une chaine
 * automatisee, et la seule chose qu'elle lit.
 *
 * La sortie texte disait deja vrai ; c'est le code de retour qui mentait.
 * `npm run seed:verifier` imprimait « Controle 12 : VERT » puis sortait en
 * echec, un `process.exit()` coupant les handles libuv encore ouverts (sockets
 * keep-alive du client HTTP) — plantage de teardown sur Node 24 / Windows,
 * « Assertion failed ... src/win/async.c ». Un CI, un hook, ou un
 * `if seed:verifier; then` concluait ECHEC sur un controle REUSSI.
 *
 * Ce test lance le script en SOUS-PROCESSUS et n'observe que son code de
 * sortie, dans les DEUX sens : 0 quand le controle est vert, non nul quand il
 * est rouge. Un correctif qui ferait toujours sortir 0 rendrait le controle
 * inoffensif : c'est ce que le second cas interdit.
 *
 * Le Strapi est remplace par un stub HTTP qui rend exactement les deux
 * requetes du controle 12. Il ne remplace pas la preuve contre une vraie
 * instance (mutation d'une localisation EN, puis restauration) — il la
 * precede, et il tourne partout, sans base ni jeton.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { EFFECTIFS_EN, RELATIONS_ARTICLE } from '../scripts/seed/controle12.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_CMS = path.join(ICI, '..');
const SCRIPT = path.join(RACINE_CMS, 'scripts', 'seed', 'index.ts');

/* ------------------------------------------------------------------ */
/* Stub Strapi : les deux requetes du controle 12, et rien d'autre.     */
/* ------------------------------------------------------------------ */

/** Les entrees EN attendues par (a) : un slug non vide, en effectif exact. */
function entreesEn(plural: string): any[] {
  return Array.from({ length: EFFECTIFS_EN[plural] }, (_, i) => ({
    documentId: `${plural}-${i}`,
    slug: `${plural}-en-${i}`,
  }));
}

/** Les 8 articles EN de (b), relations peuplees. `localeCassee` casse le 1er. */
function articlesAvecRelations(localeCassee: string | null): any[] {
  return Array.from({ length: EFFECTIFS_EN.articles }, (_, i) => {
    const article: Record<string, any> = { slug: `articles-en-${i}` };
    for (const champ of RELATIONS_ARTICLE) {
      const locale = i === 0 && localeCassee ? localeCassee : 'en';
      const cible = { locale };
      article[champ] = champ === 'tags' || champ === 'articlesLies' ? [cible] : cible;
    }
    return article;
  });
}

/**
 * @param localeCassee `null` = base saine (vert) ; `'fr'` = une relation du
 *   premier article EN pointe encore l'entree FR (rouge).
 */
async function demarrerStub(localeCassee: string | null): Promise<{ base: string; arret: () => Promise<void> }> {
  const serveur = http.createServer((req, rep) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const plural = url.pathname.replace(/^\/api\//, '');
    const corps = url.search.includes('populate%5B') || url.search.includes('populate[')
      ? { data: articlesAvecRelations(localeCassee) }
      : { data: entreesEn(plural) };
    rep.writeHead(200, { 'content-type': 'application/json' });
    rep.end(JSON.stringify(corps));
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = (serveur.address() as any).port;
  return {
    base: `http://127.0.0.1:${port}`,
    arret: () =>
      new Promise<void>((ok) => {
        serveur.closeAllConnections?.();
        serveur.close(() => ok());
      }),
  };
}

/** Lance le script en sous-processus et rend son code de sortie. */
function lancer(args: string[], env: Record<string, string>): Promise<{ code: number; sortie: string }> {
  return new Promise((ok, ko) => {
    const enfant = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: RACINE_CMS,
      env: { ...process.env, ...env },
    });
    let sortie = '';
    enfant.stdout.on('data', (d) => (sortie += d));
    enfant.stderr.on('data', (d) => (sortie += d));
    enfant.on('error', ko);
    enfant.on('close', (code, signal) => ok({ code: code ?? -1, sortie: `${sortie}[signal ${signal}]` }));
  });
}

/* ------------------------------------------------------------------ */

test('seed --verifier : controle VERT -> code de sortie 0', async () => {
  const stub = await demarrerStub(null);
  try {
    const { code, sortie } = await lancer(['--verifier'], {
      SEED_STRAPI_URL: stub.base,
      SEED_STRAPI_TOKEN: 'jeton-de-test',
    });
    assert.match(sortie, /Controle 12 : VERT/, `le controle devait etre vert :\n${sortie}`);
    assert.equal(code, 0, `VERT doit sortir en 0, obtenu ${code} :\n${sortie}`);
  } finally {
    await stub.arret();
  }
});

test('seed --verifier : controle ROUGE -> code de sortie non nul', async () => {
  const stub = await demarrerStub('fr');
  try {
    const { code, sortie } = await lancer(['--verifier'], {
      SEED_STRAPI_URL: stub.base,
      SEED_STRAPI_TOKEN: 'jeton-de-test',
    });
    assert.match(sortie, /Controle 12 : ROUGE/, `le controle devait etre rouge :\n${sortie}`);
    // `notEqual(0)` serait vert sur un PLANTAGE (0xC0000409) comme sur un vrai
    // rouge : on exige le 1 rendu par le controle, pas un code d'echec au hasard.
    assert.equal(code, 1, `ROUGE doit sortir en 1, obtenu ${code} :\n${sortie}`);
  } finally {
    await stub.arret();
  }
});

test('seed --comptage : sortie en 0 sur une base qui repond', async () => {
  const stub = await demarrerStub(null);
  try {
    const { code, sortie } = await lancer(['--comptage'], {
      SEED_STRAPI_URL: stub.base,
      SEED_STRAPI_TOKEN: 'jeton-de-test',
    });
    assert.equal(code, 0, `le comptage doit sortir en 0, obtenu ${code} :\n${sortie}`);
  } finally {
    await stub.arret();
  }
});

test('jeton absent : sortie en 2, sans toucher au reseau', async () => {
  const { code, sortie } = await lancer([], { SEED_STRAPI_TOKEN: '' });
  assert.equal(code, 2, `le jeton vide doit sortir en 2, obtenu ${code} :\n${sortie}`);
});

test('erreur Strapi : sortie en 1 (le .catch ne rend pas 0)', async () => {
  const serveur = http.createServer((_req, rep) => {
    rep.writeHead(500, { 'content-type': 'application/json' });
    rep.end('{"error":"boom"}');
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = (serveur.address() as any).port;
  try {
    const { code, sortie } = await lancer(['--comptage'], {
      SEED_STRAPI_URL: `http://127.0.0.1:${port}`,
      SEED_STRAPI_TOKEN: 'jeton-de-test',
    });
    assert.equal(code, 1, `une erreur Strapi doit sortir en 1, obtenu ${code} :\n${sortie}`);
  } finally {
    serveur.closeAllConnections?.();
    await new Promise<void>((ok) => serveur.close(() => ok()));
  }
});
