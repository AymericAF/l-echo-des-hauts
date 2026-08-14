/**
 * Confronte les EN-TETES REELLEMENT SERVIS par la production a la politique attendue.
 *
 * LE DEFAUT QUE CE FICHIER FERME, et il est arrive. Le 2026-08-10, entre 04:09:41 et
 * 08:28:10, la valeur `custom_labels` de l application Coolify `echo-site` a ete remplacee
 * par le jeu que l outil engendre par defaut : les quatre lignes qui definissaient le
 * middleware `echo-headers` et la ligne qui l APPLIQUAIT au routeur ont disparu ensemble.
 * A partir du deploiement de 08:47, `https://echo.ayfiweb.fr/` a repondu `200` sans aucun
 * `Content-Security-Policy`, sans `X-Content-Type-Options`, sans `Referrer-Policy`, sans
 * `Permissions-Policy`.
 *
 * CE QUI REND CE DEFAUT DIFFERENT DE TOUS LES AUTRES QUE CE DEPOT GARDE : IL N A FAIT
 * AUCUN BRUIT. Le build a reussi. Les six verificateurs sont restes verts — ils jugent la
 * SORTIE CONSTRUITE, et elle etait irreprochable. Le site a repondu 200 partout. Les
 * images et les styles se sont affiches : la disparition de la politique les AUTORISE.
 * Aucun avertissement, aucune trace, aucun canal. Sans une mesure fortuite, personne
 * n aurait su ni quoi, ni depuis quand.
 *
 * POURQUOI IL JUGE LA REPONSE SERVIE, ET RIEN D AUTRE. L en-tete n a AUCUN domicile dans
 * ce depot : il vit dans les labels Traefik de l application Coolify, en base de
 * l instance (`docs/runbook-provisionnement.md`, etape 27). Une garde qui relirait des
 * fichiers ne verrait donc jamais ce defaut — c est litteralement ce qui vient de se
 * passer. Seule la reponse HTTP fait foi.
 *
 * POURQUOI IL PORTE UNE COPIE DE LA POLITIQUE, alors que ce projet interdit partout la
 * seconde source de verite (`verifier-styles-en-ligne.mjs` s en interdit explicitement).
 * Parce qu il n en existait AUCUNE PREMIERE : la politique n etait ecrite nulle part sous
 * une forme comparable en machine — ni ici, ni dans un fichier de configuration, seulement
 * dans une base que l outil reecrit. C est exactement ce qui a rendu sa disparition
 * indetectable. Une attente DECLAREE n est pas une duplication : sans elle, il n y a rien
 * a confronter. Le prix est nomme et assume — le jour ou la politique change VOLONTAIREMENT
 * (l ouverture de `script-src`/`connect-src` sur `/recherche` pour Pagefind, decision
 * `fe96fc8d`), c est CE FICHIER qu il faut changer, en le sachant, et le test rouge est la
 * pour l imposer plutot que de laisser le glissement passer.
 *
 * LA VALEUR CI-DESSOUS N EST PAS RECOPIEE DE MEMOIRE. Elle est extraite de l instantane de
 * configuration du deploiement `316` (2026-08-10 04:07:32), le dernier qui portait encore
 * le middleware, et confrontee octet a octet a ce que la production a reservi apres
 * retablissement. Elle differe du runbook sur `Permissions-Policy` — le runbook decrivait
 * une valeur qui n a jamais ete servie ; c est la reponse mesuree qui fait foi, pas le
 * document.
 *
 * TROIS ISSUES, PAS DEUX (`./issues.mjs`). « Je n ai pas pu joindre le site » et « le site
 * ne sert plus la CSP » envoient corriger deux objets differents : la premiere rend `2`,
 * la seconde `1`. Les confondre coute une demi-journee de recherche dans le mauvais objet.
 *
 * ── DEUX POLITIQUES DEPUIS LE 2026-08-12, ET C EST LA FRONTIERE QUI SE GARDE ───────────
 *
 * Le changement volontaire annonce ci-dessus a eu lieu. Un SECOND routeur Traefik
 * (`echo-headers-recherche`, runbook etape 27 point 4, priorite 1000) porte une politique
 * OUVERTE sur `PathPrefix(/recherche) || PathPrefix(/en/recherche) || PathPrefix(/pagefind)`
 * — `script-src 'self' '<empreinte>' 'wasm-unsafe-eval'`, `connect-src 'self'` — pendant que
 * TOUT le reste du site reste ferme. `/pagefind` en fait partie pour un motif mesure : le
 * `Worker` classique de Pagefind n herite pas de la CSP du document, mais de celle de son
 * PROPRE script ; borner l ouverture aux deux pages HTML laissait donc la recherche morte.
 *
 * CE QUI ETAIT OUVERT, ET QUE CE FICHIER FERME. `URLS_PAR_DEFAUT` ne mesurait que `/`, un
 * media et `/robots.txt` — aucune des trois routes ouvertes. La politique de la recherche
 * pouvait donc disparaitre, se refermer ou s elargir sans qu une seule garde ne bronche :
 * le defaut du 2026-08-10 a l identique, sur le perimetre qui venait d etre cree.
 *
 * LES DEUX SENS DE LA FRONTIERE SONT DES DEFAUTS, ET AUCUN NE SE VOIT A L OEIL :
 *   - la politique FERMEE sur `/recherche` -> `200`, page normale, recherche muette. Arrive
 *     DEUX FOIS (2026-08-10, puis le premier essai du 2026-08-12) ;
 *   - la politique OUVERTE sur une page ORDINAIRE -> rien ne casse, rien ne s affiche
 *     autrement, et le site entier a perdu `script-src 'none'`, c est-a-dire le verdict
 *     « zero octet de JS hors /recherche » du §1 et la posture qui va avec.
 * Ces deux cas rendent donc un manquement qui NOMME la politique servie et sa consequence,
 * pas un simple ecart de chaine sur une directive.
 *
 * L EMPREINTE N EST PAS COMPAREE A LA LETTRE — ARBITRAGE, ET SON MOTIF. La politique
 * attendue porte le marqueur `MARQUEUR_EMPREINTE` la ou la production sert un
 * `'sha256-…'`. Ce qui est juge est le JEU DE SOURCES (ni une de plus, ni une de moins) et
 * la FORME de l empreinte, jamais sa valeur. Trois raisons, dans cet ordre :
 *
 *   1. la valeur a DEJA un domicile unique — `docs/empreinte-script-recherche.md`, dans le
 *      depot de DOC, que ce depot-ci ne peut pas lire. La recopier ici en ferait une
 *      seconde source de verite sans aucun mecanisme pour les tenir accordees : elles
 *      divergeraient en silence, ce que ce projet refuse partout ;
 *   2. elle se perime LEGITIMEMENT a toute retouche de `PageRecherche.astro`. Une garde qui
 *      rougit a chaque build legitime est une garde qu on eteint — et le jour ou elle dit
 *      quelque chose, elle est eteinte aussi ;
 *   3. surtout, une comparaison a la lettre PROUVERAIT LA MAUVAISE CHOSE. Le defaut qui
 *      coute est « l empreinte ne correspond plus au script servi » — page morte, `200`,
 *      console muette cote page. Deux copies egales d une meme valeur n en disent rien :
 *      seule la confrontation de l empreinte SERVIE au script SERVI le prouverait, et c est
 *      un autre instrument que celui-ci (il lirait un corps, pas des en-tetes).
 *
 * Ce que la forme attrape, et qui est le vrai perimetre de cette garde : l empreinte
 * remplacee par `'unsafe-inline'`, une source ajoutee (`'unsafe-eval'`, un domaine), une
 * source retiree (`'wasm-unsafe-eval'`, et le WASM ne demarre plus), et l empreinte ecrite
 * SANS ses apostrophes — source invalide que Chrome signale une fois puis ignore, donc page
 * aussi morte qu une politique fermee (constate le 2026-08-11).
 *
 * `npm run verifier:en-tetes [base]` mesure la production et rend son verdict.
 */
import { pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';

/**
 * LA POLITIQUE ATTENDUE — un en-tete par entree, la valeur telle qu elle doit etre servie.
 *
 * `separateur` dit comment la valeur se DECOUPE en directives comparables :
 *   - `';'` pour `Content-Security-Policy` (grammaire RFC : `directive; directive`)
 *   - `','` pour `Permissions-Policy` (grammaire structured-fields : `nom=(), nom=()`)
 *   - `null` pour un en-tete a valeur unique, compare tel quel.
 *
 * Le decoupage n est pas un confort d ecriture : il rend le rouge UTILISABLE. « la CSP a
 * change » n envoie nulle part ; « `script-src` : attendu `'none'`, servi `'self'
 * 'unsafe-inline'` » nomme la regression et sa direction.
 */
export const POLITIQUE_ATTENDUE = {
  'content-security-policy': {
    separateur: ';',
    valeur:
      "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; " +
      "font-src 'self'; connect-src 'none'; media-src 'self' https://echoback.ayfiweb.fr; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  'x-content-type-options': { separateur: null, valeur: 'nosniff' },
  'referrer-policy': { separateur: null, valeur: 'strict-origin-when-cross-origin' },
  'permissions-policy': {
    separateur: ',',
    valeur:
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), ' +
      'geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()',
  },
};

/**
 * LE MARQUEUR DE L EMPREINTE — la seule valeur que la politique attendue ne fixe PAS.
 *
 * Il tient la PLACE d une source `'sha256-…'` dans `script-src`. Son motif est en tete de
 * fichier ; ce qu il permet, concretement : la garde exige une empreinte BIEN FORMEE a cet
 * endroit precis, sans jamais dire laquelle — donc sans recopier ici une valeur dont le
 * domicile est ailleurs et qui se perime a chaque retouche du script.
 */
export const MARQUEUR_EMPREINTE = "'sha256-<empreinte>'";

/**
 * La FORME d une empreinte servie. SHA-256 en base64 : 43 caracteres puis le `=` de
 * remplissage, le tout entre apostrophes — elles font partie de la valeur, une source
 * ecrite sans elles est INVALIDE pour le navigateur (2026-08-11).
 *
 * Seul `sha256` est accepte : passer a `sha384` marcherait aussi bien cote navigateur, mais
 * c est une DECISION, et le rouge est precisement la pour qu elle se prenne.
 */
const FORME_EMPREINTE = /^'sha256-[A-Za-z0-9+/]{43}='$/;

/**
 * LA POLITIQUE OUVERTE — celle du second routeur `echo-headers-recherche`, sur le seul
 * perimetre de la recherche.
 *
 * Elle ne differe de la precedente que sur DEUX directives, et c est exactement l arbitrage
 * `fe96fc8d` : `script-src` (le script inline de la page, plus le WASM du moteur) et
 * `connect-src` (le `fetch` de l index par le Worker). Tout le reste est recopie a la
 * lettre — un test le tient, sinon un elargissement colle par erreur ici passerait pour
 * attendu.
 */
export const POLITIQUE_RECHERCHE = {
  'content-security-policy': {
    separateur: ';',
    valeur:
      `default-src 'self'; script-src 'self' ${MARQUEUR_EMPREINTE} 'wasm-unsafe-eval'; ` +
      "style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
      "media-src 'self' https://echoback.ayfiweb.fr; frame-ancestors 'none'; " +
      "base-uri 'self'; form-action 'self'",
  },
  'x-content-type-options': POLITIQUE_ATTENDUE['x-content-type-options'],
  'referrer-policy': POLITIQUE_ATTENDUE['referrer-policy'],
  'permissions-policy': POLITIQUE_ATTENDUE['permissions-policy'],
};

/** Les deux politiques, par le nom que les manquements et le resume emploient. */
export const POLITIQUES = { principale: POLITIQUE_ATTENDUE, recherche: POLITIQUE_RECHERCHE };

/**
 * LES PREFIXES DU SECOND ROUTEUR, tels que sa regle Traefik les ecrit.
 *
 * C est une TROISIEME attente declaree, du meme ordre que les deux politiques : si cette
 * frontiere differe de celle du proxy, la garde rend un verdict juste sur la mauvaise
 * politique — un vert qui ne prouve rien. Elle se relit sur la ligne `.rule=` du runbook.
 */
export const PREFIXES_RECHERCHE = ['/recherche', '/en/recherche', '/pagefind'];

/**
 * Quelle politique cette URL doit-elle servir ?
 *
 * `PathPrefix` de Traefik compare des PREFIXES de chemin, pas des chemins entiers : c est
 * ce qui fait tomber `/recherche/`, `/pagefind/pagefind.js` et `/pagefind/wasm.fr.pagefind`
 * du bon cote sans les enumerer.
 *
 * @param {string} url URL absolue ou chemin nu.
 * @returns {{nom: string, politique: typeof POLITIQUE_ATTENDUE}}
 */
export function politiquePour(url) {
  let chemin = String(url);
  try {
    chemin = new URL(url, 'https://origine.invalide').pathname;
  } catch {
    /* Un chemin nu qui ne se parse pas se juge tel quel : mieux vaut router sur la chaine
       brute que de faire tomber la mesure entiere pour une URL mal formee. */
  }
  const ouverte = PREFIXES_RECHERCHE.some((prefixe) => chemin.startsWith(prefixe));
  return ouverte
    ? { nom: 'recherche', politique: POLITIQUE_RECHERCHE }
    : { nom: 'principale', politique: POLITIQUE_ATTENDUE };
}

/**
 * Les URL mesurees par defaut, des DEUX cotes de la frontiere.
 *
 * Cote ferme : un DOCUMENT, un MEDIA, un fichier de service — sans eux, le DEBORDEMENT de
 * la politique ouverte sur le site entier ne se verrait plus.
 * Cote ouvert : les deux pages de recherche et `pagefind.js`, la route dont depend le
 * Worker — donc celle dont la fermeture tue la recherche en silence.
 */
export const URLS_PAR_DEFAUT = [
  '/',
  '/medias/logo_1d14a56cdc.svg',
  '/robots.txt',
  '/recherche',
  '/en/recherche',
  '/pagefind/pagefind.js',
];

/** L origine mesuree par defaut. */
export const BASE_PAR_DEFAUT = 'https://echo.ayfiweb.fr';

/**
 * Decoupe une valeur d en-tete en directives comparables.
 *
 * Le NOM est ramene en minuscules (les noms de directives sont insensibles a la casse),
 * la VALEUR est conservee telle quelle — `'self'` et `'SELF'` ne sont pas le meme jeton
 * pour un navigateur, et une garde qui les confondrait laisserait passer une reecriture.
 * Les espaces surnumeraires et les separateurs vides sont absorbes : ils ne changent rien
 * a ce que le navigateur applique, et rougir dessus ferait du bruit sans defaut.
 *
 * @param {string} valeur
 * @param {string} separateur
 * @returns {Map<string, string>} nom de directive -> reste de la directive
 */
export function directivesDe(valeur, separateur) {
  const trouvees = new Map();
  for (const morceau of String(valeur).split(separateur)) {
    const compact = morceau.replace(/\s+/g, ' ').trim();
    if (compact === '') continue;
    // `Permissions-Policy` s ecrit `nom=(...)`, la CSP `nom valeur` : les deux se coupent
    // au premier `=` ou au premier espace, celui qui vient en premier.
    const coupe = compact.search(/[\s=]/);
    if (coupe === -1) {
      trouvees.set(compact.toLowerCase(), '');
      continue;
    }
    const nom = compact.slice(0, coupe).toLowerCase();
    const reste = compact[coupe] === '=' ? compact.slice(coupe) : compact.slice(coupe + 1);
    trouvees.set(nom, reste.trim());
  }
  return trouvees;
}

/**
 * Une directive attendue est-elle SATISFAITE par celle qui est servie ?
 *
 * Sans marqueur, c est la comparaison stricte de toujours — rien ne change pour les
 * politiques qui n en portent pas. Avec marqueur, les sources se comparent comme un
 * MULTIENSEMBLE : l ordre est libre (le navigateur n en tient aucun compte, et rougir
 * dessus ferait du bruit sans defaut), mais le compte ne l est pas. Chaque marqueur consomme
 * exactement une source BIEN FORMEE ; toute source en trop ou en moins rougit.
 *
 * @param {string|undefined} attendue
 * @param {string|undefined} servie
 */
export function directiveConforme(attendue, servie) {
  if (attendue === servie) return true;
  if (attendue === undefined || servie === undefined) return false;
  if (!String(attendue).includes(MARQUEUR_EMPREINTE)) return false;

  const restantes = String(servie).split(/\s+/).filter(Boolean);
  for (const source of String(attendue).split(/\s+/).filter(Boolean)) {
    const rang =
      source === MARQUEUR_EMPREINTE
        ? restantes.findIndex((candidate) => FORME_EMPREINTE.test(candidate))
        : restantes.indexOf(source);
    if (rang === -1) return false;
    restantes.splice(rang, 1);
  }
  return restantes.length === 0;
}

/**
 * Cette CSP servie est-elle, a la lettre, l une des DEUX politiques connues ?
 *
 * C est ce qui permet de distinguer « une directive a devie » de « c est l AUTRE politique
 * qui est servie ici » — deux diagnostics qui envoient corriger deux objets differents : le
 * middleware d un cote, la REGLE du second routeur de l autre.
 *
 * @param {string} servie
 * @returns {string|null} le nom de la politique reconnue, ou null
 */
function politiqueReconnue(servie) {
  for (const [nom, politique] of Object.entries(POLITIQUES)) {
    const attendues = directivesDe(politique['content-security-policy'].valeur, ';');
    const servies = directivesDe(servie, ';');
    if (attendues.size !== servies.size) continue;
    let identique = true;
    for (const [directive, valeur] of attendues) {
      if (!directiveConforme(valeur, servies.get(directive))) {
        identique = false;
        break;
      }
    }
    if (identique) return nom;
  }
  return null;
}

/**
 * Le manquement de la FRONTIERE : ce n est pas une directive qui a bouge, c est l autre
 * politique qui est servie ici. Les deux sens sont des defauts, et aucun ne se voit a l oeil.
 */
function manquementFrontiere(url, attendue, servie) {
  if (servie === 'recherche') {
    return (
      `${url} → la politique OUVERTE de la recherche DEBORDE sur cette route, qui doit ` +
      "servir la politique fermee. Rien ne casse et rien ne s affiche autrement : le site a " +
      "simplement perdu `script-src 'none'` et `connect-src 'none'`, c est-a-dire le verdict " +
      '« zero octet de JS hors /recherche » et la posture qui va avec. Regarder la REGLE du ' +
      'routeur `echo-headers-recherche` (runbook etape 27 point 4) : son `PathPrefix` s est ' +
      'elargi, ou sa priorite lui fait prendre des routes qui ne sont pas les siennes.'
    );
  }
  if (attendue === 'recherche') {
    return (
      `${url} → la politique OUVERTE a DISPARU de cette route : c est la politique ` +
      `« ${servie} » qui y est servie. La page repond 200, s affiche normalement, et la ` +
      'RECHERCHE NE CHERCHE PAS — c est arrive deux fois (2026-08-10, puis le premier essai ' +
      'du 2026-08-12). Regarder le second routeur `echo-headers-recherche` dans les labels ' +
      "de l application Coolify : il a disparu, sa regle ne couvre plus cette route, ou sa " +
      'priorite est passee sous celle du routeur principal.'
    );
  }
  return (
    `${url} → la politique « ${servie} » est servie la ou « ${attendue} » est attendue.`
  );
}

/** Retrouve un en-tete sans se soucier de la casse de son nom — HTTP ne la distingue pas. */
function enTete(enTetes, nom) {
  for (const [cle, valeur] of Object.entries(enTetes ?? {})) {
    if (cle.toLowerCase() === nom) return valeur;
  }
  return undefined;
}

/** Le manquement d un en-tete ABSENT — le defaut du 2026-08-10, dans sa forme exacte. */
function manquementAbsent(url, nom, attendue) {
  return (
    `${url} → en-tete « ${nom} » ABSENT de la reponse servie. Attendu : « ${attendue} ». ` +
    'Cet en-tete ne vient pas du build : il est pose en label Traefik sur l application ' +
    'Coolify (runbook etape 27) et disparait SANS AUCUN SIGNAL quand ces labels sont ' +
    'reengendres par defaut — la page continue de repondre 200, les images et les styles ' +
    "continuent de s afficher, et rien d autre ne le dit. NE PAS conclure que la politique " +
    'a ete deplacee : verifier les labels de l application avant toute autre piste.'
  );
}

/** Le manquement d un en-tete a valeur unique dont la valeur a devie. */
function manquementValeur(url, nom, attendue, servie) {
  return (
    `${url} → en-tete « ${nom} » DEVIE. Attendu : « ${attendue} ». Servi : « ${servie} ».`
  );
}

/**
 * Le manquement d une directive, dans les trois sens : retiree, changee, ajoutee.
 *
 * `politique` n est pas decoratif : depuis que le site en sert DEUX, « `script-src` a
 * change » n envoie nulle part tant qu on ne sait pas LAQUELLE des deux a bouge, ni
 * laquelle cette route devait servir.
 */
function manquementDirective(url, nom, directive, attendue, servie, politique) {
  const cadre = `${url} → « ${nom} » (politique « ${politique} ») : directive « ${directive} »`;
  if (servie === undefined) {
    return (
      `${cadre} MANQUANTE. Attendu « ${directive} ${attendue} ». Une directive absente n est ` +
      'pas neutre : ce qu elle fermait redevient autorise.'
    );
  }
  if (attendue === undefined) {
    return (
      `${cadre} AJOUTEE (servie : « ${directive} ${servie} »), absente de la politique ` +
      'attendue. Un elargissement se decide, il ne se constate pas.'
    );
  }
  const surLEmpreinte = String(attendue).includes(MARQUEUR_EMPREINTE)
    ? ` La VALEUR de l empreinte n est pas jugee ici (motif en tete de verifier-en-tetes.mjs) : ` +
      `${MARQUEUR_EMPREINTE} accepte toute source « 'sha256-<43 caracteres>=' », APOSTROPHES ` +
      'COMPRISES — sans elles la source est invalide et la page est morte. Sa valeur du jour ' +
      'se relit dans docs/empreinte-script-recherche.md (depot de doc).'
    : '';
  return (
    `${cadre} CHANGEE. Attendu « ${attendue} ». Servi « ${servie} ». Si le changement est ` +
    `voulu, c est verifier-en-tetes.mjs qu il faut amender — jamais l inverse.${surLEmpreinte}`
  );
}

/** Le nom sous lequel une politique se nomme dans les messages. */
function nomDe(politique) {
  for (const [nom, connue] of Object.entries(POLITIQUES)) if (connue === politique) return nom;
  return 'imposee';
}

/**
 * Juge UNE reponse.
 *
 * La politique attendue se DEDUIT de l URL (`politiquePour`) quand elle n est pas donnee :
 * depuis le 2026-08-12 le site en sert deux, et juger toutes les routes sur la meme laisse
 * la moitie de la frontiere sans garde.
 *
 * @param {{url: string, statut?: number, enTetes?: Record<string,string>, erreur?: string}} reponse
 * @param {typeof POLITIQUE_ATTENDUE | null} attendue Forcee ; sinon deduite de l URL.
 * @returns {{manquements: string[], verifies: string[], incapacites: string[], politique: string}}
 */
export function jugerReponse(reponse, attendue = null) {
  const routee = politiquePour(reponse.url);
  const politique = attendue ?? routee.politique;
  const nomPolitique = attendue ? nomDe(attendue) : routee.nom;
  const manquements = [];
  const verifies = [];
  const incapacites = [];

  if (reponse.erreur) {
    /* UNE INCAPACITE N EST PAS UNE ANOMALIE. « le site est injoignable » envoie regarder
       le reseau, le DNS ou l hebergeur ; « la CSP est absente » envoie regarder les labels
       de l application. Rendre le second pour le premier est le motif
       `[[quand-succes-et-echec-rendent-la-meme-sortie]]`, en pire : ici c est l echec de
       la MESURE qui se deguiserait en verdict sur l objet mesure. */
    incapacites.push(`${reponse.url} → la reponse n a pas pu etre obtenue : ${reponse.erreur}`);
    return { manquements, verifies, incapacites, politique: nomPolitique };
  }
  if (reponse.statut !== 200) {
    incapacites.push(
      `${reponse.url} → statut ${reponse.statut} au lieu de 200 : les en-tetes de cette ` +
        'reponse ne disent rien de la politique servie sur la page attendue.',
    );
    return { manquements, verifies, incapacites, politique: nomPolitique };
  }

  for (const [nom, regle] of Object.entries(politique)) {
    const servie = enTete(reponse.enTetes, nom);
    if (servie === undefined) {
      manquements.push(manquementAbsent(reponse.url, nom, regle.valeur));
      continue;
    }

    if (regle.separateur === null) {
      if (String(servie).trim() !== regle.valeur) {
        manquements.push(manquementValeur(reponse.url, nom, regle.valeur, String(servie).trim()));
        continue;
      }
      verifies.push(`${nom} = ${regle.valeur}`);
      continue;
    }

    /* AVANT de comparer directive par directive : est-ce l AUTRE politique qui est servie
       ici ? Le dire ainsi n est pas un confort de message — c est un diagnostic different.
       Une directive qui a bouge envoie regarder le MIDDLEWARE ; une politique entiere
       servie du mauvais cote de la frontiere envoie regarder la REGLE du second routeur.
       Enumerer les deux directives qui different laisserait chercher dans le premier objet
       un defaut qui vit dans le second. */
    const reconnue = politiqueReconnue(servie);
    if (reconnue !== null && reconnue !== nomPolitique) {
      manquements.push(manquementFrontiere(reponse.url, nomPolitique, reconnue));
      continue;
    }

    const attendues = directivesDe(regle.valeur, regle.separateur);
    const servies = directivesDe(servie, regle.separateur);
    let devie = false;
    for (const [directive, valeur] of attendues) {
      const trouvee = servies.get(directive);
      if (!directiveConforme(valeur, trouvee)) {
        manquements.push(
          manquementDirective(reponse.url, nom, directive, valeur, trouvee, nomPolitique),
        );
        devie = true;
      }
    }
    for (const [directive, valeur] of servies) {
      if (attendues.has(directive)) continue;
      manquements.push(
        manquementDirective(reponse.url, nom, directive, undefined, valeur, nomPolitique),
      );
      devie = true;
    }
    if (!devie) {
      verifies.push(`${nom} [${nomPolitique}] : ${attendues.size} directive(s) conformes`);
    }
  }

  return { manquements, verifies, incapacites, politique: nomPolitique };
}

/**
 * Juge un LOT de reponses.
 *
 * @param {Array<{url: string, statut?: number, enTetes?: Record<string,string>, erreur?: string}>} reponses
 * @param {typeof POLITIQUE_ATTENDUE | null} attendue Forcee pour TOUTES ; sinon deduite par URL.
 */
export function inspecterEnTetes(reponses, attendue = null) {
  /* Zero reponse n est pas une preuve : c est une garde branchee sur le vide, le mode
     d echec le plus discret d un controle — il rend vert sans avoir rien regarde. */
  if (!Array.isArray(reponses) || reponses.length === 0) {
    return {
      manquements: ['aucune reponse a juger : la garde n a mesure aucune URL.'],
      verifies: [],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      reponses: 0,
      urls: [],
      politiques: [],
    };
  }

  const manquements = [];
  const verifies = [];
  const incapacites = [];
  const politiques = [];
  for (const reponse of reponses) {
    const rapport = jugerReponse(reponse, attendue);
    manquements.push(...rapport.manquements);
    verifies.push(...rapport.verifies);
    incapacites.push(...rapport.incapacites);
    politiques.push(rapport.politique);
  }

  /* UNE SEULE incapacite suffit a rendre `2`, meme si les autres URL sont conformes : un
     vert partiel presente comme un vert entier est exactement ce que cette garde existe
     pour empecher. */
  if (incapacites.length > 0) {
    return {
      manquements: incapacites,
      verifies,
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      reponses: reponses.length,
      urls: reponses.map((r) => r.url),
      politiques,
    };
  }

  return {
    manquements,
    verifies,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    reponses: reponses.length,
    urls: reponses.map((r) => r.url),
    politiques,
  };
}

/**
 * Le compte rendu AU VERT — il ANNONCE ce qui a ete verifie.
 *
 * Un vert muet (« en-tetes conformes ») ne dit ni sur quelles URL il porte, ni combien de
 * directives il a confrontees : il ressemble trait pour trait a un vert obtenu sur une
 * politique amputee de moitie. Ce resume nomme donc les URL, les en-tetes, et le compte de
 * directives reellement comparees.
 *
 * Et depuis qu il y a DEUX politiques, il nomme laquelle a ete confrontee sur chaque URL :
 * un vert obtenu en jugeant `/recherche` sur la politique fermee — c est-a-dire un routage
 * casse — ressemblerait sinon trait pour trait a un vert legitime.
 */
export function resumeEnTetes(rapport) {
  const parEnTete = [...new Set(rapport.verifies)].join(' | ');
  const urls = rapport.urls.map(
    (url, rang) => `${url} [${rapport.politiques?.[rang] ?? 'principale'}]`,
  );
  return (
    `${rapport.reponses} reponse(s) mesuree(s) — ${urls.join(', ')} — ` +
    `en-tetes confrontes a la politique attendue : ${parEnTete}.`
  );
}

/**
 * Mesure reellement les URL. Isole pour que le jugement reste testable sans reseau.
 *
 * @param {string} base Origine, sans barre finale.
 * @param {string[]} chemins
 */
export async function mesurer(base, chemins = URLS_PAR_DEFAUT) {
  const reponses = [];
  for (const chemin of chemins) {
    const url = `${base.replace(/\/$/, '')}${chemin}`;
    try {
      const reponse = await fetch(url, { redirect: 'manual' });
      const enTetes = {};
      reponse.headers.forEach((valeur, nom) => {
        enTetes[nom] = valeur;
      });
      /* Le corps est LU et jete : sans cela la connexion reste a demi ouverte dans le
         pool, et le processus ne se termine pas de lui-meme — ce qui obligerait a un
         `process.exit()` brutal, dont l abandon des poignees libuv fait avorter Node sous
         Windows AVANT que le code de sortie ne soit rendu. Une garde dont le code de
         sortie est un accident ne garde rien. */
      await reponse.arrayBuffer();
      reponses.push({ url, statut: reponse.status, enTetes });
    } catch (erreur) {
      reponses.push({ url, erreur: String(erreur?.cause?.message ?? erreur?.message ?? erreur) });
    }
  }
  return reponses;
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] ?? BASE_PAR_DEFAUT;
  const reponses = await mesurer(base);
  const rapport = inspecterEnTetes(reponses);

  /* `process.exitCode` et NON `process.exit()` : le second coupe le processus alors que le
     pool de connexions HTTP est encore vivant, et Node avorte sous Windows
     (« Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) ») — le code de sortie rendu
     n est alors plus celui du verdict. Le corps de chaque reponse etant consomme dans
     `mesurer`, le processus se termine seul, avec le bon code. */
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucun verdict sur les en-tetes servis :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exitCode = ISSUES.VERIFICATION_IMPOSSIBLE;
  } else if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) sur ${base} :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exitCode = ISSUES.ANOMALIE;
  } else {
    console.log(`✔ ${resumeEnTetes(rapport)}`);
    process.exitCode = ISSUES.CONFORME;
  }
}
