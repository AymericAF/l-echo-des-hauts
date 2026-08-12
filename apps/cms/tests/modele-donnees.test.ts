/**
 * Confronte les fichiers de schema Strapi a `docs/modele-donnees.md`, champ par champ.
 *
 * Ce test n'inspecte PAS une instance : il inspecte les fichiers versionnes, seuls
 * porteurs de la modelisation (les permissions, elles, vivent en base — §6 du cahier).
 * Il echoue si un champ manque, s'il y en a un de trop, si un type, une contrainte,
 * un defaut, une cible de relation ou un reglage i18n s'ecarte du document.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTENT_TYPES,
  COMPONENTS,
  BLOCS_CONTENU,
  INVENTAIRE,
  type ChampSpec,
} from './spec-modele-donnees.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const API = path.join(RACINE, 'src', 'api');
const COMPOSANTS = path.join(RACINE, 'src', 'components');

const lireJson = (p: string): any => JSON.parse(fs.readFileSync(p, 'utf8'));

const cheminSchema = (nom: string) =>
  path.join(API, nom, 'content-types', nom, 'schema.json');

const cheminComponent = (uid: string) => {
  const [cat, nom] = uid.split('.');
  return path.join(COMPOSANTS, cat, `${nom}.json`);
};

/** Compare un attribut de schema a sa specification, cle par cle. */
function verifierChamp(ctx: string, attendu: ChampSpec, reel: any) {
  assert.ok(reel, `${ctx} : champ absent du schema`);
  assert.equal(reel.type, attendu.type, `${ctx} : type`);

  const scalaires: (keyof ChampSpec)[] = [
    'maxLength',
    'minLength',
    'min',
    'targetField',
    'regex',
    'relation',
    'target',
    'inversedBy',
    'mappedBy',
    'component',
    'multiple',
    'repeatable',
  ];
  for (const cle of scalaires) {
    if (attendu[cle] !== undefined) {
      assert.equal(reel[cle], attendu[cle], `${ctx} : ${String(cle)}`);
    }
  }

  // `required` absent de la spec = champ optionnel : le schema ne doit pas l'imposer.
  if (attendu.required === true) {
    assert.equal(reel.required, true, `${ctx} : doit etre requis`);
  } else {
    assert.notEqual(reel.required, true, `${ctx} : doit rester optionnel`);
  }

  if (attendu.default !== undefined) {
    assert.equal(reel.default, attendu.default, `${ctx} : valeur par defaut`);
  }
  if (attendu.enum) {
    assert.deepEqual(reel.enum, attendu.enum, `${ctx} : valeurs de l'enum`);
  }
  if (attendu.allowedTypes) {
    assert.deepEqual(reel.allowedTypes, attendu.allowedTypes, `${ctx} : allowedTypes`);
  }
  if (attendu.components) {
    assert.deepEqual(
      [...reel.components].sort(),
      [...attendu.components].sort(),
      `${ctx} : composants autorises`
    );
  }

  // Une relation ne doit jamais porter une face inverse que le document ne prevoit pas
  // (A-11 : `categorie`, `tags` et `articlesLies` sont a sens unique).
  if (attendu.type === 'relation') {
    if (attendu.inversedBy === undefined) {
      assert.equal(reel.inversedBy, undefined, `${ctx} : inversedBy inattendu (sens unique)`);
    }
    if (attendu.mappedBy === undefined) {
      assert.equal(reel.mappedBy, undefined, `${ctx} : mappedBy inattendu (sens unique)`);
    }
  }
}

/** Verifie le reglage i18n au champ (A-06), et la regle Strapi 5 sur relations et uid. */
function verifierLocalisation(ctx: string, attendu: ChampSpec, reel: any) {
  const declare = reel?.pluginOptions?.i18n?.localized;
  if (attendu.loc === 'force') {
    assert.equal(
      declare,
      undefined,
      `${ctx} : relation ou uid — Strapi 5 impose la localisation, ` +
        `le schema ne doit rien declarer (voir divergence A-06)`
    );
  } else if (attendu.loc !== undefined) {
    assert.equal(declare, attendu.loc, `${ctx} : localisation i18n`);
  }
}

