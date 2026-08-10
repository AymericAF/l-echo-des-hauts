/**
 * Confronte la SURFACE REELLEMENT EXPOSEE de l API Strapi a ce que le role Public a le
 * droit de servir : rien.
 *
 * LE DEFAUT QUE CE FICHIER FERME, et il etait la depuis le provisionnement. Mesure le
 * 2026-08-10 sur `https://echoback.ayfiweb.fr` : `/api/articles`, `/api/auteurs`,
 * `/api/categories`, `/api/dossiers`, `/api/tags` et `/api/configuration` repondaient tous
 * `200` SANS AUCUN JETON — et `?status=draft` aussi. Prouve par temoin : un article cree en
 * brouillon et jamais publie etait rendu, titre et corps compris, a un appelant anonyme.
 * L ecriture, elle, etait bien fermee (`403`), donc la contrainte dure de la §1 tenait ;
 * mais le jeton de build en lecture seule ne protegeait RIEN — ce qu il ouvrait, tout le
 * monde l avait deja.
 *
 * CE QUI EST PIRE QUE LE TROU, ET LA VRAIE RAISON DE CE FICHIER. La preuve qui existait,
 * celle de l etape 21 du runbook, mesurait `/api/upload/files`. Cet endpoint repondait bien
 * `403` sans jeton — parce que le role Public ne l a JAMAIS servi. La preuve passait donc
 * AU VERT sur une surface qui n etait pas la surface exposee, alors que son propre texte
 * annoncait « si les deux repondent 200, c est le role public qui est trop ouvert ». Elle
 * n exercait pas le critere qu elle pretendait exercer :
 * `[[preuve-doit-exercer-critere-acceptation]]`.
 *
 * D OU VIENT LA LISTE, ET POURQUOI ELLE N EST PAS ECRITE A LA MAIN. Elle se DERIVE des
 * schemas de `apps/cms/src/api/*` — la seule source qui dise quels types de contenu
 * existent, donc quels `api::<type>.<controleur>.find` une permission peut ouvrir. Une
 * liste recopiee ici reproduirait le defaut d origine a l identique : le jour ou un
 * septieme type de contenu apparait, une liste figee reste verte sans l avoir interroge.
 * Pointer, jamais dupliquer.
 *
 * POURQUOI LES DEUX ROLES SONT SONDES. Sans le jeton, un role bien ferme et un jeton mort
 * rendent exactement la meme sortie — `[[quand-succes-et-echec-rendent-la-meme-sortie]]`.
 * C est litteralement le piege du 2026-08-04 : un `$ECHO_STRAPI_API_TOKEN` mal nomme donnait
 * un en-tete `Bearer ` vide, auquel Strapi repond `403`, soit le code attendu de la ligne
 * « sans jeton ». La preuve rendait `403 / 403` sur une installation correcte, et le seul
 * geste qu elle suggerait etait de regenerer un jeton qui n avait rien. Ici, la variable
 * absente rend `2` en la NOMMANT, et un jeton qui n ouvre plus rien rend un manquement qui
 * dit d aller regarder le nom de la variable avant d accuser le jeton.
 *
 * CE QU IL NE FAUT PAS EN DEDUIRE. Cette garde ne dit rien de l ECRITURE : `create`,
 * `update` et `delete` du role Public sont fermes depuis toujours et n ont jamais bouge.
 * Elle ne dit rien non plus des fichiers de la mediatheque servis sous `/uploads/…`, qui
 * sont publics PAR CONSTRUCTION — c est le LISTAGE `/api/upload/files` qui doit rester
 * ferme, pas les octets d une image que le site affiche.
 *
 * `npm run verifier:surface-publique [base]` mesure l instance et rend son verdict :
 * `0` conforme, `1` anomalie (le role sert quelque chose, ou le jeton n ouvre plus rien),
 * `2` verification impossible (variable absente, reseau muet, aucun type de contenu trouve).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';

/**
 * Les variables dont la garde a besoin, NOMMEES — c est la moitie du correctif du
 * 2026-08-04 : une variable absente doit s annoncer par son nom exact, jamais par le code
 * de reponse qu elle provoque.
 */
