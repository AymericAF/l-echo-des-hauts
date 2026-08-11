/**
 * Confronte la SORTIE CONSTRUITE a une regle simple : une chaine adressee au lecteur sort
 * dans la langue de son element, jamais dans une autre.
 *
 * LE DEFAUT QUE CE FICHIER FERME, mesure le 2026-08-11 (tache `ba63557e`). Quatre chaines
 * d interface etaient ecrites en dur, en francais, dans des composants et des modules qui
 * ne recevaient pas la locale — l etiquette du bloc de reseaux du pied de page
 * (« Reseaux du journal »), le nom de la plateforme `site` (« Site web »), le libelle du
 * lien video et sa mention d ouverture (« (s ouvre dans un nouvel onglet) »), et la
 * signature du texte alternatif de l image de partage (« , par <auteur> »). Les quatre
 * sortaient telles quelles sur les pages ANGLAISES.
 *
 * ELLES N ETAIENT PAS NOUVELLES : elles dataient du socle (`d2e7b75`). Ce qui a change le
 * 2026-08-10, c est que les pages anglaises se sont mises a rendre le pied de page
 * (`e9dc7c0`, six fixtures `*-en.json`). Le defaut n a pas ete introduit, il a ete
 * DECOUVERT — motif habituel : on ne voit pas ce qui n est pas servi.
 *
 * CE QUE CA COUTE, et pourquoi ce n est pas cosmetique : trois des quatre sont du TEXTE
 * ACCESSIBLE (`aria-label`, texte masque a l oeil, `og:image:alt`). Un lecteur d ecran
 * anglophone les entend telles quelles. Ce n est pas une coquille vue du coin de l oeil,
 * c est le contenu que percoit quelqu un qui ne voit pas la page.
 *
 * ═══ CE QU IL COMPARE, ET A QUOI ═══════════════════════════════════════════════════════
 *
 * Le vocabulaire n est PAS recopie ici : il se DERIVE de `src/lib/i18n/libelles.ts`, seul
 * domicile des chaines d interface. Pour chaque locale, chaque valeur du dictionnaire est
 * reduite a ses FRAGMENTS FIXES — les valeurs a trous sont des fonctions, appelees avec
 * une sentinelle, et ce qui reste autour d elle est le fragment. Un fragment est retenu
 * comme EXCLUSIF a sa locale s il n apparait dans aucune valeur d une autre locale : c est
 * ce qui met « Pagination » (identique en FR et en EN) hors de portee automatiquement,
 * sans exception a ecrire.
 *
 * LE VERDICT SE REND SUR LA LANGUE DE L ELEMENT, pas sur celle de la page. Un fragment
 * francais dans un element `lang="fr"` d une page anglaise est CORRECT : c est exactement
 * ce que rend la bascule FR/EN, dont le libelle est ecrit dans la langue de DESTINATION
 * (« Lire en francais » sur une page anglaise, T-04). Juger a la page ferait rougir cette
 * forme-la, et une garde qui rougit sur le comportement voulu se fait desarmer.
 *
 * ═══ CE QU IL NE VOIT PAS, ECRIT PLUTOT QUE TU ════════════════════════════════════════
 *
 * Une chaine ECRITE EN DUR dans un composant et absente du dictionnaire ne peut pas etre
 * reconnue ici : il n existe aucun texte auquel la comparer. C est precisement la forme
 * qu avaient les quatre du 2026-08-11 AVANT leur correction. Ce trou-la est ferme par
 * l autre bout, a la SOURCE, par `tests/garde-langue.test.ts` (famille « litteraux »),
 * qui refuse un texte litteral dans le gabarit d un composant. Les deux gardes ne se
 * remplacent pas : celle-ci juge ce que le lecteur recoit, l autre juge ce qui l ecrit.
 *
 * `npm run verifier:langue` pour inspecter un `dist/` deja construit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LIBELLES } from '../src/lib/i18n/libelles.ts';
import { ISSUES, manquementCorpusVide } from './issues.mjs';

/**
 * La longueur au-dessous de laquelle un fragment ne prouve plus rien.
 *
 * Les valeurs a trous laissent des fragments tres courts — « Page », « par », « sur » —
 * qui se retrouvent par hasard dans n importe quel texte, y compris anglais (« compare »,
 * « separate »). Les retenir ferait rougir la garde sur du contenu innocent, et une garde
 * qui crie a tort se fait desarmer dans la semaine. Huit caracteres est le seuil ou les
 * fragments cessent d etre des mots-outils : il laisse passer les connecteurs et retient
 * les libelles (« Site web », « Sommaire », « Recherche », « Voir la video sur »).
 */