test('inventaire §1 : 17 schemas, 75 champs declares', () => {
  const nbCollections = Object.values(CONTENT_TYPES).filter(
    (t) => t.kind === 'collectionType'
  ).length;
  const nbSingles = Object.values(CONTENT_TYPES).filter((t) => t.kind === 'singleType').length;

  assert.equal(nbCollections, INVENTAIRE.collectionTypes);
  assert.equal(nbSingles, INVENTAIRE.singleTypes);
  assert.equal(Object.keys(COMPONENTS).length, INVENTAIRE.blocsDynamicZone + INVENTAIRE.componentImbrique + INVENTAIRE.componentsPartages);
  assert.equal(
    Object.keys(CONTENT_TYPES).length + Object.keys(COMPONENTS).length,
    INVENTAIRE.schemas
  );

  const total =
    Object.values(CONTENT_TYPES).reduce((n, t) => n + Object.keys(t.attributes).length, 0) +
    Object.values(COMPONENTS).reduce((n, c) => n + Object.keys(c.attributes).length, 0);
  assert.equal(total, INVENTAIRE.champs, 'total des champs declares');
});

for (const [nom, spec] of Object.entries(CONTENT_TYPES)) {
  test(`content type ${nom} : schema conforme au cahier`, () => {
    const p = cheminSchema(nom);
    assert.ok(fs.existsSync(p), `schema absent : ${p}`);
    const s = lireJson(p);

    assert.equal(s.kind, spec.kind, `${nom} : kind`);
    assert.equal(s.info.singularName, spec.singularName, `${nom} : singularName`);
    assert.equal(s.info.pluralName, spec.pluralName, `${nom} : pluralName`);
    assert.equal(s.info.displayName, spec.displayName, `${nom} : displayName`);

    // Draft & Publish (A-02, A-34) : ecrit explicitement, jamais laisse au defaut.
    assert.equal(
      s.options?.draftAndPublish,
      spec.draftAndPublish,
      `${nom} : draftAndPublish`
    );
    // i18n au niveau du type (A-06).
    assert.equal(
      s.pluginOptions?.i18n?.localized,
      spec.i18n,
      `${nom} : i18n au niveau du content type`
    );

    const attendus = Object.keys(spec.attributes).sort();
    const reels = Object.keys(s.attributes).sort();
    assert.deepEqual(reels, attendus, `${nom} : liste des champs`);

    for (const [champ, cs] of Object.entries(spec.attributes)) {
      const ctx = `${nom}.${champ}`;
      verifierChamp(ctx, cs, s.attributes[champ]);
      verifierLocalisation(ctx, cs, s.attributes[champ]);
    }
  });

  test(`content type ${nom} : route, controleur et service exposes`, () => {
    for (const dossier of ['routes', 'controllers', 'services']) {
      const p = path.join(API, nom, dossier, `${nom}.ts`);
      assert.ok(fs.existsSync(p), `manquant : ${p}`);
    }
  });
}

for (const [uid, spec] of Object.entries(COMPONENTS)) {
  test(`component ${uid} : schema conforme au cahier`, () => {
    const p = cheminComponent(uid);
    assert.ok(fs.existsSync(p), `component absent : ${p}`);
    const s = lireJson(p);

    assert.equal(s.info.displayName, spec.displayName, `${uid} : displayName`);
    assert.ok(
      typeof s.collectionName === 'string' && s.collectionName.startsWith('components_'),
      `${uid} : collectionName`
    );

    const attendus = Object.keys(spec.attributes).sort();
    const reels = Object.keys(s.attributes).sort();
    assert.deepEqual(reels, attendus, `${uid} : liste des champs`);

    for (const [champ, cs] of Object.entries(spec.attributes)) {
      verifierChamp(`${uid}.${champ}`, cs, s.attributes[champ]);
    }
  });
}

test('Dynamic Zone `contenu` : exactement les 8 blocs du §3.6', () => {
  const s = lireJson(cheminSchema('article'));
  const dz = s.attributes.contenu;
  assert.equal(dz.type, 'dynamiczone');
  assert.deepEqual([...dz.components].sort(), [...BLOCS_CONTENU].sort());
  assert.equal(dz.components.length, 8, 'ni plus ni moins de 8 blocs (§8.3)');
});

test('A-24 : `bloc.chiffre-entree` est imbrique et n imbrique rien lui-meme', () => {
  const s = lireJson(cheminComponent('bloc.chiffre-entree'));
  for (const [champ, attr] of Object.entries<any>(s.attributes)) {
    assert.notEqual(
      attr.type,
      'component',
      `bloc.chiffre-entree.${champ} : Strapi limite l imbrication a un niveau`
    );
  }
});

