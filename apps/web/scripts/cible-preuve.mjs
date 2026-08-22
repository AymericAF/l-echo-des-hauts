/**
 * OU LA PREUVE DE RENDU VA CHERCHER SES DONNEES : le BANC, ou l INSTANCE REELLE.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure le 2026-08-11 et rejoue le 2026-08-12 avant
 * toute correction. `preuve-rendu.mjs` lancait le build ainsi :
 *
 *     spawn('npm', ['run', 'build'], { env: { ...process.env, ...env } })
 *
 * ou `env` portait l URL du Strapi de substitution. La surcouche etant appliquee EN
 * DERNIER, elle ecrasait systematiquement l environnement. Constat rejoue :
 *
 *     ECHO_STRAPI_URL=https://echoback.ayfiweb.fr npm run preuve:rendu
 *     -> « Strapi de substitution : http://127.0.0.1:54860 (fixtures de tests/fixtures/) »
 *     -> 24 pages, VERT.
 *
 * Un vert obtenu sur un banc, avec l URL de l instance dans l environnement, et rien
 * dans la sortie pour dire que l instance n avait pas ete touchee. `preuve:rendu` est
 * l outil qui prouve la couverture des huit types de blocs : tant qu il ne savait viser
 * que les fixtures, ce critere ne se prouvait que sur des donnees ecrites a la main —
 * c est-a-dire sur le seul terrain ou il ne risquait pas d echouer.
 *
 * POURQUOI LA CORRECTION N EST PAS D INVERSER LA PRECEDENCE. `{ ...env, ...process.env }`
 * aurait ferme le cas et ouvert son symetrique, PIRE parce que silencieux : un
 * `ECHO_STRAPI_URL` qui traine dans un shell — il vit dans `~/.claude/.env`, que toutes
 * les sondes de ce projet chargent — ferait viser l instance a un run qui se croit sur
 * fixtures, sans qu une ligne le dise. Le mode par defaut doit rester le banc, hors
 * ligne et sans jeton : c est lui que l integration continue lance.
 *
 * CE QUI EST CORRIGE EST DONC LA CAUSE, PAS LE SYMPTOME : le script n avait pas de
 * cible, il avait une cible ECRITE EN DUR. Elle se CHOISIT desormais, et la surcouche
 * d environnement se DERIVE du choix — le banc surcharge (c est son role, et c est
 * maintenant delibere), l instance ne surcharge rien et laisse passer l environnement.
 * Aucun ordre de spread ne decide plus de ce qui est mesure.
 *
 * UN MOT DE CIBLE NON RECONNU EST UN REFUS, JAMAIS UN REPLI SUR LE BANC. `PREUVE_CIBLE=distan`
 * (faute de frappe) qui retomberait en silence sur les fixtures rendrait exactement le
 * defaut qu on ferme : vert sur banc, cru sur instance. Il rend `2` en nommant les mots
 * acceptes — `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 */
import { ISSUES } from './issues.mjs';
import { ORIGINE_PAR_DEFAUT } from './origine.mjs';
import {
  demarrerServeurFixtures,
  absencesDeBanc,
  existeFixture,
  fixturesDuBanc,
  lireFixture,
  messageVerificationImpossible,
} from './serveur-fixtures.mjs';

export const CIBLES = { BANC: 'banc', INSTANCE: 'instance' };

/**
 * Les variables dont la cible INSTANCE a besoin, NOMMEES.
 *
 * Les nommer plutot que de laisser le build mourir sur un `fetch failed` est la moitie
 * du correctif du 2026-08-04 : une variable absente doit s annoncer par son nom exact,
 * jamais par le symptome qu elle provoque trois couches plus bas.
 */
export const VARIABLES_DE_L_INSTANCE = ['ECHO_STRAPI_URL', 'ECHO_STRAPI_API_TOKEN_READONLY'];

/** Les mots acceptes pour designer chaque cible, en argument comme en variable. */
export const MOTS_DE_CIBLE = {
  [CIBLES.BANC]: ['banc', 'fixtures', 'fixture', 'local'],
  [CIBLES.INSTANCE]: ['instance', 'distant', 'distante', 'reel'],
};

/** La variable d environnement qui choisit la cible, quand aucun drapeau ne le fait. */
export const VARIABLE_DE_CIBLE = 'PREUVE_CIBLE';

function cibleDuMot(mot) {
  const normalise = String(mot).trim().toLowerCase().replace(/^--/, '');
  for (const [cible, mots] of Object.entries(MOTS_DE_CIBLE)) {
    if (mots.includes(normalise)) return cible;
  }
  return null;
}

function motsAcceptes() {
  return Object.entries(MOTS_DE_CIBLE)
    .map(([cible, mots]) => `${cible} (${mots.join(', ')})`)
    .join(' | ');
}

