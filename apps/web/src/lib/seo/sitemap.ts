/**
 * Le sitemap index segmente par type de contenu — §5.2.
 *
 * IL SE CALCULE SUR LE REGISTRE, et c est tout le sujet. Le registre
 * (`src/lib/routes/registre.ts`, T-04) est deja la source unique de « quelles pages
 * existent » : les `getStaticPaths` le transcrivent, la bascule FR/EN y lit sa
 * contrepartie, les `hreflang` y verifient leur cible. Un sitemap qui reconstruirait sa
 * propre liste ferait une SECONDE source de verite sur la meme question — et l ecart ne
 * se decouvrirait qu en Search Console, des mois plus tard, sous forme d URL declarees
 * mais absentes. Il n y a donc rien a recalculer ici : on parcourt le registre et on
 * retire ce qu A-29 en retire.
 *
 * Trois regles y sont appliquees, aucune n est inventee ici :
 *
 *   - **A-29** — une page `noindex` sort du sitemap ET porte la balise. C est
 *     `src/lib/seo/indexation.ts` qui tranche, pour les deux points de lecture.
 *   - **§10.3 du plan editorial** — un index vide dans sa locale n est pas emis. La
 *     regle vit dans le registre ; ici elle s applique toute seule, puisqu une route
 *     non emise n est pas parcourue.
 *   - **T-06** — les alternates du sitemap sont EXACTEMENT ceux du `<head>` : ils
 *     passent par `contrepartie()` et ne sortent que sur une contrepartie exacte. Le
 *     repli de navigation (article non traduit -> page de rubrique) ne doit jamais
 *     contaminer un jeu d alternates, ni dans la page ni dans le sitemap.
 *
 * SEGMENTATION PAR TYPE, pas par locale : c est la lettre du §5.2 (« sitemap index
 * segmente par type de contenu »). Un segment porte donc ses URL francaises et
 * anglaises. Un segment vide n est pas emis et n apparait pas dans l index — declarer
 * un `urlset` sans `url` est valide mais remonte comme avertissement, et surtout cela
 * mentirait sur l existence d un type de contenu que le corpus ne porte pas.
 */
import type { Article, Configuration, Locale, Seo } from '../domaine.ts';
import {
  FAMILLES,
  PAGES_STATIQUES,
  cheminAccueil,
  cheminArticle,
  cheminIndex,
  cheminStatique,
  type Famille,
} from '../routes/chemins.ts';
import { contrepartie, type DescripteurPage } from '../routes/contrepartie.ts';
import { LOCALES_SITE, type IndexEmis, type Registre } from '../routes/registre.ts';
import { noindexDe, seoDeFamille } from './indexation.ts';
import { texteXml } from './xml.ts';

/** Les segments, dans l ordre ou l index les liste. */
export const SEGMENTS_SITEMAP = [
  'pages',
  'articles',
  'categories',
  'tags',
  'auteurs',
  'dossiers',
] as const;
export type SegmentSitemap = (typeof SEGMENTS_SITEMAP)[number];

/** La famille d index qui alimente chaque segment ; `pages` et `articles` n en ont pas. */
const SEGMENT_DE_FAMILLE: Record<Famille, SegmentSitemap> = {
  categorie: 'categories',
  tag: 'tags',
  auteur: 'auteurs',
  dossier: 'dossiers',
};

export interface AlternateSitemap {
  readonly hreflang: string;
  readonly chemin: string;
}

export interface EntreeSitemap {
  readonly chemin: string;
  /** Date ISO, ou `null` quand aucune source ne la porte — jamais inventee. */
  readonly lastmod: string | null;
  readonly alternates: readonly AlternateSitemap[];
}

export interface Segment {
  readonly nom: SegmentSitemap;
  readonly entrees: readonly EntreeSitemap[];
}

export function cheminSegment(nom: SegmentSitemap): string {
  return `/sitemap-${nom}.xml`;
}

export const CHEMIN_SITEMAP_INDEX = '/sitemap-index.xml';

/** La plus recente de plusieurs dates ISO, `null` si aucune n est fournie. */
function plusRecente(dates: readonly (string | null | undefined)[]): string | null {
  const connues = dates.filter((date): date is string => typeof date === 'string' && date !== '');
  if (connues.length === 0) return null;
  return connues.reduce((max, date) => (date > max ? date : max));
}

/**
 * Les alternates d une entree, calcules comme ceux du `<head>` (T-06).
 *
 * Le protocole des sitemaps veut que chaque URL du groupe liste TOUTES les versions,
 * elle-meme comprise — d ou l entree `hreflang` de la page courante. Sans elle, Google
 * considere le groupe comme non reciproque et l ignore en entier.
 */
function alternatesDe(registre: Registre, page: DescripteurPage, chemin: string): AlternateSitemap[] {
  const cible = contrepartie(registre, page);
  if (!cible.exact) return [];
  const cheminFr = page.locale === 'fr' ? chemin : cible.chemin;
  return [
    { hreflang: page.locale, chemin },
    { hreflang: cible.locale, chemin: cible.chemin },
    { hreflang: 'x-default', chemin: cheminFr },
  ];
}

/** Tous les articles portes par un index, toutes pages de pagination confondues. */
function articlesDeLIndex(index: IndexEmis): readonly Article[] {
  return index.pages.flatMap((page) => page.items);
}

