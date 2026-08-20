/**
 * L ALTERNATIVE DE LA CARTE DE PARTAGE, CONFRONTEE ENTRE LA SOURCE ET LA PAGE CONSTRUITE.
 *
 * ── LE MAILLON QUE PERSONNE NE TENAIT ─────────────────────────────────────────────────
 *
 * `alternativePartage` traverse trois maillons avant d atteindre un lecteur d ecran :
 *
 *   1. la REQUETE le demande            — tenu par `tests/alternative-localisee.test.ts` ;
 *   2. le MAPPING l applique            — tenu par le meme fichier, dans les deux sens ;
 *   3. le GABARIT le sert               — TENU PAR PERSONNE jusqu au 2026-08-20.
 *
 * Le troisieme ne s importe pas : `src/layouts/Base.astro` n est instanciable par aucun
 * test de ce depot. Le reflexe qui a suivi — rejouer sa cascade a la main dans un test
 * (`tests/banc-surcharge-partage-en.test.ts`) — reconduit le trou d un cran : la copie
 * atteste le raisonnement du test, plus celui du gabarit. Elle DIVERGEAIT deja de lui au
 * bout de deux jours (`url: seo.imagePartage.url` la ou le gabarit ecrit
 * `urlMedia(seo.imagePartage)`).
 *
 * ── CE QUE CE MODULE FAIT A LA PLACE ──────────────────────────────────────────────────
 *
 * Il ne connait rien du gabarit. Il compare deux choses qui existent SANS lui :
 *
 *   - ce que la SOURCE pose — lu par `mapperArticle`, la fonction meme que le site
 *     appelle. La regle « une surcharge blanche ne remplace rien » et la priorite de
 *     `alternativePartage` sur l `alternativeText` de la mediatheque ne sont donc pas
 *     recopiees ici : elles sont LUES la ou elles vivent ;
 *   - ce que le HTML CONSTRUIT sert, dans `og:image:alt` et `twitter:image:alt`.
 *
 * Reecrire le gabarit ne peut donc pas le rendre faussement vert : seule compte la valeur
 * qui sort. C est `scripts/preuve-rendu.mjs` qui lui fournit le HTML, apres un
 * `npm run build` reel — sur le banc par defaut, sur l instance avec `--reel`.
 *
 * ── LE PERIMETRE, ET POURQUOI IL S ARRETE LA ──────────────────────────────────────────
 *
 * Seuls les articles dont la SOURCE pose une carte de partage sont juges. Un article qui
 * n en pose pas recoit la carte GENEREE au build (§4.5), dont l alternative ne vient pas
 * de la source mais de `texteAlternatifOg` : la juger ici obligerait a reconstruire ses
 * cinq arguments comme le gabarit les assemble — soit a rejouer la cascade, le defaut
 * qu on corrige. Ces articles sont COMPTES (`sansCarte`), jamais sautes en silence.
 *
 * ── CE QU IL NE PROUVE PAS ────────────────────────────────────────────────────────────
 *
 * L attendu passe par `mapperArticle` : un defaut DANS LE MAPPING deplacerait les deux
 * cotes ensemble, et ce controle resterait vert. Assume — ce maillon-la est le 2, et il a
 * son harnais. Ce module ferme le 3, et lui seul.
 *
 * ── OU CETTE VALEUR SORT, ET OU ELLE NE SORT PAS — MESURE, PAS SUPPOSE ────────────────
 *
 * Le mode d echec du Lot 1 du Rucher est de verifier le HTML et de croire que le reste
 * suit. Releve le 2026-08-20 sur le `dist/` du banc (24 pages, commit `0c087a1`) :
 *
 *   - `og:image:alt` et `twitter:image:alt` — les DEUX seules sorties de cette valeur,
 *     et les deux sont jugees ici ;
 *   - JSON-LD : `ImageJsonLd` (`src/lib/seo/donnees-structurees.ts`) ne porte que
 *     `url`/`width`/`height`. AUCUN texte alternatif n y transite — ni francais ni
 *     anglais. Et l image d un `Article` y est l imageCouverture, pas la carte de partage.
 *     Rien a propager, donc rien a garder ;
 *   - sitemaps : `grep -c image` rend 0 sur les 7 fichiers de `dist/*.xml`. Le sitemap
 *     n a pas d extension image ;
 *   - `rss.xml` : ni `<image>`, ni `enclosure`, ni `media:content`.
 *
 * Poser ici une garde sur le JSON-LD ou le sitemap serait une garde ecrite pour une
 * surface qui n existe pas. Ce qui la rendrait necessaire — un `caption` ajoute a
 * `ImageObject` — se verra a la revue du module qui l ajoutera.
 */
import { mapperArticle } from '../src/lib/strapi/mapping.ts';
import { cheminArticle } from '../src/lib/routes/chemins.ts';
import { meta } from './preuve-surcharge-seo.mjs';

