/**
 * LA SONDE DE SCHEMA — elle fait ATTENDRE le build que le CMS serve le schema qu il demande.
 *
 * POURQUOI ELLE EXISTE, mesure et non suppose. Dossier `docs/course-schema-cms-vs-build-site.md`
 * (depot de documentation, commit 767a82c), piste 2 — la seule des cinq qui ferme la course par un
 * MECANISME, et la seule qui vive entierement dans ce depot.
 *
 * LA COURSE : un push qui touche `apps/cms` ET `apps/web` met les deux applications Coolify en file
 * A LA MEME SECONDE (`concurrent_builds = 2`, aucune dependance entre applications). Le site est un
 * build STATIQUE : il interroge le Strapi de PRODUCTION pendant sa construction. Si le CMS n a pas
 * fini de redemarrer avec le nouveau schema, le build demande un champ que l ANCIEN ne connait pas,
 * recoit un `400 ValidationError`, et sort en 1 :
 *
 *   | queue site | commit    | champ refuse                        | site echoue a | CMS pret a | ecart |
 *   | 455 (14/08)| 3a8ad72   | Invalid key alternativeCouverture   | +157 s        | +346 s     | 189 s |
 *   | 501 (17/08)| dadef1d   | Invalid key alternativePartage      |  +32 s        | +118 s     |  86 s |
 *   | 506 (17/08)| 3c7a2fc   | Invalid key alternatives at contenu |  +32 s        | +307 s     | 275 s |
 *
 * CE QU ELLE FAIT : elle rejoue LES REQUETES DECLAREES de `src/lib/strapi/requete.ts` — `fields` et
 * `populate`, exactement celles que le build emettra — et boucle tant que l une d elles ne repond
 * pas `200`. Le vert qu elle rend est donc le vert que le build exige : c est la MEME requete. Une
 * sonde allegee (`/api/articles` tout nu, un `connect()` TCP, une horloge) recevrait `200` de
 * l ANCIEN Strapi et rendrait la main sur un CMS qui va faire echouer le build a la seconde
 * suivante — verte sur la mauvaise sortie ([[preuve-doit-exercer-critere-acceptation]]).
 *
 * CE QU ELLE NE FAIT PAS, ET C EST ASSUME : elle RATTRAPE la course, elle ne la SUPPRIME pas. Si le
 * deploiement du CMS echoue, elle consomme son plafond puis echoue a son tour — mais elle echoue en
 * NOMMANT le champ, ce qui est tout le gain : un « Invalid key alternativePartage » envoie chercher
 * un bug de populate dans le depot, quand la cause est un CMS en retard de 275 secondes. Le remede
 * qui supprimerait la course (sequencer les deux deploiements) est la piste 1 du dossier, et il est
 * explicitement recommande de NE PAS l engager tant que cette sonde n a pas consomme son plafond.
 *
 * ⚠️ ELLE MESURE UN INSTANT, LE BUILD CONSOMME UNE DUREE — et cette moitie-la ne lui appartient
 * PAS. Mesure du 2026-08-19 (tache `d0e0df3b`, commit c951b25, queues 529 et 530) : elle a rendu
 * « PRET a la premiere passe » a 08:03:46.41, et le build a echoue sur un `502` a 08:03:50.11,
 * QUATRE SECONDES ET DEMIE plus tard, pendant que Traefik passait de l ancien conteneur CMS au
 * nouveau. Aucune attente prealable ne peut couvrir une fenetre qui s ouvre APRES elle : son
 * plafond n avait meme pas ete effleure (0,9 s sur 600), donc l allonger n aurait rien change.
 * Ce qui couvre cette fenetre vit desormais dans `src/lib/strapi/client.ts` — les REPRISES sur
 * 502/503/504 et sur l injoignable, verrouillees par `tests/client-reprises.test.ts`.
 *
 * LA FRONTIERE ENTRE LES DEUX, a ne pas brouiller : la sonde repond « le CMS sert-il le SCHEMA que
 * ce commit demande » (un `400` est son affaire, elle le NOMME) ; les reprises repondent « le CMS
 * est-il JOIGNABLE a cet instant » (un `502` est leur affaire, elles le traversent). Faire porter
 * le `400` aux reprises noierait la seule ligne qui dit ou chercher ; faire porter le `502` a la
 * sonde ne servirait a rien, puisqu il tombe apres elle.
 *
 * ⚠️ SA LIMITE CONNUE, ECRITE PLUTOT QUE COMBLEE : un `200` NE PROUVE PAS que c est le NOUVEAU CMS
 * qui a repondu. Le 2026-08-19, elle a valide a 08:03:46.41 alors que le nouveau conteneur n est
 * devenu sain qu a 08:03:49.67 — elle a donc necessairement interroge l ANCIEN, encore route par
 * le proxy. Sur un vrai changement de schema, elle validerait sur l ancien, et le build partirait :
 * il casserait, ou pire il reussirait sur l ANCIEN schema en produisant un site perime, sans aucun
 * signal. La fermer exige que le CMS DISE quelle version il sert (empreinte de commit), ce qui
 * n existe pas aujourd hui et ne se decide pas ici. NE PAS la maquiller en multipliant les passes :
 * sans identification de version, N passes vertes sur l ancien conteneur restent N mensonges.
 *
 * ELLE EST UNE COMMANDE DISTINCTE DE `npm run build`, ET CE N EST PAS UN DETAIL DE STYLE : la cible
 * de temps de build M-04 se mesure sur `astro build` (avenant A6, `docs/protocole-mesure.md` §1).
 * Fondue dans le build, son attente entrerait dans le segment mesure. `tests/nixpacks-preuve-
 * surcharge.test.ts` verrouille les deux entrees de `cmds`, leur ordre, et leur non-fusion.
 *
 * DEUX CODES DE SORTIE, PAS TROIS. La convention du depot en compte trois (`./issues.mjs`), mais
 * `1 — VERIFIE ET ANOMALIE` n a aucun sens ici : cette sonde ne juge JAMAIS le site, elle juge si le
 * CMS est pret. Un CMS qui ne sert pas le schema envoie corriger l ENVIRONNEMENT, jamais le site —
 * c est la definition meme du `2`.
 */
