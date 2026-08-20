/**
 * Construit le site sur les fixtures, puis inspecte la sortie produite.
 *
 * C est la preuve executable des deux criteres qui ne se lisent pas dans le code :
 *   1. une page article rendue affiche les HUIT types de blocs ;
 *   2. l inventaire des fichiers servis ne contient AUCUN JavaScript.
 *
 * Le critere 2 est deja tenu par la garde T-09, qui fait echouer `astro build`. Ce
 * script ne la remplace pas : il ajoute le constat par TYPE DE BLOC, que la garde ne
 * peut pas faire — elle sait dire « aucun script », pas « les huit blocs sont la ».
 *
 * IL CONSTRUIT PAR LA PORTE DE LA PRODUCTION, ET PAS PAR UNE PLUS ETROITE (2026-08-11,
 * tache 08f04f58). Il lancait `npx astro build` ; Coolify lance `npm run build`, soit
 * `astro build && node scripts/index-pagefind.mjs`. Le second maillon indexe la sortie
 * PUIS la re-inspecte — c est ce qui etend la garde T-09 aux octets que Pagefind ecrit
 * APRES le build, le seul endroit du site qui echappait a son regard. Mesure du
 * 2026-08-11 : apres `npm run preuve:rendu`, `dist/pagefind/` N EXISTAIT PAS, et la ligne
 * « N page(s) indexee(s) par Pagefind » n apparaissait QUE dans le journal du deploiement.
 * Une regression de l indexation, un Pagefind qui deposerait un octet hors de son dossier,
 * une exemption de chemin qui deriverait : rien n aurait rougi avant la PRODUCTION.
 *
 * POURQUOI CETTE BRANCHE PLUTOT QU UN PAS D INDEXATION AJOUTE A L INTEGRATION CONTINUE :
 * elle ferme aussi le trou pour qui lance `preuve:rendu` A LA MAIN — recette, poste,
 * `queue-run` — c est-a-dire pour tous les lecteurs qui ne regardent pas un journal
 * GitHub. Le seul argument contraire etait le cout, et il ne tient pas devant la mesure :
 * sur les 24 pages des fixtures, l indexation coute 0,25 s a chaud et 1,3 s a froid,
 * contre 3,3 s pour le build seul.
 *
 * DEUX CIBLES, ET LE CHOIX EST EXPLICITE (2026-08-12, tache 7b96216a) :
 *
 *   npm run preuve:rendu              -> le BANC, hors ligne, sans jeton. Le defaut.
 *   npm run preuve:rendu -- --reel    -> l INSTANCE REELLE (`ECHO_STRAPI_URL`).
 *   PREUVE_CIBLE=instance npm run preuve:rendu
 *
 * Jusqu au 2026-08-12 la cible etait ECRITE EN DUR : la surcouche d environnement du
 * banc etait appliquee APRES `process.env`, donc un `ECHO_STRAPI_URL=https://echoback…`
 * pose dans le shell etait ECRASE sans un mot. Mesure avant correction : le run
 * demarrait quand meme `http://127.0.0.1:54860` et rendait 24 pages de fixtures, VERT.
 * La preuve du critere « les huit types de blocs » ne pouvait donc s exercer que sur des
 * donnees ecrites a la main — le seul terrain ou elle ne risquait pas d echouer.
 * D ou vient la surcouche et pourquoi elle n est PAS inversee : `scripts/cible-preuve.mjs`.
 *
 * L ATTENDU SUIT LA CIBLE, TOUJOURS. Les blocs poses, la Configuration de reference et
 * les portraits des auteurs viennent de la source CHOISIE, jamais des fixtures quand on
 * vise l instance : comparer un rendu d instance a un attendu de banc rougirait sur la
 * difference des deux corpus, pas sur un defaut du site.
 *
 * La sortie va dans `dist/`, comme un build normal — dans les deux modes. Le journal
 * nomme la cible en tete ET en pied, pour qu un `dist/` ne se lise jamais sans savoir
 * d ou il vient.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cartesPoseesParLaSource,
  inspecterAlternativesPartage,
} from './alternative-partage-servie.mjs';
import { CIBLES, cibleDemandee, sourcePourCible } from './cible-preuve.mjs';
import { articlesDuBanc, inspecterBlocs, TYPES, verdictPageComplete } from './couverture-blocs.mjs';
import { arbitrer, ISSUES } from './issues.mjs';
import { inspecterMentionsRendues, resumeMentionsRendues } from './mentions-obligatoires.mjs';
import { inspecterSortie, resume } from './verifier-sortie.mjs';
import { prefixeLocale } from '../src/lib/routes/chemins.ts';
import { LOCALES_SITE } from '../src/lib/routes/registre.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * LES LOCALES NE SONT PLUS ECRITES DANS CE FICHIER.
 *
 * Les trois controles ci-dessous en enumeraient chacun sa propre liste — `['fr', 'en']`
 * ecrit trois fois, plus un `locale === 'fr' ? '' : 'en/'` pour le prefixe d URL. Une
 * liste par controle est une liste qu on oublie : c est exactement par la que les pages
 * article anglaises sont restees hors garde jusqu au 2026-08-10, quand le pied de page
 * et le credit du portrait, eux, y etaient deja passes.
 *
 * `LOCALES_SITE` et `prefixeLocale` sont les declarations que le SITE consomme pour
 * emettre ses pages. Ajouter une locale la-bas etend ces controles sans qu on ait a y
 * penser ; en retirer une les retrecit, ce qui est le comportement juste — mais pas en
 * silence : `tests/couverture-blocs.test.ts` confronte `LOCALES_SITE` aux fixtures
 * `articles-*.json` presentes, et rougit si les deux ensembles divergent.
 */
const LOCALES = [...LOCALES_SITE];

/** Le dossier de `dist/` d une locale : '' pour la locale par defaut, `en/` sinon. */
function dossierLocale(locale) {
  const prefixe = prefixeLocale(locale);
  return prefixe === '' ? '' : `${prefixe.slice(1)}/`;
}

/**
 * La locale de REFERENCE : celle que le site sert SANS prefixe d URL.
 *
 * Elle se DERIVE de `prefixeLocale`, jamais ecrite `'fr'` : le controle du pied de page
 * compare toute page a la Configuration de cette locale-la, et un `'fr'` en dur ferait
 * comparer a une locale qui n est plus la reference le jour ou le registre change.
 */
const LOCALE_REFERENCE = LOCALES.find((locale) => dossierLocale(locale) === '') ?? LOCALES[0];

