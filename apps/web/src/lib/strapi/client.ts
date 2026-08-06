/**
 * Acces REST a Strapi, au BUILD uniquement.
 *
 * Le jeton est un jeton de build en LECTURE SEULE (§7 du cahier, hypothese 8 du brief) :
 * il n est jamais expose au navigateur — ce module n est importe que par le loader
 * Content Layer, qui s execute dans le processus de build. Aucune variable ici n est
 * prefixee `PUBLIC_`, ce qui garantit que Vite ne l inline pas dans un bundle client.
 */
import { REQUETES, construireUrl, type NomRequete } from './requete.ts';
import type { Locale } from '../domaine.ts';

export interface ReponseCollection {
  data: unknown[];
  meta?: { pagination?: { page: number; pageCount: number } };
}

function variable(nom: string): string | undefined {
  const depuisVite = (import.meta as { env?: Record<string, string | undefined> }).env?.[nom];
  return depuisVite ?? process.env[nom];
}

export interface Configuration {
  baseUrl: string;
  jeton: string;
}

export function lireConfiguration(): Configuration {
  const baseUrl = variable('ECHO_STRAPI_URL');
  const jeton = variable('ECHO_STRAPI_API_TOKEN_READONLY');

  const manquantes = [
    baseUrl ? null : 'ECHO_STRAPI_URL',
    jeton ? null : 'ECHO_STRAPI_API_TOKEN_READONLY',
  ].filter((nom): nom is string => nom !== null);

  if (manquantes.length > 0) {
    throw new Error(
      `Variables d environnement absentes : ${manquantes.join(', ')}. ` +
        'Le build lit Strapi, il n a pas de mode degrade — copier .env.example en .env ' +
        'et renseigner les valeurs (elles vivent hors du depot, qui est public).',
    );
  }

  return { baseUrl: baseUrl as string, jeton: jeton as string };
}

async function appeler(configuration: Configuration, url: string): Promise<unknown> {
  const reponse = await fetch(url, {
    headers: { Authorization: `Bearer ${configuration.jeton}`, Accept: 'application/json' },
  });

  if (reponse.status === 404) return null;

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => '');
    throw new Error(
      `Strapi a repondu ${reponse.status} sur ${url.replace(configuration.baseUrl, '')} : ${corps.slice(0, 300)}`,
    );
  }

  return reponse.json();
}

/**
 * Charge une collection entiere, page par page. Le `pageSize` vient de la requete
 * declaree : il est borne pour que le poids d une reponse reste previsible, et la
 * pagination fait le reste — un plafond silencieux amputerait le corpus, et une liste
 * amputee se recette « conforme » sur ce qui manque.
 */
export async function chargerCollection(
  configuration: Configuration,
  nom: Exclude<NomRequete, 'configuration'>,
  locale: Locale,
): Promise<unknown[]> {
  const requete = REQUETES[nom];
  const entrees: unknown[] = [];
  let page = 1;
  let pages = 1;

  do {
    const url = construireUrl(configuration.baseUrl, nom, {
      ...requete,
      locale,
      pagination: { ...requete.pagination, page },
    });
    const reponse = (await appeler(configuration, url)) as ReponseCollection | null;
    if (reponse === null) return entrees;
    if (!Array.isArray(reponse.data)) {
      throw new Error(`Reponse inattendue sur ${nom} (${locale}) : « data » n est pas un tableau.`);
    }
    entrees.push(...reponse.data);
    pages = reponse.meta?.pagination?.pageCount ?? 1;
    page += 1;
  } while (page <= pages);

  return entrees;
}

/**
 * Single Type `Configuration`. Rend `null` sur 404 — ce que l instance repond tant
 * qu aucune entree n a ete creee (releve du 2026-08-07 sur echoback.ayfiweb.fr : la
 * permission est ouverte, le contenu manque). Ce que le build fait de ce `null` est
 * decide dans `corpus.ts`, pas ici.
 */
export async function chargerConfiguration(
  configuration: Configuration,
  locale: Locale,
): Promise<unknown | null> {
  const url = construireUrl(configuration.baseUrl, 'configuration', {
    ...REQUETES.configuration,
    locale,
  });
  const reponse = (await appeler(configuration, url)) as { data?: unknown } | null;
  return reponse?.data ?? null;
}
