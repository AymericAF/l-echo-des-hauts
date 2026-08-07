/**
 * `npm run seed` — charge le contenu de demonstration versionne dans Strapi.
 *
 * Rejouable : le rapprochement se fait sur le slug, par locale. Deux executions
 * consecutives donnent le meme comptage en base.
 *
 * Deux variables d'environnement, aucune valeur par defaut secrete :
 *   SEED_STRAPI_URL    (defaut http://localhost:1337)
 *   SEED_STRAPI_TOKEN  jeton d'API **full-access** — PAS celui du build, qui
 *                      est en lecture seule (contrainte dure de la §1 ratifiee).
 *
 * Sous-commandes :
 *   (aucune)     execute le seed puis affiche le comptage en base
 *   --verifier   n'ecrit rien : rejoue le controle 12 du plan editorial
 *   --comptage   n'ecrit rien : affiche le comptage en base
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClientHttp } from './client.ts';
import { chargerCorpus } from './corpus.ts';
import { executerSeed } from './seed.ts';
import { controlerLocalisationsEn, EFFECTIFS_EN } from './controle12.ts';
import { ErreurCorpus, ErreurStrapi } from './erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_DATA = path.join(ICI, '..', '..', 'data');

const BASE = (process.env.SEED_STRAPI_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const JETON = process.env.SEED_STRAPI_TOKEN ?? '';

const FAMILLES = ['categories', 'tags', 'auteurs', 'dossiers', 'articles'] as const;

async function lireJson(chemin: string): Promise<any> {
  const url = `${BASE}/${chemin}`;
  const rep = await fetch(url, { headers: { Authorization: `Bearer ${JETON}` } });
  const texte = await rep.text();
  if (!rep.ok) throw new ErreurStrapi('GET', url, rep.status, texte);
  return JSON.parse(texte);
}

/** Le comptage en base, famille par famille et locale par locale. */
async function comptage(): Promise<Record<string, number>> {
  const sortie: Record<string, number> = {};
  for (const famille of FAMILLES) {
    for (const locale of ['fr', 'en']) {
      const statut = famille === 'articles' ? '&status=published' : '';
      const rep = await lireJson(
        `api/${famille}?locale=${locale}&fields[0]=slug&pagination[pageSize]=1${statut}`
      );
      sortie[`${famille}:${locale}`] = rep?.meta?.pagination?.total ?? 0;
    }
  }
  const medias = await lireJson('api/upload/files?pagination[pageSize]=1');
  sortie['medias'] = Array.isArray(medias) ? medias.length : (medias?.pagination?.total ?? 0);
  for (const locale of ['fr', 'en']) {
    const rep = await lireJson(`api/configuration?locale=${locale}&fields[0]=nomSite`);
    sortie[`configuration:${locale}`] = rep?.data ? 1 : 0;
  }
  return sortie;
}

function afficherComptage(titre: string, valeurs: Record<string, number>) {
  console.log(`\n${titre}`);
  for (const [cle, n] of Object.entries(valeurs)) console.log(`  ${cle.padEnd(22)} ${n}`);
}

async function verifier(): Promise<number> {
  const rapport = await controlerLocalisationsEn(lireJson);

  console.log('\nControle 12 — (a) les 41 localisations EN portant un uid');
  let total = 0;
  for (const [plural, attendu] of Object.entries(EFFECTIFS_EN)) {
    const rendu = rapport.a.effectifs[plural] ?? 0;
    total += rendu;
    console.log(`  ${plural.padEnd(12)} ${String(rendu).padStart(3)} / ${attendu}`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(total).padStart(3)} / 41`);
  for (const a of rapport.a.anomalies) console.log(`  !! ${a.objet} : ${a.constat}`);

  console.log('\nControle 12 — (b) relations des 8 articles EN');
  console.log(`  fields[0]=locale rend-il le locale de l'entree liee ? ${rapport.b.localeRendueParFields ? 'OUI' : 'NON'}`);
  console.log(`  methode retenue : ${rapport.b.methode}`);
  for (const a of rapport.b.anomalies) console.log(`  !! ${a.objet} : ${a.constat}`);
  if (rapport.b.anomalies.length === 0) console.log('  aucune entree liee hors locale en');

  console.log(`\nControle 12 : ${rapport.vert ? 'VERT' : 'ROUGE'}`);
  return rapport.vert ? 0 : 1;
}

async function principal(): Promise<number> {
  const args = new Set(process.argv.slice(2));

  if (JETON === '') {
    console.error(
      'SEED_STRAPI_TOKEN est vide.\n' +
        "  Creez un jeton d'API **full-access** dans l'admin Strapi\n" +
        '  (Settings > API Tokens > Create new API Token, Token type: Full access)\n' +
        "  et exportez-le. Ce n'est PAS le jeton du build, qui est en lecture seule."
    );
    return 2;
  }

  if (args.has('--verifier')) return verifier();
  if (args.has('--comptage')) {
    afficherComptage('Comptage en base', await comptage());
    return 0;
  }

  console.log(`corpus : ${RACINE_DATA}`);
  const corpus = chargerCorpus(RACINE_DATA);
  console.log(
    `lu : ${corpus.medias.length} medias, ${corpus.categories.length} categories, ` +
      `${corpus.tags.length} tags, ${corpus.auteurs.length} auteurs, ` +
      `${corpus.dossiers.length} dossiers, ${corpus.articles.length} articles`
  );

  const client = new ClientHttp(BASE, JETON);
  const debut = Date.now();
  const resultat = await executerSeed(client, corpus, (l) => console.log(`  ${l}`));
  console.log(`\ntermine en ${((Date.now() - debut) / 1000).toFixed(1)} s`);

  const somme = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  console.log(`creations : ${somme(resultat.crees)} — mises a jour : ${somme(resultat.misAJour)}`);
  afficherComptage('Comptage en base', await comptage());
  return 0;
}

/*
 * Le code de sortie se POSE (`process.exitCode`), il ne se force pas
 * (`process.exit()`) : le processus se termine ensuite de lui-meme, quand ses
 * handles se sont fermes.
 *
 * `process.exit()` coupe les handles libuv encore ouverts — ici les sockets
 * keep-alive du client HTTP vers Strapi. Sur Node 24 / Windows, la coupure
 * faisait avorter le processus (« Assertion failed:
 * !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c », code
 * 0xC0000409) APRES avoir imprime « Controle 12 : VERT ». La sortie texte
 * disait vrai, le code de retour disait l'inverse — et c'est le code de retour
 * qui commande une chaine automatisee.
 *
 * `tests/seed-code-sortie.test.ts` exerce les deux sens en sous-processus.
 */
principal()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    if (e instanceof ErreurCorpus) {
      console.error(`\nCORPUS INVALIDE — rien n'a ete ecrit dans Strapi.\n${e.message}`);
    } else if (e instanceof ErreurStrapi) {
      console.error(`\nSTRAPI A REFUSE UNE REQUETE.\n${e.message}`);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  });
