/**
 * LE MIROIR DU SITE SERVI — la seconde source de la preuve de surcharge, la ou elle
 * n existe pas autrement.
 *
 * POURQUOI CE FICHIER EXISTE (2026-08-17, tache `3d546868`, acte de la decision
 * `49e9fc1a` branche A). `scripts/preuve-surcharge-seo.mjs` croise DEUX sources : le
 * corpus versionne et un `dist/`. Sur la machine qui joue le seed — le poste, seul
 * endroit ou le corpus entier existe — il n y a PAS de `dist/` : le build qui sert le
 * site tourne chez Coolify, et sa sortie n en sort jamais. Le miroir ramene donc la
 * seconde source depuis le SITE SERVI, en forme de `dist/`, et la preuve la juge sans
 * changer d une ligne.
 *
 * CE QU IL NE FAIT PAS, ET C EST LE POINT : il ne JUGE rien. Il rend `0` (le miroir est
 * complet) ou `2` (il ne l est pas), jamais `1`. Un miroir qui rendrait `1` melerait
 * « le site est faux » et « je n ai pas pu le lire » — exactement la confusion que la
 * convention des trois issues existe pour empecher.
 *
 * CHAQUE TEST CASSE UN POINT PRECIS D UN MIROIR SAIN. Le plus important est celui du
 * miroir PARTIEL : une page manquante ferait sauter la preuve en silence
 * (`lirePage` rend `null`, la boucle `continue`), et le verdict porterait alors sur un
 * echantillon dont personne n aurait choisi le contour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { construireMiroir, cheminsAMirroiter } from '../scripts/miroir-servi.mjs';
import { verifierSurchargeSeo } from '../scripts/preuve-surcharge-seo.mjs';
import { ISSUES } from '../scripts/issues.mjs';

const ORIGINE = 'https://echo.test';

const SURCHARGE = {
  metaTitre: 'Eolien : le verrou n est pas l enquete',
  metaDescription: 'L ecart de raccordement qui decidera du parc.',
  imagePartage: 'partage/A01-og.png',
  alternativePartage: 'Sharing card: six turbines on the ridge of the pass',
};

function ecrire(racine: string, rel: string, contenu: string): void {
  const cible = path.join(racine, rel);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, contenu, 'utf8');
}

/** Le meme corpus factice que la preuve : A01 surcharge, A02 nu, A40 noindex. */
function corpusFactice(): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-corpus-miroir-'));
  const a01 = {
    code: 'A01',
    slug: 'col-des-trois-vents',
    titre: 'Le col des Trois-Vents, dernier verrou',
    seo: { ...SURCHARGE },
  };
  const a02 = { code: 'A02', slug: 'le-plui-de-2027', titre: 'Ce que le PLUi de 2027 promet' };
  const a40 = {
    code: 'A40',
    slug: 'reponses-des-maires',
    titre: 'Ce que les 14 maires ont repondu',
    seo: { noindex: true },
  };
  for (const article of [a01, a02, a40]) {
    ecrire(racine, `articles/${article.code}.fr.md`, `---\n${JSON.stringify(article, null, 2)}\n---\n`);
  }
  ecrire(
    racine,
    'categories.json',
    JSON.stringify([{ fr: { nom: 'Territoire', slug: 'territoire', seo: { metaTitre: 'Territoire : la carte' } } }]),
  );
  ecrire(racine, 'dossiers.json', JSON.stringify([{ fr: { titre: 'L eau du plateau', slug: 'l-eau-du-plateau' } }]));
  return racine;
}

function page(opts: {
  titre: string;
  description?: string;
  ogImage?: string;
  ogImageAlt?: string;
  robots?: string;
}): string {
  return [
    '<!doctype html><html lang="fr"><head>',
    `<title>${opts.titre}</title>`,
    opts.description ? `<meta name="description" content="${opts.description}">` : '',
    `<meta property="og:title" content="${opts.titre}">`,
    `<meta property="og:image" content="${opts.ogImage ?? '/og/fr/defaut.png'}">`,
    opts.ogImageAlt === undefined ? '' : `<meta property="og:image:alt" content="${opts.ogImageAlt}">`,
    opts.ogImageAlt === undefined ? '' : `<meta name="twitter:image:alt" content="${opts.ogImageAlt}">`,
    opts.robots ? `<meta name="robots" content="${opts.robots}">` : '',
    '</head><body></body></html>',
  ].join('\n');
}

