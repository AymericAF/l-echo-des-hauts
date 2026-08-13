/**
 * CE QUE LA PAGE DE MENTIONS LEGALES DOIT PORTER — une table, deux points de lecture.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure et non suppose (decision `ed69d5bf`, branche A).
 * Deux textes de mentions legales coexistaient sur ce site, et AUCUN SEGMENT ne leur etait
 * commun : le texte en dur de `PageMentions.astro` portait l editeur, le directeur de la
 * publication, le contact et l hebergeur ; le champ Strapi `configuration.mentionsLegales`
 * — requis par le mapping, demande au populate, seede dans les deux locales — portait la
 * provenance des images et la clause de non-diffamation, et n etait rendu par AUCUN
 * composant. Les deux copies avaient DEJA diverge : elles n ont pas attendu.
 *
 * Depuis l arbitrage, le CHAMP fait foi et le texte en dur a disparu. Ce fichier est ce
 * qui empeche la double source de revenir : il enumere les huit clauses de la comparaison
 * mot a mot, dit LAQUELLE est obligatoire et POURQUOI, et se lit
 *
 *   - sur le CHAMP (le seed versionne, la fixture du Strapi de substitution) ;
 *   - sur la PAGE RENDUE (`dist/`), la seule sortie que le lecteur voie.
 *
 * IL NE JUGE PAS LA VERITE DES FAITS. Qu Aymeric Filliot soit entrepreneur individuel a
 * cette adresse, qu HOSTINGER INTERNATIONAL LTD facture bien ce VPS : aucune machine ne
 * peut le constater, et ce fichier ne pretend pas le faire. Il constate qu AUCUNE mention
 * ne DISPARAIT — ce qui est exactement le defaut qui s est produit.
 *
 * POURQUOI CE FICHIER NE S APPELLE PAS `verifier-mentions-legales.mjs`, et ce que cela
 * coute — ecrit plutot que tu. Un `verifier-*.mjs` entre d office dans deux dispositifs :
 * la boucle derivee du job `sortie` (`scripts/verificateurs-de-sortie.mjs`) et le tableau
 * de `tests/verificateurs-incapacite.test.ts`. Or leur convention suppose un objet unique,
 * `dist/`, et un cas « objet legitimement absent » qui doit rester VERT. Ici, ni l un ni
 * l autre : cette garde juge AUSSI le champ (seed, fixture), et une page de mentions
 * legales absente n est jamais legitime — elle rend `2`, jamais `0`. La convention des
 * trois issues est donc tenue et PROUVEE dans les trois sens par
 * `tests/mentions-legales.test.ts` (conforme, anomalie, incapacite), sans etre empruntee
 * a un tableau qui decrirait mal cet objet. La garde s execute depuis
 * `scripts/preuve-rendu.mjs`, c est-a-dire sur un BUILD REEL, dans le job `sortie`.
 *
 * LES MOTIFS SONT DES CITATIONS, PAS DES RESUMES. Chacun reprend le texte servi mot pour
 * mot. Un motif large (« HOSTINGER ») resterait vert sur un texte tronque ou reformule,
 * c est-a-dire sur le mode d echec meme qu on ferme : une garde qui accepte une
 * paraphrase autorise la paraphrase, et un fait juridique paraphrase est un fait
 * juridique perdu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES } from './issues.mjs';
import { cheminStatique } from '../src/lib/routes/chemins.ts';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';

/* ------------------------------------------------------------------ */
/* Normalisation — un seul texte comparable, quelle que soit sa forme  */
/* ------------------------------------------------------------------ */

/**
 * Le texte legal, ramene a la forme sous laquelle il se compare.
 *
 * Trois sources doivent rendre la MEME chaine : le Markdown du seed, les noeuds Blocks de
 * la fixture, et le HTML de la page construite. Sans cela, il faudrait trois tables de
 * motifs — donc trois occasions de diverger, ce qui est le defaut qu on ferme.
 *
 * L espace avant une virgule ou un point est SUPPRIME : `<strong>gras</strong>, suite`
 * devient « gras , suite » des que les balises sont remplacees par une espace, et le motif
 * cite du texte francais correct. Aucune ponctuation francaise ne prend d espace avant une
 * virgule ou un point ; « : », « ; », « ! », « ? » et « » » gardent la leur, intacte.
 */