export const VARIABLES_REQUISES = {
  base: 'ECHO_STRAPI_URL',
  jeton: 'ECHO_STRAPI_API_TOKEN_READONLY',
};

/** Les codes qui prouvent un refus. Tout le reste demande a etre explique. */
const CODES_DE_REFUS = new Set([401, 403]);

/**
 * Derive la surface exposable des schemas du CMS.
 *
 * @param {URL|string} racine Le repertoire `apps/cms/src/api`.
 * @returns {{type: string, chemin: string, collection: boolean, brouillons: boolean}[]}
 */
export function surfaceDepuisSchemas(racine) {
  const chemin = racine instanceof URL ? fileURLToPath(racine) : racine;
  if (!existsSync(chemin)) {
    /* Une racine introuvable ne doit JAMAIS rendre une surface vide : zero type de contenu
       ferait passer la garde au vert sans avoir rien interroge, ce qui est le mode d echec
       exact qu elle existe pour empecher. */
    throw new Error(
      `surface introuvable : ${chemin} n existe pas. La garde derive la liste des types de ` +
        'contenu des schemas du CMS ; sans eux elle ne sait pas quoi interroger, et une liste ' +
        'vide rendrait un vert obtenu sur rien.',
    );
  }

  const surface = [];
  for (const dossier of readdirSync(chemin)) {
    const types = join(chemin, dossier, 'content-types');
    if (!existsSync(types)) continue;
    for (const nom of readdirSync(types)) {
      const fichier = join(types, nom, 'schema.json');
      if (!existsSync(fichier)) continue;
      const schema = JSON.parse(readFileSync(fichier, 'utf8'));
      const collection = schema.kind === 'collectionType';
      surface.push({
        type: `api::${schema.info.singularName}.${schema.info.singularName}`,
        /* Le chemin REST d un single type est au SINGULIER (`/api/configuration`) et celui
           d une collection au pluriel. Se tromper de forme rend `404`, que la garde traite
           en incapacite — jamais en fermeture. */
        chemin: collection ? schema.info.pluralName : schema.info.singularName,
        collection,
        brouillons: schema.options?.draftAndPublish === true,
      });
    }
  }
  return surface.sort((a, b) => a.chemin.localeCompare(b.chemin));
}

/**
 * Le plan de sondes : ce qui sera reellement interroge, et avec quelle attente.
 *
 * `?status=draft` est sonde sur CHAQUE type, y compris ceux qui ne portent pas le couple
 * brouillon/publie. C est inoffensif la ou l option est absente, et le jour ou elle est
 * activee sur un type, la sonde existe deja — une garde qui suivrait l option se
 * decouvrirait aveugle exactement le jour ou il faudrait qu elle voie.
 *
 * @param {ReturnType<typeof surfaceDepuisSchemas>} surface
 */
export function sondesAttendues(surface) {
  const sondes = [];
  for (const entree of surface) {
    const racine = `/api/${entree.chemin}`;
    for (const role of ['public', 'jeton']) {
      sondes.push({ chemin: racine, role, brouillon: false, brouillonsActifs: entree.brouillons });
      sondes.push({ chemin: `${racine}?status=draft`, role, brouillon: true, brouillonsActifs: entree.brouillons });
    }
  }
  /* La surface que mesurait l ANCIENNE preuve. Elle reste sondee — elle n a jamais ete
     fausse, elle etait seulement seule, et seule elle ne disait rien du role Public. */
  sondes.push({ chemin: '/api/upload/files', role: 'public', brouillon: false, brouillonsActifs: false });
  sondes.push({ chemin: '/api/upload/files', role: 'jeton', brouillon: false, brouillonsActifs: false });
  return sondes;
}

