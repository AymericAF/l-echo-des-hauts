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
 * pendant que Traefik RETIRAIT l ancien conteneur CMS. Aucune attente prealable ne peut couvrir
 * un instant qui tombe APRES elle : son plafond n avait meme pas ete effleure (0,9 s sur 600),
 * donc l allonger n aurait rien change. Ce qui couvre cet instant vit desormais dans
 * `src/lib/strapi/client.ts` — les REPRISES sur 502/503/504 et sur l injoignable, verrouillees
 * par `tests/client-reprises.test.ts`.
 *
 * ⚠️ CE PARAGRAPHE A DIT « QUATRE SECONDES ET DEMIE » JUSQU AU 2026-08-20, et le chiffre s est
 * relu comme la largeur de la fenetre de bascule. Il ne l etait pas : c est l ecart entre deux
 * evenements d une seule queue. La fenetre, mesuree sur 54 bascules par la tache `a1d26d8e`, dure
 * 30,3 s en mediane (14,5 a 35,9 s, sur 54 sur 54) — et pendant tout ce temps les DEUX conteneurs
 * repondent `200`. Le `502` de la queue 530 n est pas la fenetre : c est son BORD, l instant du
 * retrait. Les deux demandent deux remedes differents, ce que la frontiere ci-dessous dit.
 *
 * LA FRONTIERE ENTRE LES TROIS, a ne pas brouiller :
 *   - la SONDE repond « le CMS sert-il le SCHEMA que ce commit demande » (un `400` est son
 *     affaire, elle le NOMME) ;
 *   - les REPRISES repondent « le CMS est-il JOIGNABLE a cet instant » (un `502` est leur
 *     affaire, elles le traversent) ;
 *   - l EMPREINTE repond « QUELLE version vient de repondre » — la seule des trois qui morde sur
 *     les trente secondes de doublon, ou tout est `200` et ou il n y a donc rien a reprendre.
 * Faire porter le `400` aux reprises noierait la seule ligne qui dit ou chercher ; faire porter
 * le `502` a la sonde ne servirait a rien, puisqu il tombe apres elle ; et elargir les reprises
 * pour attraper le doublon ne marcherait pas, un corps valide n etant pas une panne.
 *
 * ⚠️ SA LIMITE CONNUE — DESORMAIS OBSERVABLE, ET TOUJOURS PAS FERMEE. Un `200` NE PROUVE PAS que
 * c est le NOUVEAU CMS qui a repondu. Le 2026-08-19, elle a valide a 08:03:46.41 alors que le
 * nouveau conteneur n est devenu sain qu a 08:03:49.67 — elle a donc necessairement interroge
 * l ANCIEN, encore route par le proxy. Sur un vrai changement de schema, elle validerait sur
 * l ancien, et le build partirait : il casserait, ou pire il reussirait sur l ANCIEN schema en
 * produisant un site perime, sans aucun signal. NE PAS la maquiller en multipliant les passes :
 * sans identification de version, N passes vertes sur l ancien conteneur restent N mensonges.
 *
 * PREMIER TEMPS, POSE ICI. Le CMS DIT desormais quel commit il sert
 * (`apps/cms/src/middlewares/empreinte-commit.ts`, en-tete `X-Echo-Commit`), et la sonde LIT cet
 * en-tete a chaque passe, le JOURNALISE et le RAPPORTE. Le basculement d empreinte pendant la
 * bascule du proxy devient VISIBLE dans le journal de build, la ou il etait indetectable.
 *
 * ⚠️ ELLE N EN FAIT RIEN D AUTRE, ET C EST UNE CONTRAINTE DURE — ne pas « finir le travail ». Les
 * deux applications ne portent le meme SHA que sur un push touchant LES DEUX arbres :
 * `watch_paths` ne reveille le CMS que sur `apps/cms/**` et le site que sur `apps/web/**`, si
 * bien que le CMS tourne couramment sur un commit plus recent que le site — c est LEGITIME et
 * COURANT (constate le 2026-08-19 : le CMS a tourne sur deux commits successifs pendant que le
 * site restait sur le sien). Une empreinte absente, vide, divergente ou INEGALE vaut donc « je ne
 * sais pas » : elle se journalise en avertissement, et la sonde retombe sur son comportement
 * d avant. Une garde d egalite stricte planterait sur TOUS les deploiements ne touchant que le
 * site ([[garde-en-ferme-dans-un-build-transforme-l-incapacite-en-panne]]) — le mode d echec que
 * `nixpacks.toml` documente deja a propos de `--experimental-strip-types`. Verrouille par le
 * VERROU de la section 8 de `tests/attendre-schema.test.ts`.
 *
 * SECOND TEMPS, HORS PERIMETRE. Cote build, `SOURCE_COMMIT` est ABSENTE : le reglage Coolify
 * `include_source_commit_in_build` vaut `false` sur les trois applications, et Coolify efface
 * `.git` avant de construire — le build ne peut donc pas la deduire. La sonde tourne en MODE
 * DEGRADE : elle n a rien a quoi comparer ce qu elle lit, et elle le DIT, plutot que de laisser
 * ses lignes d empreinte passer pour une verification. Le jour ou le build connaitra son SHA,
 * `empreinteAttendue` se remplit tout seul et la comparaison s allume — TOUJOURS non bloquante,
 * pour la raison ci-dessus.
 *
 * LE NOM DE L EN-TETE EST RECOPIE ICI, et cette recopie est ASSUMEE. Un test d `apps/web` ne peut
 * pas lire `apps/cms` : le declencheur au commit (`outils/gardes-au-commit.js`) ne materialise que
 * les applications touchees par le commit, et un commit ne touchant que `apps/web` ferait rougir
 * pour un fichier absent (meme raison qu en tete de `tests/fixtures-locales.test.ts`). Le
 * garde-fou contre la derive n est donc pas une garde mais la JOURNALISATION elle-meme : un
 * renommage cote CMS fait imprimer « empreinte ABSENTE » a chaque passe de chaque build.
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

