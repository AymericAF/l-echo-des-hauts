/**
 * LA CADENCE DE LA GARDE DES EN-TETES — ou plutot : les DEUX endroits ou elle ne doit
 * jamais l avoir, et le contrat qu elle doit tenir pour en avoir une ailleurs.
 *
 * CE QUI A ETE MESURE LE 2026-08-12 (tache `5e568f4a`), et qui fixe tout le reste. La
 * production ne construit PAS ce depot : elle construit `apps/web` SEUL. Releve en lecture
 * seule sur la base Coolify du VPS (`SELECT` sur `applications`) et dans le journal du
 * deploiement 371 (commit `c35e7d5`, celui qui sert aujourd hui) :
 *
 *   application `echo-site` : build_pack = nixpacks, base_directory = /apps/web,
 *   publish_directory = /dist, install_command / build_command / start_command VIDES.
 *
 *   plan Nixpacks reellement execute — install : « npm ci » · build : « npm run build ».
 *   Rien d autre. `npm test` ne tourne NULLE PART sur le chemin de la production, et
 *   `.github/workflows/gardes-du-code.yml` non plus : GitHub Actions et Coolify sont deux
 *   chemins qui ne se croisent pas.
 *
 * CONSEQUENCE, ET C EST TOUT L OBJET DE CE FICHIER. Le SEUL crochet qui s execute en
 * production est `npm run build`, c est-a-dire `astro build` (donc les integrations
 * d `astro.config.mjs`) puis `scripts/index-pagefind.mjs`. Y brancher un verificateur qui
 * interroge un SERVEUR ferait deux degats a la fois :
 *
 *   1. il mesurerait l ANCIEN conteneur — au moment du build, la bascule n a pas eu lieu.
 *      Journal du deploiement 371 : le build finit a 11:20:15, « Rolling update started »
 *      vient APRES. On verifierait donc l etat d avant en croyant verifier celui d apres ;
 *   2. une coupure reseau ferait ECHOUER UN DEPLOIEMENT qui n a rien a se reprocher. Le
 *      verificateur rendrait `2` — une incapacite, le code qui dit « corriger
 *      l ENVIRONNEMENT » — et la production tomberait sur un verdict qui ne parle pas
 *      d elle.
 *
 * OU ELLE DOIT VIVRE, ALORS. Sur le porteur de cadence qui existe deja et qui n est pas
 * dans ce depot : `ops/echo-veille.sh` et ses controles `ops/veille.d/` (depot prive,
 * tache `115b6646`). Son contrat est mot pour mot celui que ce verificateur rend deja —
 * `0` conforme et le porteur reste MUET, `1` divergence et la sortie standard EST le
 * message, `2` incapacite, jamais aplaties l une sur l autre. Il ne manque donc ni cadence,
 * ni canal, ni distinction des trois issues : il manque une enveloppe dans `checks.d/`.
 * Un second dispositif periodique pour le meme site serait un dispositif de plus a
 * maintenir, et c est toujours le second qui meurt en silence.
 *
 * CE QUE CE FICHIER TIENT, ET QUE RIEN NE TENAIT.
 *
 *   - `tests/garde-en-tetes-securite.test.ts` exerce les trois issues SUR LA FONCTION, en
 *     memoire. Or le porteur de cadence ne lit pas une fonction : il lit un CODE DE SORTIE.
 *     Une fonction qui rend le bon verdict et un processus qui rend un autre code laisserait
 *     le defaut entier en place — c est le meme ecart que `verificateurs-incapacite.test.ts`
 *     ferme pour les sept autres, et il n etait pas ferme pour celui-ci.
 *   - Rien n empechait de rebrancher ce verificateur dans le build ou dans l integration
 *     continue. L exemption de `verificateurs-de-sortie.mjs` le tient hors de la BOUCLE du
 *     job `sortie` ; elle ne dit rien d une integration ajoutee a `astro.config.mjs` ni d un
 *     pas `run:` ajoute au workflow. C etait une convention, pas un mecanisme.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ISSUES } from '../scripts/issues.mjs';
import {
  BASE_PAR_DEFAUT,
  POLITIQUE_ATTENDUE,
  URLS_PAR_DEFAUT,
} from '../scripts/verifier-en-tetes.mjs';
import { EXEMPTES_DE_L_INTEGRATION_CONTINUE } from '../scripts/verificateurs-de-sortie.mjs';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEPOT = path.dirname(path.dirname(RACINE));
const VERIFICATEUR = path.join(RACINE, 'scripts', 'verifier-en-tetes.mjs');
const WORKFLOW = path.join(DEPOT, '.github', 'workflows', 'gardes-du-code.yml');

/**
 * Une origine de substitution, servie en `127.0.0.1`. C est la SEULE facon de prouver les
 * trois issues sans toucher a la production : la garde ne juge que ce qu un serveur rend,
 * et un serveur conforme comme un serveur nu se fabriquent ici en trois lignes.
 *
 * @param {(chemin: string) => Record<string, string> | null} enTetesDe null -> 404
 */
