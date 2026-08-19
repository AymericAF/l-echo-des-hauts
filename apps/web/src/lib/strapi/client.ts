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
  /** Injectable par les BANCS uniquement. La production laisse les defauts declares plus bas. */
  reprises?: Reprises;
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

/* ══════════════════════════════════════════════════════════════════════════════════════
 * LES REPRISES — le build TRAVERSE la fenetre de bascule du CMS, il ne la devine plus.
 *
 * POURQUOI ELLES EXISTENT, mesure et non supposee (tache `d0e0df3b`, journaux Coolify du commit
 * c951b25, 2026-08-19). `scripts/attendre-schema.mjs` sonde le CMS AVANT la construction : elle
 * mesure donc a un INSTANT, quand le build, lui, consomme le CMS pendant les trente secondes qui
 * suivent. Rien ne couvrait cet intervalle.
 *
 *   08:03:46.41  SITE  [attendre-schema] schema PRET a la premiere passe (aucune attente).
 *   08:03:49.67  CMS   « healthy »              <- 3,2 s APRES le vert de la sonde
 *   08:03:49.95  CMS   Removing old containers.
 *   08:03:50.11  SITE  npm run build : Strapi a repondu 502 sur /api/articles?… : Bad Gateway
 *   08:03:51.03  SITE  ERROR: process « npm run build » … exit code: 1
 *
 * La panne tient dans la SECONDE ou Traefik passe de l ancien conteneur au nouveau. Le build lit
 * le CMS par la route PUBLIQUE — `ECHO_STRAPI_URL` est `is_buildtime` (dossier
 * `docs/course-schema-cms-vs-build-site.md` §3.2, fait 5) — donc par le proxy, donc a travers
 * cette bascule. AUCUNE attente prealable ne peut couvrir une fenetre qui s ouvre APRES elle : le
 * plafond de la sonde n a d ailleurs jamais ete atteint — 0,9 s sur 600 — et l allonger n aurait
 * rien change. Le remede a sa place ICI, dans l appel lui-meme.
 *
 * CE QU ELLES NE FONT PAS, ET C EST LA FRONTIERE AVEC LA SONDE : elles ne rattrapent PAS un
 * schema en retard. Un `400 ValidationError` sort a la PREMIERE requete, tel quel — c est
 * l affaire de la sonde, qui le NOMME. Le reprendre seize fois n ajouterait que dix minutes a un
 * build condamne, et noierait la seule ligne qui dit ou chercher.
 * ════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES STATUTS DE LA BASCULE — ceux qui disent « pas MAINTENANT », jamais « ta requete est fausse ».
 *
 * 502/503/504 sont ce que rend un proxy dont l amont a disparu, redemarre, ou ne repond plus a
 * temps. Le 500 n y est PAS : il vient de l application, il est deterministe, et le reprendre
 * ferait consommer dix minutes a un build qui echouerait de la meme facon. Le 429 non plus : il
 * n a jamais ete observe sur cette route, et une garde ecrite pour un cas jamais mesure se relit
 * ensuite comme un fait.
 */
export const STATUTS_REPRIS: ReadonlySet<number> = new Set([502, 503, 504]);

/**
 * LES DELAIS, EN MILLISECONDES — le premier sous la seconde, et ce n est pas un reglage fin.
 *
 * La fenetre mesuree fait environ QUATRE SECONDES (bascule a 08:03:49,95 ; le conteneur neuf etait
 * sain depuis 08:03:49,67). Un intervalle taille sur celui de la sonde — 5 000 ms — la manquerait
 * une fois sur deux. On repart donc vite, puis on ralentit : au-dela de quelques secondes ce n est
 * plus une bascule mais un deploiement du CMS qui traine, et marteler n y change rien.
 *
 * Au-dela du dernier, c est le dernier qui se repete. AUCUN ALEA : deux builds qui rencontrent la
 * meme panne doivent produire le meme journal, sinon aucun banc ne peut rien verrouiller.
 */
export const DELAIS_DE_REPRISE_MS: readonly number[] = [500, 1_000, 2_000, 4_000, 8_000, 10_000];

/**
 * LE PLAFOND — le meme que celui de la sonde, et pour la meme raison.
 *
 * Pire deploiement `echo-strapi` mesure sur dix jours : 547 s. Dix minutes le couvrent avec 10 %
 * de marge. Il borne UNE requete, et cela suffit a borner le build : la premiere qui l epuise le
 * fait echouer, les suivantes n ont jamais lieu. Le surcout maximal d un CMS definitivement absent
 * est donc de dix minutes UNE FOIS, pas de dix minutes par appel.
 */
export const PLAFOND_DE_REPRISE_MS = 10 * 60 * 1000;