/** La locale qu un fichier de `dist/` sert, deduite de son prefixe de dossier. */
function localeDuFichier(relatif) {
  for (const locale of LOCALES) {
    const dossier = dossierLocale(locale);
    if (dossier === '') continue;
    if (relatif === `${locale}.html` || relatif.startsWith(dossier)) return locale;
  }
  return LOCALES.find((locale) => dossierLocale(locale) === '') ?? LOCALES[0];
}

function lancer(commande, arguments_, env) {
  return new Promise((resoudre) => {
    const processus = spawn(commande, arguments_, {
      cwd: RACINE,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    processus.on('close', resoudre);
  });
}

/**
 * Ce que la SOURCE pose, locale par locale : les blocs de chaque article.
 *
 * Une locale dont la source ne rend aucun article rend `null` — le controle accuse
 * alors la SOURCE, et pas le site : un corpus muet ne prouve pas qu une page ne rend
 * rien. C est vrai du banc (fixture absente) comme de l instance (locale non peuplee).
 */
function posesParLocale(entreesParLocale) {
  const poses = {};
  for (const locale of LOCALES) {
    const entrees = entreesParLocale[locale];
    poses[locale] = entrees === null ? null : articlesDuBanc(locale, { data: entrees });
  }
  return poses;
}

/**
 * Les articles de la source, LUS UNE SEULE FOIS.
 *
 * Deux controles les consomment desormais — les types de blocs et l alternative de la carte
 * de partage. Les relire par controle ferait deux allers a l instance sur la cible `--reel`,
 * et surtout deux photos d un corpus qui peut bouger entre les deux : un ecart naitrait de
 * la difference des deux lectures, pas d un defaut du site.
 */
async function articlesParLocale(source) {
  const entrees = {};
  for (const locale of LOCALES) entrees[locale] = await source.articles(locale);
  return entrees;
}

/** Les cartes de partage posees par la source, locale par locale. `null` : locale non peuplee. */
function cartesParLocale(entreesParLocale) {
  const cartes = {};
  for (const locale of LOCALES) {
    const entrees = entreesParLocale[locale];
    cartes[locale] = entrees === null ? null : cartesPoseesParLaSource(locale, entrees);
  }
  return cartes;
}

/**
 * Le HTML servi a une route, dans la sortie `build.format: 'directory'`.
 *
 * `null` — et non une exception — quand la page n existe pas : l absence d une page est
 * un ecart a REPORTER avec les autres, pas un arret qui masquerait le reste de la liste.
 */
function lirePage(dist, route) {
  const fichier = path.join(dist, ...route.slice(1).split('/'), 'index.html');
  return fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : null;
}

/**
 * LA CIBLE EST CHOISIE AVANT LE BUILD, ET ELLE EST DITE.
 *
 * Un refus (drapeau inconnu, mot de cible non reconnu, drapeau et variable qui se
 * contredisent) sort en 2 sans rien construire. Il ne retombe JAMAIS sur le banc : un
 * repli silencieux rendrait un vert de banc pour un vert d instance.
 */
const choix = cibleDemandee(process.argv.slice(2), process.env);
if (choix.refus !== undefined) {
  console.error(`\nVERIFICATION IMPOSSIBLE — cible de la preuve de rendu\n  - ${choix.refus}\n`);
  process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
}

const source = sourcePourCible(choix.cible, [...LOCALES_SITE], process.env);

/**
 * LA SOURCE EST EXIGEE AVANT LE BUILD.
 *
 * Les controles ci-dessous savent deja accuser la source plutot que le site, mais ils ne
 * le font qu APRES un build de plusieurs secondes, et chacun a sa maniere. Exiger de quoi
 * juger ici rend la meme absence sous une seule forme, avec le nom du fichier ou de la
 * variable et le code 2 (VERIFICATION IMPOSSIBLE) : « je n ai rien pu verifier » cesse de
 * ressembler a « une borne n est pas tenue ».
 */
const ouverture = await source.ouvrir();
if (ouverture.incapacite !== undefined) {
  console.error(`\n${ouverture.incapacite}\n`);
  process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
}

console.log(`\n▸ Cible : ${source.libelle} — choisie par ${choix.origine}\n`);

const code = await lancer('npm', ['run', 'build'], ouverture.surcouche);
await ouverture.fermer();

if (code !== 0) {
  console.error(`\n✖ Le build a echoue (code ${code}).`);
  process.exit(code);
}

const dist = path.join(RACINE, 'dist');
const rapport = inspecterSortie(dist);

console.log('\n─────────────  PREUVE DE RENDU  ─────────────\n');
console.log(`Sortie : ${resume(rapport)}`);

const articlesSource = await articlesParLocale(source);

const blocs = inspecterBlocs(
  posesParLocale(articlesSource),
  (route) => lirePage(dist, route),
  source.poseur,
);
/**
 * LA LIGNE SE LIT SANS LE BRIEF — reecrite le 2026-08-14, tache `c6e10619`.
 *
 * Elle disait « N page(s) rendant les 8 ». Sur l instance reelle elle imprimait donc
 * « 0 page(s) rendant les 8 » alors que DEUX pages rendaient les sept types disponibles :
 * `bloc.video` n a plus aucun porteur depuis l avenant A5 du 2026-08-10, et personne ne
 * peut le deviner en lisant ce rapport. Qui l ouvrait pour juger le controle 13 du §11 du
 * plan editorial y lisait un « 0 » et concluait l inverse du vrai.
 *
 * Deux choses changent, et rien d autre : le denominateur suit ce que le corpus EXERCE
 * (cf. `couverture-blocs.mjs`), et la ligne NOMME les types sans porteur au lieu de
 * laisser un « 7/8 » muet.
 */
for (const locale of LOCALES) {
  const compte = blocs.inspectees[locale];
  if (compte === undefined) {
    console.log(`  [${locale}] locale non inspectee`);
    continue;
  }
  const trou =
    compte.sansPorteur.length === 0 ? '' : `, aucun porteur pour ${compte.sansPorteur.join(', ')}`;
  console.log(
    `  [${locale}] ${compte.pages} page(s) article, ${compte.typesExerces} des ${TYPES.length} ` +
      `types du §3.6 exerces par ${source.poseur}${trou} — ${compte.pagesCompletes} page(s) ` +
      `rendant ces ${compte.typesExerces} types A ELLE SEULE`,
  );
}

/**
 * CONTROLE 13 du §11 du plan editorial — devenu une ASSERTION le 2026-08-14.
 *
 * L avenant A11 (decision `b5ef48c3`) exige qu AU MOINS UNE page article rendue affiche
 * les types de blocs ayant un porteur au corpus. Le compte ci-dessus n en etait qu un
 * `console.log` : la preuve ne rougissait pas, elle mentait par omission. Un indicateur
 * que rien n exerce finit par deriver sans que personne ne le voie.
 *
 * POURQUOI `1` ET NON `2`. La verification a bien eu lieu et elle a trouve quelque chose :
 * c est la definition de l anomalie dans `issues.mjs`. `2` dirait « je n ai pas pu juger »,
 * ce qui serait faux — on a lu chaque page. Ce n est pas non plus un defaut de RENDU : le
 * site rend fidelement ce qu on lui pose. Ce qui manque est un article qui porte tous les
 * types a lui seul, donc du CONTENU. Le message le dit, pour ne pas envoyer chercher une
 * regression de rendu qui n existe pas.
 *
 * LA MARGE EST NULLE, ET C EST VOULU (objection O25 de l avenant) : au 2026-08-14 une
 * seule page tient ce controle par locale, la suivante portant 5 types sur 7. Retirer un
 * bloc a l article `14-juin-1983-le-dernier-jour-de-la-filature` fera rougir ici. C est
 * exactement ce qu on attend d un filet : il tient tant que la demonstration tient.
 *
 * LA REGLE ELLE-MEME VIT DANS `couverture-blocs.mjs`, ou elle s exerce dans les deux sens
 * en quelques millisecondes. Ici on ne fait que la lire et l imprimer : un seuil enfoui
 * dans un script qui construit le site ne se prouverait qu en cassant le corpus.
 */
const controle13 = verdictPageComplete(blocs.inspectees);
if (controle13.issue !== ISSUES.CONFORME) {
  console.error(
    '\n✖ CONTROLE 13 du §11 (plan editorial) — AUCUNE page article ne rend a elle seule ' +
      `les types de blocs ayant un porteur, dans aucune des ${LOCALES.length} locales.`,
  );
  console.error(
    "\n  Ce n est ni un defaut de rendu ni une incapacite de mesure : le site rend ce qu on\n" +
      '  lui pose, et chaque page a bien ete lue. Ce qui manque est un ARTICLE qui porte tous\n' +
      '  ces types a lui seul. Avenant A11, decision `b5ef48c3`.\n',
  );
  // LE VERDICT N EST PAS PERDU : il est rendu au bloc final, apres `blocs.site` et
  // `blocs.banc`. Voir le commentaire qui precede ces trois lignes.
} else {
  // DANS UN `else`, ET CE N EST PAS DU STYLE : le `process.exit` retire ci-dessus tenait
  // AUSSI lieu de garde pour ce message. Sans lui, la premiere mesure du 2026-08-16 a
  // imprime « CONTROLE 13 … AUCUNE page » puis, sept lignes plus bas, « Controle 13 : TENU
  // — 0 page(s) ». Une sortie qui se contredit dans le meme souffle est pire qu une sortie
  // muette : on croit avoir mal lu.
  console.log(
    `\n▸ Controle 13 du §11 : TENU — ${controle13.pagesCompletes} page(s) rendent a elles seules ` +
      'tous les types de blocs ayant un porteur.',
  );
}

/**
 * Les liens de reseaux, lus DANS LA SORTIE et pas dans le composant.
 *
 * A-04 exige zero avertissement axe-core, et le mode d echec d une icone est toujours le
 * meme : un lien dont le seul contenu est un dessin n a aucun nom accessible, et un lecteur
 * d ecran annonce son URL. La regle est donc « glyphe decoratif + intitule textuel »,
 * jamais l inverse. Ce controle constate les deux sur le HTML emis :
 *   - chaque glyphe porte `aria-hidden="true"` (sinon il entre dans le nom du lien) ;
 *   - chaque lien garde du texte dans le flux (masque a l oeil, pas retire du document).
 * Ce n est PAS une campagne axe-core — elle demande un navigateur, que ce depot n a pas.
 * C est la classe d ecart que l icone introduit, et la seule qu on puisse voir d ici.
 */
function ecartsLiensSociaux(dist) {
  const ecarts = [];
  for (const fichier of fs.readdirSync(dist, { recursive: true })) {
    if (!String(fichier).endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(dist, String(fichier)), 'utf8');
    const liens = [...html.matchAll(/<a\b[^>]*class="[^"]*liens-sociaux__lien[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const [, contenu] of liens) {
      const glyphe = (contenu.match(/<svg[\s\S]*?<\/svg>/) ?? [''])[0];
      if (glyphe && !/aria-hidden="true"/.test(glyphe)) {
        ecarts.push(`${fichier} : un glyphe sans aria-hidden entre dans le nom du lien`);
      }
      const texte = contenu.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
      if (texte.length === 0) ecarts.push(`${fichier} : un lien social sans texte accessible`);
    }
    if (liens.length > 0 && !/<nav[^>]*class="liens-sociaux"[^>]*aria-label="[^"]+"/.test(html)) {
      ecarts.push(`${fichier} : la liste de reseaux n est pas nommee (aria-label)`);
    }
  }
  return ecarts;
}

/**
 * Le PIED DE PAGE, lu dans la sortie, LOCALE PAR LOCALE.
 *
 * POURQUOI CE CONTROLE EXISTE, alors qu il y en avait deja un juste au-dessus. Celui du
 * dessus ne peut PAS rougir sur une absence : il boucle sur les liens qu il trouve, et
 * une page sans aucun lien social lui rend zero ecart. Mesure du 2026-08-10 sur le
 * `dist/` d alors : 13 pages francaises portaient le bloc, les 4 pages anglaises en
 * portaient ZERO, et la preuve etait verte. Un controle qui verifie « le pied de page
 * rend bien un lien » constatait le vrai en francais et croyait avoir tout vu — angle
 * mort ASYMETRIQUE, la pire forme, parce que rien ne signalait la difference.
 *
 * CE QU IL EXIGE, ET D OU CHAQUE EXIGENCE VIENT.
 *   - Toute page emise porte le bloc dans son `<footer class="pied">`. Ce n est pas une
 *     preference : `PiedDePage.astro` le rend des que la Configuration existe, et le seed
 *     ECRIT la Configuration aux deux locales (`apps/cms/scripts/seed/seed.ts`, §4).
 *   - Les URL du bloc sont EXACTEMENT celles de la Configuration de la locale de REFERENCE
 *     — le francais — dans le meme ordre, ET SUR TOUTE PAGE, quelle que soit sa locale.
 *     `reseaux` est declare `i18n.localized: false` : les deux locales lisent la MEME
 *     liste, la comparer a la reference n est donc pas un raccourci, c est la regle.
 *
 *     CE POINT A ETE MESURE, PAS SUPPOSE. Ce controle a d abord compare chaque page a la
 *     Configuration DE SA LOCALE. Le 2026-08-10, la preuve en cassant a retire le lien
 *     LinkedIn de `configuration-en.json` : les pages anglaises ont perdu le lien, le
 *     controle est reste VERT — il lisait l attendu dans le fichier meme que le build
 *     venait de consommer. Un controle qui derive son attendu de ce qu il controle ne
 *     controle rien ; c est le defaut qu il etait cense fermer, revenu par sa propre
 *     porte.
 *   - Les DEUX locales ont ete inspectees. Sans cette derniere ligne, un banc qui
 *     cesserait de servir l anglais rendrait ce controle vert sur zero page anglaise —
 *     c est exactement le defaut qu on ferme, et il reviendrait par la porte du controle.
 *
 * Il ne juge PAS le libelle du bloc (`aria-label`), seulement qu il en porte un et qu il
 * n est pas vide : ce que ce libelle doit dire est un point de fond en cours d arbitrage,
 * et un controle n a pas a trancher a la place de son arbitre.
 */
function urlsDuPied(html) {
  const pied = /<footer class="pied"[^>]*>([\s\S]*?)<\/footer>/.exec(html);
  if (pied === null) return { pied: false, nomme: false, urls: [] };
  const bloc = /<nav class="liens-sociaux"[^>]*>[\s\S]*?<\/nav>/.exec(pied[1]);
  if (bloc === null) return { pied: true, nomme: false, urls: null };
  const nomme = /aria-label="[^"]+"/.test(bloc[0]);
  const urls = [...bloc[0].matchAll(/<a\b([^>]*)>/g)]
    .filter(([, attributs]) => /class="[^"]*liens-sociaux__lien/.test(attributs))
    .map(([, attributs]) => (/href="([^"]*)"/.exec(attributs) ?? [, ''])[1]);
  return { pied: true, nomme, urls };
}

