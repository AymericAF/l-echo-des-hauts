/**
 * Le PRODUCTEUR de l origine, et non plus seulement ses verificateurs.
 *
 * CE QUI A ETE FERME LE 2026-08-10 (commit 800a978), ET CE QUI RESTAIT OUVERT. Les six
 * verificateurs rendaient une incapacite a lire l origine sous la forme d une reponse
 * plausible. Ils sont corriges. Mais `origineDuSite()` — la fonction qui FABRIQUE
 * l origine que le site publie — portait le meme `??` :
 *
 *     const brute = site?.href ?? process.env.ECHO_SITE_URL ?? 'https://echo.ayfiweb.fr';
 *     return brute.replace(/\/+$/, '');
 *
 * `??` ne remplace que `null` et `undefined`, JAMAIS la chaine vide. Une variable
 * d environnement posee sans valeur traversait donc le repli et ressortait telle quelle,
 * et c est cette chaine-la qui prefixe les canoniques, les `hreflang`, les `<loc>` du
 * sitemap, les `guid` du flux et la ligne `Sitemap:` du `robots.txt`.
 *
 * CE QUI EN SORTAIT, MESURE ET NON SUPPOSE : pas des adresses fausses. Les six
 * consommateurs passent tous par `new URL(chemin, origine)`, qui LEVE sur `''` comme sur
 * `foo:bar` — la sortie etait donc un `TypeError: Invalid URL` anonyme chez l un d eux.
 * Ce que le `??` faisait perdre n etait pas la justesse des adresses : c etait la CAUSE.
 *
 * CE QUE LA MESURE DIT DE SA JOIGNABILITE — et elle est plus etroite que celle des
 * verificateurs, qui avaient une ligne de commande grande ouverte. Le producteur n a
 * AUCUNE porte hors d Astro : il n est appele que par `Base.astro` et les quatre routes
 * de `src/pages/`. Or `astro build` refuse en amont toute origine que `lireOrigine()`
 * declarerait illisible, et pour la MEME raison mecanique : Astro calcule
 * `new URL(config.site).origin` (`core/build/index.js:66`) puis s en sert de base
 * (`core/build/generate.js:375`). Une origine opaque y rend la CHAINE 'null', et
 * `new URL(chemin, 'null')` leve. Le predicat d Astro et le notre coincident donc
 * aujourd hui — c est ce que `equivalence` ci-dessous mesure valeur par valeur.
 *
 * POURQUOI CORRIGER QUAND MEME. La coincidence vit chez un TIERS, dans deux lignes non
 * documentees d un detail d implementation, et peut bouger a la montee de version. Le
 * jour ou elle bouge, ce n est pas un build rouge qu on recolte : c est un site qui
 * publie des canoniques fausses en repondant 200. Meme raisonnement que celui tenu pour
 * les trois gardes de `integrations/`, elles aussi hors de portee d un build reel et
 * corrigees quand meme.
 *
 * LE PIEGE QUE CE FICHIER GARDE EN PREMIER : le cas normal ne doit pas bouger d un
 * octet. En particulier, la valeur rendue N EST PAS `new URL(x).origin` — elle CONSERVE
 * le chemin (`https://exemple.test/sous-dossier`). `lireOrigine()` sert de PREDICAT de
 * lisibilite, pas de source de la valeur rendue.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ISSUES } from '../scripts/issues.mjs';
import { lireOrigine } from '../scripts/origine.mjs';
import { ORIGINE_PAR_DEFAUT, origineDuSite } from '../src/lib/seo/origine-site.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Pose `ECHO_SITE_URL` le temps d un appel, puis restaure exactement l etat d avant. */
function avecEnv<T>(valeur: string | undefined, action: () => T): T {
  const avant = process.env.ECHO_SITE_URL;
  const etaitPresente = 'ECHO_SITE_URL' in process.env;
  if (valeur === undefined) delete process.env.ECHO_SITE_URL;
  else process.env.ECHO_SITE_URL = valeur;
  try {
    return action();
  } finally {
    if (etaitPresente) process.env.ECHO_SITE_URL = avant as string;
    else delete process.env.ECHO_SITE_URL;
  }
}

// ── 1. LE CAS NORMAL NE BOUGE PAS — c est la premiere garde, pas la derniere ──────────

test('une origine lisible rend exactement ce qu elle rendait, slash final retire', () => {
  const cas: [URL | undefined, string | undefined, string][] = [
    [new URL('https://echo.ayfiweb.fr/'), undefined, 'https://echo.ayfiweb.fr'],
    [new URL('https://echo.ayfiweb.fr'), undefined, 'https://echo.ayfiweb.fr'],
    /* Le chemin est CONSERVE : rendre `.origin` l amputerait, et le canonique d un site
       servi sous un sous-dossier cesserait de correspondre a son sitemap. */
    [new URL('https://exemple.test/sous-dossier/'), undefined, 'https://exemple.test/sous-dossier'],
    [new URL('http://127.0.0.1:4321/'), undefined, 'http://127.0.0.1:4321'],
    /* `site` absent : la valeur vient de l environnement, puis du repli. */
    [undefined, 'https://depuis-env.test/', 'https://depuis-env.test'],
    [undefined, 'https://depuis-env.test///', 'https://depuis-env.test'],
    [undefined, undefined, ORIGINE_PAR_DEFAUT],
  ];
  for (const [site, env, attendu] of cas) {
    assert.equal(
      avecEnv(env, () => origineDuSite(site)),
      attendu,
      `site=${String(site)} env=${String(env)}`,
    );
  }
});