/**
 * La cible demandee, ou le refus motive.
 *
 * PURE : elle ne lit ni `process.argv` ni `process.env`, pour que la table de decision
 * s exerce en test sans avoir a fabriquer un processus.
 *
 * @param {string[]} argv Les arguments passes au script (sans `node` ni le chemin).
 * @param {Record<string, string|undefined>} env
 * @returns {{cible: string, origine: string} | {refus: string}}
 */
export function cibleDemandee(argv = [], env = {}) {
  const drapeaux = argv.filter((argument) => argument.startsWith('--'));
  const parDrapeau = drapeaux.map((drapeau) => ({ drapeau, cible: cibleDuMot(drapeau) }));

  const inconnus = parDrapeau.filter(({ cible }) => cible === null);
  if (inconnus.length > 0) {
    return {
      refus:
        `drapeau inconnu : ${inconnus.map(({ drapeau }) => drapeau).join(', ')}. ` +
        `Cibles acceptees : ${motsAcceptes()}.`,
    };
  }

  const distinctes = new Set(parDrapeau.map(({ cible }) => cible));
  if (distinctes.size > 1) {
    return {
      refus:
        `drapeaux contradictoires : ${drapeaux.join(', ')}. Une preuve vise UNE cible ; ` +
        'en viser deux dans le meme run ne dit pas laquelle a rendu le verdict.',
    };
  }

  const brute = env[VARIABLE_DE_CIBLE];
  const parVariable = brute === undefined || brute === '' ? null : cibleDuMot(brute);

  if (brute !== undefined && brute !== '' && parVariable === null) {
    return {
      refus:
        `${VARIABLE_DE_CIBLE}=« ${brute} » n est pas une cible connue. Cibles acceptees : ` +
        `${motsAcceptes()}. Un mot non reconnu ne retombe PAS sur le banc : un repli ` +
        'silencieux rendrait un vert de banc pour un vert d instance, ce que cette preuve ' +
        'existe pour empecher.',
    };
  }

  if (distinctes.size === 1) {
    const cible = [...distinctes][0];
    if (parVariable !== null && parVariable !== cible) {
      return {
        refus:
          `le drapeau ${drapeaux.join(' ')} demande « ${cible} » et ${VARIABLE_DE_CIBLE} ` +
          `demande « ${parVariable} ». Trancher a la place de l appelant reviendrait a ` +
          'choisir en silence ce qui est mesure.',
      };
    }
    return { cible, origine: drapeaux.join(' ') };
  }

  if (parVariable !== null) return { cible: parVariable, origine: `${VARIABLE_DE_CIBLE}=${brute}` };

  return { cible: CIBLES.BANC, origine: 'defaut' };
}

/**
 * Les variables absentes de l environnement pour viser l instance.
 *
 * Une variable POSEE MAIS VIDE compte comme absente : `ECHO_STRAPI_URL=` produirait un
 * `Bearer ` vide ou une URL nulle, c est-a-dire un echec qui accuse l instance a la
 * place de la variable — la classe exacte du defaut du 2026-08-04.
 */
export function manquesDeLInstance(env = {}) {
  return VARIABLES_DE_L_INSTANCE.filter((nom) => (env[nom] ?? '') === '');
}

/**
 * LE BANC : Strapi de substitution servi depuis `tests/fixtures/`, hors ligne, sans jeton.
 *
 * C est le mode par DEFAUT, et il doit le rester : il tourne sans reseau, sans secret, et
 * c est lui que l integration continue lance a chaque push. Sa surcouche d environnement
 * ECRASE `ECHO_STRAPI_URL` et le jeton, et cet ecrasement est desormais DELIBERE — c est
 * ce qui garantit qu un `.env` charge dans le shell ne detourne pas un run de banc vers
 * l instance.
 *
 * @param {string[]} locales Les locales du site, pour exiger une fixture par collection.
 */