/**
 * @param {string} dist
 * @param {string[]} attendu Les URL de reseaux de la Configuration de la locale de
 *   REFERENCE, lues dans la SOURCE (fixture ou instance) — cf. l encadre ci-dessus.
 *   L attendu ne vient jamais de `dist/`, quelle que soit la cible.
 */
function ecartsPiedDePage(dist, attendu) {
  const ecarts = [];
  const inspectees = Object.fromEntries(LOCALES.map((locale) => [locale, 0]));

  for (const fichier of fs.readdirSync(dist, { recursive: true })) {
    const relatif = String(fichier).replace(/\\/g, '/');
    if (!relatif.endsWith('.html')) continue;

    const locale = localeDuFichier(relatif);
    const { pied, nomme, urls } = urlsDuPied(fs.readFileSync(path.join(dist, relatif), 'utf8'));
    inspectees[locale] += 1;

    if (!pied) {
      ecarts.push(`${relatif} : aucun pied de page`);
      continue;
    }
    if (urls === null) {
      ecarts.push(`${relatif} [${locale}] : le pied de page ne porte AUCUN bloc de reseaux`);
      continue;
    }
    if (!nomme) ecarts.push(`${relatif} : le bloc de reseaux du pied de page n a pas d aria-label`);
    if (urls.join('|') !== attendu.join('|')) {
      ecarts.push(
        `${relatif} [${locale}] : reseaux du pied de page = [${urls.join(', ')}], ` +
          `la Configuration de reference (fr) dit [${attendu.join(', ')}]`,
      );
    }
  }

  for (const locale of LOCALES) {
    if (inspectees[locale] === 0) {
      ecarts.push(
        `aucune page « ${locale} » dans la sortie : le pied de page de cette locale n est garde par rien`,
      );
    }
  }

  return { ecarts, inspectees };
}

