/**
 * Les huit types de blocs du §3.6, constates DANS LA SORTIE, LOCALE PAR LOCALE.
 *
 * POURQUOI CE MODULE EXISTE. Jusqu au 2026-08-10, `preuve-rendu.mjs` listait les pages
 * article en lisant `dist/article/` — le repertoire FRANCAIS, ecrit en dur. Mesure du
 * meme jour : « Pages article generees : 2 », quand la sortie en portait TROIS. La page
 * anglaise rendait bien ses huit blocs, mais AUCUN CONTROLE NE L EXIGEAIT : un bloc qui
 * aurait cesse de rendre EN ANGLAIS SEUL laissait la preuve verte, parce qu elle
 * regardait ailleurs. Angle mort ASYMETRIQUE, la meme forme que celui du pied de page
 * ferme le matin meme — un cote couvert, l autre non, et rien ne signalait la difference.
 *
 * CE QUI EST DERIVE, ET D OU. Aucun chemin de page n est ecrit ici. La liste des locales
 * vient de `LOCALES_SITE` (`src/lib/routes/registre.ts`) et la forme de l URL de
 * `cheminArticle` (`src/lib/routes/chemins.ts`) — les deux declarations que le site
 * lui-meme consomme pour EMETTRE ces pages. Une liste de chemins par langue recopiee ici
 * devrait etre modifiee a chaque nouvelle locale, donc serait oubliee : c est exactement
 * ainsi que l anglais est reste hors garde.
 *
 * CE QUE CETTE DERIVATION NE PROUVE PAS, ET QUI LE PROUVE. Deriver le chemin de
 * `cheminArticle` veut dire qu une URL d article MAL FORMEE serait cherchee — et trouvee
 * — au mauvais endroit, sans que ce controle bronche. Ce n est pas son objet : la FORME
 * des routes est gardee par `ROUTES_ATTENDUES` de `corpus-recette.mjs`, ecrit A LA MAIN
 * et confronte a la sortie par `preuve-pagination.mjs`. Ici on derive OU REGARDER, et on
 * controle CE QUI EST RENDU ; l attendu de rendu, lui, ne vient jamais de la sortie.
 *
 * LE CRITERE N EST PAS L EGALITE DES DEUX LOCALES. Le cadrage prevoit moins d articles
 * anglais que francais (§6). Un controle qui exigerait l egalite des volumetries
 * rougirait a tort en permanence, donc serait desarme. Le critere porte sur CE QUI
 * EXISTE : pour chaque article DU BANC, les blocs que le banc lui pose sont exactement
 * ceux que sa page rend. Aucune locale n est jamais comparee a l autre.
 *
 * DEUX FAMILLES D ECARTS, PARCE QU ELLES N ACCUSENT PAS LE MEME COUPABLE :
 *   - `banc` : la locale n a pas de fixture, ou son banc n exerce pas les huit types.
 *     Le controle ne PEUT alors rien dire de ces types dans cette locale, et le dire
 *     serait accuser le site pour un trou du banc.
 *   - `site` : une page ne rend pas un bloc que le banc lui pose, en rend un qu il ne
 *     lui pose pas, ou n existe pas.
 */
import { cheminArticle } from '../src/lib/routes/chemins.ts';

/** Les huit blocs du §3.6, chacun reconnu par la classe que son composant pose. */
export const SIGNATURES = {
  'bloc.texte': 'bloc-texte',
  'bloc.citation': 'bloc-citation',
  'bloc.galerie': 'bloc-galerie',
  'bloc.encadre': 'bloc-encadre',
  'bloc.video': 'bloc-video',
  'bloc.image-legendee': 'bloc-image',
  'bloc.separateur': 'bloc-separateur',
  'bloc.chiffres-cles': 'bloc-chiffres',
};

export const TYPES = Object.keys(SIGNATURES);

/**
 * Les articles que le banc d une locale pose, avec la route que le site leur donnera.
 *
 * Les blocs ne sont PAS dedoublonnes : un article qui pose deux fois `bloc.texte`
 * n exige rien de plus qu une fois, et la comparaison ci-dessous se fait par ensemble.
 * Les garder tels quels evite d avoir a expliquer une liste qui ne ressemble pas a la
 * fixture qu on vient de lire.
 *
 * @param {string} locale
 * @param {{ data?: Array<{ slug: string, contenu?: Array<{ __component: string }> }> }} donnees
 */
export function articlesDuBanc(locale, donnees) {
  return (donnees.data ?? []).map((article) => ({
    slug: article.slug,
    route: cheminArticle(locale, article.slug),
    blocs: (article.contenu ?? []).map((bloc) => bloc.__component),
  }));
}

/**
 * Confronte, locale par locale, ce que le banc pose a ce que la sortie rend.
 *
 * @param {Record<string, null | Array<{ slug: string, route: string, blocs: string[] }>>} bancParLocale
 *        `null` pour une locale du site dont la fixture d articles n existe pas.
 * @param {(route: string) => string | null} lire
 *        Le HTML de la page servie a cette route, ou `null` si la sortie ne la porte pas.
 */
export function inspecterBlocs(bancParLocale, lire) {
  const banc = [];
  const site = [];
  const inspectees = {};

  const locales = Object.keys(bancParLocale);
  if (locales.length === 0) {
    banc.push(
      'aucune locale a inspecter : le controle rendrait vert sur zero page, ce qui ne prouve rien',
    );
    return { banc, site, inspectees };
  }

  for (const locale of locales) {
    const articles = bancParLocale[locale];
    inspectees[locale] = { pages: 0, typesExerces: 0, pagesCompletes: 0 };

    if (articles === null) {
      banc.push(
        `banc « ${locale} » : aucune fixture d articles — le rendu des blocs de cette locale ` +
          'n est garde par rien',
      );
      continue;
    }

    const exerces = new Set(articles.flatMap((article) => article.blocs));
    inspectees[locale].typesExerces = TYPES.filter((type) => exerces.has(type)).length;

    const absentsDuBanc = TYPES.filter((type) => !exerces.has(type));
    if (absentsDuBanc.length > 0) {
      banc.push(
        `banc « ${locale} » : aucun article n exerce ${absentsDuBanc.join(', ')} — ce controle ` +
          'ne peut RIEN dire de ces types dans cette locale',
      );
    }

    const inconnus = [...exerces].filter((type) => !TYPES.includes(type));
    if (inconnus.length > 0) {
      banc.push(
        `banc « ${locale} » : type de bloc sans signature ${inconnus.join(', ')} — soit le §3.6 ` +
          'a bouge, soit la fixture invente un composant',
      );
    }

    for (const article of articles) {
      const html = lire(article.route);
      if (html === null) {
        site.push(`[${locale}] ${article.route} : page absente de la sortie`);
        continue;
      }
      inspectees[locale].pages += 1;

      const poses = new Set(article.blocs.filter((type) => TYPES.includes(type)));
      const rendus = new Set(TYPES.filter((type) => html.includes(SIGNATURES[type])));

      for (const type of TYPES) {
        if (poses.has(type) && !rendus.has(type)) {
          site.push(
            `[${locale}] ${article.route} : le banc pose « ${type} », la page rendue ne le porte pas`,
          );
        }
        if (!poses.has(type) && rendus.has(type)) {
          site.push(
            `[${locale}] ${article.route} : la page rend « ${type} » que le banc ne pose pas`,
          );
        }
      }

      if (rendus.size === TYPES.length) inspectees[locale].pagesCompletes += 1;
    }
  }

  return { banc, site, inspectees };
}
