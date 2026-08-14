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
      /* LES SONDES DE PROFONDEUR. Le middleware `global::statut-publie` impose
         `status=published` sur la query RACINE ; que la contrainte se propage aux relations
         ramenees par `?populate=*` est un RAISONNEMENT sur le comportement de Strapi, pas un
         fait mesure — c etait le seul point du lot « role Public » a ne reposer sur rien
         d autre. Sans ces deux sondes, une relation imbriquee qui fuirait rendrait le meme
         vert qu une instance saine : le defaut de l etape 21, deplace d un cran en
         profondeur. */
      sondes.push({ chemin: `${racine}?populate=*`, role, brouillon: false, brouillonsActifs: entree.brouillons, profond: true });
      sondes.push({ chemin: `${racine}?populate=*&status=draft`, role, brouillon: true, brouillonsActifs: entree.brouillons, profond: true });
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
/**
 * TOUS les `publishedAt` d un document, racine ET relations imbriquees, a toute profondeur.
 *
 * POURQUOI LA PROFONDEUR, ET PAS LA SEULE RACINE. Le middleware impose `status=published`
 * sur la query RACINE. Que Strapi propage cette contrainte aux relations ramenees par
 * `?populate=*` est un raisonnement sur son comportement interne, pas un fait mesure. Un
 * scan limite a la racine declarerait donc « propre » une reponse dont un tag, un auteur ou
 * un article lie serait un brouillon — et rendrait un vert rigoureusement identique a celui
 * d une instance saine. C est le defaut de l etape 21 refait un cran plus bas.
 *
 * Le CHEMIN de chaque occurrence est conserve : « il y a une fuite dans la reponse » se
 * discute, `$[0].tags[0].publishedAt` se corrige.
 *
 * @param {unknown} noeud
 * @param {string} chemin
 * @param {{chemin: string, valeur: unknown}[]} trouves
 * @returns {{chemin: string, valeur: unknown}[]}
 */
export function recenserPublishedAt(noeud, chemin = '$', trouves = []) {
  if (Array.isArray(noeud)) {
    noeud.forEach((valeur, i) => recenserPublishedAt(valeur, `${chemin}[${i}]`, trouves));
    return trouves;
  }
  if (!noeud || typeof noeud !== 'object') return trouves;
  for (const [cle, valeur] of Object.entries(noeud)) {
    if (cle === 'publishedAt') {
      trouves.push({ chemin: `${chemin}.publishedAt`, valeur });
      continue;
    }
    recenserPublishedAt(valeur, `${chemin}.${cle}`, trouves);
  }
  return trouves;
}

/**
 * Les occurrences NON PUBLIEES d une reponse Strapi, collection ou type unique, a toute
 * profondeur.
 *
 * C EST LE DISCRIMINANT DU MIDDLEWARE `global::statut-publie`, et il tient a une seule
 * propriete : il impose `status=published` a l appelant sans credence, donc la reponse ne
 * peut porter que des versions publiees. Un `publishedAt: null` prouve que `?status=draft` a
 * ete HONORE — c est la fuite du 2026-08-10, celle qui rendait un article non publie titre
 * et corps compris a n importe qui.
 *
 * `undefined` (et non un tableau vide) quand le corps n est pas lisible : ne pas pouvoir
 * juger n est pas juger conforme.
 *
 * @param {unknown} corps
 * @returns {{inspectes: {chemin: string, valeur: unknown}[], nonPublies: {chemin: string}[]} | undefined}
 */
export function nonPubliesEnProfondeur(corps) {
  if (!corps || typeof corps !== 'object' || !('data' in corps)) return undefined;
  const donnees = corps.data;
  if (donnees === null) return { inspectes: [], nonPublies: [] };
  const entrees = Array.isArray(donnees) ? donnees : [donnees];
  if (entrees.some((e) => !e || typeof e !== 'object')) return undefined;
  const inspectes = recenserPublishedAt(donnees);
  /* `publishedAt` ABSENT et `publishedAt: null` ne se confondent pas : le premier arrive sur
     un type sans brouillon/publie (rien a conclure), le second est une version brouillon. */
  return { inspectes, nonPublies: inspectes.filter((x) => x.valeur === null) };
}

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