function origineDeSubstitution(enTetesDe: (chemin: string) => Record<string, string> | null) {
  const serveur = http.createServer((requete, reponse) => {
    const enTetes = enTetesDe(requete.url ?? '/');
    if (enTetes === null) {
      reponse.writeHead(404).end('');
      return;
    }
    reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...enTetes }).end('<!doctype html>');
  });
  return new Promise<{ base: string; fermer: () => Promise<void> }>((ok) => {
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address() as { port: number };
      ok({
        base: `http://127.0.0.1:${adresse.port}`,
        fermer: () => new Promise<void>((ferme) => serveur.close(() => ferme())),
      });
    });
  });
}

/** La politique attendue, telle qu un serveur conforme la servirait. */
function politiqueServie(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(POLITIQUE_ATTENDUE).map(([nom, regle]) => [nom, regle.valeur]),
  );
}

/**
 * Lance le verificateur EN LIGNE DE COMMANDE sur une origine donnee.
 *
 * `spawn` et NON `spawnSync` : l origine de substitution est servie par CE processus, et
 * `spawnSync` bloque sa boucle d evenements — le serveur n accepterait jamais la connexion
 * et la garde s eterniserait sur un `fetch` sans reponse. Mesure du 2026-08-12 : 60 s sans
 * un octet, puis un code 143 d abandon. Un test qui se pend est un test qu on retire.
 */
function lancer(base: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((ok) => {
    const fils = spawn(process.execPath, [VERIFICATEUR, base], { encoding: 'utf8' } as never);
    let stdout = '';
    let stderr = '';
    fils.stdout.on('data', (d) => (stdout += d));
    fils.stderr.on('data', (d) => (stderr += d));
    fils.on('close', (code) => ok({ code: code ?? -1, stdout, stderr }));
  });
}

// ── 1. Le CODE DE SORTIE est le verdict — c est lui, et rien d autre, que lit un porteur

test('conforme : le processus rend 0, et il ne dit RIEN sur la sortie d erreur', async () => {
  const { base, fermer } = await origineDeSubstitution(() => politiqueServie());
  try {
    const passe = await lancer(base);
    assert.equal(
      passe.code,
      ISSUES.CONFORME,
      `code ${passe.code} au lieu de 0 :\n${passe.stderr}${passe.stdout}`,
    );
    /* LA MOITIE LA PLUS IMPORTANTE DU CONTRAT, et la plus facile a perdre : un controle
       qui parle a chaque passage se fait ignorer, et le jour ou il dit quelque chose il
       est ignore aussi. Le porteur ne relaie que ce qui sort en `1` ou `2` ; encore
       faut-il que le cas conforme n ecrive rien la ou il regarde. */
    assert.equal(passe.stderr, '', `le cas conforme ecrit sur stderr : « ${passe.stderr.trim()} »`);
  } finally {
    await fermer();
  }
});

