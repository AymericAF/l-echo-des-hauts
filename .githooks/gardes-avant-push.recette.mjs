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
 * DEUX CAS S'EN PASSENT DÉLIBÉRÉMENT — Q et R. Le seam remplace `npm test`, donc n'a besoin
 * d'aucune dépendance : il rend structurellement invisible le contrôle d'installation, qui est
 * exactement ce que ces deux-là exercent. Ils empruntent donc le chemin réel.
 *
 * Usage  : node .githooks/gardes-avant-push.recette.mjs
 * Sortie : 0 = conforme · 1 = anomalie · 2 = vérification impossible.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { hostname, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ICI = fileURLToPath(new URL('.', import.meta.url));

/**
 * UN `pid` REELLEMENT MORT, pas un nombre inventé. Un `99999` pris au hasard peut exister sur la
 * machine qui joue la recette : le cas « lanceur mort » passerait alors pour une raison qui n'est
 * pas la sienne, ou échouerait sans que rien ne soit cassé. On en fabrique un vrai — un processus
 * qu'on lance et qu'on laisse mourir — et on reprend son `pid`.
 */
const PID_MORT = (() => {
  const r = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  return r.pid;
})();
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

  // --- M a P. LA FENETRE EST DESORMAIS LA CAMPAGNE ENTIERE (2026-08-18) -------------------
  //
  // CE QUI A CHANGE EN AMONT, ET POURQUOI CE DEPOT DOIT LE DIRE. Jusqu au 2026-08-18, le verrou
  // etait pose au debut d UNE PASSE et leve a sa fin. Une campagne §10 compte 12 passes, donc
  // ONZE INTERVALLES pendant lesquels ce depot etait ROUVERT — et un deploiement pris dans un
  // intervalle DEBORDE sur la passe suivante et la fausse. Depuis, le lanceur de campagne tient
  // le verrou d un bout a l autre, avec un bail RENOUVELE tant qu il vit.
  //
  // CE QUE CES CAS EXIGENT DU MESSAGE. Il doit toujours porter les TROIS informations validees :
  // QUELLE campagne, JUSQU A QUAND, COMMENT sortir. Et il doit dire que l attente n est plus
  // « la fin de la passe » mais « la fin de la CAMPAGNE » : quelqu un qui croit attendre 10 min
  // alors qu il en attend 90 supprimera le fichier — et la garde sera morte.
  {
    const f = verrouEcrit(JSON.stringify({
      campagne: 'P3 campagne creneau-09h', portee: 'campagne', expire_a: dans(900),
      pid: process.pid, hote: hostname(),
    }));
    commit(travail, 'un commit vert, mais pendant une CAMPAGNE');
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('M. verrou de PORTEE CAMPAGNE : le push est REFUSE',
      r.code !== 0 && /CAMPAGNE DE MESURE est en vol/.test(r.sortie),
      `code ${r.code}`);
    verdict('M bis. le refus dit QUELLE campagne, et c est la campagne — pas une passe',
      /P3 campagne creneau-09h/.test(r.sortie), '');
    verdict('M ter. le refus dit JUSQU A QUAND — le bail, en clair',
      /bail jusqu/i.test(r.sortie) && /\d{4}-\d{2}-\d{2}T/.test(r.sortie), '');
    verdict('M quater. le refus dit COMMENT SORTIR — p3-chrono etat, le fichier, --no-verify',
      /p3-chrono/.test(r.sortie) && r.sortie.includes('verrou-campagne.json') && /--no-verify/.test(r.sortie), '');
    verdict('M quinquies. CAS DECISIF — le refus dit que la fenetre est la CAMPAGNE ENTIERE, intervalles compris',
      /CAMPAGNE ENTI[EÈ]RE/i.test(r.sortie) && /entre deux passes|intervalle/i.test(r.sortie),
      'sans cela, on croit attendre une passe quand on attend une campagne — et on supprime le fichier');
  }

  {
    // Une PASSE isolee, elle, n a pas change : sa fenetre est la passe. Le message ne doit pas
    // annoncer une campagne entiere pour dix minutes d attente, sinon il ment dans l autre sens.
    const f = verrouEcrit(JSON.stringify({
      campagne: 'P3 passe-isolee', portee: 'passe', expire_a: dans(900),
      pid: process.pid, hote: hostname(),
    }));
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('N. verrou de portee PASSE : refus, et la fenetre annoncee est la PASSE',
      r.code !== 0 && /cette PASSE/i.test(r.sortie) && !/CAMPAGNE ENTI[EÈ]RE/i.test(r.sortie),
      `code ${r.code}`);
  }

  {
    // LE LANCEUR EST MORT. Le bail court encore, mais son processus n existe plus : plus personne
    // ne le renouvellera. Faire attendre la fin du bail ferait payer a ce depot un blocage dont
    // on sait deja qu il n a plus d objet — et c est ce qui pousse a supprimer le fichier.
    const f = verrouEcrit(JSON.stringify({
      campagne: 'P3 campagne tuee', portee: 'campagne', expire_a: dans(900),
      pid: PID_MORT, hote: hostname(),
    }));
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('O. lanceur MORT, bail encore valide : le push repasse — un mort ne renouvelle pas son bail',
      r.code === 0 && /Les deux suites passent/.test(r.sortie),
      `code ${r.code} (pid mort ${PID_MORT})`);
  }

  {
    // ET LE SENS INVERSE, sans quoi le cas O passerait aussi avec une sonde qui rend toujours
    // « mort » — c est-a-dire avec la garde entierement desarmee.
    const f = verrouEcrit(JSON.stringify({
      campagne: 'P3 campagne vivante', portee: 'campagne', expire_a: dans(900),
      pid: process.pid, hote: hostname(),
    }));
    commit(travail, 'un commit vert, campagne vivante');
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('O bis. CONTRE-EPREUVE — lanceur VIVANT : le push reste REFUSE',
      r.code !== 0 && /CAMPAGNE DE MESURE est en vol/.test(r.sortie),
      `code ${r.code}`);
  }

  {
    // UN VERROU D UNE AUTRE MACHINE NE SE SONDE PAS. Un `pid` de la-bas ne veut rien dire ici ;
    // le lire « mort » rouvrirait ce depot en pleine campagne. On s en tient au bail.
    const f = verrouEcrit(JSON.stringify({
      campagne: 'P3 campagne d ailleurs', portee: 'campagne', expire_a: dans(900),
      pid: PID_MORT, hote: 'une-autre-machine',
    }));
    const r = pousser(travail, ['origin', 'main'], 'exit 0', { ECHO_VERROU_CAMPAGNE: f });
    verdict('P. verrou d un AUTRE hote : la vivacite ne se sonde pas, le bail fait foi -> refus',
      r.code !== 0 && /CAMPAGNE DE MESURE est en vol/.test(r.sortie),
      `code ${r.code}`);
  }

  // --- Q a T. LE FAUX ROUGE D ENVIRONNEMENT (2026-08-24, tache `095fdab0`) ----------------
  //
  // CE QUE CES CAS PROUVENT. Ce crochet joue `npm test` DANS L ARBRE COURANT. Un worktree neuf
  // n a pas de `node_modules` : la suite y echoue pour une raison qui n a RIEN A VOIR avec le
  // code, et le refus imprimait « ROUGE apps/cms … test failed » — un message qui ACCUSE LE CODE
  // quand c est l INSTALLATION qui manque. Cout constate : un diagnostic complet a chaque fois,
  // et le risque d abandonner une fusion parfaitement saine.
  //
  // LES CONTRE-EPREUVES COMPTENT AUTANT QUE LES CAS. Une garde qui crierait « dependances » sur
  // tout rouge n aurait fait que deplacer le mensonge : R prouve qu un arbre installe passe le
  // controle, T qu un vrai echec de test reste annonce comme un echec de test.
  //
  // Q ET R N UTILISENT PAS LE SEAM, exprès : le seam remplace `npm test`, donc n a besoin
  // d aucune dependance — s en servir ici ne prouverait rien du chemin reel.
  {
    git(travail, ['reset', '-q', '--hard', 'origin/main']);
    commit(travail, 'un commit dans un arbre sans node_modules');
    const r = pousser(travail, ['origin', 'main'], null);
    verdict('Q. CAS DECISIF — sans node_modules, le refus NOMME l installation, pas le code',
      r.code !== 0 && /D[EÉ]PENDANCES NE SONT PAS INSTALL/i.test(r.sortie)
        && /N EST PAS UN [EÉ]CHEC DES TESTS/i.test(r.sortie),
      `code ${r.code}`);
    verdict('Q bis. le refus nomme LES DEUX applications d un coup, pas la premiere qui peche',
      /apps\/cms\/node_modules est absent/.test(r.sortie)
        && /apps\/web\/node_modules est absent/.test(r.sortie),
      'sinon on paie les quarante secondes d apps/cms pour decouvrir apps/web ensuite');
    verdict('Q ter. le refus dit LE GESTE — npm ci, avec le chemin de CET arbre',
      /npm ci --prefix "[^"]*apps[\\/]cms"/.test(r.sortie)
        && /npm ci --prefix "[^"]*apps[\\/]web"/.test(r.sortie),
      'un refus sans remede ecrit se fait desarmer');
    verdict('Q quater. aucune suite n a ete jouee — il n y avait rien a juger',
      !/Les deux suites passent/.test(r.sortie) && !/ROUGE apps/.test(r.sortie),
      'refuser ici coute deux existsSync, refuser apres aurait coute les deux suites');
  }

  {
    // CONTRE-EPREUVE. `node_modules` present : le controle ne doit plus rien dire, et la garde
    // doit aller jusqu aux suites. Elles rougissent (le depot jetable n a pas de script `test`),
    // et c est exactement ce qu on veut lire : un rouge de suite, pas un refus d installation.
    for (const app of ['apps/cms', 'apps/web']) mkdirSync(join(travail, app, 'node_modules'), { recursive: true });
    commit(travail, 'un commit dans un arbre installe');
    const r = pousser(travail, ['origin', 'main'], null);
    verdict('R. CONTRE-EPREUVE — node_modules present : plus un mot sur les dependances',
      r.code !== 0 && !/D[EÉ]PENDANCES NE SONT PAS INSTALL/i.test(r.sortie)
        && /est ROUGE/.test(r.sortie),
      `code ${r.code} — le controle laisse passer et les suites prononcent`);
  }

  {
    // UN `node_modules` PRESENT MAIS PERIME. Le controle d existence ne peut pas le voir : seule
    // la sortie le trahit. C est le cas d un arbre installe AVANT une fusion qui a deplace les
    // lockfiles — et c est le meme faux rouge, une heure plus tard dans la journee.
    const sortieModuleAbsent = join(base, 'sortie-module-absent.mjs');
    writeFileSync(sortieModuleAbsent,
      'console.error("Error [ERR_MODULE_NOT_FOUND]: Cannot find package \'astro\' imported from tests/mapping.test.ts");\n'
      + 'process.exit(1);\n', 'utf8');
    commit(travail, 'un commit dont les dependances sont perimees');
    const r = pousser(travail, ['origin', 'main'], `node "${sortieModuleAbsent}"`);
    verdict('S. CAS DECISIF — un rouge a signature de module introuvable est annonce comme tel',
      r.code !== 0 && /SIGNATURE D UNE D[EÉ]PENDANCE ABSENTE/i.test(r.sortie)
        && /Cannot find package 'astro'/.test(r.sortie) && /npm ci --prefix/.test(r.sortie),
      `code ${r.code}`);
  }

  {
    // ET LE SENS INVERSE, sans quoi S passerait aussi avec une garde qui crie « dependances » sur
    // n importe quel rouge — c est-a-dire avec le diagnostic entierement desarme.
    // LA SORTIE EST CELLE DE `node --test`, JUSQU A SA DERNIERE LIGNE : elle finit par la fin de
    // l objet d erreur, « } ». C est ce que le refus affichait comme detail — « · apps/cms : } ».
    const sortieTestCasse = join(base, 'sortie-test-casse.mjs');
    writeFileSync(sortieTestCasse,
      "console.log('\\u2716 le mapping rend le bon slug (0.9ms)');\n"
      + "console.log('\\u2139 fail 1');\n"
      + 'console.log("  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:");\n'
      + "console.log('    operator: \\'strictEqual\\'');\n"
      + "console.log('  }');\n"
      + 'process.exit(1);\n', 'utf8');
    commit(travail, 'un commit dont les tests sont VRAIMENT casses');
    const r = pousser(travail, ['origin', 'main'], `node "${sortieTestCasse}"`);
    verdict('T. CONTRE-EPREUVE — un vrai echec de test reste un echec de TEST',
      r.code !== 0 && /est ROUGE/.test(r.sortie)
        && !/D[EÉ]PENDANCE ABSENTE/i.test(r.sortie)
        && /AssertionError/.test(r.sortie),
      `code ${r.code}`);
    verdict('T bis. le detail NOMME l echec au lieu de rendre la derniere ligne, « } »',
      /· apps\/cms : .*fail 1.*AssertionError/.test(r.sortie)
        && !/· apps\/cms : \}\s*$/m.test(r.sortie),
      (r.sortie.match(/· apps\/cms : .*/) || [''])[0].slice(0, 120));
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