export const LONGUEUR_MINIMALE = 8;

/** Ce qu on injecte dans les libelles a trous pour retrouver leurs parties fixes. */
const SENTINELLE = String.fromCharCode(1);

/** Elements sans contenu : ils ne ferment pas, donc ils n empilent aucune langue. */
const ORPHELINS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elements dont le contenu n est PAS du texte destine au lecteur. */
const OPAQUES = new Set(['script', 'style']);

/** Les attributs qui portent du texte LU OU ENTENDU. */
const ATTRIBUTS_PARLANTS = new Set(['aria-label', 'title', 'placeholder']);

/**
 * `alt` EST DEHORS, et il faut savoir pourquoi avant de l ajouter. Il vient de
 * `alternativeText` de la mediatheque Strapi, champ NON localise (`i18n.localized: false`,
 * A-06) : les textes de remplacement des images sont donc francais sur les pages
 * anglaises PAR CONSTRUCTION DU MODELE, pas par oubli d un composant. C est un ecart
 * reel, mais il se corrige dans le schema et le corpus ; le faire rougir a chaque build
 * sans pouvoir le corriger ici tuerait la garde. Il est SIGNALE dans le compte rendu, et
 * jamais compte comme manquement.
 */
const ATTRIBUT_DONNEE = 'alt';

/** `og:image:alt` et `twitter:image:alt` : du texte accessible, servi par un `<meta>`. */
const METAS_PARLANTES = /^(og:image:alt|twitter:image:alt)$/;

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

/** Les valeurs qu une locale peut produire, fonctions appelees avec la sentinelle. */
function valeursProduites(table) {
  const valeurs = [];
  for (const valeur of Object.values(table)) {
    if (typeof valeur === 'string') valeurs.push(valeur);
    else if (typeof valeur === 'function') {
      /* TOUS les trous recoivent la sentinelle, pas seulement le premier : un libelle a
         deux trous appele avec un seul argument produirait « sur undefined », un fragment
         qui n existe dans aucune page et qui salit le vocabulaire. */
      const trous = Array.from({ length: Math.max(1, valeur.length) }, () => SENTINELLE);
      valeurs.push(String(valeur(...trous)));
    }
    else if (valeur !== null && typeof valeur === 'object') {
      for (const interne of Object.values(valeur)) {
        if (typeof interne === 'string') valeurs.push(interne);
      }
    }
  }
  return valeurs;
}

/**
 * Le vocabulaire EXCLUSIF de chaque locale, derive du dictionnaire.
 *
 * @param {Record<string, object>} dictionnaire `LIBELLES`, ou un dictionnaire de banc.
 * @returns {Map<string, string[]>} locale -> fragments qui n appartiennent qu a elle.
 */
export function vocabulaireExclusif(dictionnaire = LIBELLES) {
  const produites = new Map();
  for (const [locale, table] of Object.entries(dictionnaire)) {
    produites.set(locale, valeursProduites(table));
  }

  const exclusif = new Map();
  for (const [locale, valeurs] of produites) {
    const fragments = new Set();
    for (const valeur of valeurs) {
      for (const morceau of valeur.split(SENTINELLE)) {
        const fragment = morceau.trim();
        if (fragment.length < LONGUEUR_MINIMALE) continue;
        const ailleurs = [...produites].some(
          ([autre, autresValeurs]) =>
            autre !== locale && autresValeurs.some((v) => v.includes(fragment)),
        );
        if (!ailleurs) fragments.add(fragment);
      }
    }
    exclusif.set(locale, [...fragments].sort());
  }
  return exclusif;
}

