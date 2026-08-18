/**
 * UN CHAMP RETIRE DU CORPUS DOIT ETRE VIDE EN BASE — sinon il y survit, invisible.
 *
 * LE DEFAUT, MESURE EN PRODUCTION LE 2026-08-14 (tache `f011a634`). Les 22 surcharges
 * `alternativeCouverture` / `alternativeHero` avaient ete RETIREES du corpus : les visuels
 * ayant desormais un fichier par locale, chacun porte sa propre alternative au manifeste,
 * et une surcharge en plus ferait deux porteurs du meme texte. Le seed a tourne, il a dit
 * « termine », et le site a continue de servir LES ANCIENNES SURCHARGES — dont celle de
 * `A23`, qui annoncait « The time "17 h 40" … the image carries its wording in French »
 * sur une image qui affiche desormais « 5.40 p.m. » en anglais. L alternative etait donc
 * devenue FAUSSE, et rien ne le disait.
 *
 * LA CAUSE, et elle est generale — elle ne concerne pas que ces 22 champs. `corpsDe` rend
 * `undefined` pour un champ absent du corpus ; `JSON.stringify` supprime les cles
 * `undefined` ; et un `PUT` Strapi ne touche QUE ce qu on lui donne. Retirer une valeur du
 * corpus ne la retire donc pas de la base : elle y reste, et le seed la declare
 * « inchangee » parce qu il ne la compare a rien.
 *
 * LA REGLE : le corpus versionne fait autorite. Un champ scalaire qu il ne declare PAS est
 * envoye a `null`, explicitement. Ce que ca coute, ecrit plutot que tu : une valeur saisie
 * a la main dans le back-office sur l un de ces champs sera ECRASEE au seed suivant. C est
 * deja vrai de tous les champs que le corpus declare ; ce test etend la meme regle a ceux
 * qu il a cesse de declarer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { executerSeed } from '../scripts/seed/seed.ts';
import type { ClientStrapi } from '../scripts/seed/client.ts';

const DATA_REEL = path.join(import.meta.dirname, '..', 'data');

type Ecriture = { plural: string; locale: string | undefined; data: Record<string, any> };

/* Le meme faux Strapi que `seed-seo-transmission.test.ts` : il ne fait que retenir ce
   qu on lui ecrit. Recopie plutot qu importe — un harnais partage entre deux fichiers de
   test devient une dependance a maintenir pour un gain de vingt lignes. */
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

/** Les champs scalaires facultatifs que le corpus peut cesser de declarer. */
const CHAMPS_EFFACABLES: Record<string, string[]> = {
  articles: ['alternativeCouverture', 'legendeCouverture'],
  categories: ['alternativeHero'],
  dossiers: ['alternativeHero'],
  auteurs: ['alternativePhoto'],
};

test('un champ facultatif non declare par le corpus part a NULL, jamais absent du corps', async () => {
  const ecritures = await ecrituresDuCorpusReel();
  const absents: string[] = [];

  for (const [plural, champs] of Object.entries(CHAMPS_EFFACABLES)) {
    /* On ne juge que les ecritures qui portent le CORPS COMPLET. Le seed en emet aussi de
       PARTIELLES — la passe `articlesLies`, qui n envoie que ce champ-la : y exiger les
       autres reviendrait a demander a une mise a jour ciblee de tout reecrire, c est-a-dire
       l inverse du seed differentiel. */
    const completes = ecritures.filter((e) => e.plural === plural && 'slug' in e.data);
    for (const ecriture of completes) {
      for (const champ of champs) {
        if (!(champ in ecriture.data)) {
          absents.push(`${plural} (${ecriture.locale ?? 'fr'}) : « ${champ} » absent du corps`);
        }
      }
    }
  }

  assert.deepEqual(
    [...new Set(absents)],
    [],
    'un champ absent du corps n est pas efface en base : le PUT ne touche que ce qu on lui donne'
  );
});

test('PREUVE PAR LE CAS REEL : les 22 surcharges retirees partent bien a null', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  const surchargesEn = ecritures
    .filter((e) => e.locale === 'en' && 'alternativeCouverture' in e.data)
    .map((e) => e.data.alternativeCouverture);

  assert.ok(surchargesEn.length > 0, 'des articles anglais doivent avoir ete ecrits');
  assert.equal(
    surchargesEn.every((v) => v === null),
    true,
    'les couvertures anglaises ont leur propre fichier : plus aucune surcharge ne doit subsister'
  );

  const herosEn = ecritures
    .filter((e) => ['categories', 'dossiers'].includes(e.plural) && e.locale === 'en')
    .map((e) => e.data.alternativeHero);
  assert.equal(herosEn.every((v) => v === null), true);
});

