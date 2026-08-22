/**
 * LE COMPTE D EPISODES D UN DOSSIER, CONFRONTE ENTRE LA SOURCE ET LA PAGE CONSTRUITE.
 *
 * ── LA FORME QUI N AVAIT JAMAIS ETE RENDUE ────────────────────────────────────────────
 *
 * `compteDeLIndex` (`src/lib/routes/compte-index.ts`) produit TROIS formes : rien a zero,
 * le singulier a un, le pluriel au-dela. Le commit `2761336` a prouve le SINGULIER dans
 * le HTML — quatre fragments, page de dossier et carte d accueil, les deux locales. Les
 * deux autres formes n avaient jamais ete vues ailleurs que dans une assertion d unite,
 * parce qu aucun dossier du banc n avait plus d un article.
 *
 * Sur trois formes, une seule etait couverte — et c est la moins risquee : au singulier,
 * une substitution de mot sort en toutes lettres dans les deux langues. Le PLURIEL est la
 * forme ou une regle d accord se perd sans bruit.
 *
 * ── CE MODULE NE LIT PAS `libelles.ts`, ET C EST TOUT SON INTERET ─────────────────────
 *
 * Un controle qui derive son attendu de ce qu il controle ne controle rien
 * (`preuve-rendu.mjs`, la meme phrase, a propos de la Configuration de reference). S il
 * s adossait au compte du site ou au dictionnaire `nombreEpisodes`, casser le libelle
 * pluriel deplacerait LES DEUX COTES ensemble : le controle resterait vert sur un site
 * qui s est mis a dire autre chose. C est la recette qui fabrique les deux cotes de sa
 * propre comparaison.
 *
 * Les quatre formes sont donc RECOPIEES ci-dessous. La recopie est assumee, comme celle
 * de la partition d attributs de `tests/fixtures-locales.test.ts` : elle est le prix d un
 * attendu independant. Elle ne peut pas se refermer en silence sur l original —
 * `tests/compte-episodes-servi.test.ts` lit CE FICHIER et rougit s il se met a importer
 * l un ou l autre.
 *
 * Ce qui est recopie est le MOT, jamais la regle de choix : le module ne sait pas que le
 * pluriel commence a deux parce que le site le dit, il le tient de la grammaire.
 *
 * ── LE CAS A ZERO : CE QUE LA PRODUCTION MONTRE, ET RIEN DE PLUS ──────────────────────
 *
 * Le registre n emet PAS d index vide (§10.3 du plan editorial). Forcer la construction
 * d une page de dossier vide pour la juger reviendrait a controler un chemin que la
 * production n emprunte jamais — un vert sur du code mort.
 *
 * Ce qui est juge a la place est le fait OBSERVABLE que la production produit vraiment :
 * un dossier sans article n a AUCUNE page dans la sortie, et AUCUNE carte sur l accueil.
 * C est la contrepartie du `null` rendu par `compteDeLIndex`, vue du dehors.
 *
 * CE QUE CELA NE PROUVE PAS, et il faut le lire tel quel : que `compteDeLIndex` rend
 * `null` a zero (tenu par l unite), et qu un index vide qui SERAIT emis un jour ne
 * rendrait pas un `<p>` muet (tenu par la garde de source du gabarit, dans
 * `tests/compte-index.test.ts`). Ces deux-la restent hors du HTML, faute de HTML.
 *
 * ── LE TOTAL VIENT DE LA SOURCE, PAS DE LA PAGE ───────────────────────────────────────
 *
 * Le nombre attendu est l intersection de la relation `articles` du dossier avec les
 * articles que la source rend pour cette locale — la meme intersection que
 * `articlesDeDossier` (`registre.ts`), refaite ici sur les entrees brutes. Un article
 * reference mais absent du corpus ne rend aucune page : le compter ferait accuser le site
 * d un compte qu il a juste.
 */
import { cheminIndex, prefixeLocale } from '../src/lib/routes/chemins.ts';