/**
 * Le manquement d un endpoint que le role Public sert.
 *
 * LA FUITE N EST ANNONCEE QUE LA OU IL Y A QUELQUE CHOSE A FUIR. Strapi accepte
 * `?status=draft` sur TOUS les types, y compris ceux dont `draftAndPublish` vaut `false`,
 * ou le parametre est simplement inerte : la reponse y est identique a celle sans lui.
 * Ecrire « un article non publie est lisible » sur `/api/tags` serait une conclusion
 * fausse tiree d une mesure juste, et un rouge inexact se discute au lieu de se corriger
 * — `[[mauvais-nom-de-champ-produit-conclusion-fausse]]`. L endpoint reste un manquement :
 * il est ouvert. C est la QUALIFICATION qui change, pas le verdict.
 */
function manquementOuvert(sonde) {
  const geste =
    'Fermer `find`/`findOne` de ce type dans Settings → Users & Permissions → Roles → Public.';

  if (sonde.brouillon && sonde.brouillonsActifs) {
    return (
      `${sonde.chemin} → ${sonde.statut} SANS AUCUN JETON : c est une FUITE EDITORIALE, pas ` +
      'un reglage trop large. Un article non publie y est lisible titre et corps compris par ' +
      `n importe qui. ${geste} Et NE PAS se contenter de retirer le parametre du site : il est ` +
      'passe par l appelant, pas par nous.'
    );
  }
  if (sonde.brouillon) {
    return (
      `${sonde.chemin} → ${sonde.statut} SANS AUCUN JETON : le role Public sert cet endpoint. ` +
      'Le parametre `?status=draft` y est INERTE — ce type ne porte pas le couple ' +
      'brouillon/publie (`draftAndPublish: false`), il n y a donc rien de non publie derriere ' +
      `cette reponse. L ouverture, elle, est bien reelle. ${geste}`
    );
  }
  return (
    `${sonde.chemin} → ${sonde.statut} SANS AUCUN JETON : le role Public sert cet endpoint. ` +
    `Le jeton ${VARIABLES_REQUISES.jeton} n y protege donc rien — ce qu il ouvre, tout le ` +
    `monde l a deja. ${geste}`
  );
}

/** Le manquement d un endpoint que le jeton de build n ouvre PLUS. */
function manquementJetonFerme(sonde) {
  return (
    `${sonde.chemin} → ${sonde.statut} AVEC le jeton de build : il n ouvre plus cet endpoint, ` +
    'et le build du site casserait dessus. ⚠️ REGARDER LE NOM DE LA VARIABLE AVANT D ACCUSER ' +
    `LE JETON : une variable ${VARIABLES_REQUISES.jeton} absente donne un en-tete « Bearer » ` +
    'vide, auquel Strapi repond 403 — soit exactement le code d un appel sans jeton (mesure le ' +
    '2026-08-04). Regenerer le jeton est irreversible ; verifier le nom ne coute rien.'
  );
}

/**
 * Juge un lot de sondes deja mesurees.
 *
 * @param {{chemin: string, role: 'public'|'jeton', brouillon: boolean, statut?: number, erreur?: string}[]} sondes
 */