function entreeIndex(registre: Registre, index: IndexEmis): EntreeSitemap[] {
  const seo: Seo | null = seoDeFamille(index.famille, index.entite);

  return index.pages.map((tranche) => {
    const page: DescripteurPage = {
      genre: 'index',
      locale: index.locale,
      famille: index.famille,
      documentId: index.documentId,
      numero: tranche.numero,
    };
    const chemin = cheminIndex(index.locale, index.famille, index.slug, tranche.numero);
    return {
      chemin,
      /* La date d un index n est pas celle de l entite : une rubrique « change » quand
         un de ses articles change, alors que son propre `updatedAt` ne bouge pas. Un
         lastmod fige sur l entite ferait recrawler la page au mauvais moment. */
      lastmod: plusRecente([index.entite.updatedAt, ...articlesDeLIndex(index).map((a) => a.updatedAt)]),
      alternates: alternatesDe(registre, page, chemin),
      noindex: noindexDe(page, seo),
    } as EntreeSitemap & { noindex: boolean };
  });
}

/**
 * Le sitemap, segment par segment, calcule sur le registre.
 *
 * @param registre Le registre des routes reellement emises (T-04).
 * @param configurations Le Single Type `Configuration` de chaque locale : sa date de
 *   modification est la seule source honnete pour le `lastmod` des pages statiques.
 */
export function segmentsSitemap(
  registre: Registre,
  configurations: ReadonlyMap<Locale, Configuration | null>,
): Segment[] {
  const parSegment = new Map<SegmentSitemap, EntreeSitemap[]>(
    SEGMENTS_SITEMAP.map((nom) => [nom, []]),
  );
  const ajouter = (nom: SegmentSitemap, entree: EntreeSitemap & { noindex: boolean }): void => {
    if (entree.noindex) return; // A-29 — une seule decision, deux points de lecture.
    parSegment.get(nom)!.push({
      chemin: entree.chemin,
      lastmod: entree.lastmod,
      alternates: entree.alternates,
    });
  };

  for (const locale of LOCALES_SITE) {
    const articles = registre.articles(locale);
    const configuration = configurations.get(locale) ?? null;

    // 1. Accueil : sa fraicheur est celle du plus recent de ses articles.
    const accueil: DescripteurPage = { genre: 'accueil', locale };
    const cheminDAccueil = cheminAccueil(locale);
    ajouter('pages', {
      chemin: cheminDAccueil,
      lastmod: plusRecente([configuration?.updatedAt, ...articles.map((a) => a.updatedAt)]),
      alternates: alternatesDe(registre, accueil, cheminDAccueil),
      noindex: noindexDe(accueil, null),
    });

    // 2. Pages statiques : `/404` et `/mentions-legales` sont ecartees par A-29.
    for (const nom of PAGES_STATIQUES) {
      const page: DescripteurPage = { genre: 'statique', locale, nom };
      const chemin = cheminStatique(locale, nom);
      ajouter('pages', {
        chemin,
        lastmod: configuration?.updatedAt ?? null,
        alternates: alternatesDe(registre, page, chemin),
        noindex: noindexDe(page, null),
      });
    }

    // 3. Articles.
    for (const entree of articles) {
      const page: DescripteurPage = { genre: 'article', locale, article: entree };
      ajouter('articles', {
        chemin: cheminArticle(locale, entree.slug),
        lastmod: entree.updatedAt,
        alternates: alternatesDe(registre, page, cheminArticle(locale, entree.slug)),
        noindex: noindexDe(page, entree.seo),
      });
    }
  }

  // 4. Index : le registre ne contient que ceux qui sont emis (§10.3).
  for (const famille of FAMILLES) {
    for (const index of registre.indexes) {
      if (index.famille !== famille) continue;
      for (const entree of entreeIndex(registre, index)) {
        ajouter(SEGMENT_DE_FAMILLE[famille], entree as EntreeSitemap & { noindex: boolean });
      }
    }
  }

  return SEGMENTS_SITEMAP.map((nom) => ({ nom, entrees: parSegment.get(nom)! })).filter(
    (segment) => segment.entrees.length > 0,
  );
}

function absolue(chemin: string, origine: string): string {
  return new URL(chemin, origine).href;
}

/** Un segment de sitemap : `<urlset>`, avec les alternates en `xhtml:link`. */
export function xmlUrlset(entrees: readonly EntreeSitemap[], origine: string): string {
  const urls = entrees.map((entree) => {
    const lignes = [`    <loc>${texteXml(absolue(entree.chemin, origine))}</loc>`];
    if (entree.lastmod !== null) lignes.push(`    <lastmod>${texteXml(entree.lastmod)}</lastmod>`);
    for (const alternate of entree.alternates) {
      lignes.push(
        `    <xhtml:link rel="alternate" hreflang="${texteXml(alternate.hreflang)}" ` +
          `href="${texteXml(absolue(alternate.chemin, origine))}" />`,
      );
    }
    return `  <url>\n${lignes.join('\n')}\n  </url>`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `${urls.join('\n')}\n` +
    '</urlset>\n'
  );
}

/** L index : il liste les segments EMIS, et ne se reference jamais lui-meme. */
export function xmlSitemapIndex(segments: readonly Segment[], origine: string): string {
  const entrees = segments.map((segment) => {
    const lignes = [`    <loc>${texteXml(absolue(cheminSegment(segment.nom), origine))}</loc>`];
    const lastmod = plusRecente(segment.entrees.map((entree) => entree.lastmod));
    if (lastmod !== null) lignes.push(`    <lastmod>${texteXml(lastmod)}</lastmod>`);
    return `  <sitemap>\n${lignes.join('\n')}\n  </sitemap>`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${entrees.join('\n')}\n` +
    '</sitemapindex>\n'
  );
}