const SITEMAP_INDEX = [
  '<?xml version="1.0" encoding="UTF-8"?><sitemapindex>',
  `<sitemap><loc>${ORIGINE}/sitemap-pages.xml</loc></sitemap>`,
  '</sitemapindex>',
].join('\n');

const SITEMAP_PAGES = [
  '<?xml version="1.0" encoding="UTF-8"?><urlset>',
  `<url><loc>${ORIGINE}/article/col-des-trois-vents</loc></url>`,
  `<url><loc>${ORIGINE}/article/le-plui-de-2027</loc></url>`,
  `<url><loc>${ORIGINE}/categorie/territoire</loc></url>`,
  `<url><loc>${ORIGINE}/dossier/l-eau-du-plateau</loc></url>`,
  '</urlset>',
].join('\n');

/** Ce que le site servi rend, URL par URL — retouchable pour casser un point. */
function siteSain(retouche: (s: Record<string, { statut: number; corps?: string } | Error>) => void = () => {}) {
  const servi: Record<string, { statut: number; corps?: string } | Error> = {
    [`${ORIGINE}/sitemap-index.xml`]: { statut: 200, corps: SITEMAP_INDEX },
    [`${ORIGINE}/sitemap-pages.xml`]: { statut: 200, corps: SITEMAP_PAGES },
    [`${ORIGINE}/article/col-des-trois-vents/`]: {
      statut: 200,
      corps: page({
        titre: `${SURCHARGE.metaTitre} — L Echo`,
        description: SURCHARGE.metaDescription,
        ogImage: '/uploads/A01-og.png',
        ogImageAlt: SURCHARGE.alternativePartage,
      }),
    },
    [`${ORIGINE}/article/le-plui-de-2027/`]: {
      statut: 200,
      corps: page({ titre: 'Ce que le PLUi de 2027 promet — L Echo' }),
    },
    [`${ORIGINE}/article/reponses-des-maires/`]: {
      statut: 200,
      corps: page({ titre: 'Ce que les 14 maires ont repondu — L Echo', robots: 'noindex' }),
    },
    [`${ORIGINE}/categorie/territoire/`]: {
      statut: 200,
      corps: page({ titre: 'Territoire : la carte — L Echo' }),
    },
    [`${ORIGINE}/dossier/l-eau-du-plateau/`]: {
      statut: 200,
      corps: page({ titre: 'L eau du plateau — L Echo' }),
    },
  };
  retouche(servi);

  const vues: string[] = [];
  const recuperer = async (url: string) => {
    vues.push(url);
    const reponse = servi[url];
    if (reponse === undefined) return { statut: 404, corps: '' };
    if (reponse instanceof Error) throw reponse;
    return { statut: reponse.statut, corps: reponse.corps ?? '' };
  };
  return { recuperer, vues };
}

function destination(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'echo-miroir-')), 'miroir');
}

async function miroir(
  retoucheSite: (s: Record<string, { statut: number; corps?: string } | Error>) => void = () => {},
  options: { origine?: string } = {},
) {
  const corpus = corpusFactice();
  const dest = destination();
  const { recuperer, vues } = siteSain(retoucheSite);
  const rapport = await construireMiroir({
    origine: options.origine ?? ORIGINE,
    corpus,
    destination: dest,
    recuperer,
  });
  return { rapport, dest, corpus, vues };
}

/* ------------------------------------------------------------------ */

test('les chemins a mirroiter viennent du CORPUS, jamais d une liste ecrite ici', async () => {
  /* Le jour ou une route bouge, une liste en dur ferait passer le miroir a cote de
     toutes les pages concernees — et un miroir qui ne ramene rien ne signale rien. */
  const chemins = cheminsAMirroiter(corpusFactice());
  assert.deepEqual(
    [...chemins].sort(),
    [
      '/article/col-des-trois-vents',
      '/article/le-plui-de-2027',
      '/article/reponses-des-maires',
      '/categorie/territoire',
      '/dossier/l-eau-du-plateau',
    ],
    'les chemins doivent etre ceux que le corpus declare, calcules par les fonctions du build',
  );
});

test('un miroir complet rend CONFORME et depose les pages en forme de dist/', async () => {
  const { rapport, dest } = await miroir();

  assert.equal(rapport.issue, ISSUES.CONFORME, rapport.manquements.join(' | '));
  assert.equal(rapport.pagesEcrites, 5);
  assert.equal(rapport.segmentsSitemap, 1);
  assert.equal(
    fs.existsSync(path.join(dest, 'article', 'col-des-trois-vents', 'index.html')),
    true,
    'la page doit etre deposee la ou `lirePage` du preuve la cherche',
  );
  assert.equal(fs.existsSync(path.join(dest, 'sitemap-pages.xml')), true);
});