export function normaliserTexteLegal(source) {
  return String(source)
    /* Les balises d abord, les entites ensuite : decoder `&lt;` avant fabriquerait de
       fausses balises que l etape suivante mangerait. */
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    /* Markdown : un lien rend son TEXTE (l adresse de contact s y lit deux fois), les
       titres perdent leurs dieses, le gras et l italique leurs etoiles. */
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    /* L apostrophe typographique et l apostrophe droite designent le meme caractere pour
       un lecteur : `libelles.ts` ecrit « L’Écho », le seed « L'Écho ». Une garde qui les
       distingue rougit sur une difference que personne ne voit. */
    .replace(/[’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

/**
 * Le texte d un champ « Rich text (Blocks) » de Strapi 5.
 *
 * La separation est posee ENTRE LES BLOCS et jamais entre les feuilles d un meme
 * paragraphe : `["Tous les visuels sont des ", "œuvres du projet", ", générées…"]` doit se
 * recoller sans espace parasite, sinon le motif cite du texte qui n existe nulle part.
 */
export function texteDesBlocks(noeuds) {
  const morceaux = [];
  const parcourir = (noeud) => {
    if (Array.isArray(noeud)) {
      noeud.forEach(parcourir);
      return;
    }
    if (!noeud || typeof noeud !== 'object') return;
    if (typeof noeud.text === 'string') morceaux.push(noeud.text);
    if (Array.isArray(noeud.children)) parcourir(noeud.children);
  };
  for (const bloc of Array.isArray(noeuds) ? noeuds : []) {
    parcourir(bloc);
    morceaux.push('\n');
  }
  return normaliserTexteLegal(morceaux.join(''));
}

/* ------------------------------------------------------------------ */
/* La table                                                            */
/* ------------------------------------------------------------------ */

/**
 * L entite d hebergement, confirmee SUR LA FACTURE le 2026-08-07 (result de `dd9b814a`).
 *
 * LE PAYS SUIT LA LANGUE DE LA PAGE, LE RESTE DE L ADRESSE NON — arbitrage tranche au
 * train du 2026-08-12, entre deux decisions ecrites qui se contredisaient :
 *
 *   - `66d139e` (2026-08-11 20:37) posait cette garde avec « adresse legale, ne se
 *     traduit pas », et codait « Larnaca, Chypre » pour les DEUX locales.
 *   - `301f9cb` (2026-08-11 23:46), TROIS HEURES PLUS TARD, corrigeait l inverse dans
 *     le composant : « Chypre » sortait tel quel sur la page anglaise (tache `ba63557e`),
 *     et distinguait explicitement « le PAYS se traduit ; la raison sociale et la rue,
 *     non — ce sont des noms propres qui identifient une entite juridique ».
 *
 * La plus recente l emporte, l ordre etant etabli par deux horodatages de commit et non
 * par l ordre de lecture. Les deux intentions sont d ailleurs conciliables : ce que
 * `66d139e` protegeait est l identite juridique et l adresse postale — elles restent
 * intactes ci-dessous. Seul le nom du pays suit la locale.
 */
const HEBERGEUR_ADRESSE = 'HOSTINGER INTERNATIONAL LTD, 61 Lordou Vironos Street, 6023 Larnaca';
const PAYS_HEBERGEUR = { fr: 'Chypre', en: 'Cyprus' };

/**
 * LES HUIT CLAUSES DE LA COMPARAISON, moins la date — qui vit dans le composant.
 *
 * `obligatoire` distingue ce que la loi impose de ce que le projet s impose. Les deux sont
 * exigees, et le drapeau ne relache rien : il dit ce qu on perd. Une clause obligatoire
 * absente est une infraction ; une clause de projet absente est une protection perdue
 * (le risque R5 du brief, pour la provenance des images).
 *
 * `source` nomme d ou vient la redaction. Une garde qui exige un texte sans dire d ou il
 * sort est une opinion : le jour ou quelqu un veut la modifier, il n a rien a relire.
 */
export const MENTIONS_DU_CHAMP = {
  fr: [
    {
      cle: 'nature-fictive',
      intitule: 'le site declare qu il n est pas un media reel',
      source: 'comparaison (1) — champ Strapi, hypothese 4 du brief §3',
      obligatoire: false,
      motif: /« L'Écho des Hauts » n'existe pas\./,
    },
    {
      cle: 'pas-service-de-presse',
      intitule: 'la clause de qualification : ce n est pas un service de presse en ligne',
      source: "comparaison (1) — n existait QUE dans libelles.ts (mediaFictifTexte)",
      obligatoire: false,
      motif: /ne constitue en aucun cas un service de presse en ligne\./,
    },
    {
      cle: 'aucune-personne-reelle',
      intitule: 'la clause de non-diffamation et de droit a l image',
      source: 'comparaison (1) — n existait QUE dans le champ Strapi',
      obligatoire: false,
      motif: /Aucune personne réelle identifiable n'est nommée, citée ni photographiée/,
    },
    {
      cle: 'images-provenance',
      intitule: 'la provenance et la licence des visuels',
      source: 'comparaison (2) — parade ecrite au risque R5 du brief §6',
      obligatoire: false,
      motif: /Tous les visuels sont des œuvres du projet, générées ou composées pour ce démonstrateur\./,
    },
    {
      cle: 'editeur-raison-sociale',
      intitule: "la raison sociale de l editeur, forme juridique comprise",
      source: 'comparaison (3) — LCEN art. 6 III 1°',
      obligatoire: true,
      motif: /Monsieur Aymeric Filliot EI/,
    },
    {
      cle: 'editeur-adresse',
      intitule: 'l adresse du siege de l editeur',
      source: 'comparaison (4) — LCEN art. 6 III 1°',
      obligatoire: true,
      motif: /230 rue Eloi Morel, 80000 Amiens/,
    },
    {
      cle: 'directeur-publication',
      intitule: 'le directeur de la publication',
      source: 'comparaison (5) — LCEN art. 6 III 1°',
      obligatoire: true,
      motif: /Directeur de la publication : Aymeric Filliot\./,
    },
    {
      cle: 'contact',
      intitule: 'l adresse de contact de l editeur',
      source: 'comparaison (6) — LCEN art. 6 III 1°',
      obligatoire: true,
      motif: /contact@echo\.ayfiweb\.fr/,
    },
    {
      cle: 'hebergeur',
      intitule: "le nom, la denomination et l adresse de l hebergeur",
      source: 'comparaison (7) — LCEN art. 6 III 2°, entite confirmee sur facture le 2026-08-07',
      obligatoire: true,
      motif: new RegExp(`Site hébergé par ${HEBERGEUR_ADRESSE}, ${PAYS_HEBERGEUR.fr}\\.`),
    },
  ],
  en: [
    {
      cle: 'nature-fictive',
      intitule: 'le site declare qu il n est pas un media reel',
      source: 'comparaison (1) — champ Strapi, miroir anglais',
      obligatoire: false,
      motif: /"The Highland Echo" does not exist\./,
    },
    {
      cle: 'pas-service-de-presse',
      intitule: 'la clause de qualification : ce n est pas un service de presse en ligne',
      source: "comparaison (1) — n existait QUE dans libelles.ts (mediaFictifTexte, EN)",
      obligatoire: false,
      motif: /is in no way an online press service\./,
    },
    {
      cle: 'aucune-personne-reelle',
      intitule: 'la clause de non-diffamation et de droit a l image',
      source: 'comparaison (1) — n existait QUE dans le champ Strapi',
      obligatoire: false,
      motif: /No identifiable real person is named, quoted or photographed/,
    },
    {
      cle: 'images-provenance',
      intitule: 'la provenance et la licence des visuels',
      source: 'comparaison (2) — parade ecrite au risque R5 du brief §6',
      obligatoire: false,
      motif: /Every visual is a work of the project, generated or composed for this demonstrator\./,
    },
    {
      cle: 'editeur-raison-sociale',
      intitule: "la raison sociale de l editeur, forme juridique comprise",
      source: 'comparaison (3) — LCEN art. 6 III 1°, non traduite (raison sociale)',
      obligatoire: true,
      motif: /Monsieur Aymeric Filliot EI/,
    },
    {
      cle: 'editeur-adresse',
      intitule: 'l adresse du siege de l editeur',
      source: 'comparaison (4) — LCEN art. 6 III 1°, adresse legale, ne se traduit pas',
      obligatoire: true,
      motif: /230 rue Eloi Morel, 80000 Amiens/,
    },
    {
      cle: 'directeur-publication',
      intitule: 'le directeur de la publication',
      source: 'comparaison (5) — LCEN art. 6 III 1°',
      obligatoire: true,
      motif: /Publication director : Aymeric Filliot\./,
    },
    {
      cle: 'contact',
      intitule: 'l adresse de contact de l editeur',
      source: 'comparaison (6) — LCEN art. 6 III 1°',
      obligatoire: true,
      motif: /contact@echo\.ayfiweb\.fr/,
    },
    {
      cle: 'hebergeur',
      intitule: "le nom, la denomination et l adresse de l hebergeur",
      source: 'comparaison (7) — LCEN art. 6 III 2°, adresse legale, ne se traduit pas',
      obligatoire: true,
      motif: new RegExp(`Site hosted by ${HEBERGEUR_ADRESSE}, ${PAYS_HEBERGEUR.en}\\.`),
    },
  ],
};

/**
 * LA HUITIEME CLAUSE, exigee de la PAGE et non du champ.
 *
 * La date de derniere mise a jour reste une constante de `PageMentions.astro` : Aymeric a
 * repondu « A » sans trancher ce point, et le comportement en place est CONSERVE plutot
 * que choisi en silence. La garde l exige donc la ou elle vit — et `tests/…` exige
 * symetriquement qu elle ne soit PAS dans le champ, faute de quoi deux dates
 * cohabiteraient et divergeraient.
 */
export const MENTIONS_DE_LA_PAGE = {
  fr: [
    {
      cle: 'derniere-mise-a-jour',
      intitule: 'la date de derniere mise a jour du texte legal',
      source: 'comparaison (8) — non obligatoire ; constante de PageMentions.astro',
      obligatoire: false,
      motif: /Dernière mise à jour : \d{4}-\d{2}-\d{2}/,
    },
  ],
  en: [
    {
      cle: 'derniere-mise-a-jour',
      intitule: 'la date de derniere mise a jour du texte legal',
      source: 'comparaison (8) — non obligatoire ; constante de PageMentions.astro',
      obligatoire: false,
      motif: /Last updated : \d{4}-\d{2}-\d{2}/,
    },
  ],
};

/** Les cles que la loi impose, triees — le test les confronte a une liste ecrite. */
export function clesObligatoires(locale) {
  return (MENTIONS_DU_CHAMP[locale] ?? [])
    .filter((mention) => mention.obligatoire)
    .map((mention) => mention.cle)
    .sort();
}

/** Le manquement d une clause absente, redige pour qui decouvre la contrainte. */
function manquement(mention, ou) {
  return (
    `${mention.cle} — ${mention.intitule} : ABSENTE de ${ou}` +
    `${mention.obligatoire ? ' [MENTION OBLIGATOIRE]' : ''} (${mention.source})`
  );
}

/**
 * Les clauses que le CHAMP ne porte pas, pour une locale.
 *
 * @param {string|unknown[]} champ Le Markdown du seed, ou les noeuds Blocks de Strapi.
 * @param {string} locale
 * @returns {string[]}
 */
export function manquementsDuChamp(champ, locale) {
  const table = MENTIONS_DU_CHAMP[locale];
  if (table === undefined) {
    return [
      `locale « ${locale} » inconnue de la table des mentions legales : la garde ne sait pas ` +
        'ce qu elle devrait exiger, elle ne peut donc pas rendre un vert.',
    ];
  }
  const texte = typeof champ === 'string' ? normaliserTexteLegal(champ) : texteDesBlocks(champ);
  return table.filter((m) => !m.motif.test(texte)).map((m) => manquement(m, `le champ [${locale}]`));
}

/* ------------------------------------------------------------------ */
/* La page construite                                                  */
/* ------------------------------------------------------------------ */

/**
 * Le fichier de `dist/` qui sert la page legale d une locale, DERIVE des routes du site.
 *
 * Il n est pas ecrit ici : `cheminStatique` est la declaration que le site consomme pour
 * emettre ses pages. Une liste par controle est une liste qu on oublie — c est par la que
 * les pages anglaises sont restees hors garde jusqu au 2026-08-10.
 */
function fichierDeLaPage(dist, locale) {
  const route = cheminStatique(locale, 'mentions-legales');
  return path.join(dist, ...route.slice(1).split('/'), 'index.html');
}

/**
 * La page de mentions legales de chaque locale du site, confrontee a la table.
 *
 * @param {string} dist
 * @returns {{ manquements: string[], issue: number, pages: number }}
 */
export function inspecterMentionsRendues(dist) {
  if (!fs.existsSync(dist)) {
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages: 0,
    };
  }

  const manquements = [];
  const absentes = [];
  let pages = 0;

  for (const locale of LOCALES_SITE) {
    const fichier = fichierDeLaPage(dist, locale);
    if (!fs.existsSync(fichier)) {
      /* Une page legale absente n est PAS un defaut de redaction : c est un defaut de
         construction. Les deux envoient a des gestes opposes — relire un texte, ou
         comprendre pourquoi rien n a ete emis. */
      absentes.push(
        `${path.relative(dist, fichier).split(path.sep).join('/')} : page absente de la sortie ` +
          `— la locale « ${locale} » n a AUCUNE mention legale servie`,
      );
      continue;
    }
    pages += 1;
    const texte = normaliserTexteLegal(fs.readFileSync(fichier, 'utf8'));
    const table = [...(MENTIONS_DU_CHAMP[locale] ?? []), ...(MENTIONS_DE_LA_PAGE[locale] ?? [])];
    if (table.length === 0) {
      absentes.push(
        `locale « ${locale} » emise par le site mais inconnue de la table des mentions legales`,
      );
      continue;
    }
    for (const mention of table) {
      if (!mention.motif.test(texte)) manquements.push(manquement(mention, `la page [${locale}]`));
    }
  }

  if (absentes.length > 0 || pages === 0) {
    return {
      manquements: [...absentes, ...manquements],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      pages,
    };
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pages,
  };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeMentionsRendues(rapport) {
  const clauses = LOCALES_SITE.reduce(
    (total, locale) =>
      total + (MENTIONS_DU_CHAMP[locale]?.length ?? 0) + (MENTIONS_DE_LA_PAGE[locale]?.length ?? 0),
    0,
  );
  return (
    `${rapport.pages} page(s) de mentions legales, ${clauses} clause(s) exigees au total : ` +
    'aucune mention obligatoire ne manque, et aucune clause de la comparaison n a ete perdue.'
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const rapport = inspecterMentionsRendues(dist);
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune mention legale n a ete jugee :');
    for (const m of rapport.manquements) console.error(`  - ${m}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} mention(s) manquante(s) :`);
    for (const m of rapport.manquements) console.error(`  - ${m}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeMentionsRendues(rapport)}`);
}