/**
 * L EN-TETE PAR LEQUEL LE CONTENEUR DIT SA VERSION — recopie d
 * `apps/cms/src/middlewares/empreinte-commit.ts` (recopie assumee, cf. l en-tete de ce fichier).
 */
export const EN_TETE_EMPREINTE = 'X-Echo-Commit';

/**
 * L empreinte servie par la reponse, ou `null` quand il n y en a pas.
 *
 * `headers.get` est INSENSIBLE A LA CASSE (RFC 9110) : un proxy peut renormaliser le nom, et un
 * acces direct a une cle en dur rendrait `null` sur un proxy poli — un silence qui se lirait
 * exactement comme « le CMS ne dit pas sa version ».
 *
 * Une valeur VIDE est ramenee a `null`, et ce n est pas de la coquetterie : deux conteneurs qui
 * ignorent leur version rendraient la MEME chaine vide, et toute comparaison les declarerait
 * egaux — un vert fabrique a partir de deux ignorances.
 */
export function lireEmpreinte(entetes) {
  const brut = entetes?.get?.(EN_TETE_EMPREINTE);
  if (typeof brut !== 'string') return null;
  const propre = brut.trim();
  return propre === '' ? null : propre;
}

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
    /* L empreinte se lit sur TOUTES les reponses, y compris les `400` : celle de l ANCIEN schema
       est justement la reponse dont il faut savoir qui l a produite. */
    return { ...classerReponse(reponse.status, corps), empreinte: lireEmpreinte(reponse.headers) };
  } catch (erreur) {
    const cause = erreur?.cause?.code ?? erreur?.name ?? '';
    return {
      verdict: VERDICTS.INDISPONIBLE,
      champ: null,
      statut: null,
      empreinte: null,
      precision: `CMS injoignable — ${erreur.message}${cause ? ` (${cause})` : ''}`,
    };
  }
}

/**
 * L EMPREINTE QUE LE BUILD PORTE LUI-MEME — `null` aujourd hui, et c est le fait mesure.
 *
 * `include_source_commit_in_build` vaut `false` sur les trois applications Coolify, et Coolify
 * efface `.git` avant de construire : rien ne permet au build de connaitre son propre SHA. Cette
 * fonction rend donc `null`, la sonde le DIT (mode degrade), et la bascule du reglage — second
 * temps, hors perimetre — suffira a l allumer sans toucher a une ligne de logique.
 */
