/**
 * LES TROIS GARDES DE BUILD JUGENT-ELLES CONTRE LA MEME REFERENCE QUE LE PRODUCTEUR ?
 *
 * CE QUI S EST MESURE LE 2026-08-11, avant toute correction, sur le depot en c35e7d5 :
 *
 *     ECHO_SITE_URL=https://echo.ayfiweb.fr  npx astro build --site https://autre-origine.test
 *
 *   - le canonique sort en `https://autre-origine.test/` : le PRODUCTEUR
 *     (`src/lib/seo/origine-site.ts`) suit la configuration resolue, et c est correct ;
 *   - `garde-origine-medias` FAIT ECHOUER LE BUILD sur 238 references d image accusees
 *     d etre « hors du site » — alors qu elles portent exactement l origine que le build
 *     avait recue en argument ;
 *   - `garde-seo` FAIT ECHOUER LE BUILD sur 121 manquements : 6 « segment hors du site »
 *     et les 115 pages indexables declarees « absentes du sitemap », le sitemap etant
 *     devenu etranger a ses propres yeux ;
 *   - `garde-liens` rend VERT, code 0, et imprime sa coche — `2990 lien(s) interne(s)` au
 *     lieu des `3587` de la meme sortie jugee contre la bonne origine. 597 liens retires
 *     de la garde SANS UN MOT.
 *
 * LES TROIS NE SE COMPORTENT DONC PAS PAREIL, et la troisieme est la pire : deux gardes
 * accusent a tort, ce qui se voit ; la derniere se DESARME en affichant le meme signe de
 * conformite qu un site sain. C est la forme exacte deja fermee chez les six
 * verificateurs le 2026-08-10 (commit 800a978) — succes et incapacite rendant la meme
 * sortie — sauf qu ici la porte n a rien de theorique : `--site` est une option PUBLIQUE
 * d Astro, elle ne demande aucune manipulation d environnement.
 *
 * LA CAUSE, une ligne dans chacune des trois :
 *
 *     const origine = process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
 *
 * L environnement n est pas la configuration. Astro resout `site` a partir de plusieurs
 * sources dont la ligne de commande, qui GAGNE sur le fichier de configuration et donc
 * sur la variable qui l alimente. Une garde qui relit l environnement juge contre une
 * reference que le producteur n a pas utilisee.
 *
 * CE QUE CE FICHIER TIENT : l INVARIANT, pas le cas. Ce qui est asserte n est pas
 * « `--site https://autre-origine.test` ne doit pas rougir » mais « l environnement n a
 * AUCUNE influence sur le verdict quand la configuration est resolue » — c est la seule
 * formulation qui survive a une quatrieme source de configuration.
 *
 * LE PIEGE SYMETRIQUE, garde par la section 4 : desarmer les gardes ferait passer ce
 * fichier au vert aussi surement que les corriger. Une reference REELLEMENT fautive —
 * image d un hote tiers, lien mort, `<loc>` sans page — doit continuer de faire ECHOUER
 * le build, jugee contre l origine resolue.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import gardeLiens from '../integrations/garde-liens.mjs';
import gardeOrigineMedias from '../integrations/garde-origine-medias.mjs';
import gardeSeo from '../integrations/garde-seo.mjs';

/** Ce que `--site` impose, donc ce que le producteur a REELLEMENT emis dans la sortie. */
const RESOLUE = 'https://autre-origine.test';
/** Ce que `ECHO_SITE_URL` porte pendant ce meme build — et que les gardes lisaient. */
const ENVIRONNEMENT = 'https://echo.ayfiweb.fr';

const LES_TROIS = [
  ['garde-origine-medias', gardeOrigineMedias],
  ['garde-liens', gardeLiens],
  ['garde-seo', gardeSeo],
] as const;

function page(tete: string, corps: string): string {
  return `<!doctype html><html lang="fr"><head><title>t</title>${tete}</head><body>${corps}</body></html>`;
}