/**
 * Le credit du portrait, lu DANS LA SORTIE — §13 point 6b du plan editorial, tranche le
 * 2026-08-03 : `/auteur/[slug]` affiche le `caption` de la mediatheque sous l image.
 *
 * Pourquoi ici et pas dans un test : une attribution CC BY qui n est pas AFFICHEE ne
 * satisfait pas la licence. Ce qu il faut constater n est donc pas qu un composant lit un
 * champ, c est qu une ligne de texte existe dans la page, apres l image, et qu elle porte
 * EXACTEMENT ce que la mediatheque dit. Un test de source dirait « le gabarit mentionne
 * legende » ; il resterait vert sur une page vide.
 *
 * Trois ecarts distincts, parce qu ils ont trois causes differentes :
 *   - portrait sans credit         → la ligne de gabarit a saute ;
 *   - credit avant l image         → « sous le portrait » n est plus tenu ;
 *   - credit different du caption  → une seconde source s est glissee entre les deux.
 */
/**
 * Le texte d un fragment HTML, entites comprises.
 *
 * Sans ce decodage, la comparaison au `caption` de la mediatheque echouerait sur la
 * PONCTUATION : Astro echappe l apostrophe en `&#39;`, et les captions du seed en portent
 * (« aucune personne reelle n'est representee »). Le controle aurait alors rougi sur un
 * rendu juste — mesure le 2026-08-10 sur les 5 portraits du corpus de seed.
 */
