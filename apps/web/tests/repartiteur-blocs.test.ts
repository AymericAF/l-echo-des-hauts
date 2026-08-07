/**
 * Garde de COMPLETUDE du repartiteur de blocs (§3.6, §4.4).
 *
 * Ce que cette garde protege : ajouter un neuvieme type de bloc au domaine sans ecrire
 * son composant. Le repartiteur rendrait alors `undefined` — ou, ici, leverait au build
 * sur le premier article portant ce bloc. Dans les deux cas, le defaut se decouvre en
 * production, sur un article, et pas a la ligne ou il a ete introduit.
 *
 * POURQUOI UN TEST, alors que `BlocContenu.astro` porte deja un
 * `satisfies Record<Bloc['type'], unknown>`. Parce que ce `satisfies` NE TOURNE NULLE
 * PART. Astro STRIP les types du frontmatter, il ne les verifie pas ; `astro check`
 * n est pas installe (et ne le sera pas : il tire `@astrojs/check` + `typescript` dans
 * un depot public dont le README est un argumentaire). Mesure du 2026-08-07, sur un
 * domaine volontairement casse par un neuvieme type sans rendu : `npm test` rendait
 * 229/229 verts, et `astro build` allait au bout, garde T-09 comprise. Le `satisfies`
 * n etait donc vu que par l editeur d un humain qui aurait ouvert le fichier — c est un
 * commentaire, pas une garde. Il est CONSERVE pour ce qu il vaut (il previent a la
 * frappe), et c est ce fichier qui le rend opposable en machine.
 *
 * COMMENT, sans ajouter une dependance. Les trois copies de la liste des huit blocs sont
 * lues DANS LEUR SOURCE et confrontees entre elles :
 *
 *   - `domaine.ts`        — l union `Bloc`, autorite du domaine ;
 *   - `BlocContenu.astro` — la table `RENDUS`, un composant par type ;
 *   - `mapping.ts`        — le `switch` sur `__component`, qui fabrique ces types.
 *
 * Une liste attendue ecrite en dur ici serait une QUATRIEME copie, a diverger comme les
 * autres. C est la confrontation qui est la garde, pas une constante.
 *
 * PIEGE DE CETTE FORME, et ce qui le ferme. Un extracteur qui ne trouve plus rien rend
 * deux ensembles vides, donc egaux, donc verts : la garde mourrait en silence le jour ou
 * la forme du fichier bouge — exactement le mode d echec qu on corrige ici. Deux parades :
 * chaque extraction est verifiee NON VIDE avant d etre confrontee, et un membre d union
 * dont le litteral ne se lit pas ressort en marqueur `?Nom` au lieu de disparaitre.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHEMIN_DOMAINE = 'src/lib/domaine.ts';
const CHEMIN_REPARTITEUR = 'src/components/blocs/BlocContenu.astro';
const CHEMIN_MAPPING = 'src/lib/strapi/mapping.ts';

function source(relatif: string): string {
  return fs.readFileSync(path.join(RACINE, relatif), 'utf8');
}

// ---------------------------------------------------------------------------
// extraction (fonctions pures : elles prennent un texte, pas un fichier)
// ---------------------------------------------------------------------------

/** Les membres de `export type Bloc = A | B | … ;`. */
export function membresUnionBloc(src: string): string[] {
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
export function typesDuDomaine(src: string): string[] {
  return membresUnionBloc(src).map((nom) => {
    const corps = new RegExp(`export interface ${nom}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src);
    const litteral = corps === null ? null : /readonly type:\s*'([^']+)'/.exec(corps[1]);
    return litteral === null ? `?${nom}` : litteral[1];
  });
}

/** La table `RENDUS` du repartiteur : `'bloc.x': Composant`. */
export function tableDuRepartiteur(src: string): { type: string; composant: string }[] {
  const table = /const RENDUS = \{([\s\S]*?)\n\}/.exec(src);
  if (table === null) return [];
  return [...table[1].matchAll(/'([^']+)'\s*:\s*([A-Za-z0-9_]+)\s*,/g)].map((ligne) => ({
    type: ligne[1],
    composant: ligne[2],
  }));
}

/** Les composants `.astro` importes, par identifiant. */
export function composantsImportes(src: string): Map<string, string> {
  return new Map(
    [...src.matchAll(/^import\s+([A-Za-z0-9_]+)\s+from\s+'(\.[^']+\.astro)';/gm)].map((ligne) => [
      ligne[1],
      ligne[2],
    ]),
  );
}

/** Les `case 'bloc.…':` du `switch` de `mapping.ts`. */
export function typesDuMapping(src: string): string[] {
  return [...src.matchAll(/case '(bloc\.[^']+)':/g)].map((ligne) => ligne[1]);
}

/**
 * La DECISION de la garde : ce que le domaine declare et que la table ne rend pas, et
 * l inverse. Les deux sens comptent — un rendu orphelin est un composant mort qu une
 * suppression de type a oublie derriere elle.
 */
export function manquements(
  attendus: readonly string[],
  presents: readonly string[],
  nomAttendus: string,
  nomPresents: string,
): string[] {
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
// la garde, sur les sources reelles
// ---------------------------------------------------------------------------

const DOMAINE = typesDuDomaine(source(CHEMIN_DOMAINE));
const TABLE = tableDuRepartiteur(source(CHEMIN_REPARTITEUR));
const MAPPING = typesDuMapping(source(CHEMIN_MAPPING));

// --- non-vacuite : une extraction muette rendrait la confrontation verte a vide -------

test('l union Bloc du domaine se lit, et porte au moins les 8 blocs du §3.6', () => {
  assert.ok(
    DOMAINE.length >= 8,
    `${DOMAINE.length} type(s) extrait(s) de ${CHEMIN_DOMAINE} : la lecture de l union Bloc ` +
      'a cesse de fonctionner. Sans ce controle, la confrontation ci-dessous serait verte a vide.',
  );
  assert.ok(DOMAINE.includes('bloc.texte'), `types lus : ${DOMAINE.join(', ')}`);
  assert.deepEqual(
    DOMAINE.filter((type) => type.startsWith('?')),
    [],
    'un membre de l union Bloc n expose pas de litteral `readonly type`',
  );
});

test('la table RENDUS du repartiteur se lit, et porte au moins 8 entrees', () => {
  assert.ok(
    TABLE.length >= 8,
    `${TABLE.length} entree(s) extraite(s) de ${CHEMIN_REPARTITEUR} : la lecture de la table ` +
      'RENDUS a cesse de fonctionner (renommage, reformatage ?).',
  );
});

test('le switch de mapping.ts se lit, et porte au moins 8 cas', () => {
  assert.ok(MAPPING.length >= 8, `${MAPPING.length} cas extrait(s) de ${CHEMIN_MAPPING}`);
});

// --- la confrontation elle-meme -------------------------------------------------------

test('tout type de bloc du domaine a son rendu, et tout rendu a son type', () => {
  assert.deepEqual(
    manquements(
      DOMAINE,
      TABLE.map((entree) => entree.type),
      'l union Bloc (src/lib/domaine.ts)',
      'la table RENDUS (BlocContenu.astro)',
    ),
    [],
    'un bloc sans rendu laisse un trou muet dans la page : ecrire son composant, ' +
      'l importer, et l ajouter a RENDUS.',
  );
});

test('tout type de bloc du domaine est fabrique par le mapping, et reciproquement', () => {
  assert.deepEqual(
    manquements(DOMAINE, MAPPING, 'l union Bloc (src/lib/domaine.ts)', 'mapping.ts (switch sur __component)'),
    [],
    'un type que le mapping ne sait pas fabriquer n arrivera jamais dans une page ; ' +
      'un cas de mapping sans type du domaine rend une valeur hors contrat.',
  );
});

test('chaque rendu declare est importe, et son fichier existe sur le disque', () => {
  const importes = composantsImportes(source(CHEMIN_REPARTITEUR));
  const absents = TABLE.flatMap(({ type, composant }) => {
    const relatif = importes.get(composant);
    if (relatif === undefined) return [`« ${type} » : ${composant} n est importe nulle part`];
    const complet = path.join(RACINE, 'src/components/blocs', relatif);
    return fs.existsSync(complet) ? [] : [`« ${type} » : ${relatif} n existe pas`];
  });
  assert.deepEqual(absents, []);
});

// --- ce que la garde REFUSE, exerce sur des sources fabriquees -------------------------

const DOMAINE_FABRIQUE = `
export interface BlocTexte {
  readonly type: 'bloc.texte';
  readonly contenu: string;
}

export interface BlocSondage {
  readonly type: 'bloc.sondage';
  readonly question: string;
}

export type Bloc =
  | BlocTexte
  | BlocSondage;
`;

const REPARTITEUR_FABRIQUE = `---
import BlocTexte from './BlocTexte.astro';

const RENDUS = {
  'bloc.texte': BlocTexte,
} satisfies Record<Bloc['type'], unknown>;
---
`;

test('un neuvieme type ajoute au domaine sans son rendu est REFUSE', () => {
  const m = manquements(
    typesDuDomaine(DOMAINE_FABRIQUE),
    tableDuRepartiteur(REPARTITEUR_FABRIQUE).map((entree) => entree.type),
    'domaine',
    'RENDUS',
  );
  assert.equal(m.length, 1);
  assert.match(m[0], /bloc\.sondage/);
});

test('un rendu orphelin, dont le type a disparu du domaine, est REFUSE', () => {
  const m = manquements(['bloc.texte'], ['bloc.texte', 'bloc.mort'], 'domaine', 'RENDUS');
  assert.equal(m.length, 1);
  assert.match(m[0], /bloc\.mort/);
});

test('deux listes identiques ne remontent aucun manquement', () => {
  assert.deepEqual(manquements(['a', 'b'], ['b', 'a'], 'domaine', 'RENDUS'), []);
});

test('un membre d union dont le litteral ne se lit pas ressort en marqueur, jamais absent', () => {
  // Sans ce marqueur, un membre illisible DISPARAITRAIT des deux cotes de la
  // confrontation : elle resterait verte en ayant cesse de couvrir ce type.
  const types = typesDuDomaine('export type Bloc =\n  | BlocFantome;\n');
  assert.deepEqual(types, ['?BlocFantome']);
});

test('une union Bloc introuvable rend une liste vide, que la non-vacuite attrape', () => {
  assert.deepEqual(typesDuDomaine('export type Autre = string;'), []);
  assert.deepEqual(tableDuRepartiteur('const AUTRE = {};'), []);
});
