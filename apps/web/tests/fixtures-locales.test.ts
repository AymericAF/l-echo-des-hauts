/**
 * Le banc a-t-il une locale ANGLAISE, et ressemble-t-il a ce que le seed ecrit ?
 *
 * CE QUE CE FICHIER FERME. Jusqu au 2026-08-10, `tests/fixtures/` ne portait que six
 * fichiers `*-fr.json` : le Strapi de substitution (`scripts/serveur-fixtures.mjs`)
 * rendait une collection VIDE et un 404 sur le Single Type pour la locale `en`. Mesure
 * du meme jour, sur le `dist/` de `npm run preuve:rendu` : 13 pages francaises portaient
 * le bloc de reseaux du pied de page, les 4 pages anglaises en portaient ZERO — et
 * chacune affichait le bandeau « Configuration Strapi absente ». Tout ce qui vit dans le
 * pied de page anglais n etait donc garde par RIEN hors ligne.
 *
 * C etait un angle mort ASYMETRIQUE, la pire forme : le francais etait couvert, l anglais
 * ne l etait pas, et rien ne signalait la difference. Un controle qui verifie « le pied de
 * page rend bien un lien » constatait le vrai en francais et croyait avoir tout vu.
 *
 * L ECART ETAIT DANS LE BANC, PAS DANS LE SITE. Le seed ecrit la Configuration AUX DEUX
 * LOCALES (`apps/cms/scripts/seed/seed.ts`, section 4 : la boucle `for (const locale of
 * LOCALES)` ecrit `reseaux` a l anglais aussi), et `apps/cms/data/*.json` porte un bloc
 * `en` pour les cinq collections. Le site n a jamais eu ce trou ; le banc, si.
 *
 * CE QUE CE FICHIER NE FAIT PAS. Il ne juge aucun RENDU : une fixture peut etre
 * impeccable et la page anglaise ne rien afficher. Le rendu se constate dans la sortie
 * construite, par `scripts/preuve-rendu.mjs` (« Pied de page », les deux locales), qui
 * tourne dans l integration continue. Les deux etages ne se remplacent pas : celui-ci
 * garde la FORME des donnees, l autre garde ce que la page emet.
 *
 * D OU VIENT LA PARTITION « champ partage / champ localise ». Elle est ecrite dans les
 * schemas Strapi (`apps/cms/src/api/<type>/content-types/<type>/schema.json`,
 * `pluginOptions.i18n.localized`) et gardee la-bas par `apps/cms/tests/modele-donnees.test.ts`
 * (A-06). Elle est RECOPIEE ici, et cette recopie est assumee : un test d `apps/web` ne
 * peut pas lire `apps/cms`, parce que le declencheur au commit
 * (`outils/gardes-au-commit.js`) ne materialise que les applications touchees par le
 * commit — un commit qui ne toucherait que `apps/web` ferait alors rougir ce fichier pour
 * un fichier absent, et on le desactiverait. Le garde-fou contre la derive est le test
 * « toute cle de fixture est classee » plus bas : une cle qui apparait ou disparait d une
 * fixture force une decision, elle ne passe pas en silence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(ICI, 'fixtures');

function fixture(nom: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${nom}.json`), 'utf8'));
}

function existe(nom: string): boolean {
  return fs.existsSync(path.join(FIXTURES, `${nom}.json`));
}

/** Les cinq collections du modele (§3.1 a §3.7). `configuration` est un Single Type. */
const COLLECTIONS = ['articles', 'auteurs', 'categories', 'tags', 'dossiers'] as const;