export function empreinteDuBuild() {
  const brut = process.env.SOURCE_COMMIT;
  if (typeof brut !== 'string') return null;
  const propre = brut.trim();
  return propre === '' ? null : propre;
}

/**
 * CE QUE LES EMPREINTES VUES PERMETTENT DE DIRE — et, surtout, ce qu elles ne permettent pas.
 *
 * ⚠️ AUCUNE DE CES SORTIES N EST UNE CAUSE D ECHEC. Elles ne touchent ni `issue`, ni la boucle :
 * elles ne font qu ECRIRE. Voir le VERROU de la section 8 des tests.
 */
function resumerEmpreintes({ empreintes, empreinteFinale, empreinteAttendue }) {
  const avertissements = [];

  if (empreintes.length === 0) {
    avertissements.push(
      `empreinte ABSENTE : aucune reponse du CMS ne porte « ${EN_TETE_EMPREINTE} ». La VERSION ` +
        'servie n a pas pu etre identifiee — un `200` ne dit alors rien du conteneur qui a ' +
        'repondu. Non bloquant (le CMS d avant le 2026-08-19, et tout developpement local, sont ' +
        'dans ce cas).',
    );
  } else if (empreintes.length > 1) {
    avertissements.push(
      `PLUSIEURS empreintes vues pendant la sonde — ${empreintes.join(', ')} : le proxy a bascule ` +
        'd un conteneur CMS a un autre pendant la construction. Non bloquant.',
    );
  }

  if (empreinteAttendue === null || empreinteAttendue === undefined) {
    avertissements.push(
      'mode DEGRADE : le build ignore sa propre empreinte (`SOURCE_COMMIT` absente cote site, ' +
        '`include_source_commit_in_build = false`). Ce qui precede est une OBSERVATION, rien n a ' +
        'ete compare.',
    );
  } else if (empreinteFinale !== null && empreinteFinale !== empreinteAttendue) {
    avertissements.push(
      `l empreinte servie par le CMS (${empreinteFinale}) DIFFERE de celle du build ` +
        `(${empreinteAttendue}). Non bloquant, et souvent NORMAL : les deux applications ne ` +
        'portent le meme SHA que sur un push touchant les deux arbres.',
    );
  }

  const phrase =
    empreinteFinale !== null
      ? ` Empreinte du CMS a la derniere passe : ${empreinteFinale}.`
      : empreintes.length === 0
        ? ' Empreinte du CMS : ABSENTE — la version servie n a pas pu etre identifiee.'
        : ` Empreinte du CMS a la derniere passe : DIVERGENTE (${empreintes.join(', ')}).`;

  return { avertissements, phrase };
}

