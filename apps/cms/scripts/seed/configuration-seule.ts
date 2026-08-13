/**
 * ÉCRIRE LE SEUL CHAMP `mentionsLegales` DU SINGLE TYPE Configuration, dans les deux locales.
 *
 * POURQUOI CE SCRIPT PLUTOT QUE `npm run seed`. Le seed complet réécrit les 40 articles FR,
 * les 8 EN et les 21 liés avec `?status=published` : Strapi 5 REPUBLIE alors chaque document
 * même inchangé, et le webhook `publish_to_coolify` tire une requête par publication — 69
 * écritures, la rafale mesurée du 2026-08-10. Le runbook impose donc, pour un seed complet,
 * de couper le webhook puis de le remettre ET de le prouver : six étapes dont l'oubli laisse
 * le site sans mise à jour, en panne muette (la consigne a déjà échoué trois fois).
 *
 * Rien de tout cela n'est nécessaire ici. `configuration` porte `draftAndPublish: false`
 * dans son `schema.json` — vérifié, pas supposé — donc son écriture n'émet JAMAIS
 * `entry.publish`. Le runbook l'écrit noir sur blanc : « tout le coût vient des articles ».
 * Ce script ne déclenche donc AUCUN déploiement, et n'a pas besoin qu'on touche au webhook.
 * Corollaire à ne pas oublier : le site étant statique, il faut ensuite déclencher UN
 * déploiement pour que la page change (étape 28 du runbook).
 *
 * IL N'ÉCRIT QU'UN CHAMP. Ni les médias, ni `nomSite`, ni `baseline`, ni `texteFooter` : un
 * PUT ne remplace que ce qu'on lui donne, et tout champ non transmis est un champ qu'on ne
 * peut pas casser.
 *
 * L'ÉTAT AVANT EST SAUVEGARDÉ SUR DISQUE avant la moindre écriture — sans lui, le retour en
 * arrière n'existe pas.
 *
 * Usage (jeton FULL ACCESS, cf. runbook « jeton de seed ») :
 *   SEED_STRAPI_URL=… SEED_STRAPI_TOKEN=… node scripts/seed/configuration-seule.ts [--constater]
 *   --constater : ne rien écrire, seulement comparer l'instance au corpus du dépôt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClientHttp } from './client.ts';
import { chargerCorpus } from './corpus.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE_DATA = path.join(ICI, '..', '..', 'data');
const BASE = (process.env.SEED_STRAPI_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const JETON = process.env.SEED_STRAPI_TOKEN ?? '';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * LA CLAUSE QUE CE SCRIPT EXISTE POUR REMETTRE — celle de l'hébergeur (LCEN art. 6 III 2°).
 *
 * Le repère est la VILLE de l'adresse, pas le mot « Hébergement » : le titre de section est
 * traduit (« Hosting »), l'adresse ne l'est pas. Un repère qui change avec la langue aurait
 * rendu la garde verte sur une locale et rouge sur l'autre, sans que rien ne manque.
 */
export const REPERE_HEBERGEUR = 'Larnaca';

/** Le texte d'un champ blocks Strapi, aplati — pour comparer et pour compter. */
export function plat(noeud: unknown): string {
  if (Array.isArray(noeud)) return noeud.map(plat).join('');
  if (noeud && typeof noeud === 'object') {
    const n = noeud as { text?: string; children?: unknown };
    return (n.text ?? '') + plat(n.children ?? []);
  }
  return '';
}

const TITRES = /Nature du site|What this site is|Images|Éditeur|Publisher|Hébergement|Hosting/g;

export type Ecart = {
  locale: string;
  longueurInstance: number;
  longueurCorpus: number;
  titresInstance: string;
  titresCorpus: string;
  /** `true` quand l'instance porte la clause : rien à faire pour cette locale. */
  clauseSurInstance: boolean;
  /** `false` signale un corpus lui-même amputé — écrire l'aggraverait au lieu de le corriger. */
  clauseDansCorpus: boolean;
};

/**
 * Juge une locale SANS RIEN ÉCRIRE. Séparé de l'écriture pour être exerçable hors réseau —
 * et parce que le verdict « le corpus non plus ne porte pas la clause » doit ARRÊTER le
 * script : publier un corpus amputé remplacerait un texte incomplet par un autre.
 */
export function jugerLocale(surInstance: unknown, voulu: unknown, locale: string): Ecart {
  const a = plat(surInstance);
  const b = plat(voulu);
  return {
    locale,
    longueurInstance: a.length,
    longueurCorpus: b.length,
    titresInstance: (a.match(TITRES) ?? []).join(' / '),
    titresCorpus: (b.match(TITRES) ?? []).join(' / '),
    clauseSurInstance: a.includes(REPERE_HEBERGEUR),
    clauseDansCorpus: b.includes(REPERE_HEBERGEUR),
  };
}

export type ClientConfiguration = {
  lireSingle(singular: string, params: { locale: string }): Promise<any>;
  majSingle(singular: string, data: Record<string, any>, params: { locale: string }): Promise<any>;
};

