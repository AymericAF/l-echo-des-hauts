/**
 * COMPLETUDE DU REPARTITEUR DE BLOCS (§3.6, §4.4) — la decision, sortie du test.
 *
 * CE QUE CE FICHIER PROTEGE : ajouter un neuvieme type de bloc au domaine sans ecrire son
 * composant. Le repartiteur rendrait `undefined`, ou leverait au build sur le PREMIER
 * article portant ce bloc — le defaut se decouvrant en production, sur un article, et pas
 * a la ligne ou il a ete introduit.
 *
 * POURQUOI CE FICHIER EXISTE, mesure le 2026-08-12 (tache da2975e2). La garde existait
 * deja, entiere et juste — mais elle vivait TOUT ENTIERE dans `tests/repartiteur-blocs.test.ts`,
 * donc elle ne tournait que dans `npm test`. Or `npm test` ne tourne NULLE PART sur le
 * chemin de la production :
 *
 *   - releve du 2026-08-12 dans la base de Coolify (`applications`, uuid
 *     `mft3ounqrorfp4kix266q16q`) : l application `echo-site` construit en `nixpacks`,
 *     `base_directory = /apps/web`, `build_command` VIDE — donc le plan Nixpacks par
 *     defaut ;
 *   - releve du meme jour dans le journal du deploiement #371 (commit `c35e7d5`), le plan
 *     effectivement execute : `install -> npm ci`, `build -> npm run build`, `start` vide.
 *     Il n y a PAS de `npm test` sur ce chemin, et il n y en aura jamais : Nixpacks ne
 *     lance que ces deux phases.
 *
 * La garde tournait donc chez GitHub et sur le poste, et pas la ou le mal se produit — un
 * `git push --no-verify` suivi d un deploiement manuel, ou un deploiement declenche sur un
 * commit dont l integration continue n a pas fini de tourner, et le neuvieme bloc partait
 * en production. C est la meme forme que les deux autres defauts du jour : une garde qui ne
 * s exerce pas la ou le mal se produit ne garde rien.
 *
 * OU LA GARDE EST BRANCHEE MAINTENANT : `integrations/garde-repartiteur.mjs`, hook
 * `astro:config:done` — DANS `astro build`, donc dans `npm run build`, donc dans le seul
 * geste que Coolify execute. Au plus tot, avant qu une seule page ne soit rendue.
 *
 * ⚠️ CE QUE LA GARDE A LE DROIT DE LIRE, ET POURQUOI C EST UNE CONTRAINTE DURE. Le
 * contexte de construction de Coolify n est PAS le depot : c est `/apps/web` (`nixpacks
 * build … /artifacts/<id>/apps/web`, releve au journal #371), et les `Watch Paths` de
 * l application ne surveillent que `apps/web/**`. Une garde de build qui lirait un fichier
 * hors de ce repertoire — un `.github/`, un `docs/`, la racine du depot — ne le trouverait
 * pas dans l image, rendrait INCAPACITE, et ferait ECHOUER LA PRODUCTION pour une cause qui
 * n existe que chez elle. Les trois sources ci-dessous sont toutes sous `apps/web/src/`.
 *
 * POURQUOI UNE CONFRONTATION ET PAS UNE LISTE ATTENDUE. Les trois copies de la liste des
 * huit blocs sont lues DANS LEUR SOURCE et confrontees entre elles ; une liste ecrite ici
 * serait une QUATRIEME copie, a diverger comme les autres.
 *
 * PIEGE DE CETTE FORME, ET CE QUI LE FERME. Un extracteur qui ne trouve plus rien rend deux
 * ensembles vides, donc egaux, donc verts : la garde mourrait en silence le jour ou la forme
 * d un fichier bouge — exactement le mode d echec qu on corrige ici. D ou deux parades, et
 * la SEPARATION DES DEUX ISSUES : une extraction muette est une INCAPACITE (code 2 :
 * corriger la garde), jamais un manquement du site (code 1) ; et un membre d union dont le
 * litteral ne se lit pas ressort en marqueur `?Nom` au lieu de disparaitre.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ISSUES } from './issues.mjs';

const RACINE_PAR_DEFAUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * LES TROIS SOURCES CONFRONTEES — toutes sous `src/`, donc dans le contexte de
 * construction de Coolify (`Base Directory` = `/apps/web`). Ajouter ici un chemin qui en
 * sort ferait echouer la production, et elle seule : les tests, eux, voient tout le depot.
 */