function texteHtml(fragment) {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * LES DEUX LOCALES, et pas seulement le francais. `photo` est declare
 * `i18n.localized: false` : la page auteur anglaise affiche donc EXACTEMENT le meme
 * `caption` de mediatheque. Ne lire que `auteurs-fr.json` laissait `/en/auteur/…` hors de
 * toute garde — meme classe de defaut que le pied de page anglais, meme correction.
 */
/**
 * @param {string} dist
 * @param {Record<string, null | Array<{slug: string, photo: null | {caption: string}}>>} auteursParLocale
 *   Ce que la SOURCE rend pour chaque locale du site ; `null` quand elle n en rend
 *   aucun — le controle accuse alors la source, jamais la page.
 */
function ecartsCreditPortrait(dist, auteursParLocale) {
  const ecarts = [];
  let controles = 0;

  for (const locale of LOCALES) {
    const auteurs = auteursParLocale[locale];
    if (auteurs === null || auteurs === undefined) {
      ecarts.push(
        `aucun auteur rendu par ${source.poseur} en « ${locale} » : la page auteur de cette ` +
          'locale n est gardee par rien',
      );
      continue;
    }
    const prefixe = dossierLocale(locale);

    for (const auteur of auteurs) {
      const route = `/${prefixe}auteur/${auteur.slug}`;
      const page = path.join(dist, `${prefixe}auteur`, auteur.slug, 'index.html');
      if (!fs.existsSync(page)) {
        ecarts.push(`${route} : page absente de la sortie`);
        continue;
      }
      const html = fs.readFileSync(page, 'utf8');
      const positionImage = html.indexOf('index__portrait');
      const credit = /<p[^>]*class="[^"]*index__credit[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html);

      /* `== null` couvre `null` ET `undefined` : la fixture ecrit `photo: null`, l API
         d une instance OMET la cle quand la relation est vide. Les distinguer ferait
         planter le controle sur `auteur.photo.caption` au lieu de rendre son verdict. */
      if (auteur.photo == null) {
        if (credit !== null) ecarts.push(`${route} : credit rendu sans portrait`);
        continue;
      }

      controles += 1;
      if (positionImage === -1) {
        ecarts.push(`${route} : portrait absent de la page`);
        continue;
      }
      if (credit === null) {
        ecarts.push(`${route} : portrait sans ligne de credit`);
        continue;
      }
      if (credit.index < positionImage) {
        ecarts.push(`${route} : le credit precede l image, il doit la suivre`);
      }
      const rendu = texteHtml(credit[1]);
      if (rendu !== auteur.photo.caption) {
        ecarts.push(
          `${route} : credit rendu « ${rendu} » ≠ caption de la mediatheque « ${auteur.photo.caption} »`,
        );
      }
    }
  }

  return { ecarts, controles };
}

/**
 * LES DONNEES DE REFERENCE VIENNENT DE LA SOURCE, PAS DE `dist/`.
 *
 * Rappel de ce que la mesure du 2026-08-10 a etabli : un controle qui derive son attendu
 * de ce qu il controle ne controle rien. La Configuration de reference et la liste des
 * auteurs sont donc relues a la source (banc OU instance), jamais dans la sortie qu on
 * vient de construire.
 */
const auteursParLocale = Object.fromEntries(
  await Promise.all(LOCALES.map(async (locale) => [locale, await source.auteurs(locale)])),
);

/*
 * L ABSENCE DE CONFIGURATION N INTERROMPT PLUS — mesure du 2026-08-20, cible `--reel`.
 *
 * Elle sortait ici en `2`. Or elle ne prive d attendu QUE le pied de page : `reseaux` est
 * lu par `ecartsPiedDePage` et par personne d autre (seul appelant, plus bas). Le credit
 * du portrait lit `auteurs`, les reseaux et les mentions legales lisent `dist/`, les types
 * de blocs ont ete inspectes bien avant.
 *
 * CE QU ELLE MASQUAIT, MESURE EN FORCANT `source.configuration` A `null` PENDANT QU UNE
 * PAGE AVAIT CESSE DE RENDRE UN BLOC : la sortie s arretait sur les trois lignes de
 * l incapacite, et CINQ familles disparaissaient — credit du portrait, reseaux, mentions
 * legales, pied de page, types de blocs — sans meme leur ligne de resume, qui est pourtant
 * imprimee plus bas et sans condition. Le code rendu etait `2` alors qu une ANOMALIE de
 * rendu etait deja constatee : « je n ai pas pu juger » pour un site en faute.
 *
 * L incapacite est CONSERVEE mais BORNEE a la famille qu elle prive : `null` ici, et le
 * pied de page rend « NON JUGE » au lieu de le rendre pour tout le monde. Ce n est pas une
 * cascade — les quatre autres familles ne consomment pas cette donnee.
 */
const configurationReference = await source.configuration(LOCALE_REFERENCE);
const reseauxDeReference =
  configurationReference == null || !Array.isArray(configurationReference.reseaux)
    ? null
    : configurationReference.reseaux.map((reseau) => reseau.url);

const credits = ecartsCreditPortrait(dist, auteursParLocale);
console.log(
  credits.ecarts.length === 0
    ? `Credit du portrait : ${credits.controles} page(s) auteur, caption de la mediatheque rendu sous l image.`
    : `Credit du portrait : ${credits.ecarts.length} ecart(s).`,
);

const ecartsSociaux = ecartsLiensSociaux(dist);
console.log(
  ecartsSociaux.length === 0
    ? 'Liens de reseaux : glyphes en aria-hidden, texte accessible present sur chaque lien.'
    : `Liens de reseaux : ${ecartsSociaux.length} ecart(s).`,
);

/**
 * LES MENTIONS LEGALES, lues DANS LA SORTIE et pas dans le champ qui les alimente.
 *
 * Pourquoi ici et pas seulement dans un test : depuis la decision `ed69d5bf` (branche A),
 * le texte legal ne vit plus dans le composant mais dans `configuration.mentionsLegales`.
 * Un test de source dirait « le composant rend un champ » et resterait VERT si le champ
 * cessait d arriver, si `RichTexte` avalait un noeud, ou si la page anglaise retombait sur
 * la Configuration francaise. Ce que la loi exige n est pas qu un composant lise un champ :
 * c est que la mention SOIT SUR LA PAGE.
 *
 * `tests/mentions-legales.test.ts` tient l autre bout — le CHAMP seede et la FIXTURE
 * portent les memes clauses. Les deux ensemble ferment la chaine : le texte publie est
 * celui qui a ete relu, et il arrive entier jusqu au lecteur.
 */
const mentions = inspecterMentionsRendues(dist);
console.log(
  mentions.manquements.length === 0
    ? `Mentions legales : ${resumeMentionsRendues(mentions)}`
    : `Mentions legales : ${mentions.manquements.length} manquement(s) sur ${mentions.pages} page(s).`,
);

/* L ATTENDU DU PIED reste passe explicitement : `p2/wt-f866e743` appelait
   `ecartsPiedDePage(dist)` parce qu a sa base la fonction lisait sa reference
   elle-meme. Elle prend desormais `attendu` en second parametre — le laisser
   tomber rendrait `undefined` et la comparaison ne porterait plus sur rien. */
/* ET `null` N EST PAS `[]`. Quand la Configuration manque, on NE JUGE PAS : lui passer une
   liste vide accuserait chaque page de servir un lien EN TROP, soit 119 ecarts fabriques
   par l absence de l attendu — une incapacite deguisee en anomalie, exactement ce que la
   convention d `issues.mjs` interdit. */