import { setTimeout as dormir } from 'node:timers/promises';

import { ISSUES } from './issues.mjs';
import { lireConfiguration } from '../src/lib/strapi/client.ts';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';
import { REQUETES, construireUrl } from '../src/lib/strapi/requete.ts';

/**
 * LE PLAFOND, DIMENSIONNE SUR LE PIRE CAS — a ne pas raccourcir parce que les essais passent vite.
 *
 * Pire ecart mesure : 275 s (queue 506). Pire deploiement `echo-strapi` sur dix jours : 547 s.
 * Dix minutes couvrent le second avec 10 % de marge. Un plafond taille sur le cas COURANT
 * rouvrirait la course sur le cas long — c est-a-dire exactement celui qu on ferme.
 */
export const PLAFOND_PAR_DEFAUT_MS = 10 * 60 * 1000;

/** Une passe toutes les 5 s : 120 passes au plus, six requetes chacune, en `pageSize=1`. */
export const INTERVALLE_PAR_DEFAUT_MS = 5 * 1000;

/**
 * Le delai d UNE requete. Sans lui, une connexion qui reste ouverte sans repondre mangerait le
 * plafond en une seule passe, et la sonde abandonnerait sans avoir jamais reinterroge le CMS.
 */
export const DELAI_REQUETE_MS = 15 * 1000;

/** Ce qu une reponse dit du CMS — et, pour chacun, s il y a lieu d attendre. */
export const VERDICTS = {
  /** Le schema accepte la requete du build : c est le seul vert. */
  PRETE: 'prete',
  /** `400 ValidationError` : le CMS sert encore l ANCIEN schema. On attend. */
  SCHEMA_EN_RETARD: 'schema-en-retard',
  /** Injoignable, 5xx : le conteneur redemarre. On attend. */
  INDISPONIBLE: 'indisponible',
  /** 401/403 : le jeton est refuse. Attendre dix minutes ne fabrique pas un jeton. */
  REFUSEE: 'refusee',
};

