/**
 * Garde de COMPLETUDE du repartiteur de blocs (§3.6, §4.4).
 *
 * Ce que cette garde protege : ajouter un neuvieme type de bloc au domaine sans ecrire
 * son composant. Le repartiteur rendrait alors `undefined` — ou, ici, leverait au build
 * sur le premier article portant ce bloc. Dans les deux cas, le defaut se decouvre en
 * production, sur un article, et pas a la ligne ou il a ete introduit.
 *
 * POURQUOI PAS SEULEMENT LE `satisfies` de `BlocContenu.astro`. Parce que ce `satisfies`
 * NE TOURNE NULLE PART. Astro STRIP les types du frontmatter, il ne les verifie pas ;
 * `astro check` n est pas installe (et ne le sera pas : il tire `@astrojs/check` +
 * `typescript` dans un depot public dont le README est un argumentaire). Mesure du
 * 2026-08-07, sur un domaine volontairement casse par un neuvieme type sans rendu :
 * `npm test` rendait 229/229 verts, et `astro build` allait au bout, garde T-09 comprise.
 * Le `satisfies` n etait donc vu que par l editeur d un humain qui aurait ouvert le
 * fichier — c est un commentaire, pas une garde.
 *
 * ⚠️ CE QUI A CHANGE LE 2026-08-12 (tache da2975e2), ET POURQUOI CE FICHIER NE PORTE PLUS
 * LA GARDE. Jusque-la, la garde vivait TOUT ENTIERE ici : ses extracteurs, sa
 * confrontation, sa decision. Elle ne tournait donc que dans `npm test` — et `npm test` ne
 * tourne NULLE PART sur le chemin de la production. Releve du 2026-08-12, dans la base de
 * Coolify (`applications`, `echo-site`) puis dans le journal du deploiement #371 : plan
 * Nixpacks `install -> npm ci`, `build -> npm run build`, `start` vide. Rien d autre. Un
 * `--no-verify`, un deploiement manuel, un push dont l integration continue n a pas fini
 * de tourner, et le neuvieme bloc partait en production.
 *
 * La decision a donc DEMENAGE dans `scripts/repartiteur-blocs.mjs`, et elle est branchee
 * dans `astro.config.mjs` par `integrations/garde-repartiteur.mjs` — hook
 * `astro:config:done`, le plus tot du build. Ce fichier-ci reste ce qu il aurait toujours
 * du etre : le banc d essai de cette decision, plus les assertions qui verifient qu elle
 * est bien BRANCHEE la ou le mal se produit.
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
 * une extraction muette est une INCAPACITE et non un manquement, et un membre d union
 * dont le litteral ne se lit pas ressort en marqueur `?Nom` au lieu de disparaitre.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import gardeRepartiteur, { ROLE_SORTIE } from '../integrations/garde-repartiteur.mjs';
import { ISSUES } from '../scripts/issues.mjs';
import {
  CHEMINS,
  composantsImportes,
  inspecterRepartiteur,
  manquements,
  tableDuRepartiteur,
  typesDuDomaine,
  typesDuMapping,
} from '../scripts/repartiteur-blocs.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relatif: string): string {
  return fs.readFileSync(path.join(RACINE, relatif), 'utf8');
}

// ---------------------------------------------------------------------------
// la garde, sur les sources reelles
// ---------------------------------------------------------------------------

const DOMAINE = typesDuDomaine(source(CHEMINS.domaine));
const TABLE = tableDuRepartiteur(source(CHEMINS.repartiteur));
const MAPPING = typesDuMapping(source(CHEMINS.mapping));

// --- non-vacuite : une extraction muette rendrait la confrontation verte a vide -------

test('l union Bloc du domaine se lit, et porte au moins les 8 blocs du §3.6', () => {
  assert.ok(
    DOMAINE.length >= 8,
    `${DOMAINE.length} type(s) extrait(s) de ${CHEMINS.domaine} : la lecture de l union Bloc ` +
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
    `${TABLE.length} entree(s) extraite(s) de ${CHEMINS.repartiteur} : la lecture de la table ` +
      'RENDUS a cesse de fonctionner (renommage, reformatage ?).',
  );
});

test('le switch de mapping.ts se lit, et porte au moins 8 cas', () => {
  assert.ok(MAPPING.length >= 8, `${MAPPING.length} cas extrait(s) de ${CHEMINS.mapping}`);
});

// --- la confrontation elle-meme -------------------------------------------------------

test('les sources reelles ne portent AUCUN ecart, et la garde a bien juge', () => {
  const rapport = inspecterRepartiteur();
  assert.equal(
    rapport.issue,
    ISSUES.CONFORME,
    `la garde du repartiteur n est pas verte :\n  - ${rapport.manquements.join('\n  - ')}`,
  );
  /* Un `issue === 0` sur zero type lu serait le vert sur rien : on constate qu elle a
     REELLEMENT confronte quelque chose. */
  assert.ok(rapport.types.length >= 8, `${rapport.types.length} type(s) confronte(s)`);
});

