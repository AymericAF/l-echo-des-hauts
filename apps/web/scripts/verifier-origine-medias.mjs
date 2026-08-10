/**
 * Confronte l ORIGINE de chaque image de la sortie a l arbitrage T-01.
 *
 * LE DEFAUT QUE CE FICHIER FERME. Le 2026-08-08, la recette technique (tache `e100971e`)
 * a constate que le site en ligne n affichait AUCUNE image. Cause : `src/lib/media.ts`
 * absolutisait les URL de la mediatheque contre `ECHO_STRAPI_URL`, donc vers
 * `echoback.ayfiweb.fr`, quand la CSP servie porte `img-src 'self' data:`. Le navigateur
 * refusait les 21 `<img>` de l accueil. Sur 86 URL, l inventaire reseau relevait 86
 * documents, 107 feuilles de style et ZERO image, pour des fichiers qui repondaient
 * pourtant en 200 : pas une image manquante, une image INTERDITE.
 *
 * IL EST PASSE SOUS DES TESTS VERTS ET UN BUILD VERT, et ce n est pas un hasard : aucune
 * garde ne regardait cet endroit. `verifier-images.mjs` verifie les dimensions et le
 * `loading`, jamais l hote. `verifier-liens.mjs` s interdit explicitement les `src`
 * d images (« qui pointent Strapi et vivent hors du site » — commentaire depuis corrige).
 * `verifier-seo.mjs` ignore un `og:image` externe comme « hors garde ». Le trou etait a
 * l intersection exacte des trois.
 *
 * LA REGLE TENUE ICI N EST PAS UNE RECOPIE DE LA CSP. L en-tete vit dans les labels
 * Traefik de l application Coolify (`docs/runbook-provisionnement.md`, etape 27) et n a
 * aucun domicile dans ce depot ; en recopier la valeur creerait la seconde source de
 * verite que ce projet corrige partout ailleurs. Ce qui est tenu ici est l ARBITRAGE
 * T-01 (`docs/arbitrages-techniques.md`) : « l image servie depuis notre propre domaine,
 * telechargee au build ». Une reference de meme origine, ou une `data:` URI, satisfait
 * `'self' data:` quelle que soit la formulation exacte de l en-tete ; tout le reste est
 * refuse. La garde reste donc juste si la CSP est reecrite, et ne devient fausse que si
 * T-01 est renverse — auquel cas c est ce fichier qu il faut changer, en le sachant.
 *
 * DEUX CLASSES, SEPAREES DANS LE MESSAGE. Une image d origine etrangere et un media local
 * absent de `dist/` produisent le meme ecran — une page sans images — pour des causes
 * opposees. Les confondre enverrait chercher la mauvaise.
 *
 * PORTEE : toutes les pages HTML, `/recherche` comprise ; l exception de T-09 porte sur
 * le JavaScript, jamais sur les images.
 *
 * `npm run verifier:origine-medias` pour inspecter un `dist/` deja construit. Ce qui rend
 * la clause opposable en machine, c est `integrations/garde-origine-medias.mjs`, qui
 * appelle cette fonction DEPUIS le build et le fait sortir en code non nul.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ISSUES, manquementCorpusVide } from './issues.mjs';
import { lireOrigine } from './origine.mjs';
import { normaliser, routeDuFichier } from './verifier-liens.mjs';

/**
 * Les positions d IMAGE du HTML : celles que la directive `img-src` de la CSP gouverne.
 *
 * `link rel="icon"` en fait partie et se glisse volontiers a travers une garde ecrite
 * pour les `<img>` — c est pourtant la premiere ressource que le navigateur demande.
 */
const POSITIONS = [
  { balise: 'img', attribut: 'src', liste: false, nom: 'img[src]' },
  { balise: 'img', attribut: 'srcset', liste: true, nom: 'img[srcset]' },
  { balise: 'source', attribut: 'src', liste: false, nom: 'source[src]' },
  { balise: 'source', attribut: 'srcset', liste: true, nom: 'source[srcset]' },
];

