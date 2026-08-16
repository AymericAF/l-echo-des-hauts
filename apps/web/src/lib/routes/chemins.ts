/**
 * Les chemins du §4.2, fabriques ICI et nulle part ailleurs.
 *
 * T-04 interdit de fabriquer l URL de CONTREPARTIE par manipulation de chaine — la
 * contrepartie se lit dans le registre (`registre.ts`, `contrepartie.ts`). Ce module-ci
 * fait l autre moitie du travail : construire l URL d une page qu on EMET, a partir de
 * sa locale et du slug de CETTE locale. Les deux ne doivent pas se confondre.
 *
 * Pourquoi centraliser : sans cela, chaque page reinvente son prefixe `/en`, sa borne
 * de pagination et sa convention de slash final. L ecart ne se voit alors qu en
 * cliquant, c est-a-dire jamais en test automatise.
 *
 * Convention de forme, alignee sur `build.format: 'directory'` d `astro.config.mjs` :
 * un chemin commence par `/`, ne finit JAMAIS par `/` sauf la racine. C est la forme
 * comparable au registre et a l arborescence de `dist/`.
 */
import type { Locale } from '../domaine.ts';

/** §4.2 : « 12 par page ». Ecrit une seule fois, lu partout. */
export const ARTICLES_PAR_PAGE = 12;

/** Les quatre familles d index du §4.2. */
export const FAMILLES = ['categorie', 'tag', 'auteur', 'dossier'] as const;
export type Famille = (typeof FAMILLES)[number];

/**
 * A-42 : le tag est pagine comme la categorie ; auteur et dossier ne le sont pas
 * (la volumetrie du §6 les borne — paginer ce qui tient sur un ecran ajoute des URL a
 * indexer sans rien apporter).
 */
export const FAMILLES_PAGINEES: readonly Famille[] = ['categorie', 'tag'];

/**
 * `recherche` y figure au meme titre que les autres : c est une page du §4.2, emise
 * dans les deux locales, portee au sitemap et pointee par la bascule FR/EN. Ce qui la
 * distingue — elle est la seule autorisee a charger du JavaScript (§5.4) — ne se lit ni
 * ici ni dans le registre : cela se joue dans son gabarit et dans la garde T-09.
 */
export const PAGES_STATIQUES = [
  'a-propos',
  'mentions-legales',
  'coulisses',
  'recherche',
  '404',
] as const;
export type PageStatique = (typeof PAGES_STATIQUES)[number];

export function prefixeLocale(locale: Locale): string {
  return locale === 'fr' ? '' : `/${locale}`;
}

export function autreLocale(locale: Locale): Locale {
  return locale === 'fr' ? 'en' : 'fr';
}

/**
 * Forme canonique d un chemin : sans requete, sans fragment, sans slash final.
 *
 * Ce n est pas de la cosmetique. `Astro.url.pathname` rend `/categorie/x/` en build
 * `directory`, le registre porte `/categorie/x`, et un `href` ecrit a la main peut
 * porter l un ou l autre. Comparer deux formes differentes de la meme page ferait
 * echouer la garde de liens sur un site parfaitement sain — et une garde qui rougit a
 * tort finit desactivee.
 */
export function normaliserChemin(chemin: string): string {
  const sansFragment = chemin.split('#')[0].split('?')[0];
  const sansSlashFinal = sansFragment.replace(/\/+$/, '');
  if (sansSlashFinal === '') return '/';
  return sansSlashFinal.startsWith('/') ? sansSlashFinal : `/${sansSlashFinal}`;
}

export function cheminAccueil(locale: Locale): string {
  return locale === 'fr' ? '/' : prefixeLocale(locale);
}

export function cheminArticle(locale: Locale, slug: string): string {
  return `${prefixeLocale(locale)}/article/${slug}`;
}

export function cheminStatique(locale: Locale, nom: PageStatique): string {
  return `${prefixeLocale(locale)}/${nom}`;
}

/**
 * Index de liste, pagine ou non.
 *
 * La page 1 n a PAS de segment `/page/1` : deux URL pour la meme liste seraient du
 * contenu duplique, et le canonique devrait alors arbitrer entre elles. On n emet donc
 * que la forme courte, et `/page/1` n existe nulle part.
 */
export function cheminIndex(
  locale: Locale,
  famille: Famille,
  slug: string,
  numero = 1,
): string {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error(
      `Numero de page invalide : ${numero}. Une page se numerote a partir de 1, en entier.`,
    );
  }
  if (numero > 1 && !FAMILLES_PAGINEES.includes(famille)) {
    throw new Error(
      `La famille « ${famille} » n est pas paginee (A-42) : demander sa page ${numero} ` +
        'construirait une URL qu aucun build n emet.',
    );
  }
  const base = `${prefixeLocale(locale)}/${famille}/${slug}`;
  return numero === 1 ? base : `${base}/page/${numero}`;
}