/**
 * Les parametres de sonde, requete par requete.
 *
 * ILS NE DIFFERENT DE LA REQUETE DU BUILD QUE PAR LA PAGINATION, et c est la seule licence prise :
 * la validation des cles par Strapi est independante du `pageSize`, alors que ramener 50 entrees
 * toutes les 5 secondes pendant dix minutes ne l est pas. `fields` et `populate` sont, eux, repris
 * TELS QUELS — ce sont eux qui portent les cles que l ancien schema refuse.
 *
 * Le single type `configuration` n a pas de pagination declaree : lui en inventer une ferait sonder
 * autre chose que ce que le build emet.
 */
export function parametresDeSonde(locale) {
  const sondes = {};
  for (const [nom, requete] of Object.entries(REQUETES)) {
    sondes[nom] =
      requete.pagination === undefined
        ? { ...requete, locale }
        : { ...requete, locale, pagination: { ...requete.pagination, pageSize: 1, page: 1 } };
  }
  return sondes;
}

/** L URL exacte que le build construirait, allegee de sa seule pagination. */
export function urlDeSonde(baseUrl, nom, locale) {
  return construireUrl(baseUrl, nom, parametresDeSonde(locale)[nom]);
}

/** Rend le corps lisible dans un journal de build, sans le noyer. */
function extrait(corps, taille = 200) {
  const propre = String(corps).replace(/\s+/g, ' ').trim();
  return propre.length > taille ? `${propre.slice(0, taille)}…` : propre;
}

/**
 * Le champ refuse, TEL QUE LE CMS LE NOMME — jamais une constante de ce depot.
 *
 * On lit le `message` en priorite, pas `details.key` : sur une cle imbriquee, Strapi rend
 * « Invalid key alternatives at contenu » dans le message quand `details.key` ne porte que
 * `alternatives`. Le message dit OU chercher, la cle seule ne le dit pas.
 */
function champRefuse(corps) {
  let charge = null;
  try {
    charge = JSON.parse(corps);
  } catch {
    return null;
  }
  const message = charge?.error?.message;
  if (typeof message === 'string') {
    const trouve = message.match(/Invalid key\s+(.+?)\s*$/);
    if (trouve !== null) return trouve[1];
  }
  const cle = charge?.error?.details?.key;
  return typeof cle === 'string' ? cle : null;
}

/**
 * Classe une reponse HTTP — c est ici que passe la frontiere entre « j attends » et « c est fini ».
 *
 * LE 404 EST UN VERT, et ce n est pas un relachement : `src/lib/strapi/client.ts` rend `null` sur
 * 404 sans lever — le single type `Configuration` repond 404 tant qu aucune entree n a ete creee
 * (releve du 2026-08-07 sur l instance). Une sonde qui attendrait la-dessus serait PLUS STRICTE que
 * le build : elle bloquerait dix minutes puis ferait echouer un deploiement que le build, lui,
 * aurait mene a son terme. Une garde qui refuse ce que son objet accepte ne garde pas, elle casse.
 */
export function classerReponse(statut, corps) {
  if (statut === 200 || statut === 404) {
    return { verdict: VERDICTS.PRETE, champ: null, statut, precision: '' };
  }
  if (statut === 401 || statut === 403) {
    return {
      verdict: VERDICTS.REFUSEE,
      champ: null,
      statut,
      precision: `jeton refuse (${statut}) : ${extrait(corps)}`,
    };
  }
  if (statut === 400) {
    const champ = champRefuse(corps);
    return {
      verdict: VERDICTS.SCHEMA_EN_RETARD,
      champ,
      statut,
      precision:
        champ === null
          ? `400 sans cle nommee : ${extrait(corps)}`
          : `400 ValidationError — « Invalid key ${champ} »`,
    };
  }
  return {
    verdict: VERDICTS.INDISPONIBLE,
    champ: null,
    statut,
    precision: `${statut} : ${extrait(corps)}`,
  };
}