test('le miroir se demande AVEC le slash final — sinon le site repond en redirection', async () => {
  const { vues } = await miroir();
  assert.ok(
    vues.includes(`${ORIGINE}/article/col-des-trois-vents/`),
    `l URL demandee doit porter le slash final. Vues : ${vues.join(', ')}`,
  );
});

test('la preuve juge le miroir exactement comme elle juge un dist/', async () => {
  const { dest, corpus } = await miroir();
  const verdict = verifierSurchargeSeo(dest, corpus);
  assert.equal(verdict.issue, ISSUES.CONFORME, verdict.manquements.join(' | '));
  assert.equal(verdict.pagesLues, 5);
});

test('un site servi qui CONTREDIT le corpus fait rougir la preuve sur le miroir', async () => {
  /* Le sens qui compte : le miroir ne doit pas gommer un ecart reel. */
  const { dest, corpus } = await miroir((s) => {
    s[`${ORIGINE}/article/col-des-trois-vents/`] = {
      statut: 200,
      corps: page({ titre: 'Le col des Trois-Vents, dernier verrou — L Echo' }),
    };
  });
  const verdict = verifierSurchargeSeo(dest, corpus);
  assert.equal(verdict.issue, ISSUES.ANOMALIE);
  assert.ok(
    verdict.manquements.some((m: string) => m.includes('article A01 fr')),
    verdict.manquements.join(' | '),
  );
});

test('une page en 404 n est pas un manquement du miroir — elle est COMPTEE absente', async () => {
  /* Une page non emise est le domaine de `verifier-seo.mjs`, pas celui-ci. Mais elle se
     compte, sinon « le site ne l emet pas » et « je ne l ai pas demandee » se
     confondent. */
  const { rapport } = await miroir((s) => {
    delete s[`${ORIGINE}/dossier/l-eau-du-plateau/`];
  });
  assert.equal(rapport.issue, ISSUES.CONFORME, rapport.manquements.join(' | '));
  assert.equal(rapport.pagesEcrites, 4);
  assert.equal(rapport.pagesAbsentes, 1);
});

test('un statut ni 200 ni 404 rend VERIFICATION IMPOSSIBLE en NOMMANT l URL et le code', async () => {
  /* Le miroir serait PARTIEL, et la preuve sauterait la page en silence : son verdict
     porterait alors sur un echantillon que personne n a choisi. */
  const { rapport } = await miroir((s) => {
    s[`${ORIGINE}/article/le-plui-de-2027/`] = { statut: 502, corps: '' };
  });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  const dit = rapport.manquements.join(' | ');
  assert.ok(dit.includes('le-plui-de-2027'), dit);
  assert.ok(dit.includes('502'), dit);
});

test('une erreur reseau rend VERIFICATION IMPOSSIBLE en nommant l URL, jamais une anomalie', async () => {
  const { rapport } = await miroir((s) => {
    s[`${ORIGINE}/categorie/territoire/`] = new Error('ECONNREFUSED');
  });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.join(' | ').includes('territoire'), rapport.manquements.join(' | '));
});

test('un sitemap-index injoignable rend VERIFICATION IMPOSSIBLE — sans lui, A-29 se verifie a vide', async () => {
  /* Le controle A-29 exige qu une page `noindex` soit ABSENTE du sitemap. Un sitemap
     vide rend cette absence triviale : la preuve certifierait conforme sans avoir rien
     lu. Un miroir sans sitemap est donc une incapacite, jamais un miroir. */
  const { rapport } = await miroir((s) => {
    delete s[`${ORIGINE}/sitemap-index.xml`];
  });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.join(' | ').includes('sitemap'), rapport.manquements.join(' | '));
});

test('un segment de sitemap injoignable est une incapacite, pas un sitemap partiel', async () => {
  const { rapport } = await miroir((s) => {
    delete s[`${ORIGINE}/sitemap-pages.xml`];
  });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.join(' | ').includes('sitemap-pages'), rapport.manquements.join(' | '));
});

test('ZERO page ramenee rend VERIFICATION IMPOSSIBLE, jamais un miroir vide et vert', async () => {
  const { rapport } = await miroir((s) => {
    for (const url of Object.keys(s)) if (!url.includes('sitemap')) delete s[url];
  });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.join(' | ').toLowerCase().includes('aucune page'), rapport.manquements.join(' | '));
});

