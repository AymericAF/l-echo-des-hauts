/**
 * La garde de surcharge SEO attrape-t-elle ce qu elle pretend garder ?
 *
 * Une garde qui n a jamais rougi ne prouve rien : elle peut lire le mauvais fichier,
 * chercher la mauvaise balise, ou ne rien trouver du tout et se taire. Chaque test
 * ci-dessous CASSE un point precis d un site sain et exige le manquement
 * correspondant — c est la seule facon de savoir que le silence, sur le vrai build,
 * est un silence informe.
 *
 * Le dernier test est le plus important : il verifie que la garde signale quand elle
 * n a RIEN pu lire. Sans lui, un `dist/` vide passerait pour un site conforme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { verifierSurchargeSeo } from '../scripts/preuve-surcharge-seo.mjs';
import { ISSUES } from '../scripts/issues.mjs';

const ORIGINE = 'https://echo.test';

const SURCHARGE = {
  metaTitre: 'Eolien : le verrou n est pas l enquete',
  metaDescription: 'L ecart de raccordement qui decidera du parc.',
  imagePartage: 'partage/A01-og.png',
};

/* ------------------------------------------------------------------ */
/* Un corpus et un dist minimaux, tous deux retouchables               */
/* ------------------------------------------------------------------ */

function ecrire(racine: string, rel: string, contenu: string): void {
  const cible = path.join(racine, rel);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, contenu, 'utf8');
}

/** Le corpus : A01 surcharge, A02 nu, A40 en noindex, une categorie, un dossier. */
function corpusFactice(retouche: (c: any) => void = () => {}): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-corpus-seo-'));
  const c = {
    a01: {
      code: 'A01',
      slug: 'col-des-trois-vents',
      titre: 'Le col des Trois-Vents, dernier verrou',
      seo: { ...SURCHARGE },
    },
    a02: { code: 'A02', slug: 'le-plui-de-2027', titre: 'Ce que le PLUi de 2027 promet' },
    a40: { code: 'A40', slug: 'reponses-des-maires', titre: 'Ce que les 14 maires ont repondu',
      seo: { noindex: true } },
    categorie: { nom: 'Territoire', slug: 'territoire', seo: { metaTitre: 'Territoire : la carte' } },
    dossier: { titre: 'L eau du plateau', slug: 'l-eau-du-plateau' },
  };
  retouche(c);

  for (const article of [c.a01, c.a02, c.a40]) {
    ecrire(racine, `articles/${article.code}.fr.md`, `---\n${JSON.stringify(article, null, 2)}\n---\n`);
  }
  ecrire(racine, 'categories.json', JSON.stringify([{ fr: c.categorie }]));
  ecrire(racine, 'dossiers.json', JSON.stringify([{ fr: c.dossier }]));
  return racine;
}

function page(opts: {
  titre: string;
  description?: string;
  ogImage?: string;
  canonique?: string;
  robots?: string;
}): string {
  return [
    '<!doctype html><html lang="fr"><head>',
    `<title>${opts.titre}</title>`,
    opts.description ? `<meta name="description" content="${opts.description}">` : '',
    `<meta property="og:title" content="${opts.titre}">`,
    `<meta property="og:image" content="${opts.ogImage ?? '/og/fr/defaut.png'}">`,
    opts.canonique ? `<link rel="canonical" href="${opts.canonique}">` : '',
    opts.robots ? `<meta name="robots" content="${opts.robots}">` : '',
    '</head><body></body></html>',
  ].join('\n');
}

/** Un `dist/` conforme au corpus factice : la surcharge sort, le repli aussi. */
function distSain(retouche: (d: Record<string, string | null>) => void = () => {}): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-dist-seo-'));
  const fichiers: Record<string, string | null> = {
    'article/col-des-trois-vents/index.html': page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: '/uploads/A01-og.png',
    }),
    'article/le-plui-de-2027/index.html': page({
      titre: 'Ce que le PLUi de 2027 promet — L Echo',
    }),
    'article/reponses-des-maires/index.html': page({
      titre: 'Ce que les 14 maires ont repondu — L Echo',
      robots: 'noindex',
    }),
    'categorie/territoire/index.html': page({ titre: 'Territoire : la carte — L Echo' }),
    'dossier/l-eau-du-plateau/index.html': page({ titre: 'L eau du plateau — L Echo' }),
    'sitemap-pages.xml': [
      '<?xml version="1.0" encoding="UTF-8"?><urlset>',
      `<url><loc>${ORIGINE}/article/col-des-trois-vents</loc></url>`,
      `<url><loc>${ORIGINE}/article/le-plui-de-2027</loc></url>`,
      `<url><loc>${ORIGINE}/categorie/territoire</loc></url>`,
      `<url><loc>${ORIGINE}/dossier/l-eau-du-plateau</loc></url>`,
      '</urlset>',
    ].join('\n'),
  };
  retouche(fichiers);

  for (const [rel, contenu] of Object.entries(fichiers)) {
    if (contenu !== null) ecrire(racine, rel, contenu);
  }
  return racine;
}