/** Une requete reelle, avec le jeton du build — la meme porte, le meme en-tete. */
async function sonderParFetch({ baseUrl, jeton, nom, locale }) {
  const url = urlDeSonde(baseUrl, nom, locale);
  try {
    const reponse = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(DELAI_REQUETE_MS),
    });
    const corps = reponse.ok ? '' : await reponse.text().catch(() => '');
    return classerReponse(reponse.status, corps);
  } catch (erreur) {
    const cause = erreur?.cause?.code ?? erreur?.name ?? '';
    return {
      verdict: VERDICTS.INDISPONIBLE,
      champ: null,
      statut: null,
      precision: `CMS injoignable — ${erreur.message}${cause ? ` (${cause})` : ''}`,
    };
  }
}

/** Le plus instructif des obstacles d une passe : un refus definitif, puis un champ nomme. */
function obstacleParlant(obstacles) {
  return (
    obstacles.find((o) => o.verdict === VERDICTS.REFUSEE) ??
    obstacles.find((o) => o.champ !== null) ??
    obstacles[0]
  );
}

const secondes = (ms) => (ms / 1000).toFixed(1);

/**
 * Boucle jusqu a ce que TOUTES les requetes declarees repondent, ou jusqu au plafond.
 *
 * TOUTES DANS LA MEME PASSE, et une passe ne garde rien de la precedente. Memoriser les verts
 * ferait un vert COMPOSE de deux schemas — celui d avant le redemarrage pour les requetes deja
 * passees, celui d apres pour les autres. Le vert du build, lui, n est jamais compose : il emet
 * toutes ses requetes contre l instance du moment.
 *
 * @param {object} options
 * @param {string} options.baseUrl Racine du CMS (`ECHO_STRAPI_URL`).
 * @param {string} options.jeton Jeton de lecture du build (`ECHO_STRAPI_API_TOKEN_READONLY`).
 * @param {string} [options.locale] Locale sondee — la validation des cles n en depend pas.
 * @param {number} [options.plafondMs] Plafond d attente. Les bancs injectent le leur ; la
 *   PRODUCTION emploie `PLAFOND_PAR_DEFAUT_MS`, verrouille par son test.
 * @param {number} [options.intervalleMs] Delai entre deux passes.
 * @param {(ms: number) => Promise<unknown>} [options.patienter] Injectable pour les bancs.
 * @param {() => number} [options.horloge] Injectable pour les bancs.
 * @param {typeof sonderParFetch} [options.sonder] Injectable pour les bancs.
 * @param {(ligne: string) => void} [options.journaliser] Une ligne PAR ATTENTE. Un journal de
 *   build muet pendant dix minutes se lit comme un build fige — et surtout, c est la seule
 *   trace qui distingue APRES COUP « elle a attendu puis reussi » de « elle a reussi tout de
 *   suite », sur un deploiement reel ou personne ne regarde le rapport.
 */