test('politique absente : le processus rend 1, en NOMMANT chaque en-tete manquant', async () => {
  /* Le defaut du 2026-08-10, reproduit sur une origine de substitution : un serveur qui
     repond 200 partout, sans une seule ligne de politique. C est exactement ce que
     `https://echo.ayfiweb.fr` a servi pendant quatre heures. */
  const { base, fermer } = await origineDeSubstitution(() => ({}));
  try {
    const passe = await lancer(base);
    assert.equal(passe.code, ISSUES.ANOMALIE, `code ${passe.code} au lieu de 1`);
    for (const nom of Object.keys(POLITIQUE_ATTENDUE)) {
      assert.ok(
        passe.stderr.includes(nom),
        `le rouge ne nomme pas « ${nom} » : un message qui ne nomme pas ce qui manque ` +
          'envoie chercher partout',
      );
    }
  } finally {
    await fermer();
  }
});

test('origine injoignable : le processus rend 2, JAMAIS 1 — on n a rien constate', async () => {
  /* « le site est injoignable » et « le site ne sert plus sa CSP » n envoient pas au meme
     endroit : le premier fait regarder le reseau, le second les labels de l application.
     Un porteur qui recoit `1` pour une coupure reseau envoie chercher un defaut qui
     n existe pas — et c est le controle qu on finit par eteindre. */
  const { base, fermer } = await origineDeSubstitution(() => ({}));
  await fermer(); // le port est desormais mort : plus personne n ecoute
  const passe = await lancer(base);
  assert.equal(
    passe.code,
    ISSUES.VERIFICATION_IMPOSSIBLE,
    `code ${passe.code} au lieu de 2 :\n${passe.stderr}${passe.stdout}`,
  );
  assert.match(passe.stderr, /VERIFICATION IMPOSSIBLE/);
});

test('un statut inattendu est une incapacite, pas une politique absente', async () => {
  const { base, fermer } = await origineDeSubstitution(() => null); // 404 partout
  try {
    const passe = await lancer(base);
    assert.equal(passe.code, ISSUES.VERIFICATION_IMPOSSIBLE, `code ${passe.code} au lieu de 2`);
  } finally {
    await fermer();
  }
});

// ── 2. L origine se DONNE — sans quoi rien de ce qui precede n existerait ──────────────

test("l origine se passe en argument, et la production n est que le DEFAUT", () => {
  /* Les trois tests ci-dessus n ont pu s ecrire que parce que l origine se donne. Une
     garde dont la cible est ecrite en dur ne se prouve qu en cassant la production —
     c est-a-dire qu elle ne se prouve pas. */
  assert.equal(BASE_PAR_DEFAUT, 'https://echo.ayfiweb.fr');
  const source = fs.readFileSync(VERIFICATEUR, 'utf8');
  assert.match(
    source,
    /process\.argv\[2\]\s*\?\?\s*BASE_PAR_DEFAUT/,
    'la cible n est plus prise en argument : le verificateur redevient improuvable ailleurs ' +
      'que sur la production, et le porteur de cadence ne peut plus etre recette',
  );
  assert.ok(URLS_PAR_DEFAUT.length >= 3, 'une seule URL mesuree ne dit rien du site servi');
});

// ── 3. Aucun chemin de PRODUCTION ne doit invoquer un verificateur qui sort sur le reseau

/**
 * La population n est pas ecrite ici : ce sont EXACTEMENT les exemptes de
 * `verificateurs-de-sortie.mjs`, c est-a-dire les verificateurs dont le corpus est une
 * REPONSE HTTP et non un repertoire. Fermer le cas `en-tetes` seul aurait laisse la classe
 * ouverte : `surface-publique` interroge une instance Strapi avec un jeton, et le brancher
 * au build ferait tomber la production sur un jeton expire.
 */
const SORTENT_SUR_LE_RESEAU = Object.keys(EXEMPTES_DE_L_INTEGRATION_CONTINUE);

function paquet(): { scripts: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
}

