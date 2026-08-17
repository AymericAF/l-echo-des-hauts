#!/usr/bin/env node
/**
 * Recette de la GARDE AVANT PUSH — elle doit REFUSER, sinon elle ne prouve rien.
 *
 * Une garde qui n'a jamais rougi n'a jamais été exercée : elle pourrait laisser tout passer sans
 * que personne ne s'en aperçoive, et c'est précisément le mode d'échec qu'elle existe pour
 * fermer. Chaque refus attendu ci-dessous doit donc tomber POUR SON MOTIF.
 *
 * ELLE TRAVAILLE SUR DE VRAIS DÉPÔTS, avec de vrais `git push` vers un remote nu, le crochet
 * réellement installé par `core.hooksPath`. Un banc qui appellerait la fonction en mémoire ne
 * prouverait pas que git l'invoque, ni qu'un code de sortie non nul arrête effectivement le push
 * — qui est tout l'enjeu.
 *
 * Les suites sont simulées par `ECHO_PREPUSH_COMMANDE` : un dépôt jetable n'a pas de
 * `node_modules`, et jouer les vraies suites ici mesurerait le dépôt de test, pas la garde. Ce
 * seam est bruyant à l'exécution, exprès.
 *
 * Usage  : node .githooks/gardes-avant-push.recette.mjs
 * Sortie : 0 = conforme · 1 = anomalie · 2 = vérification impossible.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ICI = fileURLToPath(new URL('.', import.meta.url));
let anomalies = 0;
let controles = 0;

function verdict(nom, ok, detail) {
  controles += 1;
  if (!ok) anomalies += 1;
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${nom}`);
  if (detail) console.log(`      ${detail}`);
}

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Monte un dépôt jetable : un remote nu, deux applications, le crochet installé. */
function monter() {
  const base = mkdtempSync(join(tmpdir(), 'garde-push-'));
  const nu = join(base, 'nu.git');
  const travail = join(base, 'travail');
  execFileSync('git', ['init', '--bare', '-b', 'main', nu], { stdio: 'ignore' });
  execFileSync('git', ['init', '-b', 'main', travail], { stdio: 'ignore' });

  git(travail, ['config', 'user.email', 'recette@exemple.test']);
  git(travail, ['config', 'user.name', 'Recette']);
  git(travail, ['remote', 'add', 'origin', nu]);

  // Le crochet, tel qu'il est versionné — c'est lui qu'on juge, pas une copie réécrite.
  const hooks = join(travail, '.githooks');
  mkdirSync(hooks, { recursive: true });
  for (const f of ['pre-push', 'gardes-avant-push.js']) cpSync(join(ICI, f), join(hooks, f));
  git(travail, ['config', 'core.hooksPath', '.githooks']);

  for (const app of ['apps/cms', 'apps/web']) {
    mkdirSync(join(travail, app), { recursive: true });
    writeFileSync(join(travail, app, 'package.json'), JSON.stringify({ name: app.replace('/', '-'), version: '0.0.0' }), 'utf8');
  }
  writeFileSync(join(travail, 'LISEZMOI.md'), 'depot jetable de recette\n', 'utf8');
  git(travail, ['add', '-A']);
  git(travail, ['commit', '-m', 'socle']);
  // `--no-verify` sur le socle : ce push est de l ECHAFAUDAGE, pas un cas de la recette.
  // Sans lui, le crochet joue de vraies suites dans un depot qui n a pas de node_modules et
  // refuse le montage — la recette echouerait avant d avoir rien juge.
  git(travail, ['push', '-q', '--no-verify', 'origin', 'main']);
  return { base, travail, nu };
}

/** Pousse, et rend le code + la sortie. `commande` simule le verdict des suites. */
function pousser(travail, args, commande, envPlus = {}) {
  const r = spawnSync('git', ['push', ...args], {
    cwd: travail,
    encoding: 'utf8',
    env: {
      ...process.env,
      // LA RECETTE NE REGARDE JAMAIS LE VERROU DE PRODUCTION, et ce n'est pas une précaution
      // théorique : le 2026-08-17, la première exécution de ces cas est tombée pendant une passe
      // `c12h-t` réelle, et le verrou légitime a fait ROUGIR quatre cas qui n'avaient rien à voir
      // avec lui (C, E, F, G). Une recette dont le verdict dépend de ce qui tourne dehors ne
      // prouve rien — elle rougit au hasard, donc on finit par ne plus la croire. Chaque cas
      // pointe ici un chemin absent du bac à sable ; ceux qui veulent un verrou l'écrivent.
      ECHO_VERROU_CAMPAGNE: join(base, 'aucun-verrou.json'),
      ...(commande ? { ECHO_PREPUSH_COMMANDE: commande } : {}),
      ...envPlus,
    },
  });
  return { code: r.status, sortie: (r.stdout || '') + (r.stderr || '') };
}

