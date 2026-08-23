/**
 * La surcharge `partage.seo` arrive JUSQU A L ECRITURE — corpus compris.
 *
 * `seed-seo-surcharge.test.ts` prouve que le corpus la LIT. Ce fichier prouve
 * l etape d apres, la seule qui compte pour le site : qu elle figure dans le corps
 * envoye a Strapi, et que sa `imagePartage` y est un ID DE MEDIATHEQUE, pas la cle
 * du manifeste.
 *
 * Sans ce test, les deux moities pourraient rester vraies separement pendant que la
 * chaine, elle, est coupee : c est exactement l etat trouve le 2026-08-12 — le
 * composant existait au modele, le mapper savait le lire, et aucun des six corps
 * envoyes a Strapi ne le mentionnait. La valeur ne serait pas partie, et rien
 * n aurait signale qu elle ne partait pas.
 *
 * Il tourne sur le CORPUS REEL, contre un faux client : ce qu il exerce est donc ce
 * que le depot contient vraiment, pas un cas d ecole ecrit pour passer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { executerSeed, NATURES } from '../scripts/seed/seed.ts';
import type { ClientStrapi } from '../scripts/seed/client.ts';

import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';

/* Les bacs de ce fichier se referment : nettoyage dans `after()`, bac du cas fautif
   conservé avec sa raison. Cf. `outils/bac-jetable.mjs`. */
brancherLesBacs();

const DATA_REEL = path.join(import.meta.dirname, '..', 'data');

/* ------------------------------------------------------------------ */
/* Un faux Strapi qui ne fait qu une chose : retenir ce qu on lui ecrit */
/* ------------------------------------------------------------------ */

type Ecriture = { plural: string; locale: string | undefined; data: Record<string, any> };

function clientMouchard(): { client: ClientStrapi; ecritures: Ecriture[] } {
  const ecritures: Ecriture[] = [];
  let prochainIdMedia = 1;
  let prochainDocument = 1;
  const medias = new Map<string, number>();

  const client: ClientStrapi = {
    async listerTout() {
      return [];
    },
    async creer(plural, data, params) {
      ecritures.push({ plural, locale: params.locale, data });
      return { documentId: `doc-${prochainDocument++}`, ...data };
    },
    async mettreAJour(plural, documentId, data, params) {
      ecritures.push({ plural, locale: params.locale, data });
      return { documentId, ...data };
    },
    async lireSingle() {
      return null;
    },
    async majSingle(singular, data, params) {
      ecritures.push({ plural: singular, locale: params.locale, data });
      return data;
    },
    async listerMedias() {
      return [];
    },
    async televerser(fichier) {
      const id = medias.get(fichier.nom) ?? prochainIdMedia++;
      medias.set(fichier.nom, id);
      return { id, name: fichier.nom };
    },
    async majInfosMedia(id) {
      return { id };
    },
  };

  return { client, ecritures };
}

async function ecrituresDuCorpusReel(): Promise<Ecriture[]> {
  const corpus = chargerCorpus(DATA_REEL);
  const { client, ecritures } = clientMouchard();
  await executerSeed(client, corpus);
  return ecritures;
}

/** Les ecritures d une collection qui portent une surcharge seo non vide. */
function avecSeo(ecritures: Ecriture[], plural: string): Ecriture[] {
  return ecritures.filter(
    (e) =>
      e.plural === plural &&
      e.data.seo !== undefined &&
      e.data.seo !== null &&
      Object.values(e.data.seo).some((v) => v !== undefined && v !== null)
  );
}

/* ------------------------------------------------------------------ */

test('le corps envoye a Strapi porte la surcharge seo, sur les trois familles', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  for (const plural of ['articles', 'categories', 'dossiers']) {
    assert.ok(
      avecSeo(ecritures, plural).length > 0,
      `aucune ecriture de ${plural} ne transporte de surcharge seo`
    );
  }
});