function inspecter(
  retoucheDist: (d: Record<string, string | null>) => void = () => {},
  retoucheCorpus: (c: any) => void = () => {}
) {
  return verifierSurchargeSeo(distSain(retoucheDist), corpusFactice(retoucheCorpus));
}

/* ------------------------------------------------------------------ */

test('un site conforme au corpus ne remonte aucun manquement', () => {
  const { manquements, pagesLues, issue } = inspecter();

  assert.deepEqual(manquements, []);
  assert.equal(pagesLues, 5);
  assert.equal(issue, ISSUES.CONFORME);
});

test('une page qui sert le REPLI la ou le corpus surcharge est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: 'Le col des Trois-Vents, dernier verrou — L Echo',
    });
  });

  assert.equal(manquements.length >= 1, true);
  assert.match(manquements.join('\n'), /metaTitre surcharge/);
});

test('une meta description restee au repli est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: 'Six machines, 19,8 megawatts, quatre ans d instruction.',
      ogImage: '/uploads/A01-og.png',
    });
  });

  assert.match(manquements.join('\n'), /meta description vaut/);
});

test('un og:image qui ignore l image surchargee est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: '/og/fr/col-des-trois-vents.png',
    });
  });

  assert.match(manquements.join('\n'), /og:image/);
});

test('une canonique surchargee non honoree est un manquement (A-27)', () => {
  const { manquements } = inspecter(
    (d) => {
      d['article/le-plui-de-2027/index.html'] = page({
        titre: 'Ce que le PLUi de 2027 promet — L Echo',
        canonique: `${ORIGINE}/article/le-plui-de-2027`,
      });
    },
    (c) => {
      c.a02.seo = { canonique: `${ORIGINE}/dossier/l-eau-du-plateau` };
    }
  );

  assert.match(manquements.join('\n'), /canonique vaut/);
});

test('un noindex demande par le corpus mais absent du HTML est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/reponses-des-maires/index.html'] = page({
      titre: 'Ce que les 14 maires ont repondu — L Echo',
    });
  });

  assert.match(manquements.join('\n'), /ne porte pas <meta name="robots"/);
});

test('un noindex POSE sur une page qui ne le demande pas est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/le-plui-de-2027/index.html'] = page({
      titre: 'Ce que le PLUi de 2027 promet — L Echo',
      robots: 'noindex',
    });
  });

  assert.match(manquements.join('\n'), /desindexee/);
});

test('une page noindex encore declaree au sitemap est un manquement (A-29)', () => {
  const { manquements } = inspecter((d) => {
    d['sitemap-pages.xml'] = [
      '<?xml version="1.0" encoding="UTF-8"?><urlset>',
      `<url><loc>${ORIGINE}/article/reponses-des-maires</loc></url>`,
      '</urlset>',
    ].join('\n');
  });

  assert.match(manquements.join('\n'), /declaree au sitemap/);
});

test('une surcharge qui FUIT sur une page nue est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/le-plui-de-2027/index.html'] = page({ titre: `${SURCHARGE.metaTitre} — L Echo` });
  });

  assert.match(manquements.join('\n'), /sans reprendre le repli calcule/);
});

test('un corpus SANS aucune surcharge est signale — le mecanisme n est plus exerce', () => {
  const { manquements } = inspecter(
    () => {},
    (c) => {
      delete c.a01.seo;
      delete c.a40.seo;
      delete c.categorie.seo;
    }
  );

  assert.match(manquements.join('\n'), /aucune entree du corpus ne porte de surcharge/);
});

/* ------------------------------------------------------------------ */
/* Les trois issues — la distinction qui rend le vert lisible           */
/* ------------------------------------------------------------------ */

test('un dist VIDE rend VERIFICATION IMPOSSIBLE, jamais une anomalie', () => {
  const { manquements, issue } = inspecter((d) => {
    for (const cle of Object.keys(d)) d[cle] = null;
  });

  assert.equal(issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(manquements.join('\n'), /n a donc RIEN verifie/);
});

test('un manquement reel rend ANOMALIE — le geste est de corriger le site', () => {
  const { issue } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: 'Le col des Trois-Vents, dernier verrou — L Echo',
    });
  });

  assert.equal(issue, ISSUES.ANOMALIE);
});

test('les trois issues sortent AUSSI en ligne de commande, pas seulement en fonction', () => {
  const script = path.join(import.meta.dirname, '..', 'scripts', 'preuve-surcharge-seo.mjs');
  const corpus = corpusFactice();

  const lancer = (dist: string) =>
    spawnSync(process.execPath, [script, dist, corpus], { encoding: 'utf8' }).status;

  assert.equal(lancer(distSain()), ISSUES.CONFORME);
  assert.equal(
    lancer(
      distSain((d) => {
        d['article/col-des-trois-vents/index.html'] = page({ titre: 'Le col des Trois-Vents — L Echo' });
      })
    ),
    ISSUES.ANOMALIE
  );
  assert.equal(
    lancer(fs.mkdtempSync(path.join(os.tmpdir(), 'echo-dist-absent-'))),
    ISSUES.VERIFICATION_IMPOSSIBLE
  );
});