/** Les entites que la sortie porte reellement — decodage minimal, jamais un parseur. */
function decoder(texte) {
  return texte
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normaliser(brut) {
  return decoder(brut).replace(/\s+/g, ' ').trim();
}

/**
 * Parcourt le HTML BALISE PAR BALISE et rend ce qu un lecteur recoit, avec sa langue.
 *
 * Le decoupage suit celui de `verifier-styles-en-ligne.mjs` : une valeur d attribut peut
 * contenir `>`, et un `&lt;p&gt;` dans un article est du texte, pas du balisage. Ce qui
 * s ajoute ici est la PILE DES LANGUES — `lang=` se transmet aux descendants, et c est
 * elle qui distingue un libelle francais egare d un lien de bascule correctement declare.
 *
 * @returns {{texte: string, lang: string, source: string}[]}
 */
export function chainesDe(html) {
  const trouvees = [];
  const pile = [];
  const langCourante = () => (pile.length > 0 ? pile[pile.length - 1] : '');
  let i = 0;

  const ajouterTexte = (brut) => {
    const texte = normaliser(brut);
    if (texte.length >= LONGUEUR_MINIMALE) {
      trouvees.push({ texte, lang: langCourante(), source: 'texte' });
    }
  };

  while (i < html.length) {
    const ouvre = html.indexOf('<', i);
    if (ouvre === -1) {
      ajouterTexte(html.slice(i));
      break;
    }
    if (ouvre > i) ajouterTexte(html.slice(i, ouvre));

    if (html.startsWith('<!--', ouvre)) {
      const fin = html.indexOf('-->', ouvre + 4);
      i = fin === -1 ? html.length : fin + 3;
      continue;
    }
    if (html[ouvre + 1] === '!' || html[ouvre + 1] === '?') {
      const fin = html.indexOf('>', ouvre + 1);
      i = fin === -1 ? html.length : fin + 1;
      continue;
    }
    if (html[ouvre + 1] === '/') {
      const fin = html.indexOf('>', ouvre + 1);
      pile.pop();
      i = fin === -1 ? html.length : fin + 1;
      continue;
    }

    const nom = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(ouvre, ouvre + 64));
    if (nom === null) {
      i = ouvre + 1;
      continue;
    }

    let j = ouvre + 1 + nom[1].length;
    let quote = null;
    while (j < html.length) {
      const c = html[j];
      if (quote !== null) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      j += 1;
    }
    const interieur = html.slice(ouvre + 1 + nom[1].length, j);
    const nomBas = nom[1].toLowerCase();
    const autoFermante = interieur.trimEnd().endsWith('/');

    const attributs = new Map();
    for (const trouve of interieur.matchAll(/([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g)) {
      attributs.set(trouve[1].toLowerCase(), trouve[2]);
    }
    const lang = (attributs.get('lang') ?? attributs.get('xml:lang') ?? langCourante()).toLowerCase();

    // Les attributs sont juges dans la langue de LEUR element, pas de celle de son parent.
    for (const [cle, valeur] of attributs) {
      if (!ATTRIBUTS_PARLANTS.has(cle)) continue;
      const texte = normaliser(valeur);
      if (texte.length >= LONGUEUR_MINIMALE) trouvees.push({ texte, lang, source: cle });
    }
    if (nomBas === 'meta') {
      const cle = attributs.get('property') ?? attributs.get('name') ?? '';
      if (METAS_PARLANTES.test(cle)) {
        const texte = normaliser(attributs.get('content') ?? '');
        if (texte.length >= LONGUEUR_MINIMALE) trouvees.push({ texte, lang, source: cle });
      }
    }

    if (OPAQUES.has(nomBas)) {
      // Le contenu est saute AVEC sa balise fermante : rien a empiler, rien a depiler.
      const ferme = html.toLowerCase().indexOf(`</${nomBas}`, j);
      if (ferme === -1) break;
      const finFermante = html.indexOf('>', ferme);
      i = finFermante === -1 ? html.length : finFermante + 1;
      continue;
    }

    if (!ORPHELINS.has(nomBas) && !autoFermante) pile.push(lang);
    i = j + 1;
  }

  return trouvees;
}

/** La langue declaree par le document, ou `null` s il n en declare aucune. */
export function langueDuDocument(html) {
  const trouve = /<html\b[^>]*\blang\s*=\s*"([^"]*)"/i.exec(html);
  return trouve === null ? null : trouve[1].toLowerCase();
}

