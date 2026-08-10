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

/** Les URL mesurees par defaut : un DOCUMENT, un MEDIA, un fichier de service. */
export const URLS_PAR_DEFAUT = ['/', '/medias/logo_1d14a56cdc.svg', '/robots.txt'];

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

/** Le manquement d une directive, dans les trois sens : retiree, changee, ajoutee. */
function manquementDirective(url, nom, directive, attendue, servie) {
  if (servie === undefined) {
    return (
      `${url} → « ${nom} » : directive « ${directive} » MANQUANTE. Attendu ` +
      `« ${directive} ${attendue} ». Une directive absente n est pas neutre : ce qu elle ` +
      'fermait redevient autorise.'
    );
  }
  if (attendue === undefined) {
    return (
      `${url} → « ${nom} » : directive « ${directive} » AJOUTEE (servie : « ${directive} ` +
      `${servie} »), absente de la politique attendue. Un elargissement se decide, il ne ` +
      'se constate pas.'
    );
  }
  return (
    `${url} → « ${nom} » : directive « ${directive} » CHANGEE. Attendu « ${attendue} ». ` +
    `Servi « ${servie} ». Si le changement est voulu, c est verifier-en-tetes.mjs qu il ` +
    'faut amender — jamais l inverse.'
  );
}

/**
 * Juge UNE reponse.
 *
 * @param {{url: string, statut?: number, enTetes?: Record<string,string>, erreur?: string}} reponse
 * @param {typeof POLITIQUE_ATTENDUE} attendue
 * @returns {{manquements: string[], verifies: string[], incapacites: string[]}}
 */
export function jugerReponse(reponse, attendue = POLITIQUE_ATTENDUE) {
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
    return { manquements, verifies, incapacites };
  }
  if (reponse.statut !== 200) {
    incapacites.push(
      `${reponse.url} → statut ${reponse.statut} au lieu de 200 : les en-tetes de cette ` +
        'reponse ne disent rien de la politique servie sur la page attendue.',
    );
    return { manquements, verifies, incapacites };
  }

  for (const [nom, regle] of Object.entries(attendue)) {
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

    const attendues = directivesDe(regle.valeur, regle.separateur);
    const servies = directivesDe(servie, regle.separateur);
    let devie = false;
    for (const [directive, valeur] of attendues) {
      const trouvee = servies.get(directive);
      if (trouvee !== valeur) {
        manquements.push(manquementDirective(reponse.url, nom, directive, valeur, trouvee));
        devie = true;
      }
    }
    for (const [directive, valeur] of servies) {
      if (attendues.has(directive)) continue;
      manquements.push(manquementDirective(reponse.url, nom, directive, undefined, valeur));
      devie = true;
    }
    if (!devie) verifies.push(`${nom} : ${attendues.size} directive(s) conformes`);
  }

  return { manquements, verifies, incapacites };
}

/**
 * Juge un LOT de reponses.
 *
 * @param {Array<{url: string, statut?: number, enTetes?: Record<string,string>, erreur?: string}>} reponses
 * @param {typeof POLITIQUE_ATTENDUE} attendue
 */
export function inspecterEnTetes(reponses, attendue = POLITIQUE_ATTENDUE) {
  /* Zero reponse n est pas une preuve : c est une garde branchee sur le vide, le mode
     d echec le plus discret d un controle — il rend vert sans avoir rien regarde. */
  if (!Array.isArray(reponses) || reponses.length === 0) {
    return {
      manquements: ['aucune reponse a juger : la garde n a mesure aucune URL.'],
      verifies: [],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      reponses: 0,
      urls: [],
    };
  }

  const manquements = [];
  const verifies = [];
  const incapacites = [];
  for (const reponse of reponses) {
    const rapport = jugerReponse(reponse, attendue);
    manquements.push(...rapport.manquements);
    verifies.push(...rapport.verifies);
    incapacites.push(...rapport.incapacites);
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
    };
  }

  return {
    manquements,
    verifies,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    reponses: reponses.length,
    urls: reponses.map((r) => r.url),
  };
}

/**
 * Le compte rendu AU VERT — il ANNONCE ce qui a ete verifie.
 *
 * Un vert muet (« en-tetes conformes ») ne dit ni sur quelles URL il porte, ni combien de
 * directives il a confrontees : il ressemble trait pour trait a un vert obtenu sur une
 * politique amputee de moitie. Ce resume nomme donc les URL, les en-tetes, et le compte de
 * directives reellement comparees.
 */
export function resumeEnTetes(rapport) {
  const parEnTete = [...new Set(rapport.verifies)].join(' | ');
  return (
    `${rapport.reponses} reponse(s) mesuree(s) — ${rapport.urls.join(', ')} — ` +
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