export function sourceBanc(locales) {
  const exigees = fixturesDuBanc(locales);

  return {
    cible: CIBLES.BANC,
    libelle: 'banc (fixtures de tests/fixtures/)',
    poseur: 'le banc',

    async ouvrir() {
      const absentes = absencesDeBanc(exigees);
      if (absentes.length > 0) {
        return { incapacite: messageVerificationImpossible('preuve de rendu sur banc', absentes) };
      }
      const serveur = await demarrerServeurFixtures();
      return {
        adresse: serveur.url,
        surcouche: {
          ECHO_STRAPI_URL: serveur.url,
          ECHO_STRAPI_API_TOKEN_READONLY: 'jeton-de-fixture',
          /* La CONSTANTE, pas la chaine : `origine.mjs` est le domicile unique de cette
             valeur depuis `p2/wt-code-gardes`. La recopier ici rouvrirait la duplication
             que ce domicile a fermee — meme arbitrage qu au train du 2026-08-12 sur
             `origineDuBuild`. */
          ECHO_SITE_URL: ORIGINE_PAR_DEFAUT,
        },
        fermer: () => serveur.arreter(),
      };
    },

    /* `null` quand la fixture n existe pas : l appelant accuse alors le banc, pas le
       site. Servir une collection vide a la place ferait passer une ABSENCE pour une
       REPONSE — c est le repli retire de `serveur-fixtures.mjs` le 2026-08-10. */
    async articles(locale) {
      return existeFixture(`articles-${locale}`) ? lireFixture(`articles-${locale}`).data : null;
    },
    async auteurs(locale) {
      return existeFixture(`auteurs-${locale}`) ? lireFixture(`auteurs-${locale}`).data : null;
    },
    async dossiers(locale) {
      return existeFixture(`dossiers-${locale}`) ? lireFixture(`dossiers-${locale}`).data : null;
    },
    async configuration(locale) {
      return existeFixture(`configuration-${locale}`)
        ? lireFixture(`configuration-${locale}`).data
        : null;
    },
  };
}

/**
 * L INSTANCE REELLE : le Strapi que le site consomme en production.
 *
 * Elle ne surcharge RIEN. `surcouche` est vide, et c est tout le correctif : le build
 * herite de `process.env` tel quel, donc de `ECHO_STRAPI_URL` et du jeton de lecture.
 * `ECHO_SITE_URL` n est pas exigee — `origineDuSite` documente son repli et refuse une
 * valeur vide, ce qui suffit.
 *
 * LES DONNEES DE REFERENCE VIENNENT DU MEME CLIENT QUE LE BUILD (`src/lib/strapi/client.ts`),
 * avec les MEMES requetes declarees (`REQUETES`). Ce n est pas une commodite : une
 * seconde facon d interroger l instance divergerait de celle qui alimente le site, et la
 * preuve comparerait alors deux corpus au lieu d un corpus a son rendu.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{articles: Function, auteurs: Function, dossiers: Function, configuration: Function}} [lecteur]
 *        Injecte en test, pour exercer la table de decision sans reseau.
 */
export function sourceInstance(env = {}, lecteur = undefined) {
  let acces = lecteur ?? null;

  async function client() {
    if (acces !== null) return acces;
    const { lireConfiguration, chargerCollection, chargerConfiguration } = await import(
      '../src/lib/strapi/client.ts'
    );
    const configuration = lireConfiguration();
    acces = {
      articles: (locale) => chargerCollection(configuration, 'articles', locale),
      auteurs: (locale) => chargerCollection(configuration, 'auteurs', locale),
      dossiers: (locale) => chargerCollection(configuration, 'dossiers', locale),
      configuration: (locale) => chargerConfiguration(configuration, locale),
    };
    return acces;
  }

  return {
    cible: CIBLES.INSTANCE,
    libelle: `instance reelle (${env.ECHO_STRAPI_URL ?? 'ECHO_STRAPI_URL absente'})`,
    poseur: "l instance",

    async ouvrir() {
      const manques = manquesDeLInstance(env);
      if (manques.length > 0) {
        return {
          incapacite: [
            'VERIFICATION IMPOSSIBLE — preuve de rendu sur l instance reelle',
            ...manques.map((nom) => `  - variable d environnement absente ou vide : ${nom}`),
            'Aucun repli sur le banc n a ete servi a la place : un build de fixtures rendu',
            'sous le nom de l instance serait exactement le defaut que ce mode ferme.',
          ].join('\n'),
        };
      }
      /* Surcouche VIDE : c est ici que le correctif vit. Le build lit l environnement du
         processus, et rien ne l ecrase plus. */
      return { adresse: env.ECHO_STRAPI_URL, surcouche: {}, fermer: async () => {} };
    },

    async articles(locale) {
      return (await client()).articles(locale);
    },
    async auteurs(locale) {
      return (await client()).auteurs(locale);
    },
    async dossiers(locale) {
      return (await client()).dossiers(locale);
    },
    async configuration(locale) {
      return (await client()).configuration(locale);
    },
  };
}

/**
 * La source qui correspond a la cible. Aucune cible par defaut n est inventee ici : le
 * choix est deja fait par `cibleDemandee`, qui sait dire pourquoi.
 */
export function sourcePourCible(cible, locales, env = {}, lecteur = undefined) {
  if (cible === CIBLES.BANC) return sourceBanc(locales);
  if (cible === CIBLES.INSTANCE) return sourceInstance(env, lecteur);
  throw new Error(`cible inconnue : ${cible}. Codes de sortie : ${JSON.stringify(ISSUES)}`);
}