export async function attendreSchema({
  baseUrl,
  jeton,
  locale = LOCALES_SITE[0],
  plafondMs = PLAFOND_PAR_DEFAUT_MS,
  intervalleMs = INTERVALLE_PAR_DEFAUT_MS,
  patienter = dormir,
  horloge = () => Date.now(),
  sonder = sonderParFetch,
  journaliser = () => {},
}) {
  const noms = Object.keys(REQUETES);
  const debut = horloge();
  let passes = 0;
  let attentes = 0;
  /* Le PREMIER obstacle rencontre survit au succes : sans lui, un rapport vert ne saurait pas dire
     CE QU IL A ATTENDU, et « elle a attendu puis reussi » se lirait comme « elle a reussi ». */
  let premier = null;

  for (;;) {
    passes += 1;
    const obstacles = [];
    for (const nom of noms) {
      const verdict = await sonder({ baseUrl, jeton, nom, locale });
      if (verdict.verdict !== VERDICTS.PRETE) obstacles.push({ requete: nom, ...verdict });
    }

    const attenduMs = horloge() - debut;

    if (obstacles.length === 0) {
      return {
        issue: ISSUES.CONFORME,
        passes,
        attentes,
        attenduMs,
        obstacle: null,
        premierObstacle: premier,
        recit:
          premier === null
            ? `schema PRET a la premiere passe (aucune attente) — ${noms.length} requete(s) ` +
              'declaree(s) acceptee(s) par le CMS.'
            : `schema PRET apres ${secondes(attenduMs)} s d attente et ${passes} passe(s) : le CMS ` +
              `refusait encore « ${premier.champ ?? premier.precision} » sur la requete ` +
              `« ${premier.requete} » a la premiere passe. La course a ete rattrapee.`,
      };
    }

    const obstacle = obstacleParlant(obstacles);
    if (premier === null) premier = obstacle;

    const definitif = obstacle.verdict === VERDICTS.REFUSEE;
    if (definitif || attenduMs + intervalleMs >= plafondMs) {
      return {
        issue: ISSUES.VERIFICATION_IMPOSSIBLE,
        passes,
        attentes,
        attenduMs,
        obstacle,
        premierObstacle: premier,
        recit: definitif
          ? `le CMS REFUSE la requete « ${obstacle.requete} » — ${obstacle.precision}. Attendre n y ` +
            'changera rien : la sonde s arrete sans consommer son plafond. Le jeton de build ' +
            '(ECHO_STRAPI_API_TOKEN_READONLY) ou ses permissions sont a corriger.'
          : (obstacle.champ === null
              ? `le CMS n a jamais servi la requete « ${obstacle.requete} » — ${obstacle.precision}.`
              : `le CMS ne sert toujours pas « ${obstacle.champ} » (requete « ${obstacle.requete} ») ` +
                `— ${obstacle.precision}.`) +
            ` Attendu ${secondes(attenduMs)} s en ${passes} passe(s), plafond de ` +
            `${secondes(plafondMs)} s atteint : abandon.`,
      };
    }

    attentes += 1;
    journaliser(
      `passe ${passes} : ${
        obstacle.champ === null
          ? `« ${obstacle.requete} » ne repond pas — ${obstacle.precision}`
          : `le CMS ne sert pas encore « ${obstacle.champ} » (requete « ${obstacle.requete} »)`
      } — nouvelle tentative dans ${secondes(intervalleMs)} s ` +
        `(attendu ${secondes(attenduMs)} s sur un plafond de ${secondes(plafondMs)} s).`,
    );
    await patienter(intervalleMs);
  }
}

/* ------------------------------------------------------------------ */

if (import.meta.filename === process.argv[1]) {
  let configuration = null;
  try {
    /* LES MEMES VARIABLES QUE LE BUILD, LUES AU MEME ENDROIT. Une seconde resolution ici ferait
       sonder une instance et construire contre une autre — deux fois 200, donc build vert. */
    configuration = lireConfiguration();
  } catch (erreur) {
    console.error(`\n[attendre-schema] VERIFICATION IMPOSSIBLE — rien n a pu etre sonde :\n  ${erreur.message}`);
    process.exitCode = ISSUES.VERIFICATION_IMPOSSIBLE;
  }

  if (configuration !== null) {
    console.log(
      `[attendre-schema] sonde ${Object.keys(REQUETES).length} requete(s) declaree(s) sur ` +
        `${configuration.baseUrl} — plafond ${secondes(PLAFOND_PAR_DEFAUT_MS)} s, une passe toutes ` +
        `les ${secondes(INTERVALLE_PAR_DEFAUT_MS)} s.`,
    );

    const rapport = await attendreSchema({
      ...configuration,
      journaliser: (ligne) => console.log(`[attendre-schema] ${ligne}`),
    });

    if (rapport.issue === ISSUES.CONFORME) {
      console.log(`[attendre-schema] ${rapport.recit}`);
      process.exitCode = ISSUES.CONFORME;
    } else {
      console.error(`\n[attendre-schema] VERIFICATION IMPOSSIBLE — ${rapport.recit}`);
      console.error(
        '\n  Ceci n est PAS un defaut du site : le depot demande ce que le schema DOIT servir.\n' +
          '  Regarder le deploiement de `echo-strapi` du meme commit — a-t-il abouti ?\n' +
          '  L ancienne version du site reste servie ; rien n a ete publie de casse.\n' +
          `  Code de sortie ${ISSUES.VERIFICATION_IMPOSSIBLE} (0 conforme).`,
      );
      process.exitCode = ISSUES.VERIFICATION_IMPOSSIBLE;
    }
  }
}
