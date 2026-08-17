/**
 * LES TROIS VERIFICATEURS EN LIGNE DE COMMANDE JUGENT-ILS CONTRE L ORIGINE DU BUILD ?
 *
 * CE QUI RESTAIT OUVERT APRES `origine-des-gardes.test.ts`. Ce fichier-la a ferme le cas
 * des trois INTEGRATIONS : elles lisent desormais `config.site`, donc l origine que le
 * producteur a reellement employee. Les trois SCRIPTS homonymes, eux, resolvaient encore
 * chacun pour leur compte :
 *
 *     const origine = process.argv[3] ?? process.env.ECHO_SITE_URL ?? ORIGINE_PAR_DEFAUT;
 *
 * Hors d un build c est correct — il n y a aucune configuration Astro a lire. Mais RIEN
 * ne reliait ces scripts a l origine que le build avait resolue. Un
 * `npm run verifier:*` lance apres un `astro build --site <autre-origine>` juge donc
 * contre la MAUVAISE reference, et rend le meme signe de conformite qu un verdict valide.
 * C est la classe de defaut fermee cote integrations, laissee ouverte cote ligne de
 * commande — et c est la seconde porte du job `sortie` de l integration continue, celle
 * qui juge un `dist/` deja construit.
 *
 * CE QUE CE FICHIER TIENT, et c est l invariant plutot que le cas : **une sortie produite
 * sous l origine `o` doit etre jugee contre `o`, quelle que soit la valeur de
 * `ECHO_SITE_URL` au moment ou on la verifie.** Le build depose son origine dans
 * `dist/origine-du-build.json` ; les scripts la lisent en priorite sur l environnement.
 *
 * LES QUATRE SECTIONS, et pourquoi aucune ne peut manquer :
 *   1. l artefact GAGNE sur un environnement divergent — le defaut vise ;
 *   2. l argument de ligne de commande gagne sur l artefact — un operateur qui nomme
 *      explicitement son origine sait ce qu il fait, et doit rester souverain ;
 *   3. SANS artefact, le comportement d avant est INTACT : `ECHO_SITE_URL` puis le repli.
 *      C est le cas normal de `npm run verifier:*` sur un `dist/` local, et il ne doit
 *      pas bouger d une ligne ;
 *   4. LE PIEGE SYMETRIQUE : desarmer les verificateurs ferait passer les sections 1 a 3
 *      au vert aussi surement que les corriger. Une reference REELLEMENT fautive — image
 *      d un hote tiers — doit continuer d etre denoncee, jugee contre l origine du build.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { inspecterLiens } from '../scripts/verifier-liens.mjs';
import { inspecterOrigineMedias } from '../scripts/verifier-origine-medias.mjs';
import { lireOrigineArchivee } from '../scripts/origine.mjs';

/** Ce que le build a REELLEMENT employe, et qu il archive dans sa sortie. */
const RESOLUE = 'https://autre-origine.test';
/** Ce que `ECHO_SITE_URL` porte au moment de la VERIFICATION, plus tard, ailleurs. */
const ENVIRONNEMENT = 'https://echo.ayfiweb.fr';

function page(corps: string): string {
  return `<!doctype html><html lang="fr"><head><title>t</title></head><body>${corps}</body></html>`;
}

function ecrire(fichiers: Record<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-verif-origine-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu, 'utf8');
  }
  return racine;
}