/**
 * LES QUATRE FORMES, RECOPIEES A DESSEIN. Voir l en-tete : c est ce qui permet a ce
 * controle de rougir quand le site change de mot, au lieu de changer de mot avec lui.
 */
export const FORMES = {
  fr: { singulier: 'épisode', pluriel: 'épisodes' },
  en: { singulier: 'episode', pluriel: 'episodes' },
};

/**
 * Comparer deux chaines accentuees sans se faire piéger par la composition Unicode.
 *
 * « é » s ecrit U+00E9 ou U+0065 U+0301 : deux suites d octets differentes pour le meme
 * caractere a l ecran. Un ecart fabrique par une normalisation enverrait chercher un
 * defaut de libelle la ou il n y a qu une forme de codage.
 */
function normaliser(texte) {
  return texte.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Le texte du paragraphe de compte d une page d index, ou `null` s il n y en a pas. */
export function compteServiParLIndex(html) {
  const trouve = html.match(/<p class="index__compte"[^>]*>([^<]*)<\/p>/);
  return trouve === null ? null : normaliser(trouve[1]);
}

/**
 * Les cartes de dossier de l accueil, indexees par la ROUTE qu elles pointent.
 *
 * `null` — et non un objet vide — quand la liste elle-meme est absente : l accueil d une
 * locale sans aucun dossier emis n a pas de `<ul>`, et ce n est pas la meme chose qu un
 * accueil qu on n a pas su lire. L appelant distingue les deux.
 */
export function cartesDeLAccueil(html) {
  const bloc = html.match(/<ul class="accueil__dossiers"[^>]*>([\s\S]*?)<\/ul>/);
  if (bloc === null) return {};
  const cartes = {};
  for (const item of bloc[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
    const route = item[1].match(/<a\s[^>]*href="([^"]*)"/);
    if (route === null) continue;
    const compte = item[1].match(/<p[^>]*>([^<]*)<\/p>/);
    cartes[route[1]] = compte === null ? null : normaliser(compte[1]);
  }
  return cartes;
}

/**
 * Ce que la source pose pour une locale : un attendu par dossier, et les incapacites.
 *
 * @param {string} locale
 * @param {unknown[] | null} dossiers  Les entrees brutes de dossiers (fixtures ou instance).
 * @param {unknown[] | null} articles  Les entrees brutes d articles de la MEME locale.
 * @returns {{ poses: Array<{ slug: string, route: string, total: number,
 *             attendu: string | null }>, incapacites: string[] }}
 */
export function dossiersPosesParLaSource(locale, dossiers, articles) {
  const formes = FORMES[locale];
  const poses = [];
  const incapacites = [];

  if (formes === undefined) {
    return {
      poses,
      incapacites: [
        `${locale} : aucune forme attendue n est declaree pour cette locale — ce controle ` +
          'ne peut rien dire de ses dossiers (ajoute-la a FORMES, en la RECOPIANT)',
      ],
    };
  }

  const connus = new Set(
    (articles ?? []).map((entree) => entree?.documentId).filter((id) => typeof id === 'string'),
  );

  for (const brut of dossiers ?? []) {
    const slug = typeof brut?.slug === 'string' ? brut.slug : '(slug illisible)';

    /* UNE RELATION NON PEUPLEE N EST PAS UN DOSSIER VIDE. Les confondre ferait exiger
       l ABSENCE d une page qui doit peut-etre exister — une accusation fabriquee par un
       populate manquant, pas par le site. */
    if (!Array.isArray(brut?.articles)) {
      incapacites.push(
        `${locale} — ${slug} : la relation « articles » n est pas peuplee a la source, ` +
          'le compte attendu est inconnu',
      );
      continue;
    }

    const total = brut.articles.filter((reference) => connus.has(reference?.documentId)).length;

    poses.push({
      slug,
      route: cheminIndex(locale, 'dossier', slug),
      total,
      attendu: total < 1 ? null : `${total} ${total > 1 ? formes.pluriel : formes.singulier}`,
    });
  }

  return { poses, incapacites };
}

/**
 * Confronte, locale par locale, le compte pose par la source a celui que les pages servent.
 *
 * Les DEUX surfaces sont jugees : la page du dossier et la carte de l accueil. Ne juger
 * que la premiere laisserait passer le defaut du 2026-08-20 — la carte disait « 1 article »
 * quand la page du meme dossier, a un clic, disait « 1 épisode ».
 *
 * @param {Record<string, ReturnType<typeof dossiersPosesParLaSource> | null>} posesParLocale
 * @param {(route: string) => string | null} lire  Le HTML servi a une route, `null` si absente.
 */
export function inspecterComptesEpisodes(posesParLocale, lire) {
  const ecarts = [];
  const incapacites = [];
  const exerces = { singulier: 0, pluriel: 0 };
  let controles = 0;
  let vides = 0;

  for (const [locale, poses] of Object.entries(posesParLocale)) {
    if (poses === null || poses === undefined) continue;
    incapacites.push(...poses.incapacites);
    if (poses.poses.length === 0) continue;

    /* L accueil est lu UNE fois par locale : c est la meme page pour tous ses dossiers. */
    const routeAccueil = prefixeLocale(locale);
    const htmlAccueil = lire(routeAccueil);
    const cartes = htmlAccueil === null ? null : cartesDeLAccueil(htmlAccueil);
    if (cartes === null) {
      incapacites.push(
        `${locale} — l accueil « ${routeAccueil || '/'} » est absent de la sortie : les ` +
          'cartes de dossier n ont pas pu etre lues',
      );
    }

    for (const pose of poses.poses) {
      const html = lire(pose.route);
      const carte = cartes === null ? undefined : cartes[pose.route];

      /* ── LE CAS A ZERO, tel que la production le montre : rien, nulle part. ── */
      if (pose.attendu === null) {
        vides += 1;
        if (html !== null) {
          ecarts.push(
            `${locale} — ${pose.route} : le dossier est VIDE a la source et sa page a ` +
              'pourtant ete emise (§10.3 : le registre n emet pas d index vide)',
          );
        }
        if (carte !== undefined) {
          ecarts.push(
            `${locale} — accueil : le dossier VIDE « ${pose.slug} » porte une carte ` +
              `(${carte === null ? 'sans compte' : `« ${carte} »`}), il ne devrait pas y figurer`,
          );
        }
        continue;
      }

      if (html === null) {
        ecarts.push(
          `${locale} — ${pose.route} : page absente de la sortie alors que le dossier ` +
            `porte ${pose.total} article(s), rien n a pu etre lu`,
        );
        continue;
      }

      controles += 1;
      exerces[pose.total > 1 ? 'pluriel' : 'singulier'] += 1;

      const servi = compteServiParLIndex(html);
      if (servi !== normaliser(pose.attendu)) {
        ecarts.push(
          `${locale} — ${pose.route} : la page du dossier sert ` +
            `${servi === null ? 'AUCUN compte' : `« ${servi} »`} au lieu de ` +
            `« ${pose.attendu} », que la source pose (${pose.total} article(s))`,
        );
      }

      if (cartes === null) continue;
      if (carte === undefined) {
        ecarts.push(
          `${locale} — accueil : aucune carte pour le dossier « ${pose.slug} », qui porte ` +
            `${pose.total} article(s) et devrait y annoncer « ${pose.attendu} »`,
        );
        continue;
      }
      if (carte !== normaliser(pose.attendu)) {
        ecarts.push(
          `${locale} — accueil : la carte du dossier « ${pose.slug} » compte ` +
            `${carte === null ? 'RIEN' : `« ${carte} »`} au lieu de « ${pose.attendu} », ` +
            'que sert la page du dossier',
        );
      }
    }
  }

  return { ecarts, incapacites, controles, vides, exerces };
}