/** La ligne de journal d une passe : ce que la sonde a VU, meme quand elle n attend pas. */
function ligneEmpreinte(passe, distinctes) {
  if (distinctes.length === 1) return `empreinte du CMS, passe ${passe} : ${extrait(distinctes[0], 80)}`;
  if (distinctes.length === 0) {
    return (
      `empreinte du CMS, passe ${passe} : ABSENTE — aucune reponse ne porte ` +
      `« ${EN_TETE_EMPREINTE} » (non bloquant, la sonde continue).`
    );
  }
  return (
    `empreinte du CMS, passe ${passe} : DIVERGENTES — ` +
    `${distinctes.map((e) => extrait(e, 80)).join(', ')} : le proxy a bascule PENDANT la passe ` +
    '(non bloquant, la sonde continue).'
  );
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
 * @param {(ligne: string) => void} [options.journaliser] Une ligne PAR ATTENTE, plus une ligne
 *   d EMPREINTE par passe. Un journal de build muet pendant dix minutes se lit comme un build
 *   fige — et surtout, c est la seule trace qui distingue APRES COUP « elle a attendu puis
 *   reussi » de « elle a reussi tout de suite », sur un deploiement reel ou personne ne regarde
 *   le rapport. Les deux natures se distinguent par leur prefixe (`empreinte …`).
 * @param {string|null} [options.empreinteAttendue] L empreinte que le BUILD porte, quand il la
 *   connait — `null` aujourd hui (mode degrade). ⚠️ Elle ne sert QU A journaliser un ecart : la
 *   comparaison n influe JAMAIS sur `issue`, parce que les deux applications ne portent le meme
 *   SHA que sur un push touchant les deux arbres.
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
  empreinteAttendue = null,
}) {
  const noms = Object.keys(REQUETES);
  const debut = horloge();
  let passes = 0;
  let attentes = 0;
  /* Les empreintes vues, DANS L ORDRE DE PREMIERE APPARITION : c est cet ordre qui montre le
     basculement ancien -> nouveau, et un `Set` rendu tel quel le perdrait a la relecture. */
  const empreintes = [];
  /* L empreinte de la DERNIERE passe — `null` si la passe n en a vu aucune, ou plusieurs. Elire
     une version parmi deux reviendrait a inventer la reponse que toute cette section cherche. */
  let empreinteFinale = null;
  /* Le PREMIER obstacle rencontre survit au succes : sans lui, un rapport vert ne saurait pas dire
     CE QU IL A ATTENDU, et « elle a attendu puis reussi » se lirait comme « elle a reussi ». */
  let premier = null;

  for (;;) {
    passes += 1;
    const obstacles = [];
    const vues = [];
    for (const nom of noms) {
      const verdict = await sonder({ baseUrl, jeton, nom, locale });
      if (verdict.empreinte !== null && verdict.empreinte !== undefined) vues.push(verdict.empreinte);
      if (verdict.verdict !== VERDICTS.PRETE) obstacles.push({ requete: nom, ...verdict });
    }

    /* CE QUE LA PASSE A VU, dit A CHAQUE PASSE et pas seulement a l abandon : sur un deploiement
       reel, le journal Coolify est la SEULE trace, et il n est lu que quand il est rouge. Une
       ligne verte qui nomme la version servie est ce qui permettra, apres coup, de distinguer
       « le build a lu le NOUVEAU CMS » de « il a lu l ancien et personne ne l a su ». */
    const distinctes = [...new Set(vues)];
    for (const empreinte of distinctes) {
      if (!empreintes.includes(empreinte)) empreintes.push(empreinte);
    }
    empreinteFinale = distinctes.length === 1 ? distinctes[0] : null;
    journaliser(ligneEmpreinte(passes, distinctes));

    const attenduMs = horloge() - debut;
    const resume = resumerEmpreintes({ empreintes, empreinteFinale, empreinteAttendue });

    if (obstacles.length === 0) {
      const rapport = {
        issue: ISSUES.CONFORME,
        passes,
        attentes,
        attenduMs,
        obstacle: null,
        premierObstacle: premier,
        empreintes,
        empreinteFinale,
        empreinteAttendue,
        avertissements: resume.avertissements,
        recit:
          premier === null
            ? `schema PRET a la premiere passe (aucune attente) — ${noms.length} requete(s) ` +
              'declaree(s) acceptee(s) par le CMS.'
            : `schema PRET apres ${secondes(attenduMs)} s d attente et ${passes} passe(s) : le CMS ` +
              `refusait encore « ${premier.champ ?? premier.precision} » sur la requete ` +
              `« ${premier.requete} » a la premiere passe. La course a ete rattrapee.`,
      };
      rapport.recit += resume.phrase;
      return rapport;
    }

    const obstacle = obstacleParlant(obstacles);
    if (premier === null) premier = obstacle;

    const definitif = obstacle.verdict === VERDICTS.REFUSEE;
    if (definitif || attenduMs + intervalleMs >= plafondMs) {
      const rapport = {
        issue: ISSUES.VERIFICATION_IMPOSSIBLE,
        passes,
        attentes,
        attenduMs,
        obstacle,
        premierObstacle: premier,
        empreintes,
        empreinteFinale,
        empreinteAttendue,
        avertissements: resume.avertissements,
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
      rapport.recit += resume.phrase;
      return rapport;
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
      empreinteAttendue: empreinteDuBuild(),
    });

    /* LES AVERTISSEMENTS S IMPRIMENT DANS LES DEUX CAS, et sur la sortie d ERREUR meme quand la
       sonde est VERTE : c est la seule facon qu ils survivent a un journal de build qu on ne lit
       que quand il est rouge. Ils ne changent PAS le code de sortie — la version servie n est pas
       un critere d echec, cf. l en-tete de ce fichier. */
    for (const avertissement of rapport.avertissements) {
      console.warn(`[attendre-schema] ⚠️ ${avertissement}`);
    }

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