/**
 * Le manquement d une reponse PUBLIQUE qui porte du non publie. C est LA fuite.
 *
 * Le compte est nomme : « il y a une fuite » sans son ampleur se discute, un nombre se
 * corrige. Le geste, lui, n est plus « fermer la permission » mais « regarder le
 * middleware » — sous la branche A, l ouverture est voulue, c est la protection qui manque.
 */
function manquementFuiteContenu(sonde, nonPublies) {
  /* LES CHEMINS SONT NOMMES, et c est ce qui rend le rouge actionnable en profondeur : une
     fuite a la racine et une fuite dans `$[0].tags[0]` n envoient pas au meme endroit. La
     seconde ne se corrige PAS en refermant la permission du type sonde — le tag fuit par la
     relation d un article, pas par `/api/tags`. */
  const ou = nonPublies.slice(0, 3).map((x) => x.chemin).join(', ');
  const reste = nonPublies.length > 3 ? `, … (+${nonPublies.length - 3})` : '';
  const profond = nonPublies.some((x) => x.chemin !== '$.publishedAt' && !/^\$\[\d+\]\.publishedAt$/.test(x.chemin));

  return (
    `${sonde.chemin} → 200 SANS AUCUN JETON, et la reponse porte ${nonPublies.length} entree(s) non ` +
    `publiee(s) (\`publishedAt: null\`) en ${ou}${reste} : c est une FUITE EDITORIALE. Un article ` +
    'non publie y est lisible titre et corps compris par n importe qui. ' +
    (profond
      ? 'ELLE EST DANS UNE RELATION IMBRIQUEE, pas a la racine : refermer la permission du type ' +
        'sonde ne la fermerait PAS — le document non publie arrive par le `populate` d un autre ' +
        'type. C est le middleware qui doit propager `status=published` a la relation. '
      : '') +
    'Le middleware `global::statut-publie` ' +
    'doit imposer `status=published` a tout appelant sans credence — verifier qu il est bien ' +
    'declare dans `apps/cms/config/middlewares.ts` ET que l instance a REDEMARRE avec. En ' +
    'attendant la correction, refermer `find`/`findOne` de ce type dans Settings → Users & ' +
    'Permissions → Roles → Public : la fermeture d urgence passe avant la comprehension.'
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
    servies: 0,
    brouillonsServisProteges: 0,
    profondesExercees: 0,
    publishedAtInspectes: 0,
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
  /* Branche A : une sonde publique SERVIE dont le contenu est propre. `brouillonsServisProteges`
     est le seul compte qui prouve le middleware — un refus, lui, ne prouve que la fermeture. */
  let servies = 0;
  let brouillonsServisProteges = 0;
  /* Les deux comptes de la PROFONDEUR. `profondesExercees` prouve que le plan portait bien
     des sondes `?populate=*` et qu elles ont abouti a un verdict ; `publishedAtInspectes`
     prouve que l arbre a reellement ete parcouru — une reponse PLATE (populate ignore par
     l instance, relations absentes) rendrait sinon le meme vert qu une reponse parcourue. */
  let profondesExercees = 0;
  let publishedAtInspectes = 0;

  for (const sonde of sondes) {
    if (sonde.erreur) {
      /* Une incapacite n est pas une anomalie : « je n ai pas pu joindre l instance » envoie
         regarder le reseau, « le role sert /api/articles » envoie fermer une permission. */
      incapacites.push(`${sonde.chemin} (${sonde.role}) → la reponse n a pas pu etre obtenue : ${sonde.erreur}`);
      continue;
    }

    if (sonde.role === 'public') {
      if (sonde.statut === 200) {
        /* BRANCHE A (decision 7106948b) : l OUVERTURE n est plus le manquement, le BROUILLON
           LISIBLE l est. La fuite se ferme par du code (`global::statut-publie`) et le role
           Public reste ouvert conformement au §3.9. Juger le seul code HTTP rendait cet etat
           IMMESURABLE : « 0 avec le role ouvert » etait inatteignable, et rouvrir les 11
           permissions produisait une douzaine de manquements que le middleware travaille ou
           non. C est desormais le CONTENU qui tranche. */
        const lecture = nonPubliesEnProfondeur(sonde.corps);
        if (lecture === undefined) {
          incapacites.push(
            `${sonde.chemin} (sans jeton) → 200, mais son corps n a pas pu etre lu : impossible ` +
              'de distinguer une reponse protegee d une fuite. Un vert rendu ici serait un vert ' +
              'obtenu sur rien.',
          );
          continue;
        }
        publishedAtInspectes += lecture.inspectes.length;
        if (lecture.nonPublies.length > 0) {
          if (sonde.profond) profondesExercees += 1;
          manquements.push(manquementFuiteContenu(sonde, lecture.nonPublies));
          continue;
        }
        servies += 1;
        if (sonde.brouillon && sonde.brouillonsActifs) brouillonsServisProteges += 1;
        if (sonde.profond) profondesExercees += 1;
        verifies.push(
          `${sonde.chemin} servi (200), ${lecture.inspectes.length} publishedAt inspecte(s), aucun non publie`,
        );
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
      /* Un refus exerce le critere de profondeur aussi bien qu une reponse verifiee : il
         prouve que rien n est servi, donc qu aucune relation ne peut fuir. Meme logique que
         `brouillonsReelsRefuses` un cran plus haut — c est ZERO des deux qui doit bloquer. */
      if (sonde.profond) profondesExercees += 1;
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
    return { manquements: incapacites, verifies, issue: ISSUES.VERIFICATION_IMPOSSIBLE, chemins, refusees, ouvertes, brouillonsRefuses, brouillonsReelsRefuses, servies, brouillonsServisProteges };
  }

  /* LE VERT NE S OBTIENT PAS SANS AVOIR INTERROGE UN BROUILLON — ET UN VRAI. C est le
     critere le plus grave de cette garde. Un lot de sondes qui l aurait perdu en chemin
     rendrait un vert rigoureusement identique a celui d une instance saine : le defaut de
     l etape 21, refait. Et un lot de six sondes `?status=draft` toutes posees sur des types
     sans brouillon/publie afficherait un compte rassurant pour une couverture nulle — le
     meme defaut sous un deguisement plus difficile a voir. */
  /* LE CRITERE EST EXERCE PAR L UN OU L AUTRE DES DEUX ETATS, jamais par aucun. Sous la
     branche B le brouillon etait REFUSE ; sous la branche A il est SERVI et son contenu
     verifie propre. Les deux prouvent quelque chose — la fermeture pour l un, le middleware
     pour l autre — mais zero des deux ne prouve rien, et c est cela seul qui doit bloquer. */
  const brouillonReelExerce = brouillonsReelsRefuses > 0 || brouillonsServisProteges > 0;
  const comptes = { chemins, refusees, ouvertes, brouillonsRefuses, brouillonsReelsRefuses, servies, brouillonsServisProteges, profondesExercees, publishedAtInspectes };

  /* LE VERT NE S OBTIENT PAS SANS AVOIR SONDE LES RELATIONS. Meme exigence que celle du
     brouillon, un cran plus bas : un plan qui perdrait ses sondes `?populate=*` — refonte,
     filtre, regression — rendrait un vert rigoureusement identique a celui d une instance
     dont les relations imbriquees ont ete verifiees. Le compte n est pas decoratif : c est
     la seule chose qui distingue « aucune relation ne fuit » de « aucune relation n a ete
     regardee ». */
  if (manquements.length === 0 && profondesExercees === 0) {
    return {
      manquements: [
        'aucune sonde `?populate=*` n a ete ni refusee ni servie : les relations imbriquees ' +
          'n ont pas ete regardees. Le middleware `global::statut-publie` impose ' +
          '`status=published` sur la query RACINE ; que la contrainte se propage au `populate` ' +
          'est un raisonnement, pas une mesure. Un vert obtenu sans ces sondes ne dit rien du ' +
          'brouillon qui arriverait par la relation d un autre type.',
      ],
      verifies,
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...comptes,
    };
  }

  if (manquements.length === 0 && !brouillonReelExerce) {
    return {
      manquements: [
        brouillonsRefuses === 0 && servies === 0
          ? 'aucune sonde de brouillon (`?status=draft`) n a ete ni refusee ni servie : le critere ' +
            'le plus grave de cette garde n a pas ete exerce. Un vert obtenu sans lui ne dit rien ' +
            'des articles non publies, qui sont precisement ce qui a fuite le 2026-08-10.'
          : 'aucune sonde de brouillon sur un type qui porte reellement le couple ' +
            'brouillon/publie (`draftAndPublish`) n a ete exercee — ni refusee, ni servie avec un ' +
            'contenu verifie. Sur les autres types `?status=draft` est inerte : ni son refus ni ' +
            'sa reponse ne prouvent quoi que ce soit du contenu non publie. Le compte est ' +
            'rassurant, la couverture est nulle.',
      ],
      verifies,
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...comptes,
    };
  }

  return {
    manquements,
    verifies,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    ...comptes,
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
  /* LES DEUX VERTS NE DISENT PAS LA MEME CHOSE, et c est tout l objet de ce compte. Un 0
     obtenu avec le role FERME ne prouve que la fermeture ; un 0 obtenu avec le role OUVERT
     et des brouillons servis dont le contenu est propre prouve que le middleware travaille.
     Sans ce chiffre les deux etats se lisent identiquement — et c est en croyant les
     distinguer qu on rouvre une surface publique pour rien. */
  const servis =
    `${rapport.brouillonsServisProteges ?? 0} brouillon(s) SERVI(S) et verifie(s) sans aucune ` +
    'entree non publiee';
  /* LA PROFONDEUR SE COMPTE, SINON ELLE NE SE VOIT PAS. Une sonde `?populate=*` qui
     ramenerait un document PLAT — relations absentes, populate ignore par l instance — rend
     le meme verdict qu une sonde qui a parcouru tout l arbre. Le compte des `publishedAt`
     rencontres est la seule chose qui les distingue : 12 sondes a 1 chacune et 12 sondes a
     26 chacune ne decrivent pas la meme mesure. */
  const profondeur =
    `${rapport.profondesExercees ?? 0} sonde(s) ?populate=* exercee(s), ` +
    `${rapport.publishedAtInspectes ?? 0} publishedAt inspecte(s) racine et relations comprises`;
  return (
    `${rapport.refusees} sonde(s) publique(s) refusee(s) — dont ${rapport.brouillonsRefuses} en ` +
    `?status=draft, ${rapport.brouillonsReelsRefuses} sur un type qui porte reellement le ` +
    `brouillon/publie —, ${rapport.servies ?? 0} sonde(s) publique(s) SERVIE(S) dont ${servis}, ` +
    `et ${rapport.ouvertes} sonde(s) ouverte(s) par le jeton de build. ${profondeur}. ` +
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
      /* LE CORPS EST CONSERVE quand une sonde PUBLIQUE rend 200 : sous la branche A c est
         lui qui tranche, l ouverture n etant plus le manquement. Le lire vide la connexion
         aussi bien que le jeter — la raison ci-dessus est donc intacte. Un corps illisible
         reste `undefined`, ce que le jugement traite en INCAPACITE et jamais en conforme. */
      const brut = await reponse.text();
      let corps;
      if (sonde.role === 'public' && reponse.status === 200) {
        try {
          corps = JSON.parse(brut);
        } catch {
          corps = undefined;
        }
      }
      mesurees.push({ ...sonde, statut: reponse.status, corps });
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
