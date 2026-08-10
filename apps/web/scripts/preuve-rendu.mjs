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
 * `npm run preuve:rendu`. La sortie va dans `dist/`, comme un build normal.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { demarrerServeurFixtures } from './serveur-fixtures.mjs';
import { inspecterSortie, resume } from './verifier-sortie.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Les huit blocs du §3.6, chacun reconnu par la classe que son composant pose. */
const SIGNATURES = {
  'bloc.texte': 'bloc-texte',
  'bloc.citation': 'bloc-citation',
  'bloc.galerie': 'bloc-galerie',
  'bloc.encadre': 'bloc-encadre',
  'bloc.video': 'bloc-video',
  'bloc.image-legendee': 'bloc-image',
  'bloc.separateur': 'bloc-separateur',
  'bloc.chiffres-cles': 'bloc-chiffres',
};

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

function pagesArticle(dist) {
  const dossier = path.join(dist, 'article');
  if (!fs.existsSync(dossier)) return [];
  return fs
    .readdirSync(dossier, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => ({
      slug: entree.name,
      html: path.join(dossier, entree.name, 'index.html'),
    }))
    .filter((page) => fs.existsSync(page.html));
}

const serveur = await demarrerServeurFixtures();
console.log(`\n▸ Strapi de substitution : ${serveur.url} (fixtures de tests/fixtures/)\n`);

const code = await lancer('npx', ['astro', 'build'], {
  ECHO_STRAPI_URL: serveur.url,
  ECHO_STRAPI_API_TOKEN_READONLY: 'jeton-de-fixture',
  ECHO_SITE_URL: 'https://echo.ayfiweb.fr',
});
await serveur.arreter();

if (code !== 0) {
  console.error(`\n✖ Le build a echoue (code ${code}).`);
  process.exit(code);
}

const dist = path.join(RACINE, 'dist');
const rapport = inspecterSortie(dist);
const pages = pagesArticle(dist);

console.log('\n─────────────  PREUVE DE RENDU  ─────────────\n');
console.log(`Sortie : ${resume(rapport)}`);
console.log(`Pages article generees : ${pages.length}`);

let complete = false;
for (const page of pages) {
  const html = fs.readFileSync(page.html, 'utf8');
  const absents = Object.entries(SIGNATURES)
    .filter(([, classe]) => !html.includes(classe))
    .map(([bloc]) => bloc);

  console.log(
    `  /article/${page.slug} : ${Object.keys(SIGNATURES).length - absents.length}/8 types de blocs` +
      (absents.length > 0 ? ` — absents : ${absents.join(', ')}` : ''),
  );
  if (absents.length === 0) complete = true;
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

function ecartsPiedDePage(dist) {
  /** La locale de REFERENCE, et elle seule — cf. l encadre ci-dessus. */
  const attendu = JSON.parse(
    fs.readFileSync(path.join(RACINE, 'tests', 'fixtures', 'configuration-fr.json'), 'utf8'),
  ).data.reseaux.map((r) => r.url);

  const ecarts = [];
  const inspectees = { fr: 0, en: 0 };

  for (const fichier of fs.readdirSync(dist, { recursive: true })) {
    const relatif = String(fichier).replace(/\\/g, '/');
    if (!relatif.endsWith('.html')) continue;

    const locale = relatif === 'en.html' || relatif.startsWith('en/') ? 'en' : 'fr';
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

  for (const locale of ['fr', 'en']) {
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
function ecartsCreditPortrait(dist) {
  const ecarts = [];
  let controles = 0;

  for (const locale of ['fr', 'en']) {
    const fichier = path.join(RACINE, 'tests', 'fixtures', `auteurs-${locale}.json`);
    if (!fs.existsSync(fichier)) {
      ecarts.push(`auteurs-${locale}.json absent : la page auteur « ${locale} » n est gardee par rien`);
      continue;
    }
    const prefixe = locale === 'fr' ? '' : 'en/';

    for (const auteur of JSON.parse(fs.readFileSync(fichier, 'utf8')).data) {
      const route = `/${prefixe}auteur/${auteur.slug}`;
      const page = path.join(dist, `${prefixe}auteur`, auteur.slug, 'index.html');
      if (!fs.existsSync(page)) {
        ecarts.push(`${route} : page absente de la sortie`);
        continue;
      }
      const html = fs.readFileSync(page, 'utf8');
      const positionImage = html.indexOf('index__portrait');
      const credit = /<p[^>]*class="[^"]*index__credit[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html);

      if (auteur.photo === null) {
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

const credits = ecartsCreditPortrait(dist);
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

const pied = ecartsPiedDePage(dist);
console.log(
  pied.ecarts.length === 0
    ? `Pied de page : bloc de reseaux conforme a la Configuration sur ${pied.inspectees.fr} page(s) fr et ${pied.inspectees.en} page(s) en.`
    : `Pied de page : ${pied.ecarts.length} ecart(s) — ${pied.inspectees.fr} page(s) fr, ${pied.inspectees.en} page(s) en inspectees.`,
);

if (rapport.manquements.length > 0) {
  console.error('\n✖ Manquements dans la sortie :');
  for (const manquement of rapport.manquements) console.error(`  - ${manquement}`);
  process.exit(1);
}

if (ecartsSociaux.length > 0) {
  console.error('\n✖ Accessibilite des liens de reseaux :');
  for (const ecart of ecartsSociaux) console.error(`  - ${ecart}`);
  process.exit(1);
}

if (pied.ecarts.length > 0) {
  console.error('\n✖ Pied de page (les deux locales) :');
  for (const ecart of pied.ecarts) console.error(`  - ${ecart}`);
  process.exit(1);
}

if (credits.ecarts.length > 0 || credits.controles === 0) {
  console.error('\n✖ Credit du portrait sur la page auteur :');
  for (const ecart of credits.ecarts) console.error(`  - ${ecart}`);
  if (credits.controles === 0) {
    console.error('  - aucune page auteur avec portrait : la preuve ne prouverait rien');
  }
  process.exit(1);
}

if (!complete) {
  console.error('\n✖ Aucune page article ne rend les 8 types de blocs.');
  process.exit(1);
}

console.log('\n✔ Une page article rend les 8 types de blocs, et aucun JavaScript n est servi.\n');