function manquement(relatif, chaine, locale, fragment) {
  return (
    `${relatif} → ${chaine.source} en « ${locale} » sur un element declare ` +
    `« ${chaine.lang === '' ? 'aucune langue' : chaine.lang} » : « ${chaine.texte} » ` +
    `(fragment « ${fragment} »). ` +
    'Cette chaine est adressee au LECTEUR : sur un `aria-label`, un texte masque a l oeil ' +
    "ou un `og:image:alt`, elle est ENTENDUE telle quelle par un lecteur d ecran. " +
    'Correction : la faire venir de `libelles(locale)` — jamais l ecrire dans le composant, ' +
    "et jamais poser un `lang=` sur l element pour faire taire ce message."
  );
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {Record<string, object>} [dictionnaire] Le dictionnaire de reference.
 */
export function inspecterLangue(dist, dictionnaire = LIBELLES) {
  const vide = { pages: 0, chaines: 0, altsNonLocalises: 0 };
  if (!fs.existsSync(dist)) {
    return { manquements: [`sortie absente : ${dist}`], issue: ISSUES.VERIFICATION_IMPOSSIBLE, ...vide };
  }

  const tous = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));
  if (!tous.some((relatif) => relatif.endsWith('.html'))) {
    return {
      manquements: [manquementCorpusVide(dist, tous.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...vide,
    };
  }

  const exclusif = vocabulaireExclusif(dictionnaire);
  const manquements = [];
  let pages = 0;
  let chaines = 0;
  let altsNonLocalises = 0;

  for (const relatif of tous) {
    if (!relatif.endsWith('.html')) continue;
    pages += 1;
    const html = fs.readFileSync(path.join(dist, relatif), 'utf8');
    const languePage = langueDuDocument(html) ?? '';

    for (const chaine of chainesDe(html)) {
      chaines += 1;
      const lang = chaine.lang === '' ? languePage : chaine.lang;
      for (const [locale, fragments] of exclusif) {
        if (locale === lang) continue;
        const fautif = fragments.find((fragment) => chaine.texte.includes(fragment));
        if (fautif !== undefined) {
          manquements.push(manquement(relatif, chaine, locale, fautif));
          break;
        }
      }
    }

    if (languePage !== '' && languePage !== 'fr') {
      for (const trouve of html.matchAll(new RegExp(`\\s${ATTRIBUT_DONNEE}="([^"]+)"`, 'g'))) {
        if (/[éèêàçôûîœ]/i.test(decoder(trouve[1]))) altsNonLocalises += 1;
      }
    }
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    pages,
    chaines,
    altsNonLocalises,
  };
}

/** Le compte rendu au vert, en une ligne — la reserve comprise. */
export function resumeLangue(rapport) {
  const reserve =
    rapport.altsNonLocalises > 0
      ? ` — RESERVE : ${rapport.altsNonLocalises} attribut(s) alt accentue(s) hors page francaise, ` +
        'qui viennent du champ NON localise `alternativeText` de la mediatheque : cela se ' +
        'corrige au modele et au corpus, pas dans un composant.'
      : '';
  return (
    `${rapport.pages} page(s) HTML, ${rapport.chaines} chaine(s) adressee(s) au lecteur : ` +
    `chacune dans la langue de son element${reserve}`
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const rapport = inspecterLangue(dist);
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune chaine n a ete jugee :');
    for (const m of rapport.manquements) console.error(`  - ${m}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const m of rapport.manquements) console.error(`  - ${m}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeLangue(rapport)}`);
}