/**
 * Partition des attributs, par type de contenu.
 *
 *   - `partages`   : `pluginOptions.i18n.localized = false` — Strapi rend LA MEME valeur
 *                    a toutes les locales. Une divergence ici est une fixture inventee.
 *   - `localises`  : `localized = true` — chaque locale porte la sienne.
 *   - `relations`  : ni l un ni l autre. En Strapi 5 une relation est par locale et
 *                    pointe la localisation de la cible dans la MEME locale.
 *   - `techniques` : ce que l API ajoute autour du contenu. `slug` est un `uid`, donc
 *                    localise d office (A-06) ; il est ici parce que sa valeur anglaise
 *                    est ANNONCEE par la fixture francaise et verifiee a part.
 *   - `sansEcart`  : sous-ensemble de `localises` qu on n exige PAS different. `seo` est
 *                    un component a champs tous optionnels, legitimement vide dans les
 *                    deux locales : exiger un ecart forcerait a inventer une valeur.
 *                    Les champs `alternative*` y sont pour la MEME raison, et il faut la
 *                    lire dans le bon sens : ils sont bien LOCALISES — c est tout leur
 *                    objet, surcharger par locale l `alternativeText` de la mediatheque,
 *                    qui n en porte qu une. Mais ils sont FACULTATIFS, et ce banc les
 *                    laisse vides des deux cotes : c est le corpus versionne, pas les
 *                    fixtures, qui porte les alternatives anglaises. Exiger un ecart ici
 *                    ferait inventer au banc une valeur que le site ne sert pas.
 */
const PARTITION: Record<
  string,
  {
    partages: string[];
    localises: string[];
    relations: string[];
    techniques: string[];
    sansEcart: string[];
  }
> = {
  articles: {
    partages: ['imageCouverture', 'datePublication', 'aLaUne'],
    localises: ['titre', 'chapo', 'contenu', 'legendeCouverture', 'alternativeCouverture', 'seo'],
    relations: ['auteur', 'categorie', 'tags', 'dossier', 'articlesLies'],
    techniques: [
      'id',
      'documentId',
      'slug',
      'locale',
      'createdAt',
      'updatedAt',
      'publishedAt',
      'localizations',
    ],
    sansEcart: ['seo', 'alternativeCouverture'],
  },
  auteurs: {
    partages: ['nom', 'photo', 'reseaux'],
    localises: ['fonction', 'bio', 'alternativePhoto'],
    relations: [],
    techniques: ['id', 'documentId', 'slug', 'locale', 'updatedAt', 'localizations'],
    sansEcart: ['alternativePhoto'],
  },
  categories: {
    partages: ['couleurAccent', 'imageHero', 'ordreAffichage'],
    localises: ['nom', 'description', 'alternativeHero', 'seo'],
    relations: [],
    techniques: ['id', 'documentId', 'slug', 'locale', 'updatedAt', 'localizations'],
    sansEcart: ['seo', 'alternativeHero'],
  },
  tags: {
    partages: [],
    localises: ['nom'],
    relations: [],
    techniques: ['id', 'documentId', 'slug', 'locale', 'updatedAt', 'localizations'],
    sansEcart: [],
  },
  dossiers: {
    partages: ['imageHero', 'dateOuverture'],
    localises: ['titre', 'introduction', 'alternativeHero', 'seo'],
    relations: ['articles'],
    techniques: ['id', 'documentId', 'slug', 'locale', 'updatedAt', 'localizations'],
    sansEcart: ['seo', 'alternativeHero'],
  },
  configuration: {
    partages: ['logo', 'logoSombre', 'favicon', 'imagePartageDefaut', 'reseaux'],
    localises: [
      'nomSite',
      'baseline',
      'descriptionDefaut',
      'texteFooter',
      'mentionsLegales',
      'alternativeLogo',
      'alternativePartageDefaut',
    ],
    relations: [],
    // Le Single Type ne peuple PAS `localizations` (`src/lib/strapi/requete.ts`).
    techniques: ['id', 'documentId', 'locale', 'updatedAt'],
    sansEcart: ['alternativeLogo', 'alternativePartageDefaut'],
  },
};

/**
 * Relations dont la cible est elle-meme une entree de fixture — donc dont on peut juger
 * la coherence entre locales. `articlesLies` en est exclu : ses cibles (`art…004` a
 * `art…007`) n existent nulle part ailleurs dans le banc, elles ne sont que des charges
 * utiles de reference destinees a exercer la troncature A-13. Rien ne permettrait de
 * decider si leur presence en anglais est juste ou fausse.
 */
