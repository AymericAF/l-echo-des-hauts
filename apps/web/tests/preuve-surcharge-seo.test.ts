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
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { verifierSurchargeSeo } from '../scripts/preuve-surcharge-seo.mjs';
import { ISSUES } from '../scripts/issues.mjs';
import { harnaisDeBacs } from '../../../outils/banc-jetable.mjs';

/* LE BAC JETABLE SE RETIRE, ET IL SE RETIRE MEME QUAND UN CAS CASSE.
   `after()` est le `finally` de `node:test` : il joue que les cas soient verts ou rouges — et
   une recette qui prouve en cassant a l echec pour regime normal, pas pour accident. Le filet
   `process.on('exit')` du harnais reprend la main sur ce qu `after()` ne voit pas : un
   `process.exit`, ou une erreur au chargement du module. Motif, mesure et perimetre du
   retrait : `outils/banc-jetable.mjs`. */
const bacs = harnaisDeBacs();
after(() => bacs.rendreCompte(bacs.nettoyer()));


const ORIGINE = 'https://echo.test';

const SURCHARGE = {
  metaTitre: 'Eolien : le verrou n est pas l enquete',
  metaDescription: 'L ecart de raccordement qui decidera du parc.',
  imagePartage: 'partage/A01-og.png',
  alternativePartage: 'Sharing card: six turbines on the ridge of the pass',
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
  const racine = bacs.creer('echo-corpus-seo-');
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
  ogImageAlt?: string;
  canonique?: string;
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
    opts.canonique ? `<link rel="canonical" href="${opts.canonique}">` : '',
    opts.robots ? `<meta name="robots" content="${opts.robots}">` : '',
    '</head><body></body></html>',
  ].join('\n');
}

/** Un `dist/` conforme au corpus factice : la surcharge sort, le repli aussi. */
function distSain(retouche: (d: Record<string, string | null>) => void = () => {}): string {
  const racine = bacs.creer('echo-dist-seo-');
  const fichiers: Record<string, string | null> = {
    'article/col-des-trois-vents/index.html': page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: '/uploads/A01-og.png',
      ogImageAlt: SURCHARGE.alternativePartage,
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

/* LE DEFAUT DU 2026-08-14, ET IL EST PASSE AU TRAVERS DE TOUT : la carte de partage de
   A01 SORTAIT bien — `og:image` la designait —, mais son `og:image:alt` restait FRANCAIS
   sur la page anglaise. Le controle regardait l image et pas le texte qui l accompagne.
   Ce texte est ENTENDU : un lecteur d ecran l annonce quand l image ne charge pas. */
test('un og:image:alt reste au texte FRANCAIS la ou le corpus surcharge est un manquement', () => {
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: '/uploads/A01-og.png',
      ogImageAlt: 'Carte de partage de A01 : six eoliennes sur la crete du col',
    });
  });

  assert.match(manquements.join('\n'), /og:image:alt/);
});

test('un og:image:alt ABSENT alors que le corpus surcharge est un manquement — le silence n est pas un repli', () => {
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: '/uploads/A01-og.png',
    });
  });

  assert.match(manquements.join('\n'), /og:image:alt/);
});

test('un twitter:image:alt qui DIVERGE de l og:image:alt est un manquement — les deux sont lus', () => {
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = [
      '<!doctype html><html lang="fr"><head>',
      `<title>${SURCHARGE.metaTitre} — L Echo</title>`,
      `<meta name="description" content="${SURCHARGE.metaDescription}">`,
      `<meta property="og:title" content="${SURCHARGE.metaTitre} — L Echo">`,
      '<meta property="og:image" content="/uploads/A01-og.png">',
      `<meta property="og:image:alt" content="${SURCHARGE.alternativePartage}">`,
      '<meta name="twitter:image:alt" content="Carte de partage de A01">',
      '</head><body></body></html>',
    ].join('\n');
  });

  assert.match(manquements.join('\n'), /twitter:image:alt/);
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

