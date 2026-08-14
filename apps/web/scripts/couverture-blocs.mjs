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
import { ISSUES } from './issues.mjs';

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
 * @param {string} [poseur]
 *        Comment NOMMER ce qui pose les blocs, dans les messages de la famille `banc`.
 *        Depuis le 2026-08-12 la preuve sait viser l instance reelle : ecrire « banc »
 *        en dur ferait dire « banc « fr » : aucun article n exerce bloc.video » a un run
 *        qui vient d interroger `echoback.ayfiweb.fr`, et enverrait chercher une fixture
 *        qui n a rien a voir. Le defaut reste « banc » : c est la cible par defaut.
 */
export function inspecterBlocs(bancParLocale, lire, poseur = 'le banc') {
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
    inspectees[locale] = { pages: 0, typesExerces: 0, sansPorteur: [], pagesCompletes: 0 };

    if (articles === null) {
      banc.push(
        `${poseur} « ${locale} » : aucun article rendu — le rendu des blocs de cette locale ` +
          'n est garde par rien',
      );
      continue;
    }

    const exerces = new Set(articles.flatMap((article) => article.blocs));

    /**
     * Les types du §3.6 que ce corpus exerce REELLEMENT — le denominateur de
     * `pagesCompletes`, et la raison pour laquelle il n est pas ecrit en dur.
     *
     * Le controle 13 du §11 (avenant A11) demande qu une page rende les types AYANT UN
     * PORTEUR, pas les huit du modele. `bloc.video` n en a plus aucun depuis l avenant A5 :
     * comparer a `TYPES.length` faisait imprimer « 0 page(s) rendant les 8 » alors que
     * deux pages rendaient les sept disponibles — un chiffre juste sur son propre enonce,
     * et inconciliable avec un controle vert.
     *
     * Le figer a 7 aurait deplace le defaut d un cran : le jour ou un fichier video a
     * licence maitrisee entre au corpus, le compte redeviendrait faux, en silence. On
     * derive donc du corpus, locale par locale — la meme valeur que `typesExerces`.
     */
    const avecPorteur = TYPES.filter((type) => exerces.has(type));
    inspectees[locale].typesExerces = avecPorteur.length;

    const absentsDuBanc = TYPES.filter((type) => !exerces.has(type));
    inspectees[locale].sansPorteur = absentsDuBanc;
    if (absentsDuBanc.length > 0) {
      banc.push(
        `${poseur} « ${locale} » : aucun article n exerce ${absentsDuBanc.join(', ')} — ce controle ` +
          'ne peut RIEN dire de ces types dans cette locale',
      );
    }

    const inconnus = [...exerces].filter((type) => !TYPES.includes(type));
    if (inconnus.length > 0) {
      banc.push(
        `${poseur} « ${locale} » : type de bloc sans signature ${inconnus.join(', ')} — soit le §3.6 ` +
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
            `[${locale}] ${article.route} : ${poseur} pose « ${type} », la page rendue ne le porte pas`,
          );
        }
        if (!poses.has(type) && rendus.has(type)) {
          site.push(
            `[${locale}] ${article.route} : la page rend « ${type} » que ${poseur} ne pose pas`,
          );
        }
      }

      // Une page « complete » porte a elle seule TOUS les types disponibles. La garde
      // `length > 0` evite qu un corpus qui n exerce rien fasse passer chaque page vide
      // pour complete — `every` sur un ensemble vide est vrai.
      if (avecPorteur.length > 0 && avecPorteur.every((type) => rendus.has(type))) {
        inspectees[locale].pagesCompletes += 1;
      }
    }
  }

  return { banc, site, inspectees };
}

/**
 * LE CONTROLE 13 du §11 du plan editorial, rendu comme un VERDICT et non comme un chiffre.
 *
 * L avenant A11 (ratifie le 2026-08-14, decision `b5ef48c3`) exige qu AU MOINS UNE page
 * article rendue affiche les types de blocs ayant un porteur au corpus. Jusqu ici le
 * compte n existait que dans un `console.log` de `preuve-rendu.mjs` : la preuve ne
 * rougissait pas, elle mentait par omission — elle imprimait « 0 page(s) rendant les 8 »
 * a l instant meme ou deux pages rendaient les sept types disponibles.
 *
 * POURQUOI CETTE DECISION VIT ICI, ET PAS DANS LE SCRIPT. Un `process.exit` enfoui au
 * milieu d un script qui construit le site ne se prouve qu en cassant le corpus et en
 * relancant un build — donc ne se prouve jamais. Isolee, la regle s exerce dans les deux
 * sens en quelques millisecondes, ce que fait la section 8 de `tests/couverture-blocs.test.ts`.
 *
 * « AU MOINS UNE PAGE », PAS « UNE PAR LOCALE » : c est la lettre du controle 13, et le
 * compte se totalise donc sur toutes les locales. Durcir en exigeant une page par locale
 * irait au-dela de ce qu Aymeric a ratifie.
 *
 * ZERO LOCALE INSPECTEE N EST PAS VERT. Un `inspectees` vide donnerait un total de 0, qui
 * doit rendre le meme rouge que « zero page complete » : dans les deux cas, rien ne
 * demontre que le corpus porte encore une page vitrine. Rendre vert sur zero page est le
 * defaut que `inspecterBlocs` refuse deja pour les locales.
 *
 * @param {Record<string, { pagesCompletes: number } | undefined>} inspectees
 *        Le champ `inspectees` rendu par `inspecterBlocs`.
 * @returns {{ pagesCompletes: number, issue: number }}
 */
export function verdictPageComplete(inspectees) {
  const pagesCompletes = Object.values(inspectees).reduce(
    (total, compte) => total + (compte?.pagesCompletes ?? 0),
    0,
  );
  return {
    pagesCompletes,
    issue: pagesCompletes > 0 ? ISSUES.CONFORME : ISSUES.ANOMALIE,
  };
}