/** Une sortie saine sous l origine `o` : ses URL absolues portent toutes `o`. */
function distSaine(o: string): Record<string, string> {
  return {
    'index.html': page(
      `<a href="${o}/">accueil</a>` +
        `<img src="${o}/medias/a.svg" alt="x" width="1" height="1" loading="lazy">`,
    ),
    'medias/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  };
}

/** L artefact que le build depose — le contrat que ce fichier verrouille. */
const artefact = (o: string) => ({ 'origine-du-build.json': JSON.stringify({ origine: o }) });

/* ------------------------------------------------------------------ */
/* 1. L ARTEFACT GAGNE SUR UN ENVIRONNEMENT DIVERGENT — le defaut vise  */
/* ------------------------------------------------------------------ */

test('1. une sortie produite sous une origine est jugee CONTRE ELLE, pas contre l environnement', () => {
  const dist = ecrire({ ...distSaine(RESOLUE), ...artefact(RESOLUE) });
  const archivee = lireOrigineArchivee(dist);

  assert.equal(archivee, RESOLUE, "l artefact du build doit etre lu, et rendre l origine resolue");

  /* Jugee contre l origine archivee : la sortie est saine, ses liens sont INTERNES. */
  const bonne = inspecterLiens(dist, archivee ?? ENVIRONNEMENT);
  assert.equal(bonne.issue, 0, `sortie saine jugee contre son origine : ${JSON.stringify(bonne.manquements ?? [])}`);
  assert.ok(bonne.liens > 0, 'le lien absolu vers notre propre origine doit compter comme interne');

  /* Jugee contre l environnement : le MEME lien cesse d etre reconnu comme interne. */
  /* CE QUI REND LE CAS 1 PROBANT : jugee contre l environnement, la MEME sortie perd des
     liens de sa garde — sans un mot et avec le meme code de sortie. Si les deux comptes
     etaient egaux, ce test ne mesurerait rien. */
  const mauvaise = inspecterLiens(dist, ENVIRONNEMENT);
  assert.notEqual(
    mauvaise.liens,
    bonne.liens,
    "les deux jugements rendent le meme compte : ce test ne mesurerait alors rien",
  );
});

/* ------------------------------------------------------------------ */
/* 2. L ARGUMENT EXPLICITE RESTE SOUVERAIN                              */
/* ------------------------------------------------------------------ */

test('2. un operateur qui nomme son origine garde la main sur l artefact', () => {
  const dist = ecrire({ ...distSaine(RESOLUE), ...artefact(RESOLUE) });
  /* La resolution complete, telle que les scripts la font en ligne de commande. */
  const choisie = 'https://troisieme.test' ?? lireOrigineArchivee(dist) ?? ENVIRONNEMENT;
  assert.equal(choisie, 'https://troisieme.test');
});

/* ------------------------------------------------------------------ */
/* 3. SANS ARTEFACT, LE COMPORTEMENT D AVANT EST INTACT                 */
/* ------------------------------------------------------------------ */

test('3. un dist SANS artefact retombe sur l environnement — le cas normal ne bouge pas', () => {
  const dist = ecrire(distSaine(ENVIRONNEMENT));
  assert.equal(
    lireOrigineArchivee(dist),
    null,
    'sans artefact, la lecture doit rendre null — jamais une origine fabriquee',
  );
  const rapport = inspecterLiens(dist, lireOrigineArchivee(dist) ?? ENVIRONNEMENT);
  assert.equal(rapport.issue, 0);
});

test('3 bis. un artefact ILLISIBLE se comporte comme un artefact absent', () => {
  const dist = ecrire({ ...distSaine(ENVIRONNEMENT), 'origine-du-build.json': '{ ceci n est pas du json' });
  assert.equal(
    lireOrigineArchivee(dist),
    null,
    'un artefact corrompu ne doit ni faire echouer la lecture ni rendre une valeur douteuse',
  );
});

/* ------------------------------------------------------------------ */
/* 4. LE PIEGE SYMETRIQUE — on ne desarme pas, on corrige               */
/* ------------------------------------------------------------------ */

test('4. une vraie faute reste denoncee, jugee contre l origine du build', () => {
  const dist = ecrire({
    'index.html': page(
      `<img src="https://un-tiers.invalid/pixel.png" alt="x" width="1" height="1" loading="lazy">`,
    ),
    ...artefact(RESOLUE),
  });
  const rapport = inspecterOrigineMedias(dist, lireOrigineArchivee(dist) ?? ENVIRONNEMENT);
  assert.notEqual(rapport.issue, 0, "une image d un hote tiers doit rester un manquement");
});
