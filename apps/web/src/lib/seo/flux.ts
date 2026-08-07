/**
 * Le flux RSS — §2.1 (« Flux RSS, sitemap, page 404 editorialisee ») et la route
 * `/rss.xml` du §4.2.
 *
 * IL SE CALCULE SUR LE REGISTRE, comme le sitemap et la bascule FR/EN, et pour la meme
 * raison : c est la seule liste qui dise ce que le build a REELLEMENT emis. Un flux qui
 * publierait un lien vers une page non emise enverrait ses lecteurs sur une 404 — et
 * personne ne le verrait, parce qu un flux se lit dans un agregateur, pas dans le site.
 *
 * DEUX FLUX, un par locale : `/rss.xml` et `/en/rss.xml`. Le §4.2 annote `/en/...` de
 * « miroir anglais complet », et un flux unique melangeant les deux langues serait
 * illisible dans un agregateur — `<language>` est une propriete du canal, pas de
 * l item. C est un arbitrage de ce lot, pas une lecture du cahier.
 *
 * AUCUN PLAFOND D ITEMS. Le corpus du §6 est borne a 40 articles francais et 8 anglais ;
 * tronquer le flux a N entrees ferait disparaitre des articles d un flux deja court, et
 * la valeur de N serait un chiffre invente. Si le corpus grandit, la question se
 * repose — elle ne se prejuge pas ici.
 *
 * UN ARTICLE `noindex` SORT DU FLUX. Le cahier ne le dit pas : A-29 ne parle que du
 * sitemap et de la balise. Mais republier dans un flux public un article dont la
 * redaction demande la desindexation contredit l intention du champ, et un flux RSS est
 * lui-meme une source d indexation. Arbitrage de ce lot, exerce par son test.
 */
import type { Article, Locale } from '../domaine.ts';
import { cheminAccueil, cheminArticle } from '../routes/chemins.ts';
import type { Registre } from '../routes/registre.ts';
import { noindexDe } from './indexation.ts';
import { texteXml } from './xml.ts';

/** Le chemin du flux de chaque locale (§4.2 : `/rss.xml`, et son miroir anglais). */
export const CHEMIN_FLUX: Record<Locale, string> = { fr: '/rss.xml', en: '/en/rss.xml' };

export interface EntreeFlux {
  readonly titre: string;
  readonly chemin: string;
  readonly resume: string;
  readonly datePublication: string;
  readonly auteur: string;
  readonly rubrique: string;
}

export interface SourceFlux {
  readonly locale: Locale;
  readonly origine: string;
  readonly nomSite: string;
  readonly description: string;
  readonly entrees: readonly EntreeFlux[];
  /** Date ISO du build : `lastBuildDate` du canal. */
  readonly genereLe: string;
}

/**
 * Une date au format RFC 822, le seul que RSS 2.0 accepte.
 *
 * Rend `null` — et non une date de repli — quand la source est illisible : inventer une
 * date ferait remonter l article en tete des agregateurs, ce qui est pire qu une date
 * absente. `toUTCString()` produit exactement la forme attendue (« Tue, 10 Mar 2026
 * 08:00:00 GMT »).
 */
export function dateRfc822(iso: string): string | null {
  if (iso === '') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toUTCString();
}

/** Les articles publies d une locale, du plus recent au plus ancien (ordre du registre). */
export function entreesFlux(registre: Registre, locale: Locale): EntreeFlux[] {
  return registre
    .articles(locale)
    .filter((article: Article) => !noindexDe({ genre: 'article', locale, article }, article.seo))
    .map((article) => ({
      titre: article.titre,
      chemin: cheminArticle(locale, article.slug),
      resume: article.chapo,
      datePublication: article.datePublication,
      auteur: article.auteur.nom,
      rubrique: article.categorie.nom,
    }));
}

function absolue(chemin: string, origine: string): string {
  return new URL(chemin, origine).href;
}

export function xmlRss(source: SourceFlux): string {
  const lienFlux = absolue(CHEMIN_FLUX[source.locale], source.origine);
  const lienSite = absolue(cheminAccueil(source.locale), source.origine);
  const construitLe = dateRfc822(source.genereLe);

  const items = source.entrees.map((entree) => {
    const lien = absolue(entree.chemin, source.origine);
    const lignes = [
      `      <title>${texteXml(entree.titre)}</title>`,
      `      <link>${texteXml(lien)}</link>`,
      `      <guid isPermaLink="true">${texteXml(lien)}</guid>`,
      `      <description>${texteXml(entree.resume)}</description>`,
      `      <dc:creator>${texteXml(entree.auteur)}</dc:creator>`,
      `      <category>${texteXml(entree.rubrique)}</category>`,
    ];
    const publieLe = dateRfc822(entree.datePublication);
    if (publieLe !== null) lignes.splice(4, 0, `      <pubDate>${texteXml(publieLe)}</pubDate>`);
    return `    <item>\n${lignes.join('\n')}\n    </item>`;
  });

  const canal = [
    `    <title>${texteXml(source.nomSite)}</title>`,
    `    <link>${texteXml(lienSite)}</link>`,
    `    <description>${texteXml(source.description)}</description>`,
    `    <language>${texteXml(source.locale)}</language>`,
    `    <atom:link href="${texteXml(lienFlux)}" rel="self" type="application/rss+xml" />`,
  ];
  if (construitLe !== null) canal.push(`    <lastBuildDate>${texteXml(construitLe)}</lastBuildDate>`);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '  <channel>\n' +
    `${canal.join('\n')}\n` +
    (items.length > 0 ? `${items.join('\n')}\n` : '') +
    '  </channel>\n' +
    '</rss>\n'
  );
}