test('l argument `site` prime sur l environnement, comme aujourd hui', () => {
  const rendu = avecEnv('https://ignoree.test', () => origineDuSite(new URL('https://gagnante.test/')));
  assert.equal(rendu, 'https://gagnante.test');
});

// ── 2. UNE ORIGINE ILLISIBLE N EST PLUS UNE ADRESSE ───────────────────────────────────

/**
 * La meme batterie que `tests/origine-illisible.test.ts` — celles qui font lever
 * `new URL()`, et `foo:bar` qui NE la fait PAS lever mais dont `.origin` rend la chaine
 * 'null'. Un `try/catch` seul ne voit pas la derniere.
 */
const ILLISIBLES = ['', 'pas-une-url', 'echo.ayfiweb.fr', '//echo.ayfiweb.fr', 'foo:bar'];

test('une chaine vide dans l environnement ne ressort plus comme une origine', () => {
  /* AVANT ce correctif : rendait '' sans une erreur, et chacun des six consommateurs
     levait ensuite un `TypeError: Invalid URL` ANONYME depuis son propre `new URL()`
     (mesure du 2026-08-10 : robots.txt, sitemap et flux, les trois). Pas une adresse
     fausse : une cause perdue. */
  assert.throws(() => avecEnv('', () => origineDuSite(undefined)), /origine du site illisible/);
});

test('toutes les formes illisibles levent, aucune ne rend une adresse', () => {
  for (const valeur of ILLISIBLES) {
    assert.throws(
      () => avecEnv(valeur, () => origineDuSite(undefined)),
      /origine du site illisible/,
      `env=${JSON.stringify(valeur)} aurait du lever`,
    );
  }
  /* Et par l argument `site` : `new URL('foo:bar')` est un objet URL VALIDE dont
     l origine est opaque. Le producteur le recoit donc sans qu Astro ait bronche. */
  assert.throws(() => origineDuSite(new URL('foo:bar')), /origine du site illisible/);
});

test('le repli ne se substitue JAMAIS a une valeur illisible', () => {
  /* Le reflexe `??` -> `||` aurait rendu ici l origine par defaut : une adresse
     plausible, fausse, et publiee en silence. C est le contraire de la convention. */
  for (const valeur of ILLISIBLES) {
    let rendu: string | null = null;
    try {
      rendu = avecEnv(valeur, () => origineDuSite(undefined));
    } catch {
      rendu = null;
    }
    assert.notEqual(rendu, ORIGINE_PAR_DEFAUT, `env=${JSON.stringify(valeur)} est retombee sur le repli`);
  }
});

// ── 3. LA CONVENTION EST IMPORTEE, PAS REINVENTEE ─────────────────────────────────────

test('le producteur leve exactement quand `lireOrigine` declare l origine illisible', () => {
  const batterie = [
    'https://echo.ayfiweb.fr',
    'https://echo.ayfiweb.fr/',
    'https://exemple.test/sous-dossier/',
    'http://127.0.0.1:4321',
    ...ILLISIBLES,
  ];
  for (const valeur of batterie) {
    const lisible = lireOrigine(valeur).lisible;
    let aLeve = false;
    try {
      avecEnv(valeur, () => origineDuSite(undefined));
    } catch {
      aLeve = true;
    }
    assert.equal(aLeve, !lisible, `${JSON.stringify(valeur)} : lireOrigine=${lisible}, leve=${aLeve}`);
  }
});

test('l erreur porte le code de la verification impossible et nomme ce qui a ete recu', () => {
  const erreur = (() => {
    try {
      avecEnv('', () => origineDuSite(undefined));
      return null;
    } catch (e) {
      return e as Error & { issue?: number };
    }
  })();
  assert.notEqual(erreur, null);
  assert.equal(erreur?.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  /* Nommer la VALEUR RECUE : sans cela on cherche un defaut de site la ou il y a un
     defaut de variable. */
  assert.match(erreur?.message ?? '', /chaine VIDE/);
  /* Nommer la VARIABLE : le lecteur du journal de build doit savoir quoi corriger. */
  assert.match(erreur?.message ?? '', /ECHO_SITE_URL/);
  /* Nommer CE QUI N A PAS ETE PRODUIT : une erreur qui dit seulement « Invalid URL »
     — ce que rend Astro aujourd hui — n indique ni le fichier ni le reglage. */
  assert.match(erreur?.message ?? '', /canoniqu|sitemap|flux|robots/i);
});

// ── 4. LA FRONTIERE `astro:content` RESTE FRANCHIE — sinon rien de tout ceci ne tourne ─

test('le producteur vit hors du module qui importe `astro:content`, et y est reexporte', () => {
  const contexte = fs.readFileSync(path.join(RACINE, 'src/lib/seo/contexte-site.ts'), 'utf8');
  const producteur = fs.readFileSync(path.join(RACINE, 'src/lib/seo/origine-site.ts'), 'utf8');

  /* C est CE decoupage qui rend la fonction testable : `contexte-site.ts` importe
     `astro:content`, donc `node --test` ne peut pas le charger — raison pour laquelle
     `origineDuSite` etait, au 2026-08-10, le SEUL module SEO sans aucun test. */
  assert.match(contexte, /export \{[^}]*origineDuSite[^}]*\} from '\.\/origine-site\.ts'/);
  assert.doesNotMatch(contexte, /function origineDuSite/);
  /* Le critere est l IMPORT, pas la mention : l en-tete de `origine-site.ts` explique
     precisement pourquoi il vit hors de cette frontiere, et doit pouvoir la nommer. */
  assert.doesNotMatch(producteur, /from 'astro:content'/);
});