/** Les `<meta>` de partage qui portent une image, et que la CSP gouverne aussi. */
const METAS_IMAGE = new Set([
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'twitter:image',
  'twitter:image:src',
]);

/** Les valeurs de `rel` qui font d un `<link>` une image. */
const RELS_IMAGE = /(^|\s)(icon|shortcut icon|apple-touch-icon(-precomposed)?|mask-icon)(\s|$)/i;

/** La directive citee dans un refus : c est elle qui bloque, dans le navigateur. */
const DIRECTIVE = "img-src 'self' data:";

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(complet));
    else trouves.push(complet);
  }
  return trouves;
}

function attribut(balise, nom) {
  const trouve = balise.match(new RegExp(`\\s${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return trouve === null ? null : (trouve[1] ?? trouve[2] ?? '');
}

/**
 * Les URL d un `srcset`, sans leurs descripteurs.
 *
 * Un descripteur peut contenir une virgule dans aucune forme valide, mais une URL le
 * peut (`,` est legal dans un chemin) : on decoupe donc sur « virgule suivie d espace ou
 * de fin », puis on prend le premier mot de chaque candidat.
 */
export function urlsDuSrcset(valeur) {
  return valeur
    .split(/\s*,\s+|\s*,\s*$/)
    .map((candidat) => candidat.trim().split(/\s+/)[0])
    .filter((url) => url !== '' && url !== undefined);
}

/** Toutes les references d image d une page, avec la position qui les porte. */
export function referencesDImages(html) {
  const trouvees = [];

  for (const position of POSITIONS) {
    const motif = new RegExp(`<${position.balise}\\b[^>]*>`, 'gi');
    for (const [balise] of html.matchAll(motif)) {
      const valeur = attribut(balise, position.attribut);
      if (valeur === null) continue;
      const urls = position.liste ? urlsDuSrcset(valeur) : [valeur.trim()];
      for (const url of urls) trouvees.push({ url, position: position.nom });
    }
  }

  for (const [balise] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const cle = attribut(balise, 'property') ?? attribut(balise, 'name');
    if (cle === null || !METAS_IMAGE.has(cle)) continue;
    const valeur = attribut(balise, 'content');
    if (valeur !== null) trouvees.push({ url: valeur.trim(), position: cle });
  }

  for (const [balise] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribut(balise, 'rel');
    if (rel === null || !RELS_IMAGE.test(rel)) continue;
    const valeur = attribut(balise, 'href');
    if (valeur !== null) trouvees.push({ url: valeur.trim(), position: `link[rel=${rel}]` });
  }

  return trouvees;
}

/**
 * @param {string} dist Chemin du repertoire de sortie.
 * @param {string} origine URL publique du site (`ECHO_SITE_URL`).
 * @returns {{manquements: string[], issue: number, references: number, pages: number}}
 */
export function inspecterOrigineMedias(dist, origine) {
  const rien = { references: 0, pages: 0 };

  /* AVANT TOUT : la reference. Sans elle, ce fichier ne rendait pas un vert mais une
     FAUSSE ACCUSATION — 44 manquements le 2026-08-10, chacun denoncant
     `https://echo.ayfiweb.fr`, notre propre origine, comme « hote hors du site ». Le
     nom denonce venait de `https://invalide.invalid`, une base fabriquee. C est la
     meme faute que le laissez-passer des deux autres : une incapacite rendue sous la
     forme d une reponse plausible — ici un verdict rouge, qui envoie corriger un site
     sain. */
  const lecture = lireOrigine(origine);
  if (!lecture.lisible) {
    return { manquements: [lecture.manquement], issue: lecture.issue, ...rien };
  }
  const hote = lecture.hote;

  if (!fs.existsSync(dist)) {
    return {
      manquements: [`sortie absente : ${dist}`],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...rien,
    };
  }

  const tous = fichiersDe(dist).map((f) => path.relative(dist, f).split(path.sep).join('/'));

  /* SECONDE INCAPACITE : `dist/` existe et ne porte pas une seule page. Jusqu au
     2026-08-10 ce cas rendait « ✔ 0 reference(s) d image sur 0 page(s) : toutes servies
     par le site ou en data:, toutes presentes dans la sortie » et le code `0` — la
     formulation exacte du defaut du 2026-08-08, mais cette fois sur zero page. Le
     declencheur est « zero PAGE inspectee », JAMAIS « zero reference trouvee » : une page
     sans media reste conforme. Argument et message : `./issues.mjs`. */
  if (!tous.some((relatif) => relatif.endsWith('.html'))) {
    return {
      manquements: [manquementCorpusVide(dist, tous.length)],
      issue: ISSUES.VERIFICATION_IMPOSSIBLE,
      ...rien,
    };
  }

  const routes = new Set();
  for (const relatif of tous) {
    const route = routeDuFichier(relatif);
    if (route !== null) routes.add(route);
  }
  const servis = new Set(tous.map((relatif) => `/${relatif}`));

  const manquements = [];
  let references = 0;
  let pages = 0;

  for (const relatif of tous) {
    if (!relatif.endsWith('.html')) continue;
    pages += 1;
    const source = routeDuFichier(relatif);
    const html = fs.readFileSync(path.join(dist, relatif), 'utf8');

    for (const { url, position } of referencesDImages(html)) {
      if (url === '' || url.startsWith('#')) continue;
      references += 1;

      // La CSP autorise `data:` explicitement — c est le seul schema qui passe.
      if (/^data:/i.test(url)) continue;

      let chemin;
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) {
        const absolue = (() => {
          try {
            return new URL(url, hote);
          } catch {
            return null;
          }
        })();
        if (absolue === null) {
          manquements.push(`${relatif} → ${position} : URL illisible « ${url} »`);
          continue;
        }
        if (absolue.origin !== hote) {
          manquements.push(
            `${relatif} → ${position} « ${url} » : hote ${absolue.origin}, hors du site. ` +
              `La CSP servie (« ${DIRECTIVE} ») REFUSE cette image dans le navigateur — ` +
              'elle sera declaree dans la page et jamais peinte, exactement comme le ' +
              '2026-08-08. T-01 : le media est servi DEPUIS NOTRE DOMAINE, telecharge au build.',
          );
          continue;
        }
        chemin = normaliser(absolue.pathname);
      } else {
        const base = new URL(source === '/' ? '/' : `${source}/`, 'https://interne.invalid');
        chemin = normaliser(new URL(url, base).pathname);
      }

      if (routes.has(chemin) || servis.has(chemin)) continue;

      manquements.push(
        `${relatif} → ${position} « ${chemin} » : aucun fichier de dist/ ne repond a ce ` +
          'chemin. L origine est bonne, ce sont les OCTETS qui manquent — le ' +
          'telechargement de la mediatheque (integrations/medias-locaux.mjs) n a pas ' +
          'depose ce fichier.',
      );
    }
  }

  return {
    manquements,
    issue: manquements.length > 0 ? ISSUES.ANOMALIE : ISSUES.CONFORME,
    references,
    pages,
  };
}

/** Le compte rendu au vert, en une ligne. */
export function resumeOrigineMedias(rapport) {
  return (
    `${rapport.references} reference(s) d image sur ${rapport.pages} page(s) : ` +
    'toutes servies par le site ou en data:, toutes presentes dans la sortie.'
  );
}

// --- Usage en ligne de commande -------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = process.argv[2] ?? path.join(racine, 'dist');
  const origine = process.argv[3] ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
  const rapport = inspecterOrigineMedias(dist, origine);
  if (rapport.issue === ISSUES.VERIFICATION_IMPOSSIBLE) {
    console.error('\n⛔ VERIFICATION IMPOSSIBLE — aucune reference d image n a ete jugee :');
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.VERIFICATION_IMPOSSIBLE);
  }
  if (rapport.manquements.length > 0) {
    console.error(`\n✖ ${rapport.manquements.length} manquement(s) :`);
    for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
    process.exit(ISSUES.ANOMALIE);
  }
  console.log(`✔ ${resumeOrigineMedias(rapport)}`);
}