test('A-07 : aucun champ de `partage.seo` n est requis ni pre-rempli', () => {
  const s = lireJson(cheminComponent('partage.seo'));
  for (const [champ, attr] of Object.entries<any>(s.attributes)) {
    assert.notEqual(attr.required, true, `partage.seo.${champ} ne doit pas etre requis`);
    if (champ !== 'noindex') {
      assert.equal(
        attr.default,
        undefined,
        `partage.seo.${champ} : le defaut se calcule au build, jamais en base`
      );
    }
  }
});

test('A-02 : Draft & Publish n est actif que sur `Article`', () => {
  for (const nom of Object.keys(CONTENT_TYPES)) {
    const s = lireJson(cheminSchema(nom));
    assert.equal(
      s.options.draftAndPublish,
      nom === 'article',
      `${nom} : Draft & Publish`
    );
  }
});

test('A-06 : i18n actif sur les 5 collections ET le single type', () => {
  for (const nom of Object.keys(CONTENT_TYPES)) {
    const s = lireJson(cheminSchema(nom));
    assert.equal(s.pluginOptions.i18n.localized, true, `${nom} : i18n`);
  }
});

test('Annexe B : aucun champ calcule au build n est stocke', () => {
  // §4.5 : sommaire, temps de lecture, images OG et articles lies de secours
  // se calculent au build. Aucun champ ne doit les porter.
  const interdits = [
    'sommaire',
    'tempsLecture',
    'tempsDeLecture',
    'ogImage',
    'imageOg',
    'articlesLiesSecours',
    'alt',
    'alternativeText', // A-04 : vient de la Media Library, jamais du modele
  ];
  for (const nom of Object.keys(CONTENT_TYPES)) {
    const s = lireJson(cheminSchema(nom));
    for (const champ of Object.keys(s.attributes)) {
      assert.ok(!interdits.includes(champ), `${nom}.${champ} : champ interdit (calcule au build)`);
    }
  }
  for (const uid of Object.keys(COMPONENTS)) {
    const s = lireJson(cheminComponent(uid));
    for (const champ of Object.keys(s.attributes)) {
      assert.ok(!interdits.includes(champ), `${uid}.${champ} : champ interdit (calcule au build)`);
    }
  }
});

/**
 * La `description` d un component est la SEULE phrase que l administrateur lit dans le
 * Content-Type Builder : elle n a aucun lecteur en aval qui la corrigerait. Celle de
 * `bloc.encadre` a porte jusqu au 2026-08-11 « Ses titres sont rendus en h4 minimum et
 * exclus du sommaire (A-21) » — generique, donc lue comme couvrant le CHAMP `titre`, alors
 * que `BlocEncadre.astro` ne rend AUCUN `h1`-`h6` pour ce champ. Ce test garde la
 * distinction plutot que la formulation : il n impose aucune redaction, il exige que les
 * deux objets soient nommes separement et que la generalite ne revienne pas.
 */
test('bloc.encadre : la description distingue les titres de `contenu` du CHAMP `titre`', () => {
  const d: string = lireJson(cheminComponent('bloc.encadre')).info.description ?? '';

  assert.ok(
    /contenu/.test(d),
    'la description doit dire a QUOI le plafond h4 s applique : les titres saisis dans `contenu`'
  );
  assert.ok(
    /titre/.test(d) && /pas un titre HTML|n est pas un titre/i.test(d),
    'la description doit dire que le CHAMP `titre` n est pas un titre HTML'
  );
  assert.ok(
    !/ses titres sont rendus/i.test(d),
    'formulation generique interdite : elle se lit comme couvrant le champ `titre`, et c est faux'
  );
  assert.ok(
    /A-21/.test(d),
    'la description POINTE l arbitrage plutot que de le recopier'
  );
});

test('A-39 : aucun champ de pierre tombale (URL morte, 410) dans le modele', () => {
  const s = lireJson(cheminSchema('article'));
  for (const champ of Object.keys(s.attributes)) {
    assert.ok(
      !/gone|tombstone|ancienSlug|redirection/i.test(champ),
      `article.${champ} : A-39 n ajoute aucun champ de pierre tombale`
    );
  }
});