export const CHEMINS = {
  domaine: 'src/lib/domaine.ts',
  repartiteur: 'src/components/blocs/BlocContenu.astro',
  mapping: 'src/lib/strapi/mapping.ts',
};

/** Le repertoire des composants de blocs, relatif a la racine de l application. */
const DOSSIER_BLOCS = 'src/components/blocs';

// ---------------------------------------------------------------------------
// extraction (fonctions pures : elles prennent un texte, pas un fichier)
// ---------------------------------------------------------------------------

/** Les membres de `export type Bloc = A | B | … ;`. */
export function membresUnionBloc(src) {
  const union = /export type Bloc =([^;]*);/.exec(src);
  if (union === null) return [];
  return union[1]
    .split('|')
    .map((membre) => membre.trim())
    .filter((membre) => membre.length > 0);
}

/**
 * Le litteral `readonly type: '…'` de chaque membre de l union `Bloc`.
 *
 * Un membre dont le litteral ne se lit pas rend `?Nom` plutot que rien : un type qui
 * DISPARAIT de la liste passerait la confrontation en silence, un marqueur la fait
 * echouer en nommant le membre illisible.
 */
export function typesDuDomaine(src) {
  return membresUnionBloc(src).map((nom) => {
    const corps = new RegExp(`export interface ${nom}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src);
    const litteral = corps === null ? null : /readonly type:\s*'([^']+)'/.exec(corps[1]);
    return litteral === null ? `?${nom}` : litteral[1];
  });
}

/** La table `RENDUS` du repartiteur : `'bloc.x': Composant`. */
export function tableDuRepartiteur(src) {
  const table = /const RENDUS = \{([\s\S]*?)\n\}/.exec(src);
  if (table === null) return [];
  return [...table[1].matchAll(/'([^']+)'\s*:\s*([A-Za-z0-9_]+)\s*,/g)].map((ligne) => ({
    type: ligne[1],
    composant: ligne[2],
  }));
}

/** Les composants `.astro` importes, par identifiant. */
export function composantsImportes(src) {
  return new Map(
    [...src.matchAll(/^import\s+([A-Za-z0-9_]+)\s+from\s+'(\.[^']+\.astro)';/gm)].map((ligne) => [
      ligne[1],
      ligne[2],
    ]),
  );
}

/** Les `case 'bloc.…':` du `switch` de `mapping.ts`. */
export function typesDuMapping(src) {
  return [...src.matchAll(/case '(bloc\.[^']+)':/g)].map((ligne) => ligne[1]);
}

/**
 * La DECISION de la garde : ce que le domaine declare et que l autre liste ne porte pas, et
 * l inverse. Les deux sens comptent — un rendu orphelin est un composant mort qu une
 * suppression de type a oublie derriere elle.
 */
export function manquements(attendus, presents, nomAttendus, nomPresents) {
  const ensembleAttendus = new Set(attendus);
  const ensemblePresents = new Set(presents);
  return [
    ...attendus
      .filter((type) => !ensemblePresents.has(type))
      .map((type) => `« ${type} » est declare dans ${nomAttendus} mais absent de ${nomPresents}`),
    ...presents
      .filter((type) => !ensembleAttendus.has(type))
      .map((type) => `« ${type} » est declare dans ${nomPresents} mais absent de ${nomAttendus}`),
  ];
}

// ---------------------------------------------------------------------------
// la garde complete, sur des sources
// ---------------------------------------------------------------------------

/**
 * Ce qui empeche de JUGER — l incapacite, distincte du manquement.
 *
 * Une source illisible ou une extraction muette veut dire que la garde est aveugle, pas
 * que le site est fautif. Les confondre enverrait chercher un bloc manquant la ou c est la
 * forme d un fichier qui a bouge — et, dans un build de production, ferait echouer le
 * deploiement sous un message qui accuse le mauvais objet.
 *
 * @param {{domaine: string[], table: {type: string}[], mapping: string[]}} lu
 * @returns {string[]}
 */
export function incapacites(lu) {
  const ecarts = [];
  if (lu.domaine.length === 0) {
    ecarts.push(
      `${CHEMINS.domaine} : l union \`export type Bloc = … ;\` ne se lit plus. La confrontation ` +
        'serait verte a vide — deux ensembles vides sont egaux.',
    );
  }
  if (lu.table.length === 0) {
    ecarts.push(
      `${CHEMINS.repartiteur} : la table \`const RENDUS = { … }\` ne se lit plus (renommage, ` +
        'reformatage ?). La garde ne sait plus ce que le repartiteur rend.',
    );
  }
  if (lu.mapping.length === 0) {
    ecarts.push(
      `${CHEMINS.mapping} : aucun \`case 'bloc.…':\` ne se lit. La garde ne sait plus quels ` +
        'types le mapping fabrique.',
    );
  }
  const illisibles = lu.domaine.filter((type) => type.startsWith('?'));
  if (illisibles.length > 0) {
    ecarts.push(
      `${CHEMINS.domaine} : ${illisibles.join(', ')} — membre(s) de l union sans litteral ` +
        '`readonly type`. Sans le marqueur, ils DISPARAITRAIENT de la confrontation, qui ' +
        'resterait verte en ayant cesse de couvrir ces types.',
    );
  }
  return ecarts;
}

/**
 * La garde, lue sur les trois sources d une application.
 *
 * @param {string} [racine] Racine de l application (defaut : `apps/web`).
 * @returns {{issue: number, manquements: string[], types: string[], rendus: number, cas: number}}
 */
export function inspecterRepartiteur(racine = RACINE_PAR_DEFAUT) {
  const lire = (relatif) => {
    const complet = path.join(racine, relatif);
    return fs.existsSync(complet) ? fs.readFileSync(complet, 'utf8') : null;
  };

  const sources = {};
  const absents = [];
  for (const [role, relatif] of Object.entries(CHEMINS)) {
    const contenu = lire(relatif);
    if (contenu === null) absents.push(`${relatif} n existe pas sous ${racine}`);
    sources[role] = contenu ?? '';
  }
  if (absents.length > 0) {
    return { issue: ISSUES.VERIFICATION_IMPOSSIBLE, manquements: absents, types: [], rendus: 0, cas: 0 };
  }

  const lu = {
    domaine: typesDuDomaine(sources.domaine),
    table: tableDuRepartiteur(sources.repartiteur),
    mapping: typesDuMapping(sources.mapping),
  };

  const aveugle = incapacites(lu);
  if (aveugle.length > 0) {
    return {
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      manquements: aveugle,
      types: lu.domaine,
      rendus: lu.table.length,
      cas: lu.mapping.length,
    };
  }

  const importes = composantsImportes(sources.repartiteur);
  const composantsAbsents = lu.table.flatMap(({ type, composant }) => {
    const relatif = importes.get(composant);
    if (relatif === undefined) return [`« ${type} » : ${composant} n est importe nulle part`];
    return fs.existsSync(path.join(racine, DOSSIER_BLOCS, relatif)) ? [] : [`« ${type} » : ${relatif} n existe pas`];
  });

  const trouves = [
    ...manquements(
      lu.domaine,
      lu.table.map((entree) => entree.type),
      `l union Bloc (${CHEMINS.domaine})`,
      `la table RENDUS (${CHEMINS.repartiteur})`,
    ),
    ...manquements(
      lu.domaine,
      lu.mapping,
      `l union Bloc (${CHEMINS.domaine})`,
      `le switch sur __component (${CHEMINS.mapping})`,
    ),
    ...composantsAbsents,
  ];

  return {
    issue: trouves.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    manquements: trouves,
    types: lu.domaine,
    rendus: lu.table.length,
    cas: lu.mapping.length,
  };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeRepartiteur(rapport) {
  return (
    `${rapport.types.length} type(s) de bloc du domaine, ${rapport.rendus} rendu(s) declare(s), ` +
    `${rapport.cas} cas de mapping : chacun a son composant, et aucun composant n est orphelin.`
  );
}