export interface Reprises {
  plafondMs?: number;
  delaisMs?: readonly number[];
  patienter?: (ms: number) => Promise<unknown>;
  horloge?: () => number;
  /**
   * UNE LIGNE PAR REPRISE. Sans elle, « le build a traverse une bascule » et « il n a rien
   * rencontre » rendent la MEME observation — un build vert — et plus personne ne sait, apres
   * coup, si le remede a servi. C est la seule trace sur un deploiement reel, ou personne ne
   * regarde le journal tant qu il est vert.
   */
  journaliser?: (ligne: string) => void;
}

const secondes = (ms: number): string => (ms / 1000).toFixed(1);

/** Ce qu une tentative a produit — la frontiere entre « je reessaie » et « c est fini ». */
type Tentative =
  | { sorte: 'reponse'; valeur: unknown }
  | { sorte: 'definitive'; message: string }
  | { sorte: 'transitoire'; precision: string };

async function tenter(url: string, jeton: string, chemin: string): Promise<Tentative> {
  try {
    const reponse = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
    });

    if (reponse.status === 404) return { sorte: 'reponse', valeur: null };
    if (reponse.ok) return { sorte: 'reponse', valeur: await reponse.json() };

    if (STATUTS_REPRIS.has(reponse.status)) {
      await reponse.text().catch(() => '');
      return { sorte: 'transitoire', precision: `${reponse.status} ${reponse.statusText}`.trim() };
    }

    const corps = await reponse.text().catch(() => '');
    return {
      sorte: 'definitive',
      message: `Strapi a repondu ${reponse.status} sur ${chemin} : ${corps.slice(0, 300)}`,
    };
  } catch (erreur) {
    /* Aucun statut du tout : le conteneur a disparu et le suivant n a pas encore pris la main.
       C est la MEME fenetre que le 502, vue une couche plus bas — la traiter autrement n en
       couvrirait que la moitie. */
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    const cause = (erreur as { cause?: { code?: string } })?.cause?.code ?? '';
    return {
      sorte: 'transitoire',
      precision: `injoignable — ${message}${cause ? ` (${cause})` : ''}`,
    };
  }
}

/**
 * Un appel au CMS qui SURVIT a la bascule du proxy.
 *
 * @param url URL complete, deja construite par `construireUrl`.
 * @param jeton Jeton de build en lecture seule.
 * @param reprises Injectables des bancs. La PRODUCTION n en passe aucun.
 * @returns Le JSON rendu, ou `null` sur 404.
 */
export async function appelerAvecReprises(
  url: string,
  jeton: string,
  reprises: Reprises = {},
): Promise<unknown> {
  const {
    plafondMs = PLAFOND_DE_REPRISE_MS,
    delaisMs = DELAIS_DE_REPRISE_MS,
    patienter = (ms: number) => new Promise((suite) => setTimeout(suite, ms)),
    horloge = () => Date.now(),
    journaliser = (ligne: string) => console.warn(`[strapi] ${ligne}`),
  } = reprises;

  const chemin = (() => {
    try {
      const analysee = new URL(url);
      return `${analysee.pathname}${analysee.search}`;
    } catch {
      return url;
    }
  })();

  const debut = horloge();
  let repris = 0;

  for (;;) {
    const tentative = await tenter(url, jeton, chemin);

    if (tentative.sorte === 'reponse') return tentative.valeur;
    if (tentative.sorte === 'definitive') throw new Error(tentative.message);

    const attenduMs = horloge() - debut;
    const delaiMs = delaisMs[Math.min(repris, delaisMs.length - 1)];

    if (attenduMs + delaiMs >= plafondMs) {
      throw new Error(
        `Strapi n a pas repondu sur ${chemin} — ${tentative.precision}. ` +
          `${repris} reprise(s) en ${secondes(attenduMs)} s, plafond de ${secondes(plafondMs)} s ` +
          'atteint : le CMS est reste indisponible PENDANT la construction. Regarder le ' +
          'deploiement de `echo-strapi` du meme commit — a-t-il abouti ?',
      );
    }

    repris += 1;
    journaliser(
      `${chemin} — ${tentative.precision} ; nouvelle tentative dans ${secondes(delaiMs)} s ` +
        `(reprise ${repris}, ${secondes(attenduMs)} s consommees sur un plafond de ` +
        `${secondes(plafondMs)} s). Fenetre de bascule du CMS.`,
    );
    await patienter(delaiMs);
  }
}

/** Le seul chemin d appel du build — il PASSE par les reprises, il ne les contourne pas. */
async function appeler(configuration: Configuration, url: string): Promise<unknown> {
  return appelerAvecReprises(url, configuration.jeton, configuration.reprises);
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