export function jugerSondes(sondes) {
  const vide = (raisons) => ({
    manquements: raisons,
    verifies: [],
    issue: ISSUES.VERIFICATION_IMPOSSIBLE,
    chemins: [],
    refusees: 0,
    ouvertes: 0,
    brouillonsRefuses: 0,
    brouillonsReelsRefuses: 0,
  });

  if (!Array.isArray(sondes) || sondes.length === 0) {
    return vide([
      'aucune sonde a juger : la garde n a interroge aucun endpoint. Un vert sur zero mesure ' +
        'ressemble trait pour trait a un vert obtenu sur une surface conforme.',
    ]);
  }

  const incapacites = [];
  const manquements = [];
  const verifies = [];
  let refusees = 0;
  let ouvertes = 0;
  let brouillonsRefuses = 0;
  let brouillonsReelsRefuses = 0;

  for (const sonde of sondes) {
    if (sonde.erreur) {
      /* Une incapacite n est pas une anomalie : « je n ai pas pu joindre l instance » envoie
         regarder le reseau, « le role sert /api/articles » envoie fermer une permission. */
      incapacites.push(`${sonde.chemin} (${sonde.role}) → la reponse n a pas pu etre obtenue : ${sonde.erreur}`);
      continue;
    }

    if (sonde.role === 'public') {
      if (sonde.statut === 200) {
        manquements.push(manquementOuvert(sonde));
        continue;
      }
      if (!CODES_DE_REFUS.has(sonde.statut)) {
        incapacites.push(
          `${sonde.chemin} (sans jeton) → ${sonde.statut}, ni 200 ni un refus (401/403). Ce code ` +
            'ne prouve aucune fermeture : un chemin absent, une redirection ou un proxy qui repond ' +
            'a la place de Strapi rendraient le meme verdict rassurant.',
        );
        continue;
      }
      refusees += 1;
      if (sonde.brouillon) {
        brouillonsRefuses += 1;
        if (sonde.brouillonsActifs) brouillonsReelsRefuses += 1;
      }
      verifies.push(`${sonde.chemin} refuse (${sonde.statut})`);
      continue;
    }

    if (sonde.statut !== 200) {
      manquements.push(manquementJetonFerme(sonde));
      continue;
    }
    ouvertes += 1;
    verifies.push(`${sonde.chemin} ouvert par le jeton (200)`);
  }

  const chemins = [...new Set(sondes.map((s) => s.chemin))];

  if (incapacites.length > 0) {
    return { manquements: incapacites, verifies, issue: ISSUES.VERIFICATION_IMPOSSIBLE, chemins, refusees, ouvertes, brouillonsRefuses, brouillonsReelsRefuses };
  }

  /* LE VERT NE S OBTIENT PAS SANS AVOIR INTERROGE UN BROUILLON — ET UN VRAI. C est le
     critere le plus grave de cette garde. Un lot de sondes qui l aurait perdu en chemin
     rendrait un vert rigoureusement identique a celui d une instance saine : le defaut de
     l etape 21, refait. Et un lot de six sondes `?status=draft` toutes posees sur des types
     sans brouillon/publie afficherait un compte rassurant pour une couverture nulle — le
     meme defaut sous un deguisement plus difficile a voir. */
  if (manquements.length === 0 && (brouillonsRefuses === 0 || brouillonsReelsRefuses === 0)) {
    return {
      manquements: [
        brouillonsRefuses === 0
          ? 'aucune sonde de brouillon (`?status=draft`) n a ete refusee : le critere le plus ' +
            'grave de cette garde n a pas ete exerce. Un vert obtenu sans lui ne dit rien des ' +
            'articles non publies, qui sont precisement ce qui a fuite le 2026-08-10.'
          : `${brouillonsRefuses} sonde(s) de brouillon refusee(s), mais AUCUNE sur un type qui ` +
            'porte reellement le couple brouillon/publie (`draftAndPublish`) : sur les autres, ' +
            '`?status=draft` est inerte et son refus ne prouve rien du contenu non publie. Le ' +
            'compte est rassurant, la couverture est nulle.',
      ],
      verifies,
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      chemins,
      refusees,
      ouvertes,
      brouillonsRefuses,
      brouillonsReelsRefuses,
    };
  }

  return {
    manquements,
    verifies,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    chemins,
    refusees,
    ouvertes,
    brouillonsRefuses,
    brouillonsReelsRefuses,
  };
}