test('une origine illisible rend VERIFICATION IMPOSSIBLE en la NOMMANT', async () => {
  const { rapport } = await miroir(() => {}, { origine: '' });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(
    rapport.manquements.join(' | ').includes('origine'),
    rapport.manquements.join(' | '),
  );
});

test('un CORPUS absent rend VERIFICATION IMPOSSIBLE — le miroir n a pas de liste a ramener', async () => {
  const vide = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-corpus-vide-'));
  const rapport = await construireMiroir({
    origine: ORIGINE,
    corpus: vide,
    destination: destination(),
    recuperer: async () => ({ statut: 200, corps: '' }),
  });
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.ok(rapport.manquements.join(' | ').includes('corpus'), rapport.manquements.join(' | '));
});

test('la destination est PURGEE avant ecriture — un miroir d hier n est pas le site d aujourd hui', async () => {
  /* Le faux vert le plus facile a fabriquer : le site cesse d emettre une page, le
     miroir precedent la porte encore, et la preuve la juge conforme. */
  const corpus = corpusFactice();
  const dest = destination();
  ecrire(dest, 'article/page-qui-n-existe-plus/index.html', '<html></html>');

  const { recuperer } = siteSain();
  await construireMiroir({ origine: ORIGINE, corpus, destination: dest, recuperer });

  assert.equal(
    fs.existsSync(path.join(dest, 'article', 'page-qui-n-existe-plus', 'index.html')),
    false,
    'une page du miroir precedent survivante ferait juger un etat qui n est plus servi',
  );
});

test('le script de recette enchaine le MIROIR puis la PREUVE, et dans cet ordre', () => {
  /* L ordre n est pas cosmetique : la preuve lancee seule jugerait le miroir de la veille,
     ou un dossier vide — et un dossier vide rend `2`, pas un faux vert, mais un `2` dont la
     cause serait cherchee dans le mauvais objet.

     L enchainement se fait par `&&` : si le miroir rend `2`, la preuve NE TOURNE PAS et le
     code `2` sort tel quel. Un `;` ferait tourner la preuve sur un miroir avoue incomplet,
     donc rendrait un verdict sur ce que personne n a choisi de regarder. */
  const scripts = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
  ).scripts as Record<string, string>;

  const chaine = scripts['recette:surcharge-seo:servi'];
  assert.ok(chaine, 'le script `recette:surcharge-seo:servi` doit exister');
  const miroirAvant = chaine.indexOf('miroir-servi.mjs');
  const preuveApres = chaine.indexOf('preuve-surcharge-seo.mjs');
  assert.notEqual(miroirAvant, -1, chaine);
  assert.notEqual(preuveApres, -1, chaine);
  assert.ok(miroirAvant < preuveApres, `le miroir doit precéder la preuve : ${chaine}`);
  assert.ok(chaine.includes('&&'), `l enchainement doit etre conditionnel (&&) : ${chaine}`);

  /* LA FRONTIERE, reprise de `nixpacks-preuve-surcharge.test.ts` : le `build` que
     l integration continue lance sur fixtures ne doit toucher a rien de tout ceci. */
  assert.ok(!scripts.build.includes('miroir-servi.mjs'), scripts.build);
  assert.ok(!scripts.build.includes('preuve-surcharge-seo.mjs'), scripts.build);
});

test('le miroir est HORS du depot — un instantane du site servi ne se versionne pas', () => {
  /* Il change a chaque passage et porte le HTML de la production : le versionner ferait
     croire a un etat du depot, et polluerait chaque diff. */
  const ignore = fs.readFileSync(path.join(import.meta.dirname, '..', '.gitignore'), 'utf8');
  assert.ok(
    /^\.miroir-servi\/?$/m.test(ignore),
    `.gitignore d apps/web doit ignorer .miroir-servi. Contenu :\n${ignore}`,
  );
});

test('les trois issues sortent AUSSI en ligne de commande', () => {
  /* Le code de sortie est ce que le controle `ops/` lit : le prouver en fonction ne
     suffit pas. */
  const corpus = corpusFactice();
  const dest = destination();

  const impossible = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, '..', 'scripts', 'miroir-servi.mjs'), dest, 'pas-une-url', corpus],
    { encoding: 'utf8' },
  );
  assert.equal(
    impossible.status,
    ISSUES.VERIFICATION_IMPOSSIBLE,
    `sortie : ${impossible.stdout}${impossible.stderr}`,
  );
  assert.ok(
    `${impossible.stdout}${impossible.stderr}`.includes('VERIFICATION IMPOSSIBLE'),
    `${impossible.stdout}${impossible.stderr}`,
  );
});
