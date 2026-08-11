/**
 * QUELS VERIFICATEURS L INTEGRATION CONTINUE RELANCE — derive de package.json, jamais recopie.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure le 2026-08-11. Le pas « les six verificateurs »
 * du job `sortie` bouclait sur une liste ECRITE EN DUR — sortie, images, liens,
 * origine-medias, seo, styles-en-ligne — quand `package.json` en exposait NEUF.
 * `verifier:cascade-titres` etait dehors : il n etait donc garde que par son cablage dans
 * `astro.config.mjs`, c est-a-dire par la chose precise que ce pas existe pour ne pas
 * supposer. Son propre commentaire le dit : « le build ne les exerce que TANT QU ILS SONT
 * BRANCHES ; retirer une ligne de ce tableau rend le build vert sur une sortie fautive ».
 *
 * POURQUOI UNE DERIVATION ET PAS UN SEPTIEME NOM AJOUTE A LA MAIN. Ajouter le nom aurait
 * ferme le CAS et laisse la CLASSE ouverte : la liste redivergerait au prochain
 * verificateur, exactement comme celle-ci a diverge. La population est donc LUE
 * (`verifier:*` de package.json) et l exception doit se DECLARER — meme forme que le pas
 * « aucun fichier de test n est absent du npm test », qui ferme deja cette classe pour les
 * tests.
 *
 * CE QUE CE FICHIER NE FAIT PAS : juger. Il ne lance rien, il ne lit aucun `dist/`. Il
 * repond a une seule question — « qui doit tourner ? » — et rougit quand il ne sait pas y
 * repondre, plutot que de rendre une liste vide sur laquelle une boucle tournerait en
 * silence avant de sortir en vert.
 *
 *   node scripts/verificateurs-de-sortie.mjs            -> la liste, un nom par ligne
 *   node scripts/verificateurs-de-sortie.mjs --pourquoi -> les exemptes et leur raison
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * LES DEUX QUI RESTENT DEHORS, ET POURQUOI — a lire avant de « corriger » un ecart de
 * comptage. Neuf verificateurs sont declares, sept tournent ici : ce n est pas un oubli.
 *
 * La raison est la meme pour les deux, et elle n a rien d une preference : leur corpus
 * n est pas un repertoire, c est une REPONSE HTTP. Aucun des deux ne recoit un chemin de
 * `dist/` — les forcer dans la boucle demanderait de leur inventer un objet qu ils ne
 * jugent pas. C est aussi la frontiere que trace `tests/verificateurs-incapacite.test.ts`
 * avec sa liste `HORS_TABLEAU`, pour la meme cause.
 *
 * ILS RESTENT TENUS, ailleurs : leurs trois sens sont exerces par
 * `tests/garde-en-tetes-securite.test.ts` et `tests/garde-surface-publique.test.ts`, et la
 * reponse servie est mesuree en recette (P3), sur l environnement en ligne — la ou elle
 * existe.
 */
export const EXEMPTES_DE_L_INTEGRATION_CONTINUE = {
  'en-tetes':
    'il interroge la PRODUCTION (https://echo.ayfiweb.fr) : l integration continue n a pas ' +
    'de site a interroger, et le brancher ici ferait rougir un commit pour l etat d un ' +
    'environnement qu aucun commit ne gouverne — les en-tetes vivent dans les labels ' +
    'Traefik de Coolify, hors du depot. Sa place est la recette (P3).',
  'surface-publique':
    'il interroge l INSTANCE STRAPI avec un jeton (ECHO_STRAPI_API_TOKEN_READONLY). Sans ' +
    '.env il rend 2 — VERIFICATION IMPOSSIBLE, et c est le comportement voulu : mesure du ' +
    '2026-08-11, code 2. Le mettre dans la boucle rendrait le job rouge pour une cause qui ' +
    'n existe pas dans le commit, et c est le JOB qu on finirait par desactiver.',
};

/** Le nom court d un verificateur, tel que `npm run verifier:<nom>` l appelle. */
function nomCourt(cle) {
  return cle.slice('verifier:'.length);
}

/**
 * Tous les verificateurs que `package.json` DECLARE, tries.
 *
 * @param {{scripts?: Record<string, string>}} paquet
 * @returns {string[]}
 */
export function verificateursDeclares(paquet) {
  return Object.keys(paquet.scripts ?? {})
    .filter((cle) => cle.startsWith('verifier:'))
    .map(nomCourt)
    .sort();
}

/**
 * Ceux que l integration continue doit relancer : les declares, moins les exemptes.
 *
 * @param {{scripts?: Record<string, string>}} paquet
 * @returns {string[]}
 */
export function verificateursALancer(paquet) {
  const exemptes = new Set(Object.keys(EXEMPTES_DE_L_INTEGRATION_CONTINUE));
  return verificateursDeclares(paquet).filter((nom) => !exemptes.has(nom));
}

/**
 * Ce qui empeche de repondre a « qui doit tourner ? ».
 *
 * Rendre une liste vide plutot qu une erreur serait le mode d echec ou SUCCES ET ECHEC
 * RENDENT LA MEME SORTIE : la boucle tournerait sur zero verificateur et le job sortirait
 * en 0. Cf. [[quand-succes-et-echec-rendent-la-meme-sortie]].
 *
 * @param {{scripts?: Record<string, string>}} paquet
 * @returns {string[]}
 */
export function incoherences(paquet) {
  const ecarts = [];
  const declares = verificateursDeclares(paquet);

  if (declares.length === 0) {
    ecarts.push(
      'aucun script `verifier:*` dans package.json : la boucle tournerait sur du vide et ' +
        'le job sortirait en vert sans avoir rien verifie.',
    );
  }

  for (const nom of Object.keys(EXEMPTES_DE_L_INTEGRATION_CONTINUE)) {
    if (!declares.includes(nom)) {
      ecarts.push(
        `exemption morte : « ${nom} » n est plus expose par package.json. Une exception qui ` +
          'survit a sa cible elargit le trou en silence — retire-la.',
      );
      continue;
    }
    const script = path.join(RACINE, 'scripts', `verifier-${nom}.mjs`);
    if (!fs.existsSync(script)) {
      ecarts.push(`exemption morte : « ${nom} » est exempte mais scripts/verifier-${nom}.mjs n existe pas.`);
    }
  }

  if (declares.length > 0 && verificateursALancer(paquet).length === 0) {
    ecarts.push('tous les verificateurs sont exemptes : il ne resterait rien a lancer.');
  }

  return ecarts;
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paquet = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));

  const ecarts = incoherences(paquet);
  if (ecarts.length > 0) {
    console.error('✖ [verificateurs-de-sortie] la liste ne peut pas etre derivee :');
    for (const ecart of ecarts) console.error(`  - ${ecart}`);
    process.exit(2);
  }

  if (process.argv.includes('--pourquoi')) {
    const declares = verificateursDeclares(paquet);
    const lances = verificateursALancer(paquet);
    console.log(
      `${lances.length} verificateur(s) relance(s) sur ${declares.length} declare(s). ` +
        'Les autres ne sont pas oublies — leur corpus est une reponse HTTP :',
    );
    for (const [nom, raison] of Object.entries(EXEMPTES_DE_L_INTEGRATION_CONTINUE)) {
      console.log(`  - verifier:${nom} — ${raison}`);
    }
  } else {
    console.log(verificateursALancer(paquet).join('\n'));
  }
}
