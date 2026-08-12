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
import os from 'node:os';
import path from 'node:path';

import { chargerCorpus } from '../scripts/seed/corpus.ts';
import { executerSeed } from '../scripts/seed/seed.ts';
import type { ClientStrapi } from '../scripts/seed/client.ts';

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
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-seo-image-'));
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