const RELATIONS_JUGEABLES: Record<string, string[]> = {
  articles: ['auteur', 'categorie', 'tags', 'dossier'],
  dossiers: ['articles'],
};

/** Le fichier dont les entrees d une relation sont issues. */
const SOURCE_RELATION: Record<string, string> = {
  auteur: 'auteurs',
  categorie: 'categories',
  tags: 'tags',
  dossier: 'dossiers',
  articles: 'articles',
};

function entrees(nom: string, locale: 'fr' | 'en'): any[] {
  return fixture(`${nom}-${locale}`).data;
}

/** La localisation `en` que l entree francaise ANNONCE, ou `null`. */
function annonceEn(entree: any): { id: number; documentId: string; slug: string } | null {
  return (entree.localizations ?? []).find((l: any) => l.locale === 'en') ?? null;
}

function cibles(valeur: unknown): string[] {
  if (valeur === null || valeur === undefined) return [];
  const liste = Array.isArray(valeur) ? valeur : [valeur];
  return liste.map((c: any) => c.documentId).filter((d: unknown) => typeof d === 'string');
}

// ---------------------------------------------------------------------------
// 1. Le banc a une locale anglaise
// ---------------------------------------------------------------------------

test('chaque collection porte une fixture anglaise, en plus de la francaise', () => {
  for (const nom of COLLECTIONS) {
    assert.ok(existe(`${nom}-fr`), `${nom}-fr.json manquant`);
    assert.ok(
      existe(`${nom}-en`),
      `${nom}-en.json manquant : la locale anglaise de « ${nom} » n est gardee par rien hors ligne`,
    );
  }
});

test('le Single Type Configuration existe dans les DEUX locales, comme le seed l ecrit', () => {
  // `apps/cms/scripts/seed/seed.ts` §4 : `for (const locale of LOCALES)` ecrit la
  // Configuration a `fr` ET a `en`. Un banc sans `configuration-en` fait rendre 404 au
  // Strapi de substitution, et toute page anglaise perd nom du site, logo, texte de pied
  // de page et bloc de reseaux — sans qu aucun test ne le voie.
  assert.ok(existe('configuration-fr'), 'configuration-fr.json manquant');
  assert.ok(existe('configuration-en'), 'configuration-en.json manquant');
  assert.equal(fixture('configuration-fr').data.locale, 'fr');
  assert.equal(fixture('configuration-en').data.locale, 'en');
});

// ---------------------------------------------------------------------------
// 2. Le miroir : ce que le francais ANNONCE existe, et rien de plus
// ---------------------------------------------------------------------------

test('chaque localisation annoncee cote francais existe cote anglais, au meme documentId et au slug annonce', () => {
  for (const nom of COLLECTIONS) {
    const anglaises = new Map(entrees(nom, 'en').map((e) => [e.documentId, e]));
    for (const fr of entrees(nom, 'fr')) {
      const annonce = annonceEn(fr);
      if (annonce === null) continue;
      const en = anglaises.get(fr.documentId);
      assert.ok(en, `${nom} : ${fr.documentId} annonce une localisation EN qui n existe pas`);
      assert.equal(en.locale, 'en', `${nom}/${fr.documentId} : locale`);
      assert.equal(
        en.slug,
        annonce.slug,
        `${nom}/${fr.documentId} : le slug anglais n est pas celui que la fixture francaise annonce`,
      );
      assert.equal(en.id, annonce.id, `${nom}/${fr.documentId} : id de la localisation`);
    }
  }
});