test('un CORPUS absent rend VERIFICATION IMPOSSIBLE en le NOMMANT, jamais un ENOENT', () => {
  /* CE N EST PAS UN CAS D ECOLE, c est le mode d echec du cablage au build de
     production (2026-08-14). La preuve y est lancee depuis `apps/web`, et son corpus est
     `../cms/data` — un chemin qui n existe QUE si le contexte de construction porte le
     depot entier. S il ne le porte pas, le comportement d avant remontait un ENOENT brut
     en code 1 : « corriger le SITE », pour un site qui n a rien. La distinction du projet
     (0/1/2) ne vaut que si le 2 sort AUSSI quand c est la source qui manque, pas
     seulement quand `dist/` est vide. */
  const absent = path.join(os.tmpdir(), 'echo-corpus-qui-n-existe-pas');
  fs.rmSync(absent, { recursive: true, force: true });

  const { issue, manquements } = verifierSurchargeSeo(distSain(), absent);

  assert.equal(issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(manquements.join('\n'), /articles/);
  assert.match(manquements.join('\n'), /categories\.json/);
  assert.ok(
    manquements.join('\n').includes(absent),
    'le message doit nommer le chemin REELLEMENT consulte — sans lui, personne ne sait ' +
      'ou la preuve a cherche, et le geste de reparation se devine.',
  );
});

test('un corpus AMPUTE d un seul fichier est une incapacite, pas un corpus sans surcharge', () => {
  /* La borne qui compte : retirer `dossiers.json` d un corpus par ailleurs sain ne doit
     pas se lire « ce corpus ne porte pas de dossier ». Une absence de FICHIER et une
     absence d ENTREE rendent la meme sortie si on ne les separe pas — le mode d echec
     que ce depot traque. */
  const corpus = corpusFactice();
  fs.rmSync(path.join(corpus, 'dossiers.json'));

  const { issue, manquements } = verifierSurchargeSeo(distSain(), corpus);

  assert.equal(issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(manquements.join('\n'), /dossiers\.json/);
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
    lancer(bacs.creer('echo-dist-absent-')),
    ISSUES.VERIFICATION_IMPOSSIBLE
  );

  /* Le CORPUS absent sort en 2 PAR LA LIGNE DE COMMANDE, et c est la seule forme qui
     compte pour le build de production : nixpacks ne lance pas une fonction, il lance ce
     script, et ne lit que son code de sortie. */
  const corpusAbsent = path.join(os.tmpdir(), 'echo-corpus-absent-cli');
  fs.rmSync(corpusAbsent, { recursive: true, force: true });
  assert.equal(
    spawnSync(process.execPath, [script, distSain(), corpusAbsent], { encoding: 'utf8' }).status,
    ISSUES.VERIFICATION_IMPOSSIBLE
  );
});

/* ------------------------------------------------------------------ */
/* Le HTML REEL, avec ses entites et ses apostrophes                    */
/*                                                                      */
/* Tout ce qui precede travaille sur des textes sans apostrophe ni      */
/* esperluette (« Eolien : le verrou n est pas l enquete »), et c est   */
/* exactement pour cela que le defaut a survecu : la fixture evitait le */
/* seul caractere qui casse. Le corpus reel, lui, est du francais.      */
/*                                                                      */
/* Deux encodages DISTINCTS, constates sur echo.ayfiweb.fr le           */
/* 2026-08-14 : dans le <title>, Astro echappe l apostrophe en `&#39;`  */
/* et l esperluette en `&amp;` ; dans un attribut `content="…"` borne   */
/* par des guillemets doubles, l apostrophe reste BRUTE. Un seul des    */
/* deux defauts se voit a chaque endroit, d ou des tests separes.       */
/* ------------------------------------------------------------------ */

const REEL = {
  metaTitre: "Éolien aux Trois-Vents : le vrai verrou n'est pas l'enquête",
  metaDescription:
    "8,4 MW disponibles au poste source, 19,8 demandés : l'écart qui décidera du parc éolien.",
};

/** Ce qu Astro ecrit dans un noeud TEXTE (le <title>). */
const commeTitre = (t: string) => t.replace(/&/g, '&amp;').replace(/'/g, '&#39;');

test('un <title> aux apostrophes encodees porte quand meme la surcharge', () => {
  const { manquements } = inspecter(
    (d) => {
      d['article/col-des-trois-vents/index.html'] = [
        '<!doctype html><html lang="fr"><head>',
        `<title>${commeTitre(REEL.metaTitre)} — L&#39;Écho des Hauts</title>`,
        `<meta name="description" content="${REEL.metaDescription}">`,
        `<meta property="og:title" content="${REEL.metaTitre} — L'Écho des Hauts">`,
        '<meta property="og:image" content="/uploads/A01-og.png">',
        '</head><body></body></html>',
      ].join('\n');
    },
    (c) => {
      c.a01.seo = {
        metaTitre: REEL.metaTitre,
        metaDescription: REEL.metaDescription,
        imagePartage: 'partage/A01-og.png',
      };
    }
  );

  assert.deepEqual(manquements, []);
});

test('une valeur d attribut qui porte une apostrophe est lue en ENTIER', () => {
  const { manquements } = inspecter(
    (d) => {
      d['article/col-des-trois-vents/index.html'] = [
        '<!doctype html><html lang="fr"><head>',
        `<title>${commeTitre(REEL.metaTitre)} — L&#39;Écho</title>`,
        `<meta name="description" content="${REEL.metaDescription}">`,
        `<meta property="og:title" content="${REEL.metaTitre} — L'Écho">`,
        '<meta property="og:image" content="/uploads/A01-og.png">',
        '</head><body></body></html>',
      ].join('\n');
    },
    (c) => {
      c.a01.seo = {
        metaTitre: REEL.metaTitre,
        metaDescription: REEL.metaDescription,
        imagePartage: 'partage/A01-og.png',
      };
    }
  );

  /* Le defaut se lisait dans le TEXTE du manquement : la description etait
     rapportee « … 19,8 demandés : l », tronquee au premier caractere apostrophe. */
  assert.deepEqual(manquements, []);
});

test('une description qui differe APRES l apostrophe reste attrapee', () => {
  const { manquements } = inspecter(
    (d) => {
      d['article/col-des-trois-vents/index.html'] = [
        '<!doctype html><html lang="fr"><head>',
        `<title>${commeTitre(REEL.metaTitre)} — L&#39;Écho</title>`,
        '<meta name="description" content="8,4 MW disponibles au poste source, 19,8 demandés : l\'inverse de ce que dit le corpus.">',
        `<meta property="og:title" content="${REEL.metaTitre} — L'Écho">`,
        '<meta property="og:image" content="/uploads/A01-og.png">',
        '</head><body></body></html>',
      ].join('\n');
    },
    (c) => {
      c.a01.seo = {
        metaTitre: REEL.metaTitre,
        metaDescription: REEL.metaDescription,
        imagePartage: 'partage/A01-og.png',
      };
    }
  );

  /* Sans ce test, « corriger » en tronquant LES DEUX cotes au premier
     caractere apostrophe rendrait tout vert — et ne verifierait plus rien. */
  assert.match(manquements.join('\n'), /meta description vaut/);
});

test('un repli qui porte une esperluette n est pas pris pour une fuite de surcharge', () => {
  const { manquements } = inspecter(
    (d) => {
      d['categorie/culture-patrimoine/index.html'] = page({
        titre: 'Culture &amp; patrimoine — L&#39;Écho des Hauts',
      });
    },
    (c) => {
      c.categorie = { nom: 'Culture & patrimoine', slug: 'culture-patrimoine' };
    }
  );

  assert.deepEqual(manquements, []);
});

test('une canonique surchargee dont l URL porte &amp; est honoree', () => {
  const cible = `${ORIGINE}/dossier/l-eau-du-plateau?de=A02&vers=dossier`;
  const { manquements } = inspecter(
    (d) => {
      d['article/le-plui-de-2027/index.html'] = page({
        titre: 'Ce que le PLUi de 2027 promet — L Echo',
        canonique: cible.replace(/&/g, '&amp;'),
      });
    },
    (c) => {
      c.a02.seo = { canonique: cible };
    }
  );

  assert.deepEqual(manquements, []);
});

test('un og:image servi sous le nom que STRAPI lui donne designe bien l image surchargee', () => {
  /* Constate sur l instance le 2026-08-14 : le corpus demande
     `partage/A01-col-des-trois-vents.png`, et le site sert
     `/medias/A01_col_des_trois_vents_ec2b979fb1.png`. Strapi renomme a l upload —
     `nameToSlug(basename, {separator:'_'})` + dix caracteres hexadecimaux — donc
     comparer le nom BRUT fait manquer TOUT media a tiret. Le rapprochement est
     celui, deja mesure et documente, de `verifier-alternatives.mjs`. */
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: 'https://echo.test/medias/A01_og_a1b2c3d4e5.png',
      ogImageAlt: SURCHARGE.alternativePartage,
    });
  });

  assert.deepEqual(manquements, []);
});

test('un og:image qui porte un AUTRE media reste un manquement', () => {
  /* La borne du suffixe n est pas du confort : sans elle, `A01_og` se rapprocherait
     aussi de `A01_og_poste_source_a1b2c3d4e5`, un autre media. */
  const { manquements } = inspecter((d) => {
    d['article/col-des-trois-vents/index.html'] = page({
      titre: `${SURCHARGE.metaTitre} — L Echo`,
      description: SURCHARGE.metaDescription,
      ogImage: 'https://echo.test/medias/A01_og_poste_source_a1b2c3d4e5.png',
    });
  });

  assert.match(manquements.join('\n'), /og:image/);
});