test('et la regle ne vide PAS ce que le corpus declare — les 7 surcharges restantes passent', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  /* Les medias vraiment PARTAGES gardent leur surcharge : cinq portraits d auteur, le logo
     et l image de partage. Si ce cas rougit, c est que la regle du `null` a mange ce
     qu elle devait laisser — et le francais reviendrait sur les pages anglaises. */
  const photos = ecritures
    .filter((e) => e.plural === 'auteurs' && e.locale === 'en')
    .map((e) => e.data.alternativePhoto)
    .filter((v) => typeof v === 'string' && v !== '');

  assert.equal(photos.length, 5, 'les cinq portraits gardent leur surcharge anglaise');

  const config = ecritures.find((e) => e.plural === 'configuration' && e.locale === 'en');
  assert.ok(config, 'la Configuration anglaise doit avoir ete ecrite');
  assert.equal(typeof config!.data.alternativeLogo, 'string');
  assert.equal(typeof config!.data.alternativePartageDefaut, 'string');
});

/**
 * LE MEME PIEGE, SUR UN REPETABLE — decision `b2517199` branche B, 2026-08-14.
 *
 * `Auteur.reseaux` a ete VIDE dans le corpus versionne. Le fichier `auteurs.json` porte
 * desormais `[]`, et `seed-corpus.test.ts` l exige. Mais un corpus vide ne prouve RIEN de
 * la base : c est exactement la lecon en tete de ce fichier — le seed a dit « termine » et
 * la production a continue de servir les anciennes valeurs pendant des jours.
 *
 * Ce qui rend le cas DIFFERENT des scalaires ci-dessus, et pourquoi il vaut son test : ici
 * la cle est bien declaree par `corpsDe`, avec un tableau vide pour valeur. Elle ne peut
 * donc pas disparaitre du `JSON.stringify` — mais ca reste une deduction tant qu on ne
 * regarde pas le corps reellement emis, et le retrait dependait d elle.
 *
 * Le corps ANGLAIS n en porte pas, et c est CORRECT : `reseaux` est non localise (A-06),
 * les deux locales lisent la meme valeur, l ecriture francaise suffit a la vider pour les
 * deux. C est d ailleurs cette non-localisation qui avait cause le defaut d origine.
 */
test('PREUVE : le vidage de `Auteur.reseaux` est bien TRANSMIS, pas seulement ecrit au corpus', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  const auteursFr = ecritures.filter(
    (e) => e.plural === 'auteurs' && e.locale === 'fr' && 'slug' in e.data,
  );
  assert.equal(auteursFr.length, 5, 'les cinq auteurs francais doivent avoir ete ecrits');

  for (const ecriture of auteursFr) {
    assert.ok(
      'reseaux' in ecriture.data,
      `${ecriture.data.slug} : « reseaux » doit etre DANS le corps — absent, il ne serait jamais vide en base`,
    );
    assert.deepEqual(
      ecriture.data.reseaux,
      [],
      `${ecriture.data.slug} : le corps doit porter un tableau VIDE`,
    );
  }

  /* Le corps anglais n en porte pas : rien a exiger, mais on le CONSTATE plutot que de le
     supposer — si une refonte du seed venait a l y ajouter avec une valeur, ce serait le
     signe que le champ a ete localise sans que ce test le sache. */
  const auteursEn = ecritures.filter((e) => e.plural === 'auteurs' && e.locale === 'en');
  assert.equal(
    auteursEn.every((e) => !('reseaux' in e.data) || deepVide(e.data.reseaux)),
    true,
    'le corps anglais ne doit pas reintroduire de reseaux',
  );
});

function deepVide(valeur: unknown): boolean {
  return Array.isArray(valeur) && valeur.length === 0;
}

/**
 * LE MEME PIEGE, A L INTERIEUR DU COMPOSANT `seo` — jamais ferme jusqu ici.
 *
 * La regle en tete de ce fichier a ete fermee A LA RACINE des entites (`efface()` sur
 * `alternativeHero`, `alternativePhoto`, `legendeCouverture`…). Elle ne l a JAMAIS ete
 * pour `partage.seo` : `corpsSeo` rendait `undefined` des que le corpus ne portait
 * aucune surcharge, `JSON.stringify` supprimait la cle, et le `PUT` ne touchait donc
 * pas le composant. Un bloc `seo` retire du corpus SURVIT en base et continue d etre
 * servi — c est la classe de defaut mesuree en production le 2026-08-14, restee ouverte
 * dans le composant.
 *
 * CE QUI SE PASSE VRAIMENT COTE STRAPI, lu dans la source plutot que suppose
 * (`@strapi/core/dist/services/document-service/components.mjs`) :
 *
 *   - `updateComponents` ligne 90 : `if (!has(attributeName, data)) continue;` — la cle
 *     absente laisse le composant EN PLACE. C est la survie.
 *   - `deleteOldComponents` puis `updateOrCreateComponent` : le corps envoye ne porte pas
 *     d `id`, donc l ancienne ligne est SUPPRIMEE et une neuve creee. Un champ omis du
 *     composant transmis retombe donc a sa valeur par defaut tout seul : le remede n est
 *     PAS d appliquer `efface()` aux six champs.
 *   - `updateOrCreateComponent(uid, null)` rend `null` apres que `deleteOldComponents` a
 *     supprime l ancienne ligne : `seo: null` EFFACE le composant. Et `createComponents`
 *     saute la valeur `null` — inoffensif a la creation.
 *
 * POURQUOI `null` NE HEURTE PAS A-07 (`docs/arbitrages-techniques.md`, A-07 : « Calcul au
 * build, jamais d ecriture en base. Tous les champs de `partage.seo` restent vides tant
 * qu un redacteur ne surcharge pas »). Ce que A-07 interdit, c est d ECRIRE une valeur —
 * donc, en pratique, de creer la ligne de composant qui fera croire plus tard a un choix
 * editorial. `seo: null` ne cree rien : il SUPPRIME cette ligne. L etat d arrivee est
 * exactement celui qu A-07 veut, aucun composant. Ecrire `{}` serait la violation ; le
 * second test ci-dessous l interdit explicitement.
 */