const pied = reseauxDeReference === null ? null : ecartsPiedDePage(dist, reseauxDeReference);
if (pied === null) {
  console.log(
    `Pied de page : NON JUGE — ${source.poseur} ne rend aucune Configuration ` +
      `« ${LOCALE_REFERENCE} », ou aucune liste de reseaux.`,
  );
} else {
  const comptePied = LOCALES.map((locale) => `${pied.inspectees[locale]} page(s) ${locale}`).join(', ');
  console.log(
    pied.ecarts.length === 0
      ? `Pied de page : bloc de reseaux conforme a la Configuration sur ${comptePied}.`
      : `Pied de page : ${pied.ecarts.length} ecart(s) — ${comptePied} inspectees.`,
  );
}

/**
 * L ALTERNATIVE DE LA CARTE DE PARTAGE — LE MAILLON DU GABARIT, ENFIN TENU (2026-08-20).
 *
 * Trois maillons portent `alternativePartage` : la requete le demande, le mapping
 * l applique, LE GABARIT le sert. Les deux premiers ont leur harnais
 * (`tests/alternative-localisee.test.ts`). Le troisieme n en avait aucun — `Base.astro` ne
 * s importe depuis aucun test — et le reflexe du 2026-08-19 (rejouer sa cascade a la main
 * dans `tests/banc-surcharge-partage-en.test.ts`) reconduisait le trou d un cran : la copie
 * avait DEJA divergé du gabarit en deux jours (`seo.imagePartage.url` contre
 * `urlMedia(seo.imagePartage)`).
 *
 * Ici, rien n est rejoue : l attendu sort de `mapperArticle` — la fonction que le site
 * appelle — et il est confronte au HTML CONSTRUIT. Le gabarit peut etre reecrit entierement
 * sans faire mentir ce controle ; il ne peut plus cesser de servir la valeur sans le faire
 * rougir. Preuve en cassant, faite le 2026-08-20 : inverser la cascade de `Base.astro` en
 * `imageGeneree ?? imageSurchargee` laisse `npm test` INTEGRALEMENT VERT et fait rougir
 * celui-ci.
 */
const partage = inspecterAlternativesPartage(cartesParLocale(articlesSource), (route) =>
  lirePage(dist, route),
);
const surchargesJugees = partage.surchargesHorsReference(LOCALE_REFERENCE);
console.log(
  partage.ecarts.length === 0 && partage.incapacites.length === 0
    ? `Carte de partage : ${partage.controles} page(s) servant l alternative que ${source.poseur} ` +
        `pose, dont ${surchargesJugees} surchargee(s) hors « ${LOCALE_REFERENCE} » ` +
        `(${partage.sansCarte} article(s) sans carte, hors perimetre).`
    : `Carte de partage : ${partage.ecarts.length} ecart(s), ${partage.incapacites.length} ` +
        `incapacite(s) — ${partage.controles} page(s) inspectee(s).`,
);

/*
 * LA SEULE SORTIE PRECOCE QUI SURVIT ICI, ET LA MESURE QUI LA JUSTIFIE (2026-08-20).
 *
 * `rapport.issue === VERIFICATION_IMPOSSIBLE` ne veut dire qu UNE chose : `dist/` ne porte
 * AUCUNE page HTML (`issues.mjs`, `manquementCorpusVide`). C est la seule condition de
 * cette zone qui porte sur le MEME objet que tout l aval — comme la cible refusee, la
 * source injoignable et le build echoue, bien plus haut.
 *
 * MESURE, en retirant toutes les pages ET `dist/pagefind/` apres le build : les familles
 * d aval rendent alors « Credit du portrait : 10 ecart(s) », « Mentions legales : 2
 * manquement(s) sur 0 page(s) », « Pied de page : 2 ecart(s) — 0 page(s) inspectees », et
 * `blocs.site` accuserait les 48 articles de ne plus rien rendre. Accumuler produirait
 * CINQ blocs d erreur pour UNE cause, et rendrait `1` — en envoyant corriger un credit de
 * portrait qui n a rien. C est la cascade illisible que ce lot existe pour eviter.
 *
 * ELLE RENDAIT `1`, ET C ETAIT FAUX. `process.exit(1)` etait ecrit en chiffre sous un
 * `rapport.issue` qui vaut `2` dans ce cas precis : l incapacite sortait sous le code du
 * manquement du site. Elle rend desormais ce que la sortie a juge.
 */
if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
  console.error('\n⛔ Sortie — VERIFICATION IMPOSSIBLE, aucune page n a ete jugee :');
  for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
  console.error(
    '\n  Les familles qui suivent liraient toutes le meme vide et rendraient chacune leur\n' +
      '  version du meme constat. Rien n est juge tant que la sortie ne porte pas de page.\n',
  );
  process.exit(rapport.issue);
}

/*
 * A PARTIR D ICI, PLUS AUCUN VERDICT N INTERROMPT LES SUIVANTS — 2026-08-20.
 *
 * Cinq `process.exit` se trouvaient dans ce bloc, un par famille. Le recensement du
 * 2026-08-17 (commit `0c07982`) avait classe « cible refusee / source injoignable / build
 * echoue » comme portant sur le meme objet que tout l aval — ce qui reste vrai, et ces
 * trois-la n ont pas bouge. Il n avait rien dit de ceux-ci.
 *
 * CE QU ILS MASQUAIENT, MESURE EN FABRIQUANT L ECART SUR LA CIBLE `--reel`, une famille a
 * la fois, TOUJOURS accompagnee d une page qui avait cesse de rendre un bloc :
 *
 *   ecart fabrique                            ce qui n a PAS ete imprime
 *   ---------------------------------------   ----------------------------------------
 *   `.js` depose dans dist/ apres le build     reseaux, mentions, pied, credit, blocs.*
 *   aria-hidden retire d un glyphe social      mentions, pied, credit, blocs.*
 *   <main> vide sur /mentions-legales/         pied, credit, blocs.*
 *   href du pied detourne                      credit, blocs.*
 *   credit du portrait reecrit                 blocs.*
 *
 * LA DERNIERE COLONNE EST LA MEME PARTOUT, et c est elle qui tranche : les cinq
 * supprimaient `blocs.site` — « le site a cesse de rendre un type que la source lui pose ».
 * Or `blocs.site` est la SEULE famille de ce rapport qui n a AUCUNE ligne de resume : les
 * autres impriment leur compte plus haut sans condition, celle-la n existe que dans le bloc
 * final. Elle disparaissait donc SANS TRACE. C est le defaut ferme par `77273f9` puis
 * `0c07982`, revenu par cinq portes situees un cran plus haut.
 *
 * ILS NE PRODUISENT PAS DE CASCADE, et c est ce qui les separe de la porte du corpus vide
 * ci-dessus : cinq objets INDEPENDANTS, dont aucun ne prive le suivant de quoi juger. Le
 * script accumulait DEJA leurs comptes en tete — les `console.log` de resume sont
 * inconditionnels. Les cinq `process.exit` CONTREDISAIENT donc le resume qui les precede :
 * on annoncait « 1 ecart(s) » sur quatre familles, puis on n en detaillait qu une.
 */
