/**
 * Controle 12 du §11 de `docs/plan-editorial.md`, execute sur la base peuplee.
 *
 * Deux faits a etablir, pas un :
 *
 *   (a) les **41** localisations EN portant un `uid` existent et ont un `slug`
 *       non vide — 6 Categorie + 20 Tag + 2 Dossier + 5 Auteur + 8 Article ;
 *   (b) sur les 8 articles EN, `auteur` et `categorie` (requis) ainsi que
 *       `tags`, `dossier` et `articlesLies` ne rendent QUE des entrees de
 *       locale `en`.
 *
 * C'est le seul controle du plan dont l'echec ne se signale nulle part : un
 * slug EN manquant est rejete a l'ecriture (A-09, bruyamment), tandis qu'une
 * localisation EN dont les relations pointent encore les entrees FR ne leve
 * RIEN. Le site anglais sort alors avec une rubrique, des tags et une signature
 * en francais, sans une erreur.
 *
 * Reserve levee ici : il n'etait PAS prouve que `fields[0]=locale` sur une
 * relation peuplee rende le `locale` de l'entree liee. Ce module tente d'abord
 * cette lecture, constate ce qu'elle rend, et **retombe sur le `slug`** si elle
 * ne rend rien. Le repli par `documentId` qui avait ete envisage ne peut pas
 * fonctionner : en Strapi 5, un document porte le MEME `documentId` dans toutes
 * ses locales — le populer ne distingue donc rien. Seul le `slug`, localise
 * d'office (A-06), differe d'une locale a l'autre.
 */

export const EFFECTIFS_EN: Record<string, number> = {
  categories: 6,
  tags: 20,
  dossiers: 2,
  auteurs: 5,
  articles: 8,
};

export const RELATIONS_ARTICLE = ['auteur', 'categorie', 'tags', 'dossier', 'articlesLies'] as const;

/** Un simple GET sur l'API de contenu, rendu deja parse. */
export type Lecteur = (cheminEtRequete: string) => Promise<any>;

export type Anomalie = { objet: string; constat: string };

export type RapportControle12 = {
  a: { effectifs: Record<string, number>; anomalies: Anomalie[] };
  b: { anomalies: Anomalie[]; localeRendueParFields: boolean; methode: string };
  vert: boolean;
};

const requeteA = (plural: string) =>
  `api/${plural}?locale=en&fields[0]=slug&pagination[pageSize]=100`;

const requeteB = (champs: readonly string[]) =>
  `api/articles?locale=en&fields[0]=slug&` +
  champs.map((c) => `populate[${c}][fields][0]=locale`).join('&');

const requeteBRepli = (champs: readonly string[]) =>
  `api/articles?locale=en&fields[0]=slug&` +
  champs.map((c) => `populate[${c}][fields][0]=slug`).join('&');

const enTableau = (v: unknown): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export async function controlerLocalisationsEn(lire: Lecteur): Promise<RapportControle12> {
  /* ---- (a) les 41 localisations EN portent un slug non vide ---- */

  const effectifs: Record<string, number> = {};
  const anomaliesA: Anomalie[] = [];
  const slugsEn = new Map<string, Set<string>>();

  for (const [plural, attendu] of Object.entries(EFFECTIFS_EN)) {
    const rep = await lire(requeteA(plural));
    const entrees: any[] = rep?.data ?? [];
    effectifs[plural] = entrees.length;
    slugsEn.set(plural, new Set(entrees.map((e) => e?.slug).filter(Boolean)));

    if (entrees.length < attendu) {
      anomaliesA.push({
        objet: plural,
        constat: `${entrees.length} localisation(s) EN rendue(s), ${attendu} attendue(s)`,
      });
    }
    for (const e of entrees) {
      if (!String(e?.slug ?? '').trim()) {
        anomaliesA.push({
          objet: `${plural}/${e?.documentId ?? '?'}`,
          constat: 'slug EN vide ou absent',
        });
      }
    }
  }

  /* ---- (b) les relations des 8 articles EN ne rendent que du `en` ---- */

  const anomaliesB: Anomalie[] = [];
  let localeRendueParFields = false;
  let methode = 'fields[0]=locale';

  const repLocale = await lire(requeteB(RELATIONS_ARTICLE));
  const articlesLocale: any[] = repLocale?.data ?? [];
  localeRendueParFields = articlesLocale.some((a) =>
    RELATIONS_ARTICLE.some((champ) =>
      enTableau(a?.[champ]).some((cible) => typeof cible?.locale === 'string')
    )
  );

  const articles = localeRendueParFields
    ? articlesLocale
    : ((await lire(requeteBRepli(RELATIONS_ARTICLE)))?.data ?? []);
  if (!localeRendueParFields) {
    methode = 'repli : populate[<relation>][fields][0]=slug, recoupe avec les slugs EN de (a)';
  }

  const pluralDe: Record<string, string> = {
    auteur: 'auteurs',
    categorie: 'categories',
    tags: 'tags',
    dossier: 'dossiers',
    articlesLies: 'articles',
  };

  for (const article of articles) {
    for (const champ of RELATIONS_ARTICLE) {
      const cibles = enTableau(article?.[champ]);

      if ((champ === 'auteur' || champ === 'categorie') && cibles.length === 0) {
        anomaliesB.push({
          objet: `article ${article?.slug} . ${champ}`,
          constat: 'relation requise rendue nulle sur la localisation EN',
        });
        continue;
      }

      for (const cible of cibles) {
        if (localeRendueParFields) {
          if (cible?.locale !== 'en') {
            anomaliesB.push({
              objet: `article ${article?.slug} . ${champ}`,
              constat: `entree liee de locale "${cible?.locale}" au lieu de "en"`,
            });
          }
        } else {
          const connus = slugsEn.get(pluralDe[champ]);
          if (!connus?.has(cible?.slug)) {
            anomaliesB.push({
              objet: `article ${article?.slug} . ${champ}`,
              constat: `entree liee de slug "${cible?.slug}", absente des slugs EN de ${pluralDe[champ]}`,
            });
          }
        }
      }
    }
  }

  return {
    a: { effectifs, anomalies: anomaliesA },
    b: { anomalies: anomaliesB, localeRendueParFields, methode },
    vert: anomaliesA.length === 0 && anomaliesB.length === 0,
  };
}