/**
 * `imagePartage` est le SEUL champ que le corpus reel n exerce pas, et ce n est pas
 * un oubli : deux gardes independantes du §6.7 l interdisent aujourd hui.
 *
 *   - la repartition du §6.4 fixe le nombre de medias du corpus (102 atteignables) ;
 *     en ajouter un pour la demonstration ferait rougir `repartition-6-4.test.ts`,
 *     qui refuse tout ecart au plan editorial sans arbitrage ecrit ;
 *   - reutiliser `identite/partage-defaut.png` ferait rougir la garde « aucun media
 *     n est employe deux fois dans deux familles differentes » — il sert deja de
 *     repli de configuration.
 *
 * Surcharger ce champ sur des donnees reelles suppose donc de trancher la volumetrie
 * media, ce qui est une decision editoriale et non un geste technique. En attendant,
 * le CHEMIN est exerce ici, sur un corpus fabrique : ce qui doit etre prouve, c est
 * que la cle de manifeste devient un ID de mediatheque — envoyee telle quelle, elle
 * est refusee par Strapi, ou pire, ignoree.
 */
test('imagePartage part en ID de mediatheque, jamais en cle de manifeste', async () => {
  const racine = bacJetable('echo-seo-image');
  const source = DATA_REEL;

  /* Le corpus reel, recopie, puis UNE surcharge posee dessus : on exerce le chemin
     sans toucher au corpus versionne ni a sa volumetrie. */
  fs.cpSync(source, racine, { recursive: true });
  const fichier = path.join(racine, 'articles', 'A01.fr.md');
  const brut = fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
  const enTete = JSON.parse(brut.match(/^---\n([\s\S]*?)\n---/)![1]);
  enTete.seo = { ...enTete.seo, imagePartage: 'identite/partage-defaut.png' };
  fs.writeFileSync(
    fichier,
    brut.replace(/^---\n[\s\S]*?\n---/, `---\n${JSON.stringify(enTete, null, 2)}\n---`)
  );

  const { client, ecritures } = clientMouchard();
  await executerSeed(client, chargerCorpus(racine));

  const portantUneImage = ecritures.filter((e) => e.data.seo?.imagePartage !== undefined);
  assert.ok(portantUneImage.length > 0, 'la surcharge posee n a pas ete transmise');

  for (const e of portantUneImage) {
    assert.equal(
      typeof e.data.seo.imagePartage,
      'number',
      `${e.plural} : imagePartage vaut « ${e.data.seo.imagePartage} » — une cle de manifeste ` +
        'envoyee telle quelle est refusee par Strapi, ou pire, ignoree'
    );
  }
});

test('une entree SANS surcharge n envoie aucun composant seo (A-07)', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  const articles = ecritures.filter((e) => e.plural === 'articles');
  const sansSurcharge = articles.filter(
    (e) => e.data.seo === undefined || Object.values(e.data.seo ?? {}).every((v) => v === undefined)
  );
  assert.ok(
    sansSurcharge.length > 0,
    'tous les articles portent une surcharge — le repli calcule n est plus exerce nulle part'
  );
});

test('la surcharge suit la LOCALE : la version EN ne recoit pas le texte FR', async () => {
  const ecritures = await ecrituresDuCorpusReel();
  const corpus = chargerCorpus(DATA_REEL);

  const articleFrSurcharge = corpus.articles.find((a) => a.fr.seo?.metaTitre !== undefined);
  assert.ok(articleFrSurcharge, 'aucun article FR surcharge — le test ne prouve rien');

  const metaFr = articleFrSurcharge.fr.seo!.metaTitre;
  const ecrituresEn = ecritures.filter((e) => e.plural === 'articles' && e.locale === 'en');

  for (const e of ecrituresEn) {
    assert.notEqual(
      e.data.seo?.metaTitre,
      metaFr,
      'une ecriture EN porte le metaTitre FR — la surcharge a fuit d une locale a l autre'
    );
  }
});