export type Rapport = {
  ecarts: Ecart[];
  avant: Record<string, unknown>;
  ecrites: string[];
  apres: Record<string, boolean>;
  /** `true` = ne pas redéployer : soit le corpus est amputé, soit l'écriture n'a pas pris. */
  rouge: boolean;
};

/**
 * Le geste, client INJECTÉ pour qu'il s'exerce sans instance.
 *
 * `constater: true` lit et juge sans jamais appeler `majSingle` — c'est ce que le test
 * vérifie en comptant les appels, et non en lisant la sortie : un « rien n'a été écrit »
 * imprimé ne prouve rien.
 */
export async function ecrireConfiguration(
  client: ClientConfiguration,
  configuration: Record<string, any>,
  options: { constater?: boolean; journal?: (ligne: string) => void } = {}
): Promise<Rapport> {
  const journal = options.journal ?? (() => {});
  const ecarts: Ecart[] = [];
  const avant: Record<string, unknown> = {};

  for (const locale of LOCALES) {
    const local = configuration[locale];
    if (!local) continue;
    const existant = await client.lireSingle('configuration', { locale });
    avant[locale] = existant?.mentionsLegales ?? null;

    const ecart = jugerLocale(existant?.mentionsLegales, local.mentionsLegales, locale);
    ecarts.push(ecart);
    journal(`--- ${locale} ---`);
    journal(`  instance : ${ecart.longueurInstance} caracteres — ${ecart.titresInstance || '(aucun titre reconnu)'}`);
    journal(`  corpus   : ${ecart.longueurCorpus} caracteres — ${ecart.titresCorpus || '(aucun titre reconnu)'}`);
    journal(`  instance : clause hebergeur ${ecart.clauseSurInstance ? 'PRESENTE' : '⚠ ABSENTE'}`);
  }

  /* Un corpus sans la clause n'est pas un corpus a publier : on s arrete AVANT d ecrire. */
  const corpusAmpute = ecarts.filter((e) => !e.clauseDansCorpus);
  if (corpusAmpute.length > 0) {
    journal(
      `\n⚠ ARRET — le CORPUS lui-meme ne porte pas la clause en ${corpusAmpute.map((e) => e.locale).join(', ')}.\n` +
        '  L ecrire remplacerait un texte incomplet par un autre. Corriger apps/cms/data d abord.'
    );
    return { ecarts, avant, ecrites: [], apres: {}, rouge: true };
  }

  if (options.constater) return { ecarts, avant, ecrites: [], apres: {}, rouge: false };

  const ecrites: string[] = [];
  for (const locale of LOCALES) {
    const local = configuration[locale];
    if (!local) continue;
    await client.majSingle('configuration', { mentionsLegales: local.mentionsLegales }, { locale });
    ecrites.push(locale);
    journal(`ecrit : configuration:${locale} — mentionsLegales seul`);
  }

  const apres: Record<string, boolean> = {};
  let rouge = false;
  for (const locale of ecrites) {
    const relu = plat((await client.lireSingle('configuration', { locale }))?.mentionsLegales);
    apres[locale] = relu.includes(REPERE_HEBERGEUR);
    if (!apres[locale]) rouge = true;
    journal(`  ${locale} : ${relu.length} caracteres — clause hebergeur ${apres[locale] ? 'PRESENTE' : '⚠ TOUJOURS ABSENTE'}`);
  }
  return { ecarts, avant, ecrites, apres, rouge };
}

async function principal(): Promise<number> {
  const constater = process.argv.slice(2).includes('--constater');

  if (JETON === '') {
    console.error(
      'SEED_STRAPI_TOKEN est vide — ce script ECRIT, il lui faut le jeton full-access\n' +
        '  (~/.claude/.env : ECHO_STRAPI_API_TOKEN_SEED). Le jeton de build est en lecture seule.'
    );
    return 2;
  }

  const corpus = chargerCorpus(RACINE_DATA);
  console.log(`instance : ${BASE}`);
  console.log(`corpus   : ${RACINE_DATA}\n`);

  const client = new ClientHttp(BASE, JETON);
  const rapport = await ecrireConfiguration(client, corpus.configuration, {
    constater,
    journal: (l) => console.log(l),
  });

  const dossier = path.join(ICI, '..', '..', '.sauvegardes');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, 'mentionsLegales-avant.json');
  fs.writeFileSync(fichier, JSON.stringify(rapport.avant, null, 2), 'utf8');
  console.log(`\netat AVANT sauvegarde : ${fichier}`);

  if (constater) {
    console.log('--constater : rien n a ete ecrit.');
    return rapport.ecarts.some((e) => !e.clauseSurInstance) ? 1 : 0;
  }
  console.log(
    rouge(rapport)
      ? '\n⚠ Ne pas redeployer — relire l instance.'
      : '\n✔ Le champ porte desormais la clause hebergeur dans les deux locales.\n' +
          '  Le SITE, lui, est statique : il ne changera qu au prochain deploiement.'
  );
  return rouge(rapport) ? 1 : 0;
}

const rouge = (r: Rapport) => r.rouge;

/* Le module s'IMPORTE dans les tests : n'executer qu'en point d'entree. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await principal();
}