function ecrire(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-gardes-origine-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

/**
 * Une sortie SAINE, telle que le producteur l ecrit sous l origine `o` : toutes ses URL
 * absolues portent `o`, ses octets sont la, son sitemap se declare lui-meme. Les trois
 * inspecteurs la rendent conforme quand on les fait juger contre `o` (verifie section 1).
 */
function distSaine(o: string): Record<string, string> {
  return {
    'index.html': page(
      `<link rel="canonical" href="${o}/">` +
        '<meta property="og:title" content="t">' +
        `<meta property="og:url" content="${o}/">` +
        '<meta property="og:type" content="website">' +
        '<meta property="og:locale" content="fr_FR">' +
        `<meta property="og:image" content="${o}/medias/a.png">` +
        '<meta name="twitter:card" content="summary_large_image">' +
        `<meta name="twitter:image" content="${o}/medias/a.png">` +
        `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","url":"${o}/"}</script>`,
      `<a href="${o}/">accueil</a><img src="${o}/medias/a.svg" alt="x" width="1" height="1" loading="lazy">`,
    ),
    'medias/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    /* Les DEUX formats sont deposes, et ce n est pas un doublon : le SVG reste reference
       par l `img` du corps — ou il est legitime — tandis que `og:image` et `twitter:image`
       exigent un format RASTERISE depuis p2/wt-code-og. Cette fixture est la sortie SAINE
       de reference : elle doit satisfaire les trois gardes telles qu elles sont, sinon ce
       fichier ne mesure plus l origine mais le format. */
    'medias/a.png': 'octets factices — aucune garde d origine ne lit le contenu binaire',
    'sitemap-index.xml': `<?xml version="1.0"?><sitemapindex><sitemap><loc>${o}/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
    'sitemap-pages.xml': `<?xml version="1.0"?><urlset><url><loc>${o}/</loc></url></urlset>`,
  };
}

type Verdict = { echec: string | null; journal: string[] };

/**
 * Rejoue un build : `astro:config:done` avec la configuration RESOLUE, puis
 * `astro:build:done` sur la sortie — dans cet ordre, celui d Astro. `site` a `undefined`
 * rejoue le cas d une configuration qui ne porte pas d origine.
 */
async function jouer(
  fabrique: () => import('astro').AstroIntegration,
  { site, environnement, dist }: { site: string | undefined; environnement: string | undefined; dist: string },
): Promise<Verdict> {
  const garde = fabrique();
  const journal: string[] = [];
  const logger = { info: (m: string) => journal.push(m) };

  const avant = process.env.ECHO_SITE_URL;
  const etaitPresente = 'ECHO_SITE_URL' in process.env;
  if (environnement === undefined) delete process.env.ECHO_SITE_URL;
  else process.env.ECHO_SITE_URL = environnement;

  try {
    const config = garde.hooks['astro:config:done'];
    if (config) await config({ config: { site }, logger } as never);

    const construit = garde.hooks['astro:build:done']!;
    try {
      await construit({ dir: pathToFileURL(`${dist}${path.sep}`), logger } as never);
      return { echec: null, journal };
    } catch (erreur) {
      return { echec: (erreur as Error).message, journal };
    }
  } finally {
    if (etaitPresente) process.env.ECHO_SITE_URL = avant as string;
    else delete process.env.ECHO_SITE_URL;
  }
}

// ── 1. Le temoin : la sortie de reference est SAINE quand on la juge contre son origine ─

test('la sortie factice est conforme aux trois gardes, jugee contre sa propre origine', async () => {
  /* Sans ce temoin, un vert de la section 3 ne prouverait rien : une sortie qu aucune
     garde ne sait juger serait verte pour la mauvaise raison. */
  const dist = ecrire(distSaine(RESOLUE));
  try {
    for (const [nom, fabrique] of LES_TROIS) {
      const verdict = await jouer(fabrique, { site: RESOLUE, environnement: RESOLUE, dist });
      assert.equal(verdict.echec, null, `${nom} rougit sur la sortie de reference : ${verdict.echec}`);
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

// ── 2. Les trois lisent la configuration resolue, et le declarent ──────────────────────

test('les trois gardes accrochent astro:config:done', () => {
  /* Le hook est le SEUL endroit ou la configuration resolue est disponible. Une garde qui
     ne l accroche pas n a aucun moyen de connaitre l origine que le producteur a suivie —
     elle ne peut que relire l environnement, c est-a-dire deviner. */
  for (const [nom, fabrique] of LES_TROIS) {
    assert.ok(
      typeof fabrique().hooks['astro:config:done'] === 'function',
      `${nom} n accroche pas astro:config:done : elle juge contre l environnement, pas ` +
        'contre la configuration que le build a reellement resolue',
    );
  }
});

// ── 3. L environnement n a AUCUNE influence quand la configuration est resolue ─────────

test('aucune des trois ne rougit quand --site diverge de ECHO_SITE_URL', async () => {
  const dist = ecrire(distSaine(RESOLUE));
  try {
    for (const [nom, fabrique] of LES_TROIS) {
      const verdict = await jouer(fabrique, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
      assert.equal(
        verdict.echec,
        null,
        `${nom} accuse une sortie que le producteur a ecrite sous « ${RESOLUE} », parce ` +
          `qu elle la juge contre « ${ENVIRONNEMENT} » lu dans l environnement :\n${verdict.echec}`,
      );
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('le verdict des trois est IDENTIQUE, que l environnement diverge ou non', async () => {
  /* L assertion qui attrape le desarmement SILENCIEUX de `garde-liens`. Elle ne rougit
     pas : elle compte 2990 liens au lieu de 3587 sur le build reel (2 au lieu de 2 ici),
     imprime la meme coche, et sort en 0. Comparer les VERDICTS COMPLETS — echec ET
     journal — est ce qui distingue « conforme » de « je n ai rien regarde ». */
  const dist = ecrire(distSaine(RESOLUE));
  try {
    for (const [nom, fabrique] of LES_TROIS) {
      const reference = await jouer(fabrique, { site: RESOLUE, environnement: RESOLUE, dist });
      const divergent = await jouer(fabrique, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
      assert.deepEqual(
        divergent,
        reference,
        `${nom} : l environnement change son verdict alors que la configuration resolue ` +
          'est la meme — c est par la que 597 liens sont sortis de la garde sans un mot',
      );
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('garde-liens inspecte le MEME nombre de liens dans les deux cas', async () => {
  /* Le cas fondateur, nomme, pour que le rouge dise de quoi il s agit si la regression
     revient : ici la garde reste verte, seul le COMPTE trahit ce qu elle a cesse de voir. */
  const dist = ecrire(distSaine(RESOLUE));
  try {
    const reference = await jouer(gardeLiens, { site: RESOLUE, environnement: RESOLUE, dist });
    const divergent = await jouer(gardeLiens, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
    assert.match(reference.journal.join('\n'), /2 lien\(s\) interne\(s\)/);
    assert.deepEqual(
      divergent.journal,
      reference.journal,
      'garde-liens a rendu la meme coche sur un nombre de liens different : un lien absolu ' +
        'vers notre propre origine cesse d etre reconnu comme interne, et sort de la garde',
    );
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

// ── 4. LE PIEGE SYMETRIQUE : une vraie faute reste attrapee ────────────────────────────

test('une image servie par un hote tiers fait TOUJOURS echouer le build', async () => {
  const fichiers = distSaine(RESOLUE);
  fichiers['index.html'] = fichiers['index.html'].replace(
    '<body>',
    '<body><img src="https://cdn.tiers.example/x.png" alt="y" width="1" height="1" loading="lazy">',
  );
  const dist = ecrire(fichiers);
  try {
    const verdict = await jouer(gardeOrigineMedias, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
    assert.ok(verdict.echec, 'garde-origine-medias a laisse passer une image d un hote tiers');
    assert.match(verdict.echec!, /cdn\.tiers\.example/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('un media de NOTRE origine dont les octets manquent fait TOUJOURS echouer le build', async () => {
  const fichiers = distSaine(RESOLUE);
  fichiers['index.html'] = fichiers['index.html'].replace(
    '<body>',
    `<body><img src="${RESOLUE}/medias/jamais-deposee.svg" alt="y" width="1" height="1" loading="lazy">`,
  );
  const dist = ecrire(fichiers);
  try {
    const verdict = await jouer(gardeOrigineMedias, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
    assert.ok(verdict.echec, 'garde-origine-medias a laisse passer un media absent de la sortie');
    assert.match(verdict.echec!, /jamais-deposee\.svg/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('un lien mort vers l origine RESOLUE fait TOUJOURS echouer le build', async () => {
  const fichiers = distSaine(RESOLUE);
  fichiers['index.html'] = fichiers['index.html'].replace('<body>', `<body><a href="${RESOLUE}/page-morte">x</a>`);
  const dist = ecrire(fichiers);
  try {
    const verdict = await jouer(gardeLiens, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
    assert.ok(verdict.echec, 'garde-liens a laisse passer un lien mort ecrit en absolu');
    assert.match(verdict.echec!, /page-morte/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('un lien REELLEMENT externe reste hors garde, et le reste en silence', async () => {
  /* La contrepartie de l assertion precedente : une garde qui rougirait sur un lien
     sortant legitime serait desactivee dans la semaine. */
  const fichiers = distSaine(RESOLUE);
  fichiers['index.html'] = fichiers['index.html'].replace(
    '<body>',
    '<body><a href="https://un-autre-site.example/page">x</a>',
  );
  const dist = ecrire(fichiers);
  try {
    const verdict = await jouer(gardeLiens, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
    assert.equal(verdict.echec, null, `garde-liens rougit sur un lien sortant legitime : ${verdict.echec}`);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('une <loc> de sitemap sans page fait TOUJOURS echouer le build', async () => {
  const fichiers = distSaine(RESOLUE);
  fichiers['sitemap-pages.xml'] =
    `<?xml version="1.0"?><urlset><url><loc>${RESOLUE}/</loc></url><url><loc>${RESOLUE}/nulle-part</loc></url></urlset>`;
  const dist = ecrire(fichiers);
  try {
    const verdict = await jouer(gardeSeo, { site: RESOLUE, environnement: ENVIRONNEMENT, dist });
    assert.ok(verdict.echec, 'garde-seo a laisse passer une <loc> qui ne designe aucune page');
    assert.match(verdict.echec!, /nulle-part/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

// ── 5. Le repli, quand la configuration ne porte pas d origine ─────────────────────────

test('sans site dans la configuration, les trois retombent sur ECHO_SITE_URL', async () => {
  /* `site` est optionnel chez Astro. Quand il manque, le PRODUCTEUR relit la variable
     (`origine-site.ts` : `site?.href ?? process.env.ECHO_SITE_URL ?? repli`) ; les gardes
     doivent suivre la MEME chaine, sinon elles jugeraient de nouveau contre autre chose
     que lui. C est aussi ce qui garde le test « les trois gardes du build ECHOUENT quand
     ECHO_SITE_URL ne se lit pas » de `origine-illisible.test.ts`. */
  const dist = ecrire(distSaine(ENVIRONNEMENT));
  try {
    for (const [nom, fabrique] of LES_TROIS) {
      const verdict = await jouer(fabrique, { site: undefined, environnement: ENVIRONNEMENT, dist });
      assert.equal(verdict.echec, null, `${nom} : le repli sur ECHO_SITE_URL ne fonctionne plus — ${verdict.echec}`);
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('sans site NI variable, les trois retombent sur l origine par defaut', async () => {
  const dist = ecrire(distSaine('https://echo.ayfiweb.fr'));
  try {
    for (const [nom, fabrique] of LES_TROIS) {
      const verdict = await jouer(fabrique, { site: undefined, environnement: undefined, dist });
      assert.equal(verdict.echec, null, `${nom} : le repli par defaut ne fonctionne plus — ${verdict.echec}`);
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('une configuration resolue ILLISIBLE ne vaut pas laissez-passer', async () => {
  /* Meme convention que partout ailleurs dans ce depot : une incapacite se DECLARE. Elle
     ne se remplace pas par le repli — sinon une origine cassee ferait juger la sortie
     contre une reference que personne n a demandee. */
  const dist = ecrire(distSaine(RESOLUE));
  try {
    for (const [nom, fabrique] of LES_TROIS) {
      const verdict = await jouer(fabrique, { site: 'foo:bar', environnement: ENVIRONNEMENT, dist });
      assert.ok(verdict.echec, `${nom} a construit sur une origine resolue illisible`);
      assert.match(verdict.echec!, /VERIFICATION IMPOSSIBLE/);
    }
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