const issues = [];

if (rapport.manquements.length > 0) {
  /* CETTE FAMILLE-CI NE PEUT PAS TIRER DANS LE PIPELINE REEL, et elle reste comme
     troisieme lecture. `npm run build` = `astro build && node scripts/index-pagefind.mjs` :
     `integrations/garde-t09.mjs` inspecte `dist/` a `astro:build:done` et LEVE, puis
     `index-pagefind.mjs` le REFAIT apres depot de l index et sort non nul. Un manquement
     fait donc echouer le BUILD, et le script sort bien plus haut sur `code !== 0`. Il a
     fallu greffer un depot de `.js` APRES le build pour la voir tirer une seule fois. */
  console.error('\n✖ Manquements dans la sortie :');
  for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
  issues.push(rapport.issue);
}

if (ecartsSociaux.length > 0) {
  console.error('\n✖ Accessibilite des liens de reseaux :');
  for (const ecart of ecartsSociaux) console.error(`  - ${ecart}`);
  issues.push(ISSUES.ANOMALIE);
}

if (mentions.issue !== ISSUES.CONFORME) {
  console.error(
    mentions.issue === ISSUES.VERIFICATION_IMPOSSIBLE
      ? '\n⛔ Mentions legales — VERIFICATION IMPOSSIBLE, aucune page n a ete jugee :'
      : '\n✖ Mentions legales absentes de la page servie :',
  );
  for (const manquement of mentions.manquements) console.error(`  - ${manquement}`);
  issues.push(mentions.issue);
}

if (pied === null) {
  console.error(
    '\n⛔ Pied de page — VERIFICATION IMPOSSIBLE :\n' +
      `  - ${source.poseur} ne rend aucune Configuration « ${LOCALE_REFERENCE} », ou aucune\n` +
      '    liste de reseaux : le pied de page n a plus d attendu, et le comparer a lui-meme\n' +
      '    ne prouverait rien. Les autres familles de ce rapport ne consomment pas cette\n' +
      '    donnee, et ont bien ete jugees.\n',
  );
  issues.push(ISSUES.VERIFICATION_IMPOSSIBLE);
} else if (pied.ecarts.length > 0) {
  console.error('\n✖ Pied de page (les deux locales) :');
  for (const ecart of pied.ecarts) console.error(`  - ${ecart}`);
  issues.push(ISSUES.ANOMALIE);
}

if (credits.ecarts.length > 0 || credits.controles === 0) {
  console.error('\n✖ Credit du portrait sur la page auteur :');
  for (const ecart of credits.ecarts) console.error(`  - ${ecart}`);
  if (credits.controles === 0) {
    console.error('  - aucune page auteur avec portrait : la preuve ne prouverait rien');
  }
  issues.push(ISSUES.ANOMALIE);
}

if (partage.ecarts.length > 0) {
  console.error('\n✖ Alternative de la carte de partage, sur la page servie :');
  for (const ecart of partage.ecarts) console.error(`  - ${ecart}`);
  issues.push(ISSUES.ANOMALIE);
}

/*
 * DEUX INCAPACITES DISTINCTES, ET AUCUNE NE MET LE SITE EN CAUSE.
 *
 * Une entree que le mapping refuse n a pas d attendu : on ne sait rien de sa page. Et
 * ZERO SURCHARGE JUGEE hors de la locale de reference vide le controle de son sens — c est
 * le trou aval par lequel le defaut du 2026-08-14 a vecu : sans une seule page surchargee
 * a juger, « la surcharge est honoree » et « la surcharge est ignoree » rendent le meme
 * vert. Code `2`, jamais `1` : c est le corpus qu il faut corriger, pas le site.
 */
if (partage.incapacites.length > 0) {
  console.error('\n⛔ Carte de partage — entrees illisibles a la source :');
  for (const incapacite of partage.incapacites) console.error(`  - ${incapacite}`);
  issues.push(ISSUES.VERIFICATION_IMPOSSIBLE);
}

if (surchargesJugees === 0) {
  console.error(
    `\n⛔ ${source.poseur.toUpperCase()}, PAS LE SITE — aucune carte de partage SURCHARGEE ` +
      `hors de « ${LOCALE_REFERENCE} » :\n` +
      '  - l `alternativeText` de la mediatheque n a qu UNE valeur, sans locale. Sans une page\n' +
      '    dont la source surcharge cette valeur, honorer la surcharge et l ignorer rendent le\n' +
      `    meme HTML, et ce controle ne juge rien. Les ${partage.controles} page(s) inspectee(s)\n` +
      '    servaient toutes l alternative du fichier.\n',
  );
  issues.push(ISSUES.VERIFICATION_IMPOSSIBLE);
}

/**
 * LA SOURCE D ABORD, LE SITE ENSUITE — et jamais l inverse.
 *
 * Un corpus qui n exercerait pas les huit types dans une locale ferait rougir un site
 * sain : la page ne peut pas rendre un bloc que la source ne lui donne pas. Rendre ce
 * verdict-la EN PREMIER, et sous son propre intitule, evite de partir chercher un defaut
 * de rendu la ou il n y en a pas.
 *
 * ET IL SORT EN 2, PAS EN 1 (2026-08-12). `1` envoie corriger LE SITE, `2` envoie
 * corriger CE AVEC QUOI ON JUGE — c est la convention de `issues.mjs`, et le message
 * dit deja « ce controle ne peut RIEN dire de ces types ». La distinction n a rien de
 * theorique depuis que la cible « instance » existe : le corpus reel n exerce que 7 des
 * 8 types, `bloc.video` etant un TROU D ENUMERATION ASSUME par l avenant A5 du
 * 2026-08-10 (aucune video a licence maitrisee, les 8 composants restent implementes).
 * Rendre `1` la-dessus enverrait chercher une regression de rendu qui n existe pas.
 */