test('la localisation se declare des DEUX cotes — le mapping lit celle de l entree qu il tient', () => {
  // Piege 1 de T-05 : la bascule FR/EN d une page anglaise lit `localizations` de
  // l entree ANGLAISE. Une declaration a sens unique laisse la bascule anglaise sans
  // contrepartie exacte, et le `hreflang` disparait sans que rien ne rougisse.
  for (const nom of COLLECTIONS) {
    const francaises = new Map(entrees(nom, 'fr').map((e) => [e.documentId, e]));
    for (const en of entrees(nom, 'en')) {
      const retour = (en.localizations ?? []).find((l: any) => l.locale === 'fr') ?? null;
      assert.ok(retour, `${nom}/${en.documentId} : l entree anglaise ne pointe pas vers le francais`);
      const fr = francaises.get(en.documentId);
      assert.ok(fr, `${nom}/${en.documentId} : aucune entree francaise a ce documentId`);
      assert.equal(retour.slug, fr.slug, `${nom}/${en.documentId} : slug francais annonce`);
      assert.equal(retour.id, fr.id, `${nom}/${en.documentId} : id francais annonce`);
    }
  }
});

test('aucune entree anglaise orpheline : le banc ne fabrique pas de contenu que le francais ignore', () => {
  for (const nom of COLLECTIONS) {
    const annonces = new Set(
      entrees(nom, 'fr')
        .filter((e) => annonceEn(e) !== null)
        .map((e) => e.documentId),
    );
    for (const en of entrees(nom, 'en')) {
      assert.ok(
        annonces.has(en.documentId),
        `${nom} : ${en.documentId} existe en anglais sans qu aucune entree francaise l annonce`,
      );
    }
  }
});

