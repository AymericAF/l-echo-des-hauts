/**
 * Confronte les liens EMIS a l arborescence REELLEMENT produite.
 *
 * T-06 : « Le build echoue si l une des URL produites — lien de bascule ou `hreflang` —
 * n appartient pas au registre des routes reellement emises. Sans cette assertion, la
 * classe entiere des liens morts de bascule ne se decouvre qu en cliquant, c est-a-dire
 * jamais en test automatise. »
 *
 * Ce fichier va un cran plus loin que la lettre de T-06, et volontairement : il ne
 * compare pas les liens au REGISTRE mais a `dist/`. Comparer le registre a lui-meme
 * prouverait sa coherence interne ; ce qu on veut savoir, c est s il decrit le site
 * produit. Si un jour `getStaticPaths` cesse d emettre ce que le registre annonce, seule
 * cette lecture-la le voit.
 *
 * Ce qu il regarde : les `href` des `<a>` et des `<link>` (donc `canonical`,
 * `alternate hreflang` — et, depuis T-01, `rel="icon"`). Ce qu il ne regarde pas : les
 * `src` et `srcset` d images, qui ont leur propre garde.
 *
 * CE COMMENTAIRE A PORTE UNE AFFIRMATION FAUSSE JUSQU AU 2026-08-09 : « les medias
 * pointent Strapi et vivent hors du site — les verifier ici remonterait un manquement
 * par image sur un site parfaitement sain ». C etait la description d un DEFAUT prise
 * pour une propriete du site. Les medias sont desormais telecharges au build et servis
 * sous `/medias/` (T-01, `src/lib/media.ts`) : un `src` interne est donc verifiable, et
 * il l est — par `scripts/verifier-origine-medias.mjs`, qui verifie EN PLUS leur origine.
 *
 * Utilisable a la main sur un `dist/` deja construit :
 *   node scripts/verifier-liens.mjs [dist] [origine]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES, manquementCorpusVide } from './issues.mjs';
import { lireOrigine } from './origine.mjs';

/** Protocoles qui ne designent pas une page du site. */
const HORS_PERIMETRE = /^(mailto:|tel:|javascript:|data:|#)/i;

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

/** Forme canonique : sans requete, sans fragment, sans slash final (hors racine). */
export function normaliser(chemin) {
  const sansFragment = chemin.split('#')[0].split('?')[0];
  const sansSlashFinal = sansFragment.replace(/\/+$/, '');
  if (sansSlashFinal === '') return '/';
  return sansSlashFinal.startsWith('/') ? sansSlashFinal : `/${sansSlashFinal}`;
}

/**
 * La route qu un fichier HTML sert.
 *
 * `x/index.html` → `/x` (format `directory` d astro.config.mjs) ; `404.html` → `/404`,
 * parce qu Astro traite cette page a part et n en fait pas un repertoire.
 */
export function routeDuFichier(relatif) {
  if (relatif === 'index.html') return '/';
  if (relatif.endsWith('/index.html')) return `/${relatif.slice(0, -'/index.html'.length)}`;
  if (relatif.endsWith('.html')) return `/${relatif.slice(0, -'.html'.length)}`;
  return null;
}

/** Les `href` d une page, avec la balise qui les porte (pour nommer la source d un defaut). */
function liensDe(html) {
  const trouves = [];
  for (const [balise] of html.matchAll(/<(?:a|link)\b[^>]*>/gi)) {
    const href = balise.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!href) continue;
    trouves.push({ href: (href[1] ?? href[2] ?? '').trim(), balise });
  }
  return trouves;
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {string} origine URL publique du site (`ECHO_SITE_URL`) : un lien absolu vers
 *   cette origine designe une page du site et doit donc aboutir.
 * @returns {{manquements: string[], issue: number, routes: number, liens: number, fichiers: number}}
 */
export function inspecterLiens(dist, origine) {
  const rien = { routes: 0, liens: 0, fichiers: 0 };

  /* AVANT TOUT : la reference. Sans elle, tout lien absolu serait classe « externe,
     hors garde » et la fonction rendrait un vert sur une sortie qu elle n a pas
     regardee — 114 liens sur 425 le 2026-08-10, sans un mot. */
  const lecture = lireOrigine(origine);
  if (!lecture.lisible) {
    return { manquements: [lecture.manquement], issue: lecture.issue, ...rien };
  }
  const hote = lecture.hote;

  if (!fs.existsSync(dist)) {
    /* Meme classe : la preuve n a pas eu lieu. Une sortie absente n est pas un site
       sans lien mort, et ne doit pas rendre le meme code qu une anomalie. */
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...rien,
    };
  }

  const tous = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));

  /* SECONDE INCAPACITE : `dist/` existe et ne porte pas une seule page. Jusqu au
     2026-08-10 ce cas rendait « ✔ 0 lien(s) interne(s) sur 0 route(s) : tous aboutissent
     dans dist/ » et le code `0` — une affirmation universelle sur l ensemble vide, servie
     comme une preuve. Le declencheur est « zero PAGE inspectee », JAMAIS « zero lien
     trouve » : une page sans `<a>` ni `<link>` reste conforme. Argument : `./issues.mjs`. */
  if (!tous.some((relatif) => relatif.endsWith('.html'))) {
    return {
      manquements: [manquementCorpusVide(dist, tous.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...rien,
      fichiers: tous.length,
    };
  }

  const routes = new Set();
  for (const relatif of tous) {
    const route = routeDuFichier(relatif);
    if (route !== null) routes.add(route);
  }
  /* Un lien peut viser un fichier servi qui n est pas une page : `/rss.xml`,
     `/favicon.svg`, `/sitemap-index.xml`. Ce sont des cibles valides. */
  const servis = new Set(tous.map((relatif) => `/${relatif}`));

  const manquements = [];
  let liens = 0;

  for (const relatif of tous) {
    if (!relatif.endsWith('.html')) continue;
    const source = routeDuFichier(relatif);
    const html = fs.readFileSync(path.join(dist, relatif), 'utf8');

    for (const { href, balise } of liensDe(html)) {
      if (href === '' || HORS_PERIMETRE.test(href)) continue;

      let chemin;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
        const absolue = (() => {
          try {
            return new URL(href, hote);
          } catch {
            return null;
          }
        })();
        if (absolue === null) {
          manquements.push(`${relatif} : href illisible « ${href} »`);
          continue;
        }
        /* Un lien REELLEMENT externe reste hors garde, et le reste en silence : c est
           un lien sortant legitime, pas un defaut. Ce `continue`-la est correct — il ne
           l etait plus quand `hote === null` le declenchait aussi, parce qu alors il ne
           disait plus « ce lien est ailleurs » mais « je n ai pas su regarder ». */
        if (absolue.origin !== hote) continue;
        chemin = normaliser(absolue.pathname);
      } else {
        // Relatif ou absolu-racine : resolu depuis la ROUTE de la page, pas depuis la racine.
        const base = new URL(source === '/' ? '/' : `${source}/`, 'https://interne.invalid');
        chemin = normaliser(new URL(href, base).pathname);
      }

      liens += 1;
      if (routes.has(chemin) || servis.has(chemin)) continue;

      manquements.push(
        `${relatif} : lien mort vers « ${chemin} » — aucune page ni aucun fichier de dist/ ` +
          `ne repond a cette URL (balise : ${balise.slice(0, 120)})`,
      );
    }
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    routes: routes.size,
    liens,
    fichiers: tous.length,
  };
}

export function resumeLiens(rapport) {
  return `${rapport.liens} lien(s) interne(s) sur ${rapport.routes} route(s) : tous aboutissent dans dist/.`;
}

/* Execution directe : `node scripts/verifier-liens.mjs [dist] [origine]`. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const origine = process.argv[3] ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
  const rapport = inspecterLiens(dist, origine);
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('⛔ VERIFICATION IMPOSSIBLE — aucun lien n a ete juge :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`✖ ${rapport.manquements.length} lien(s) mort(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeLiens(rapport)}`);
}