test('la population gardee ici est bien celle des verificateurs qui sortent sur le reseau', () => {
  /* Si l exemption disparaissait, cette liste deviendrait vide et les trois tests suivants
     passeraient sur du vide — verts sans avoir rien regarde. */
  assert.ok(SORTENT_SUR_LE_RESEAU.length >= 2, 'la population gardee est vide ou amputee');
  assert.ok(SORTENT_SUR_LE_RESEAU.includes('en-tetes'));
});

test('`npm run build` — le SEUL crochet que la production execute — n en invoque aucun', () => {
  const build = paquet().scripts.build;
  for (const nom of SORTENT_SUR_LE_RESEAU) {
    assert.ok(
      !build.includes(nom),
      `le script « build » invoque verifier:${nom}. Mesure du 2026-08-12 : la production ` +
        'execute « npm ci » puis « npm run build » dans apps/web, et RIEN d autre. Un ' +
        'verificateur qui interroge un serveur y mesurerait l ANCIEN conteneur, et ferait ' +
        'echouer le deploiement sur une coupure reseau. Sa cadence est ops/veille.d/ ' +
        '(depot prive), pas le build.',
    );
  }
});

test('aucune integration d `astro.config.mjs` n en invoque un', () => {
  /* `astro build` est le premier maillon de `npm run build` : une integration ajoutee ici
     s execute EN PRODUCTION, dans le conteneur de construction. C est la porte la plus
     naturelle, et la plus couteuse. */
  const sources = [
    fs.readFileSync(path.join(RACINE, 'astro.config.mjs'), 'utf8'),
    ...fs
      .readdirSync(path.join(RACINE, 'integrations'))
      .map((f) => fs.readFileSync(path.join(RACINE, 'integrations', f), 'utf8')),
  ].join('\n');

  for (const nom of SORTENT_SUR_LE_RESEAU) {
    assert.ok(
      !sources.includes(`verifier-${nom}`) && !sources.includes(`verifier:${nom}`),
      `verifier-${nom} est cable dans le build Astro : il s executerait en production, ` +
        'contre un serveur qui sert encore le conteneur PRECEDENT, et un incident reseau ' +
        'ferait echouer le deploiement',
    );
  }
});

test("aucun pas de l integration continue n en invoque un : elle n a pas de site a interroger", () => {
  /* LES COMMENTAIRES SONT RETIRES AVANT DE JUGER, et ce n est pas une facilite : l en-tete
     de ce workflow NOMME `verifier-en-tetes` sur quatre lignes pour expliquer justement
     pourquoi il n y est pas. Rougir dessus punirait l explication et pousserait a
     l effacer — on perdrait le seul endroit ou la raison est ecrite, pour garder une
     garde qui ne juge plus rien. Une ligne commentee, en YAML comme dans un `run:`, ne
     s execute pas : ce qui est juge ici, c est ce qui TOURNE. */
  const yml = fs
    .readFileSync(WORKFLOW, 'utf8')
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n');
  for (const nom of SORTENT_SUR_LE_RESEAU) {
    assert.ok(
      !yml.includes(`verifier:${nom}`) && !yml.includes(`verifier-${nom}`),
      `le workflow invoque verifier:${nom}. L integration continue n a pas de site a ` +
        'interroger : elle rougirait sur un incident reseau, et un rouge qui ne veut rien ' +
        'dire se fait ignorer — puis le jour ou il dit quelque chose, il est ignore aussi',
    );
  }
});

test('CONTRE-EPREUVE : le build cable bien, lui, les verificateurs qui lisent un repertoire', () => {
  /* Sans elle, les trois tests ci-dessus resteraient verts sur un `astro.config.mjs` vide
     ou un workflow supprime — ils prouveraient une absence sans prouver qu il y a quelque
     chose a laquelle elle s oppose. */
  const config = fs.readFileSync(path.join(RACINE, 'astro.config.mjs'), 'utf8');
  assert.match(config, /integrations\/garde-/, 'plus aucune garde n est cablee dans le build');
  const yml = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(yml, /verificateurs-de-sortie\.mjs/, 'le job « sortie » ne relance plus rien');
});