test('tout type de bloc du domaine a son rendu, et tout rendu a son type', () => {
  assert.deepEqual(
    manquements(
      DOMAINE,
      TABLE.map((entree: { type: string }) => entree.type),
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
  const importes = composantsImportes(source(CHEMINS.repartiteur));
  const absents = TABLE.flatMap(({ type, composant }: { type: string; composant: string }) => {
    const relatif = importes.get(composant);
    if (relatif === undefined) return [`« ${type} » : ${composant} n est importe nulle part`];
    const complet = path.join(RACINE, 'src/components/blocs', relatif);
    return fs.existsSync(complet) ? [] : [`« ${type} » : ${relatif} n existe pas`];
  });
  assert.deepEqual(absents, []);
});

// ---------------------------------------------------------------------------
// LA GARDE TOURNE-T-ELLE LA OU LE MAL SE PRODUIT ? (tache da2975e2)
// ---------------------------------------------------------------------------

test('la garde est BRANCHEE dans le build, pas seulement dans npm test', async () => {
  /* LE CŒUR DE LA TACHE. `npm test` ne tourne nulle part sur le chemin de la production :
     le plan Nixpacks de `echo-site` est `npm ci` puis `npm run build`, releve au journal
     du deploiement #371 le 2026-08-12. Une garde qui ne vit que dans un test ne garde
     donc rien de ce qui part en ligne.

     `astro-config.test.ts` tient deja l invariant general (« toute integration livree est
     branchee ») ; ce test-ci NOMME le cas, pour que le rouge dise de quoi il s agit. */
  const configuration = (await import('../astro.config.mjs')).default as {
    integrations: { name?: string }[];
  };
  const noms = configuration.integrations.map((i) => i.name);
  assert.ok(
    noms.includes('garde-repartiteur'),
    'garde-repartiteur n est plus branchee dans astro.config.mjs : la completude du ' +
      'repartiteur ne serait plus verifiee par le build que Coolify lance, seulement par ' +
      `npm test. Integrations branchees : ${noms.join(', ')}`,
  );
});

test('la garde ne lit QUE des fichiers de apps/web/src — sinon elle casse la production', () => {
  /* CONTRAINTE DE PRODUCTION, pas une preference de rangement. Le contexte de construction
     de Coolify est `/apps/web` (`nixpacks build … /artifacts/<id>/apps/web`, journal #371),
     et les Watch Paths ne couvrent que `apps/web/**`. Un chemin hors de ce repertoire
     serait introuvable DANS L IMAGE : la garde rendrait INCAPACITE et ferait echouer le
     deploiement pour une cause qui n existe que chez elle — un rouge que personne ne peut
     reproduire, donc une garde qu on desactive. */
  for (const [role, relatif] of Object.entries(CHEMINS)) {
    assert.ok(
      (relatif as string).startsWith('src/'),
      `CHEMINS.${role} = « ${relatif} » sort de src/ : introuvable dans l image de construction`,
    );
    assert.ok(fs.existsSync(path.join(RACINE, relatif as string)), `${relatif} n existe pas`);
  }
});

test('l integration declare un role d ordre connu, et n en impose aucun', () => {
  assert.equal(ROLE_SORTIE, 'sans-contrainte-d-ordre');
  const hooks = Object.keys(gardeRepartiteur().hooks);
  assert.deepEqual(
    hooks,
    ['astro:config:done'],
    'la garde ne lit aucune sortie : elle doit refuser au plus tot, avant qu une page ne ' +
      'soit rendue, et pas a `astro:build:done` quand le build est deja paye',
  );
});

// ---------------------------------------------------------------------------
// ce que la garde REFUSE, exerce sur une arborescence FABRIQUEE
// ---------------------------------------------------------------------------

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

const MAPPING_FABRIQUE = `
switch (bloc.__component) {
  case 'bloc.texte':
    return { type: 'bloc.texte' };
}
`;

/** Une application jetable, avec les trois sources aux chemins reels. */
function applicationFabriquee(sources: { domaine: string; repartiteur: string; mapping: string }): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'repartiteur-'));
  for (const [role, relatif] of Object.entries(CHEMINS)) {
    const complet = path.join(racine, relatif as string);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, sources[role as keyof typeof sources], 'utf8');
  }
  fs.writeFileSync(path.join(racine, 'src/components/blocs/BlocTexte.astro'), '<div class="bloc-texte"></div>');
  return racine;
}

test('un neuvieme type ajoute au domaine sans son rendu est REFUSE, et NOMME', () => {
  const racine = applicationFabriquee({
    domaine: DOMAINE_FABRIQUE,
    repartiteur: REPARTITEUR_FABRIQUE,
    mapping: MAPPING_FABRIQUE,
  });
  const rapport = inspecterRepartiteur(racine);
  assert.equal(rapport.issue, ISSUES.ANOMALIE, 'un bloc sans rendu doit etre une ANOMALIE du site');
  assert.match(rapport.manquements.join('\n'), /bloc\.sondage/);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('une source ILLISIBLE est une INCAPACITE, jamais un manquement du site', () => {
  /* La distinction qui evite d envoyer chercher un bloc manquant quand c est la FORME
     d un fichier qui a bouge. Dans un build de production, le message d anomalie ferait
     chercher un composant absent qui n existe pas. */
  const racine = applicationFabriquee({
    domaine: 'export type Autre = string;',
    repartiteur: REPARTITEUR_FABRIQUE,
    mapping: MAPPING_FABRIQUE,
  });
  const rapport = inspecterRepartiteur(racine);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join('\n'), /union .* ne se lit plus/);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('une table RENDUS illisible est une INCAPACITE — pas huit blocs manquants', () => {
  const racine = applicationFabriquee({
    domaine: DOMAINE_FABRIQUE,
    repartiteur: 'const AUTRE = {};',
    mapping: MAPPING_FABRIQUE,
  });
  const rapport = inspecterRepartiteur(racine);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join('\n'), /RENDUS/);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('une source ABSENTE est une INCAPACITE qui nomme le fichier', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'repartiteur-vide-'));
  const rapport = inspecterRepartiteur(racine);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements.join('\n'), /domaine\.ts n existe pas/);
  fs.rmSync(racine, { recursive: true, force: true });
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