/**
 * Le compte rendu AU VERT — il ANNONCE ce qui a ete confronte.
 *
 * Un vert muet (« surface publique conforme ») ne dit ni sur quels chemins il porte, ni
 * s il a seulement interroge un brouillon : il ressemble mot pour mot au vert que rendait
 * l ancienne preuve sur `/api/upload/files`. Ce resume nomme donc les chemins, les deux
 * comptes, et le compte de brouillons a part.
 */
export function resumeSurface(rapport) {
  return (
    `${rapport.refusees} sonde(s) publique(s) refusee(s) — dont ${rapport.brouillonsRefuses} en ` +
    `?status=draft, ${rapport.brouillonsReelsRefuses} sur un type qui porte reellement le ` +
    `brouillon/publie — et ${rapport.ouvertes} sonde(s) ouverte(s) par le jeton de build : le ` +
    `role Public ne sert rien, et le jeton ouvre bien ce que le public n a pas. ` +
    `Chemins confrontes : ${rapport.chemins.join(', ')}.`
  );
}

/**
 * Mesure reellement les sondes. Isole pour que le jugement reste testable sans reseau.
 *
 * @param {string} base Origine de l instance Strapi, sans barre finale.
 * @param {string} jeton Jeton de build en lecture seule.
 * @param {ReturnType<typeof sondesAttendues>} plan
 */
export async function mesurerSurface(base, jeton, plan) {
  const mesurees = [];
  for (const sonde of plan) {
    const url = `${base.replace(/\/$/, '')}${sonde.chemin}`;
    const entetes = { Accept: 'application/json' };
    if (sonde.role === 'jeton') entetes.Authorization = `Bearer ${jeton}`;
    try {
      const reponse = await fetch(url, { headers: entetes, redirect: 'manual' });
      /* Le corps est LU et jete : sans cela la connexion reste a demi ouverte dans le pool
         et le processus ne se termine pas seul, ce qui obligerait a un `process.exit()`
         brutal — dont l abandon des poignees libuv fait avorter Node sous Windows AVANT que
         le code de sortie ne soit rendu. Une garde dont le code de sortie est un accident
         ne garde rien. */
      await reponse.arrayBuffer();
      mesurees.push({ ...sonde, statut: reponse.status });
    } catch (erreur) {
      mesurees.push({ ...sonde, erreur: String(erreur?.cause?.message ?? erreur?.message ?? erreur) });
    }
  }
  return mesurees;
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] ?? process.env[VARIABLES_REQUISES.base];
  const jeton = process.env[VARIABLES_REQUISES.jeton];

  const absentes = [
    base ? null : VARIABLES_REQUISES.base,
    jeton ? null : VARIABLES_REQUISES.jeton,
  ].filter(Boolean);

  if (absentes.length > 0) {
    console.error(
      '\n⛔ VERIFICATION IMPOSSIBLE — variable(s) absente(s) : ' +
        absentes.join(', ') +
        '\n  La garde ne peut rien juger sans elles, et surtout : un jeton absent donne un en-tete' +
        '\n  « Bearer » vide, auquel Strapi repond 403 — soit exactement le code d un appel sans' +
        '\n  jeton. Sans ce message, la garde rendrait un verdict rassurant sur une mesure morte.',
    );
    process.exitCode = ISSUES.VERIFICATION_IMPOSSIBLE;
  } else {
    const surface = surfaceDepuisSchemas(new URL('../../cms/src/api', import.meta.url));
    const rapport = jugerSondes(await mesurerSurface(base, jeton, sondesAttendues(surface)));

    if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
      console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucun verdict sur la surface publique :');
      for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
      process.exitCode = ISSUES.VERIFICATION_IMPOSSIBLE;
    } else if (rapport.manquements.length > 0) {
      console.error(`\n✖ ${rapport.manquements.length} manquement(s) sur ${base} :`);
      for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
      process.exitCode = ISSUES.ANOMALIE;
    } else {
      console.log(`✔ ${resumeSurface(rapport)}`);
      process.exitCode = ISSUES.CONFORME;
    }
  }
}