const PORTEURS_DE_SEO = ['articles', 'categories', 'dossiers'];

/** Le corps REELLEMENT emis : le client serialise, et `JSON.stringify` mange `undefined`. */
const corpsEmis = (data: Record<string, any>): Record<string, any> =>
  JSON.parse(JSON.stringify(data));

test('le composant `seo` est TOUJOURS dans le corps emis — absent, il survivrait en base', async () => {
  const ecritures = await ecrituresDuCorpusReel();
  const absents: string[] = [];

  for (const ecriture of ecritures) {
    if (!PORTEURS_DE_SEO.includes(ecriture.plural)) continue;
    if (!('slug' in ecriture.data)) continue; // cf. les ecritures PARTIELLES, plus haut
    const emis = corpsEmis(ecriture.data);
    if (!('seo' in emis)) {
      absents.push(`${ecriture.plural} (${ecriture.locale ?? 'fr'}) « ${emis.slug} »`);
    }
  }

  assert.deepEqual(
    absents,
    [],
    'un `seo` absent du corps emis n est jamais efface : le PUT ne touche que ce qu on lui donne'
  );
});

test('… et jamais sous la forme d un composant VIDE, que A-07 interdit', async () => {
  const ecritures = await ecrituresDuCorpusReel();
  const vides: string[] = [];

  for (const ecriture of ecritures) {
    if (!PORTEURS_DE_SEO.includes(ecriture.plural)) continue;
    const emis = corpsEmis(ecriture.data);
    if (!('seo' in emis) || emis.seo === null) continue;
    const renseignes = Object.values(emis.seo).filter((v) => v !== null && v !== undefined);
    if (renseignes.length === 0) {
      vides.push(`${ecriture.plural} (${ecriture.locale ?? 'fr'}) « ${emis.slug} »`);
    }
  }

  assert.deepEqual(
    vides,
    [],
    'A-07 : une entree sans surcharge ne doit porter AUCUN composant — `null`, pas un objet vide'
  );
});

/**
 * LE CAS REEL, ET LE SEUL QUI AIT EXISTE : A19.
 *
 * Le 2026-08-13 (commit `b29aed0`), le verdict editorial d Aymeric a RETIRE la canonique
 * de A19 vers `/dossier/l-eau-du-plateau` — et avec elle le bloc `seo` entier, devenu
 * vide. Le corpus ne la porte plus. Sans `null`, le seed ne l aurait jamais retiree de la
 * base : la canonique aurait continue d annoncer a Google que l article est un doublon du
 * dossier, indefiniment, pendant que le corpus versionne disait le contraire.
 */
test('PREUVE PAR LE CAS REEL : A19, dont la canonique a ete retiree, part a `seo: null`', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  const a19 = ecritures.find(
    (e) =>
      e.plural === 'articles' &&
      e.data.slug === 'irriguer-ou-pas-le-calcul-des-sept-maraichers-du-bas'
  );
  assert.ok(a19, 'A19 doit avoir ete ecrit');

  const emis = corpsEmis(a19!.data);
  assert.ok('seo' in emis, 'A19 : la cle `seo` doit figurer dans le corps emis');
  assert.equal(
    emis.seo,
    null,
    'A19 : le corpus ne porte plus aucune surcharge — le composant doit etre EFFACE, pas ignore'
  );
});

/** Et la regle ne mange PAS ce que le corpus declare : les 6 surcharges reelles passent. */
test('… et les 6 surcharges que le corpus declare restent intactes', async () => {
  const ecritures = await ecrituresDuCorpusReel();

  const porteurs = ecritures
    .filter((e) => PORTEURS_DE_SEO.includes(e.plural) && 'slug' in e.data)
    .map((e) => corpsEmis(e.data))
    .filter((d) => d.seo !== null && d.seo !== undefined);

  assert.equal(
    porteurs.length,
    6,
    'le corpus porte six blocs `seo` : A01 fr, A01 en, A40 fr, territoire fr, territory en, l-eau-du-plateau fr'
  );

  const a01en = porteurs.find((d) => d.slug === 'trois-vents-pass-the-last-lock-on-the-wind-farm');
  assert.ok(a01en, 'A01 en doit porter sa surcharge');
  assert.equal(typeof a01en!.seo.metaTitre, 'string');
  assert.equal(typeof a01en!.seo.alternativePartage, 'string');
});
