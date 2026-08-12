/**
 * La garde de BUILD sur les `slug` — celle qui protege QUEL QUE SOIT le chemin d ecriture.
 *
 * Pourquoi elle existe alors que `minLength: 1` a ete pose cote Strapi (A-09, 2026-08-11) :
 * `minLength` vit dans l entity-validator, et TOUT ce qui ne passe pas par lui l ignore.
 * Mesure le 2026-08-11 sur une copie de la base locale : un
 * `strapi.db.query('api::categorie.categorie').update({ data: { slug: '' } })` est
 * ACCEPTE et la ligne se retrouve vide en base. Un UPDATE SQL direct, une restauration
 * de dump, un import : meme chose. Cette garde-ci est le dernier point de passage avant
 * que le slug ne devienne une URL — `mapping.ts` est l unique traversee du corpus au
 * build (`corpus.ts`), donc rien n entre sans passer ici.
 *
 * Ce qu elle refuse, et pourquoi c est une CLASSE et non le seul cas vide. Un slug sert
 * a fabriquer un segment d URL (`chemins.ts`). Vide, il produit `/article/` — soit une
 * URL sans segment, soit une collision avec l index. Mais `"   "`, `"a b"` ou `"ete"`
 * accentue produisent une URL qui ne se resout pas davantage, et ceux-la traversaient
 * `texteRequis` sans un mot : sa seule regle etait « chaine non vide ». On borne donc
 * a l alphabet d un `uid` Strapi, celui-la meme que le moteur applique — moins la chaine
 * vide, qui est le trou du 2026-08-10.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mapperArticle,
  mapperAuteur,
  mapperCategorie,
  mapperTag,
  mapperDossier,
} from '../src/lib/strapi/mapping.ts';
import { ValeurInattendueError } from '../src/lib/strapi/erreurs.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));

function fixture(nom: string): any {
  return JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', `${nom}.json`), 'utf8'));
}

function copie<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur));
}

/** Remplace la valeur designee par un chemin pointe (`auteur.slug`, `tags.0.slug`). */
function avecValeur<T>(racine: T, chemin: string, valeur: unknown): T {
  const clone: any = copie(racine);
  const segments = chemin.split('.');
  const derniere = segments.pop() as string;
  let curseur: any = clone;
  for (const segment of segments) curseur = curseur[segment];
  assert.ok(
    curseur !== undefined && derniere in curseur,
    `fixture invalide : le chemin « ${chemin} » n existe pas, le cas de test ne prouverait rien`,
  );
  curseur[derniere] = valeur;
  return clone;
}

const ARTICLES = fixture('articles-fr');
const AUTEURS = fixture('auteurs-fr');
const CATEGORIES = fixture('categories-fr');
const TAGS = fixture('tags-fr');
const DOSSIERS = fixture('dossiers-fr');

/**
 * Les DOUZE endroits par lesquels un slug entre dans le build. Un seul oubli suffit :
 * une reference de categorie vide casse le lien depuis chaque article de la rubrique.
 */
const PORTES: { nom: string; mapper: (b: unknown) => unknown; brut: () => any; chemin: string }[] = [
  { nom: 'article.slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'slug' },
  { nom: 'article.auteur.slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'auteur.slug' },
  { nom: 'article.categorie.slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'categorie.slug' },
  { nom: 'article.tags[0].slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'tags.0.slug' },
  { nom: 'article.dossier.slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'dossier.slug' },
  { nom: 'article.articlesLies[0].slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'articlesLies.0.slug' },
  { nom: 'article.localizations[0].slug', mapper: mapperArticle, brut: () => ARTICLES.data[0], chemin: 'localizations.0.slug' },
  { nom: 'auteur.slug', mapper: mapperAuteur, brut: () => AUTEURS.data[0], chemin: 'slug' },
  { nom: 'categorie.slug', mapper: mapperCategorie, brut: () => CATEGORIES.data[0], chemin: 'slug' },
  { nom: 'categorie.localizations[0].slug', mapper: mapperCategorie, brut: () => CATEGORIES.data[0], chemin: 'localizations.0.slug' },
  { nom: 'tag.slug', mapper: mapperTag, brut: () => TAGS.data[0], chemin: 'slug' },
  { nom: 'dossier.slug', mapper: mapperDossier, brut: () => DOSSIERS.data[0], chemin: 'slug' },
  { nom: 'dossier.articles[0].slug', mapper: mapperDossier, brut: () => DOSSIERS.data[0], chemin: 'articles.0.slug' },
];

/** Les valeurs qui ne peuvent pas devenir un segment d URL. */
const REFUSES: [string, string][] = [
  ['""  (le trou mesure le 2026-08-10)', ''],
  ['"   " (espaces seuls)', '   '],
  ['"deux mots" (espace interne)', 'deux mots'],
  ['"ete-a-l-ecart" accentue', 'ete-a-l-écart'],
  ['"a/b" (separateur de chemin)', 'a/b'],
  ['"a?b" (ouvre une chaine de requete)', 'a?b'],
];

for (const porte of PORTES) {
  for (const [etiquette, valeur] of REFUSES) {
    test(`${porte.nom} : ${etiquette} fait ECHOUER le build`, () => {
      assert.throws(
        () => porte.mapper(avecValeur(porte.brut(), porte.chemin, valeur)),
        (e: unknown) => {
          assert.ok(e instanceof ValeurInattendueError, `erreur attendue : ValeurInattendueError, recu ${e}`);
          assert.match(
            (e as Error).message,
            /A-09/,
            'le message doit nommer A-09 : sans cela, un futur lecteur ne saura pas quelle regle a mordu',
          );
          return true;
        },
      );
    });
  }

  test(`${porte.nom} : le slug legitime de la fixture passe toujours`, () => {
    assert.doesNotThrow(() => porte.mapper(copie(porte.brut())));
  });
}

test('les slugs du corpus reel restent tous acceptes (non-regression sur 61 slugs)', () => {
  // Les slugs vraiment saisis dans `apps/cms/data`, pas des exemples inventes.
  const legitimes = [
    'territoire',
    'territory',
    'vies-d-ici',
    'lives-here',
    'economie-locale',
    'juin-1983-le-dernier-jour-de-la-filature',
    'la-vallee-se-reconstruit',
    'camille-ferrand',
    '14-june-1983-the-mills-last-day',
    'a_b.c~d',
  ];
  for (const slug of legitimes) {
    assert.doesNotThrow(
      () => mapperCategorie(avecValeur(copie(CATEGORIES.data[0]), 'slug', slug)),
      `« ${slug} » refuse alors qu il est legitime — la garde casserait le corpus`,
    );
  }
});