const commit = (travail, message) => {
  writeFileSync(join(travail, 'LISEZMOI.md'), `${message}\n${Date.now()}\n`, 'utf8');
  git(travail, ['add', '-A']);
  git(travail, ['commit', '-m', message]);
};

// Sonde : sans git utilisable, la recette ne peut RIEN prononcer — et 2, jamais 0.
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch (e) {
  console.error(`VERIFICATION IMPOSSIBLE : git est injoignable — ${e.message}`);
  process.exit(2);
}

console.log('# Recette de la garde avant push — elle doit REFUSER, sinon elle ne prouve rien\n');

const { base, travail } = monter();
try {
  // --- A. le cas nominal : main, suites vertes ---------------------------------------
  {
    commit(travail, 'un commit vert');
    const r = pousser(travail, ['origin', 'main'], 'exit 0');
    verdict('A. push vers main avec les deux suites VERTES : accepte',
      r.code === 0 && /Les deux suites passent/.test(r.sortie),
      `code ${r.code}`);
  }

  // --- B. LE CAS DECISIF : une suite rouge arrete le push ----------------------------
  {
    commit(travail, 'un commit rouge');
    const r = pousser(travail, ['origin', 'main'], 'exit 1');
    const distant = git(travail, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
    const local = git(travail, ['rev-parse', 'HEAD']).trim();
    verdict('B. CAS DECISIF — une suite ROUGE REFUSE le push, et le commit ne part PAS',
      r.code !== 0 && /PUSH REFUS/.test(r.sortie) && distant !== local,
      `code ${r.code} · distant ${distant.slice(0, 8)} != local ${local.slice(0, 8)}`);
    verdict('C. le refus NOMME les applications rouges',
      /apps\/cms/.test(r.sortie) && /apps\/web/.test(r.sortie),
      (r.sortie.match(/· apps\/\S+.*/g) || []).join(' | ').slice(0, 160));
  }

  // --- D. une autre branche n'est pas jugee ------------------------------------------
  {
    git(travail, ['checkout', '-q', '-b', 'travaux']);
    commit(travail, 'sur une branche de travail');
    const r = pousser(travail, ['origin', 'travaux'], 'exit 1'); // suites rouges, mais hors main
    verdict('D. une branche AUTRE que main n est pas jugee — meme avec des suites rouges',
      r.code === 0 && !/PUSH REFUS/.test(r.sortie),
      `code ${r.code}`);
    git(travail, ['checkout', '-q', 'main']);
  }

  // --- E. incapacite : l arbre est sale ----------------------------------------------
  {
    git(travail, ['reset', '-q', '--hard', 'origin/main']);
    commit(travail, 'commit propre');
    writeFileSync(join(travail, 'LISEZMOI.md'), 'modification NON commitee\n', 'utf8');
    const r = pousser(travail, ['origin', 'main'], 'exit 0'); // suites vertes : seul l arbre pose probleme
    verdict('E. CAS DECISIF — un arbre SALE refuse, meme avec des suites vertes',
      r.code !== 0 && /n a PAS pu juger/.test(r.sortie) && /non commit/.test(r.sortie),
      `code ${r.code}`);
    git(travail, ['checkout', '-q', '--', 'LISEZMOI.md']);
  }

  // --- F. incapacite : HEAD n est pas le commit pousse -------------------------------
  {
    git(travail, ['reset', '-q', '--hard', 'origin/main']);
    commit(travail, 'le commit a pousser');
    const cible = git(travail, ['rev-parse', 'HEAD']).trim();
    commit(travail, 'un commit de plus, qui deplace HEAD');
    // On ne pousse QUE le premier des deux : HEAD est donc en avance sur ce qui part.
    const r = pousser(travail, ['origin', `${cible}:refs/heads/main`], 'exit 0');
    verdict('F. CAS DECISIF — HEAD different du commit pousse refuse, plutot que de juger a cote',
      r.code !== 0 && /n a PAS pu juger/.test(r.sortie) && /copie de travail est sur/.test(r.sortie),
      `code ${r.code}`);
  }

  // --- G. le seam de recette se DENONCE ----------------------------------------------
  {
    git(travail, ['reset', '-q', '--hard', 'origin/main']);
    commit(travail, 'pour verifier que le seam parle');
    const r = pousser(travail, ['origin', 'main'], 'exit 0');
    verdict('G. le seam de recette s ANNONCE — une garde qu on peut faire mentir en silence ne garde rien',
      /ECHO_PREPUSH_COMMANDE est pos/i.test(r.sortie) && /n est PAS la garde r/i.test(r.sortie),
      'le crochet dit lui-meme qu il ne joue pas npm test');
  }
  // --- H a K. LE VERROU DE CAMPAGNE (R-09) ------------------------------------------
  //
  // Ce que ces quatre cas prouvent, et que rien ne prouvait avant le 2026-08-17 : ce depot sait
  // refuser un push PARCE QU UNE CAMPAGNE DE MESURE TOURNE. Le code peut etre parfait — c est le
  // MOMENT qui ne va pas. Cas fondateur : `47d499e1`, pousse pendant la campagne §10, qui a
  // declenche les deploiements 502 et 503 et fausse une passe SANS RIEN ANNONCER.
  const verrouEcrit = (contenu) => {
    const f = join(base, 'verrou-campagne.json');
    writeFileSync(f, contenu, 'utf8');
    return f;
  };
  const dans = (s) => new Date(Date.now() + s * 1000).toISOString();

  {
    commit(travail, 'un commit vert, mais pendant une campagne');
    const f = verrouEcrit(JSON.stringify({ campagne: 'P3 c14h-p2', expire_a: dans(900) }));
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('H. verrou ACTIF : le push vers main est REFUSE, et le refus nomme la campagne',
      r.code !== 0 && /CAMPAGNE DE MESURE est en vol/.test(r.sortie) && /P3 c14h-p2/.test(r.sortie),
      `code ${r.code}`);
    verdict('H bis. le refus tombe AVANT les suites — quinze minutes de tests ne sont pas brulees',
      !/Les deux suites passent/.test(r.sortie),
      'aucune suite jouee avant le refus');
    verdict('H ter. le refus dit le REMEDE : le fichier a supprimer et l echappatoire',
      r.sortie.includes('verrou-campagne.json') && /--no-verify/.test(r.sortie),
      'sans remede ecrit, une garde fermee devient une panne et se fait desarmer');
  }

  {
    // Un `p3-chrono` tue ne doit pas bloquer ce depot pour toujours : le bail expire seul.
    const f = verrouEcrit(JSON.stringify({ campagne: 'P3 passe morte', expire_a: dans(-1) }));
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('I. verrou EXPIRE : le push repasse — un verrou qui ne se leve jamais se fait supprimer',
      r.code === 0 && /Les deux suites passent/.test(r.sortie),
      `code ${r.code}`);
  }

  {
    const f = verrouEcrit('{ ceci n est pas du JSON');
    commit(travail, 'un commit vert, verrou corrompu');
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('J. verrou CORROMPU : refus — ne pas savoir lire n est pas savoir qu il n y a pas de campagne',
      r.code !== 0 && /ILLISIBLE/.test(r.sortie),
      `code ${r.code}`);
  }

  {
    // Le verrou garde `main`, pas le depot : une branche de travail reste poussable pendant une
    // campagne, puisqu elle ne declenche aucun deploiement.
    const f = verrouEcrit(JSON.stringify({ campagne: 'P3 en vol', expire_a: dans(900) }));
    const r = pousser(travail, ['origin', 'HEAD:refs/heads/travaux-pendant-campagne'], 'exit 1', { ECHO_VERROU_CAMPAGNE: f });
    verdict('K. verrou actif mais push HORS main : accepte — R-09 vise le build, pas le depot',
      r.code === 0,
      `code ${r.code}`);
  }

  {
    // Les cas H a K neutralisent `ECHO_VERROU_CAMPAGNE` : ils ne prouvent donc RIEN sur le chemin
    // que le crochet lit en vrai. Sans ce controle, la garde pourrait pointer n importe ou en
    // production sans qu un seul cas ne rougisse. Le chemin doit vivre hors des deux depots — le
    // depot de mesure l ecrit, celui-ci le lit, et un `git clean` ne doit pas l emporter.
    const { CHEMIN_VERROU } = await import('./gardes-avant-push.js').then((m) => m.default ?? m);
    verdict('L. le chemin lu EN PRODUCTION est hors des deux depots',
      !/echo-code|l-echo-des-hauts-magazine/i.test(CHEMIN_VERROU) && CHEMIN_VERROU.includes('.claude'),
      CHEMIN_VERROU);
  }
} finally {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* le temporaire s efface seul */ }
}

console.log('');
if (anomalies === 0) {
  console.log(`RECETTE VERTE — ${controles} controle(s) passe(s) : la garde refuse, et elle refuse pour les bons motifs.`);
  process.exit(0);
}
console.log(`RECETTE ROUGE — ${anomalies} anomalie(s) sur ${controles} controle(s).`);
process.exit(1);