/*
 * ON IMPRIME LES DEUX FAMILLES AVANT DE SORTIR (2026-08-14, tache `6919564b`).
 *
 * ~~Chaque famille sortait immediatement, la source d abord.~~ Sur la cible `--reel`,
 * `blocs.banc` est TOUJOURS non vide : `bloc.video` n a aucun porteur au corpus depuis
 * l avenant A5, et n en aura pas (decision `5292ac7f`). Le premier `if` tirait donc a
 * CHAQUE execution sur l instance, et le second n etait JAMAIS atteint.
 *
 * Consequence, et c est le defaut : une page qui cesserait de rendre un bloc que l instance
 * lui pose produisait un ecart dans `blocs.site` qui n etait NI IMPRIME NI COMPTE. La sortie
 * affichait le meme code 2 qu un jour sain. La cible qui mesure le vrai corpus — la seule qui
 * compte pour une recette — ne pouvait STRUCTURELLEMENT jamais accuser le site.
 *
 * Les deux constats sont INDEPENDANTS et portent sur des objets differents : une incapacite
 * sur `bloc.video` ne dit rien des sept autres types. On les imprime donc tous les deux, sous
 * leurs intitules distincts — les confondre ferait chercher un defaut la ou il n y en a pas.
 */
if (blocs.banc.length > 0) {
  console.error(`\n✖ ${source.poseur.toUpperCase()}, PAS LE SITE — ces types ne sont exerces nulle part :`);
  for (const ecart of blocs.banc) console.error(`  - ${ecart}`);
  console.error(
    `\n  VERIFICATION IMPOSSIBLE sur ces types (code ${ISSUES.VERIFICATION_IMPOSSIBLE}) : le site` +
      ' n est pas mis en cause, c est le corpus qui ne permet pas de conclure.\n',
  );
}

if (blocs.site.length > 0) {
  console.error('\n✖ Types de blocs rendus, locale par locale :');
  for (const ecart of blocs.site) console.error(`  - ${ecart}`);
}

/*
 * ET C EST `1` QUI PRIME QUAND LES DEUX COEXISTENT.
 *
 * Un defaut de rendu constate est un FAIT ETABLI ; l incapacite, elle, ne porte que sur les
 * types qu on n a PAS PU juger. Sortir en `2` reviendrait a dire « je n ai pas pu conclure »
 * alors qu on vient de conclure sur sept types — et `2` envoie corriger CE AVEC QUOI ON JUGE,
 * donc a cote.
 *
 * CE QUE CE CHOIX CHANGE POUR LA CI, verifie et non suppose : RIEN aujourd hui. Le pas
 * `preuve-rendu` de `gardes-du-code.yml` lance `npm run preuve:rendu` — la cible BANC, sur
 * fixtures — ou les huit types sont exerces, donc ou `blocs.banc` est vide et ce cas ne peut
 * pas se presenter. Le tri en trois seaux que `tests/integration-continue.test.ts` verrouille
 * porte sur le pas `verificateurs-de-sortie`, pas sur celui-ci, et il n est pas touche. Si la
 * cible `--reel` etait un jour cablee en CI, un `2` devenu `1` l enverrait corriger le SITE au
 * lieu de l ENVIRONNEMENT — ce qui serait alors le bon aiguillage, puisqu un defaut de rendu
 * aurait ete etabli.
 */
/*
 * LE CONTROLE 13 N INTERROMPT PLUS, ET C EST LE COEUR DE CE LOT (tache `d29240e1`).
 *
 * Il jugeait le CORPUS — « aucun article ne porte tous les types a lui seul » — et sortait la.
 * Or ce qui suit juge le RENDU : `blocs.site` dit que le site a cesse de rendre un type qu on
 * lui pose. DEUX OBJETS DIFFERENTS, et le premier masquait le second.
 *
 * CE QUE CA COUTAIT, mesure le 2026-08-14 en TENTANT de fabriquer l ecart : rendre la signature
 * d un type introuvable faisait tirer le controle 13 EN PREMIER, avec « aucune page ne rend a
 * elle seule tous les types ». Un vrai defaut de rendu produit EXACTEMENT ce message — on serait
 * alle chercher un article manquant au plan editorial la ou le site avait cesse de rendre.
 *
 * QUATRE SORTIES PRECOCES RESTENT, ET ELLES SEULES — recensement acheve le 2026-08-20.
 * Cible refusee, source injoignable, build echoue portent sur le MEME objet que tout l aval :
 * sans cible, sans acces ou sans `dist/`, ce qui suit ne juge rien. La quatrieme est la porte
 * du corpus vide, plus bas, mesuree et motivee a l endroit ou elle vit. Les six autres ont ete
 * fabriquees une a une sur `--reel` et s accumulent desormais : voir l encadre qui precede
 * `const issues = []`.
 *
 * L ORDRE DES CODES est inchange : `1` (anomalie de rendu) prime sur `2` (incapacite). Le
 * verdict du controle 13 vient APRES les deux : il ne peut plus les masquer, et il n est plus
 * perdu.
 */
if (blocs.site.length > 0) issues.push(ISSUES.ANOMALIE);
if (blocs.banc.length > 0) issues.push(ISSUES.VERIFICATION_IMPOSSIBLE);
if (controle13.issue !== ISSUES.CONFORME) issues.push(controle13.issue);

/*
 * L ARBITRAGE EN UN SEUL POINT, ET IL GARDE LE MESSAGE DE SUCCES.
 *
 * `1` prime sur `2`, comme avant — mais la regle vit maintenant dans `arbitrer`, ou elle
 * s exerce dans les deux sens sans construire le site. Ce qui change est qu il n y a plus
 * qu UN endroit ou l ordre est ecrit, au lieu de neuf `process.exit` dont l ordre etait
 * celui des lignes.
 *
 * ET C EST CE BLOC QUI GARDE LE VERT FINAL, dans son `else`. C est le defaut qui s est
 * glisse dans la correction du controle 13 le 2026-08-16 : le `process.exit` retire tenait
 * AUSSI lieu de garde pour le message de succes, et la sortie a imprime « AUCUNE page »
 * puis « TENU — 0 page(s) » sept lignes plus bas. Une sortie qui se contredit dans le meme
 * souffle est pire qu une sortie muette : on croit avoir mal lu.
 */
if (issues.length > 0) {
  process.exit(arbitrer(issues));
} else {
  console.log(
    `\n✔ [${source.libelle}] Dans chacune des ${LOCALES.length} locales (${LOCALES.join(', ')}), ` +
      `chaque page article rend exactement les blocs que ${source.poseur} lui pose, les ` +
      `${TYPES.length} types y compris — et aucun JavaScript n est servi.\n`,
  );
}