/**
 * Les cartes de partage que la SOURCE pose pour une locale, avec l alternative attendue.
 *
 * `sansCarte` compte les articles que la source livre SANS carte : ceux que le controle ne
 * juge pas. Il sort d ici parce qu il ne se lit qu ICI — le rapport, lui, ne voit plus les
 * entrees brutes. Le taire ferait passer « rien a juger » pour « tout est conforme ».
 *
 * @param {string} locale
 * @param {unknown[] | null} entrees  Les entrees brutes de la source (fixtures ou instance).
 * @returns {{ posees: Array<{ slug: string, route: string, attendu: string | null,
 *             origine: 'surcharge' | 'mediatheque' | null, incapacite?: string }>,
 *            sansCarte: number }}
 */
export function cartesPoseesParLaSource(locale, entrees) {
  const posees = [];
  let sansCarte = 0;
  for (const brute of entrees ?? []) {
    /* UNE ENTREE ILLISIBLE NE FAIT PAS TOMBER LE RAPPORT. `mapperArticle` leve sur une
       donnee inattendue : sur la cible `--reel`, une seule entree malformee emporterait
       les controles de toutes les autres. Elle se nomme et se compte, comme le reste. */
    let article = null;
    try {
      article = mapperArticle(brute);
    } catch (erreur) {
      const nom = typeof brute?.slug === 'string' ? brute.slug : '(slug illisible)';
      posees.push({
        slug: nom,
        route: cheminArticle(locale, nom),
        attendu: null,
        origine: null,
        incapacite: `${locale} — ${nom} : la source est illisible (${erreur.message})`,
      });
      continue;
    }

    const carte = article.seo?.imagePartage ?? null;
    if (carte === null) {
      sansCarte += 1;
      continue;
    }

    /* L ORIGINE EST DERIVEE DE LA DONNEE, pas de la regle. `mapperArticle` a deja tranche
       (surcharge blanche = pas de surcharge) : on lit son verdict en comparant la valeur
       retenue a l `alternativeText` brut du media. C est la seule facon de nommer
       l origine sans reecrire la regle qui la decide. */
    const brut = typeof brute?.seo?.imagePartage?.alternativeText === 'string'
      ? brute.seo.imagePartage.alternativeText
      : null;

    posees.push({
      slug: article.slug,
      route: cheminArticle(locale, article.slug),
      attendu: carte.alternative,
      origine: carte.alternative !== null && carte.alternative !== brut ? 'surcharge' : 'mediatheque',
    });
  }
  return { posees, sansCarte };
}

/**
 * Confronte, locale par locale, l alternative posee par la source a celle que la page sert.
 *
 * @param {Record<string, ReturnType<typeof cartesPoseesParLaSource> | null>} poseesParLocale
 * @param {(route: string) => string | null} lire  Le HTML servi a cette route, `null` si absente.
 */
export function inspecterAlternativesPartage(poseesParLocale, lire) {
  const ecarts = [];
  const incapacites = [];
  const parLocale = {};
  let controles = 0;
  let sansCarte = 0;

  for (const [locale, cartes] of Object.entries(poseesParLocale)) {
    parLocale[locale] = [];
    if (cartes === null || cartes === undefined) continue;
    sansCarte += cartes.sansCarte;

    for (const posee of cartes.posees) {
      if (posee.incapacite !== undefined) {
        incapacites.push(posee.incapacite);
        continue;
      }

      const html = lire(posee.route);
      if (html === null) {
        ecarts.push(`${locale} — ${posee.route} : page absente de la sortie, rien n a pu etre lu`);
        continue;
      }

      controles += 1;
      parLocale[locale].push(posee);

      const cite = (valeur) => (valeur === null ? 'RIEN' : `« ${valeur} »`);
      const ogAlt = meta(html, 'property', 'og:image:alt');
      const twAlt = meta(html, 'name', 'twitter:image:alt');

      if (ogAlt !== posee.attendu) {
        ecarts.push(
          `${locale} — ${posee.route} : og:image:alt sert ${cite(ogAlt)} au lieu de ` +
            `${cite(posee.attendu)}, que la source pose (${posee.origine})`,
        );
        continue;
      }

      /* Les deux reseaux ne lisent pas la meme balise : les laisser diverger fait servir
         deux textes selon le reseau. Meme regle que `preuve-surcharge-seo.mjs`. */
      if (twAlt !== ogAlt) {
        ecarts.push(
          `${locale} — ${posee.route} : twitter:image:alt (${cite(twAlt)}) DIVERGE de ` +
            `og:image:alt (${cite(ogAlt)})`,
        );
      }
    }
  }

  return {
    ecarts,
    incapacites,
    controles,
    sansCarte,
    /**
     * Combien de cartes SURCHARGEES ont ete jugees HORS de la locale de reference.
     *
     * C est le compte qui dit si la preuve prouve quelque chose : une surcharge n existe
     * que pour les locales qui ne sont pas celle du fichier de la mediatheque. Sans une
     * seule, « la surcharge est honoree » et « la surcharge est ignoree » rendent la meme
     * sortie — c est le trou aval qui a laisse vivre le defaut du 2026-08-14.
     */
    surchargesHorsReference(localeReference) {
      return Object.entries(parLocale)
        .filter(([locale]) => locale !== localeReference)
        .reduce((total, [, posees]) => total + posees.filter((p) => p.origine === 'surcharge').length, 0);
    },
  };
}