test('le noindex vrai du corpus arrive TEL QUEL — ni perdu, ni transforme', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  const noindexVrais = ecritures.filter((e) => e.data.seo?.noindex === true);
  assert.ok(
    noindexVrais.length > 0,
    'aucune ecriture ne porte noindex:true — le champ dont l echec coute le plus cher n est ' +
      'exerce nulle part sur le corpus reel'
  );
});

/* ------------------------------------------------------------------ */
/* L ALTERNATIVE DE LA CARTE DE PARTAGE — ajoute le 2026-08-17          */
/* ------------------------------------------------------------------ */

/**
 * LE DEFAUT QUE CES DEUX TESTS FERMENT, ET POURQUOI AUCUN AUTRE NE POUVAIT LE VOIR.
 *
 * Le 2026-08-17 a 09h54 UTC, la preuve de surcharge SEO jouee sur le site SERVI a rendu
 * son premier rouge : `https://echo.ayfiweb.fr/en/article/trois-vents-pass-the-last-lock-on-the-wind-farm/`
 * servait un `og:image:alt` EN FRANCAIS, mot pour mot l `alternativeText` du media
 * `partage/A01-col-des-trois-vents.png` — un seul fichier pour les deux locales, en
 * francais par construction (A-04 amende). Le corpus versionne, lui, porte bien la
 * surcharge anglaise depuis `apps/cms/data/articles/A01.en.md`.
 *
 * Le maillon coupe etait `corpsSeo` (`scripts/seed/seed.ts`) : il enumere les champs du
 * composant UN PAR UN et n a jamais enumere `alternativePartage`. La valeur etait lue,
 * validee, refusee si mal formee — puis jetee silencieusement avant l ecriture.
 *
 * Aucun test ne pouvait le voir, et ce n est pas un hasard :
 *   - `seed-seo-surcharge` s arrete a `chargerCorpus` : il prouve que la valeur est LUE ;
 *   - `seed-seo-transmission` (ci-dessus) enumerait les champs a la main, et l enumeration
 *     manuelle a exactement le meme trou que celle qu elle juge ;
 *   - `seed-natures-exhaustives` ecoute ce que le seed ECRIT : un champ jamais ecrit n y
 *     apparait pas, donc rien ne manque. Sa seconde moitie confronte bien les SCHEMAS aux
 *     natures, mais pour les seuls `src/components/bloc/*.json` — `partage/seo.json` en
 *     sort par construction.
 *
 * D ou les deux tests : le premier tient LE FAIT (l anglais part), le second tient LA
 * CLASSE (aucun attribut du composant ne peut plus etre oublie par une enumeration).
 */
test('la surcharge `alternativePartage` du corpus ARRIVE dans le corps envoye a Strapi', async () => {
  const corpus = chargerCorpus(DATA_REEL);
  const ecritures = await ecrituresDuCorpusReel();

  /* Ce que la redaction a ecrit, relu a la SOURCE et jamais recopie ici : recopier la
     phrase anglaise ferait passer ce test le jour ou elle changerait dans le corpus. */
  const attendus: { quoi: string; slug: string; texte: string }[] = [];
  for (const a of corpus.articles) {
    for (const locale of ['fr', 'en'] as const) {
      const l = (a as any)[locale];
      const texte = l?.seo?.alternativePartage;
      if (typeof texte === 'string') {
        attendus.push({ quoi: `article ${a.code}:${locale}`, slug: l.slug, texte });
      }
    }
  }

  assert.ok(
    attendus.length > 0,
    'aucune entree du corpus reel ne surcharge `alternativePartage` — ce test ne prouverait ' +
      'plus rien, et le chemin redeviendrait invisible'
  );

  for (const attendu of attendus) {
    const ecriture = ecritures.find((e) => e.plural === 'articles' && e.data.slug === attendu.slug);
    assert.ok(ecriture, `${attendu.quoi} : aucune ecriture pour le slug « ${attendu.slug} »`);
    assert.equal(
      ecriture!.data.seo?.alternativePartage,
      attendu.texte,
      `${attendu.quoi} : le corps envoye a Strapi porte ` +
        `${JSON.stringify(ecriture!.data.seo?.alternativePartage)} au lieu de la surcharge du ` +
        'corpus. Sans elle, `og:image:alt` retombe sur l `alternativeText` de la mediatheque — ' +
        'UNE valeur par fichier, en francais, servie telle quelle sur la page ANGLAISE.'
    );
  }
});

