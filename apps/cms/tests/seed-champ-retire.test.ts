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
