/**
 * Acces REST a Strapi, au BUILD uniquement.
 *
 * Le jeton est un jeton de build en LECTURE SEULE (§7 du cahier, hypothese 8 du brief) :
 * il n est jamais expose au navigateur — ce module n est importe que par le loader
 * Content Layer, qui s execute dans le processus de build. Aucune variable ici n est
 * prefixee `PUBLIC_`, ce qui garantit que Vite ne l inline pas dans un bundle client.
 */
import { creerRegistre, inscrire, lireEmpreinte, type RegistreEmpreintes } from './empreintes.ts';
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
 *
 * ⚠️ CE QU ELLES NE COUVRENT PAS NON PLUS — corrige le 2026-08-20 (tache `86db5b22`, sur la mesure
 * de `a1d26d8e` : les 54 bascules du CMS depuis le 2026-08-03). LA BASCULE N EST PAS UN TROU,
 * C EST UN DOUBLON. Pendant une mediane de 30,3 s (14,5 a 35,9 s, sur 54 sur 54), les DEUX
 * conteneurs sont vivants, sains, et portes par des etiquettes Traefik IDENTIQUES au caractere
 * pres — elles derivent de l UUID de l application, jamais du nom du conteneur. `echoback.
 * ayfiweb.fr` a donc DEUX amonts servant DEUX commits, et tous deux repondent `200` avec un corps
 * valide. Aucune reprise ne se declenche la : il n y a rien a reprendre.
 *
 * Cause, lue dans le journal et non deduite : `health_check_start_period = 40` sur `echo-strapi`
 * fait DORMIR Coolify 40 s avant sa premiere interrogation, quand Docker, lui, declare le
 * conteneur sain des sa premiere sonde reussie — environ 10 s apres le demarrage. Les trente
 * secondes sont exactement cet ecart, et la dispersion vient du seul demarrage de Strapi : un CMS
 * qui demarre VITE creuse donc une fenetre PLUS LARGE.
 *
 * CE QUE LES REPRISES COUVRENT EXACTEMENT, et c est etroit mais reel : l INSTANT ou l ancien
 * conteneur est retire et ou le proxy ne route plus rien. C est ce qu a pris la queue 530
 * (`c951b25`) — un seul `502`, a 08:03:50.11, soit 160 ms apres `Removing old containers`. Sur
 * 199 constructions mesurees, TROIS ont chevauche une fenetre : les queues 263, 504 et 530.
 *
 * CE QUI COUVRE LE DOUBLON, ET QUI N EST PAS ICI : l empreinte de commit servie par le CMS
 * (`apps/cms/src/middlewares/empreinte-commit.ts`, commit 472ebf6) et lue par la sonde. NE PAS
 * chercher a elargir les reprises pour l attraper — un `200` porteur d un corps valide n est pas
 * une panne, et aucun reglage de delai ne distingue deux versions qui repondent toutes les deux.
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
 * CE QU IL FAUT RATTRAPER EST BREF, ET C EST LA MESURE QUI LE DIT. Ce n est PAS la fenetre de
 * bascule — elle dure trente secondes, mais le proxy y sert `200` des deux cotes (voir le bloc
 * ci-dessus). C est le seul INSTANT du retrait de l ancien conteneur : la queue 530 a pris son
 * `502` 160 ms apres `Removing old containers`, et le proxy routait de nouveau a la seconde
 * suivante. Un intervalle taille sur celui de la sonde — 5 000 ms — perdrait donc cinq secondes
 * de build pour une panne qui a dure moins d une. On repart vite, puis on ralentit : au-dela de
 * quelques secondes ce n est plus un retrait mais un CMS reellement absent, et marteler n y
 * change rien.
 *
 * ⚠️ La version precedente de ce paragraphe disait « la fenetre mesuree fait environ QUATRE
 * SECONDES ». C etait FAUX d un facteur sept, et surtout ce n etait pas une fenetre : 4,5 s
 * separaient deux evenements d une seule queue. Corrige le 2026-08-20 sur les 54 bascules de
 * `a1d26d8e`. Le dimensionnement, lui, ne bouge pas — il etait taille sur le retrait, qui est
 * bien ce qu il couvre.
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

/* ══════════════════════════════════════════════════════════════════════════════════════
 * LA GARDE DE BASCULE — ce qui couvre le DOUBLON, la ou les reprises ci-dessus ne peuvent rien.
 *
 * Les reprises traversent le BORD de la fenetre (le retrait de l ancien conteneur). Elles ne
 * voient PAS les trente secondes qui le precedent, ou les deux conteneurs repondent `200` avec un
 * corps valide : il n y a rien a reprendre, et aucun reglage de delai ne distingue deux versions
 * qui repondent toutes les deux correctement. Le seul fait observable depuis le build est
 * l EMPREINTE que chaque reponse porte — et le seul jugement possible est « elle a change ».
 *
 * La regle vit dans `empreintes.ts`, avec ce qu elle coute et ce qu elle ne fait pas. Ici, une
 * seule chose : elle est cablee sur `tenter`, donc sur le POINT DE PASSAGE UNIQUE de tous les
 * appels du build au CMS. Un correctif qui vivrait a cote du chemin emprunte serait vert sans rien
 * garder ([[controle-jamais-execute-reellement-nest-pas-vert]]).
 * ════════════════════════════════════════════════════════════════════════════════════ */

let registre: RegistreEmpreintes = creerRegistre();

/** Ce que la construction en cours a vu. Lu par `corpus.ts` pour prononcer le mot de la fin. */
export function registreDesEmpreintes(): RegistreEmpreintes {
  return registre;
}

/**
 * UN PROCESSUS, UNE CONSTRUCTION, UN REGISTRE — la production n appelle JAMAIS ceci.
 *
 * Elle n en a pas besoin : chaque construction est un processus neuf, et la sonde
 * `attendre-schema.mjs` en est un autre (deux entrees distinctes de `cmds`, ce que
 * `tests/nixpacks-preuve-surcharge.test.ts` verrouille). Les BANCS, eux, enchainent plusieurs
 * constructions simulees dans le meme processus : sans remise a zero, le second heriterait des
 * empreintes du premier et rougirait pour une bascule qui n a pas eu lieu.
 */
export function reinitialiserRegistreDesEmpreintes(): void {
  registre = creerRegistre();
}

/** Ce qu une tentative a produit — la frontiere entre « je reessaie » et « c est fini ». */
type Tentative =
  | { sorte: 'reponse'; valeur: unknown }
  | { sorte: 'definitive'; message: string }
  | { sorte: 'rupture'; message: string }
  | { sorte: 'transitoire'; precision: string };

async function tenter(url: string, jeton: string, chemin: string): Promise<Tentative> {
  try {
    const reponse = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
    });

    /* L empreinte se lit AVANT tout aiguillage sur le statut, et sur TOUTES les reponses — 404 et
       erreurs comprises. Le middleware du CMS pose son en-tete AVANT `next()` precisement pour
       cela : la reponse qu il est le plus utile d identifier est le `400 ValidationError` de
       l ancien schema. */
    const rupture = inscrire(registre, lireEmpreinte(reponse.headers), chemin);
    if (rupture !== null) return { sorte: 'rupture', message: rupture };

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
    /* Une rupture ne se REESSAIE pas : reessayer ne ferait qu ajouter une troisieme lecture a une
       construction deja compromise, et la fenetre ne se referme pas parce qu on insiste. */
    if (tentative.sorte === 'rupture') throw new Error(tentative.message);

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