test('le manque legitime est PRESERVE : chaque collection garde une entree francaise sans jumelle anglaise', () => {
  // Le corpus reel est ainsi : 8 articles anglais sur 40 (`apps/cms/data/articles/`), et
  // `apps/cms/data/*.json` autorise un bloc `en` ABSENT (`en?:` dans
  // `apps/cms/scripts/seed/corpus.ts`). Un banc ou tout serait traduit ne prouverait plus
  // rien sur le repli de la bascule FR/EN (T-06) ni sur l index anglais non emis (§10.3) :
  // il dirait ce qu on veut entendre.
  for (const nom of COLLECTIONS) {
    const sansEn = entrees(nom, 'fr').filter((e) => annonceEn(e) === null);
    assert.ok(
      sansEn.length > 0,
      `${nom} : plus aucune entree francaise sans traduction — le cas « contrepartie absente » n est plus exerce`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. La forme : partagee ou localisee, comme le schema le dit
// ---------------------------------------------------------------------------

function paires(): { nom: string; fr: any; en: any }[] {
  const liste: { nom: string; fr: any; en: any }[] = [];
  for (const nom of COLLECTIONS) {
    const anglaises = new Map(entrees(nom, 'en').map((e) => [e.documentId, e]));
    for (const fr of entrees(nom, 'fr')) {
      const en = anglaises.get(fr.documentId);
      if (en) liste.push({ nom, fr, en });
    }
  }
  liste.push({ nom: 'configuration', fr: fixture('configuration-fr').data, en: fixture('configuration-en').data });
  return liste;
}

test('toute cle de fixture est CLASSEE — une cle nouvelle force une decision, elle ne passe pas en silence', () => {
  for (const { nom, fr, en } of paires()) {
    const p = PARTITION[nom];
    const classees = new Set([...p.partages, ...p.localises, ...p.relations, ...p.techniques]);
    for (const [cote, entree] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      for (const cle of Object.keys(entree)) {
        assert.ok(
          classees.has(cle),
          `${nom} (${cote}) : la cle « ${cle} » n est classee ni partagee, ni localisee, ni relation, ni technique`,
        );
      }
    }
    for (const cle of classees) {
      assert.ok(cle in fr, `${nom} : la partition declare « ${cle} », absent de la fixture francaise`);
    }
  }
});

test('les deux locales portent EXACTEMENT les memes cles', () => {
  for (const { nom, fr, en } of paires()) {
    assert.deepEqual(
      Object.keys(en).sort(),
      Object.keys(fr).sort(),
      `${nom}/${fr.documentId ?? 'configuration'} : les cles divergent entre locales`,
    );
  }
});

test('les champs NON LOCALISES sont identiques d une locale a l autre', () => {
  // C est ici que se joue le bloc en cause : `reseaux` de la Configuration est declare
  // `localized: false`. La liste anglaise n est donc pas « une autre liste » : c est LA
  // MEME. Un banc qui l aurait inventee prouverait autre chose que le site.
  for (const { nom, fr, en } of paires()) {
    for (const champ of PARTITION[nom].partages) {
      assert.deepEqual(
        en[champ],
        fr[champ],
        `${nom}/${fr.documentId ?? 'configuration'} : « ${champ} » est un champ PARTAGE, il doit etre identique aux deux locales`,
      );
    }
  }
});

test('les champs LOCALISES non nuls des deux cotes different — sinon le banc est du francais sous une etiquette anglaise', () => {
  for (const { nom, fr, en } of paires()) {
    const sansEcart = new Set(PARTITION[nom].sansEcart);
    for (const champ of PARTITION[nom].localises) {
      if (sansEcart.has(champ)) continue;
      if (fr[champ] === null || fr[champ] === undefined) continue;
      if (en[champ] === null || en[champ] === undefined) continue;
      assert.notDeepEqual(
        en[champ],
        fr[champ],
        `${nom}/${fr.documentId ?? 'configuration'} : « ${champ} » est identique aux deux locales alors qu il est LOCALISE`,
      );
    }
  }
});

test('documentId partage, id et locale propres — la regle Strapi 5 des localisations', () => {
  for (const { nom, fr, en } of paires()) {
    assert.equal(en.documentId, fr.documentId, `${nom} : documentId`);
    assert.notEqual(en.id, fr.id, `${nom}/${fr.documentId} : les deux locales partagent un id`);
    assert.equal(fr.locale, 'fr');
    assert.equal(en.locale, 'en');
  }
});

// ---------------------------------------------------------------------------
// 4. Les relations pointent la MEME locale
// ---------------------------------------------------------------------------

test('une relation anglaise ne vise que des cibles qui existent en anglais, et n en invente aucune', () => {
  for (const { nom, fr, en } of paires()) {
    for (const champ of RELATIONS_JUGEABLES[nom] ?? []) {
      const source = SOURCE_RELATION[champ];
      const traduits = new Set(
        entrees(source, 'fr')
          .filter((e) => annonceEn(e) !== null)
          .map((e) => e.documentId),
      );

      const enFr = cibles(fr[champ]);
      const enEn = cibles(en[champ]);

      for (const cible of enEn) {
        assert.ok(
          enFr.includes(cible),
          `${nom}/${fr.documentId} : « ${champ} » vise ${cible} en anglais, absent de la relation francaise`,
        );
        assert.ok(
          traduits.has(cible),
          `${nom}/${fr.documentId} : « ${champ} » vise ${cible} en anglais, or ${cible} n a pas de localisation anglaise`,
        );
      }
      for (const cible of enFr) {
        if (traduits.has(cible)) {
          assert.ok(
            enEn.includes(cible),
            `${nom}/${fr.documentId} : « ${champ} » perd ${cible} en anglais alors que sa traduction existe`,
          );
        }
      }
    }
  }
});

test('une reference de relation porte le slug et le libelle de SA locale, pas ceux du francais', () => {
  // Piege 1 de T-05 transpose aux references : `/en/` + un slug francais est une 404, et
  // le defaut est invisible tant que les deux slugs se ressemblent.
  for (const { nom, fr, en } of paires()) {
    for (const champ of RELATIONS_JUGEABLES[nom] ?? []) {
      const source = SOURCE_RELATION[champ];
      const parDocument = new Map(entrees(source, 'en').map((e) => [e.documentId, e]));
      const liste = Array.isArray(en[champ]) ? en[champ] : en[champ] === null ? [] : [en[champ]];
      for (const reference of liste) {
        const cible = parDocument.get(reference.documentId);
        assert.ok(cible, `${nom}/${fr.documentId} : ${reference.documentId} absent de ${source}-en`);
        assert.equal(
          reference.slug,
          cible.slug,
          `${nom}/${fr.documentId} : « ${champ} » porte le slug « ${reference.slug} » la ou ${source}-en dit « ${cible.slug} »`,
        );
      }
    }
  }
});