/**
 * LA CLASSE, et non le cas : `corpsSeo` et `NATURE_SEO` enumerent tous deux les champs du
 * composant a la main. Une enumeration manuelle ne se relit pas ; elle se confronte au
 * SCHEMA, qui est la seule source de ce que le composant porte.
 *
 * Il ne regarde pas le corpus reel — c est delibere : le corpus n exerce aujourd hui que
 * deux des six champs, et un test qui depend de la donnee redeviendrait muet a chaque
 * champ neuf, c est-a-dire exactement au moment ou il servirait.
 */
test('CHAQUE attribut de `partage.seo` est TRANSMIS par le seed et a une nature declaree', async () => {
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, '..', 'src', 'components', 'partage', 'seo.json'),
      'utf8'
    )
  );
  const attributs = Object.keys(schema.attributes ?? {});
  assert.ok(attributs.length > 0, 'le schema du composant est illisible — incapacite, pas succes');

  /* (a) La nature : sans elle, `comparerCorps` traite le champ en nature inconnue et
     REECRIT les 69 entrees a chaque passe, donc un deploiement par publication. */
  const natures = ((NATURES.article as any).seo?.repete ?? {}) as Record<string, unknown>;
  assert.deepEqual(
    attributs.filter((a) => natures[a] === undefined).sort(),
    [],
    'ces attributs existent au schema de `partage.seo` et n ont aucune nature dans NATURE_SEO'
  );

  /* (b) La transmission : un corpus fabrique qui porte TOUS les champs, et le corps
     envoye doit tous les porter en retour. */
  const racine = bacJetable('echo-seo-exhaustif');
  fs.cpSync(DATA_REEL, racine, { recursive: true });
  const fichier = path.join(racine, 'articles', 'A01.fr.md');
  const brut = fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
  const enTete = JSON.parse(brut.match(/^---\n([\s\S]*?)\n---/)![1]);
  enTete.seo = {
    metaTitre: 'Titre de surcharge, pose pour ce test',
    metaDescription: 'Description de surcharge, posee pour ce test.',
    imagePartage: 'identite/partage-defaut.png',
    alternativePartage: 'Alternative de surcharge, posee pour ce test',
    noindex: true,
    canonique: 'https://exemple.test/canonique-de-test',
  };
  assert.deepEqual(
    Object.keys(enTete.seo).sort(),
    [...attributs].sort(),
    'le cas fabrique ci-dessus ne couvre plus tous les attributs du schema — complete-le, ' +
      'sinon ce test rendrait vert sur le champ qu il ne pose pas'
  );
  fs.writeFileSync(
    fichier,
    brut.replace(/^---\n[\s\S]*?\n---/, `---\n${JSON.stringify(enTete, null, 2)}\n---`)
  );

  const { client, ecritures } = clientMouchard();
  await executerSeed(client, chargerCorpus(racine));

  const ecriture = ecritures.find((e) => e.plural === 'articles' && e.data.slug === enTete.slug);
  assert.ok(ecriture, 'aucune ecriture pour l article surcharge');
  const seoEnvoye = (ecriture!.data.seo ?? {}) as Record<string, unknown>;

  assert.deepEqual(
    attributs.filter((a) => seoEnvoye[a] === undefined).sort(),
    [],
    'ces attributs du composant sont poses au corpus et n arrivent PAS a Strapi : `corpsSeo` ' +
      'les enumere un par un et en a oublie. Une valeur lue, validee, puis jetee avant ' +
      'l ecriture ne laisse aucune trace — succes et echec rendent la meme sortie.'
  );
});
