#!/usr/bin/env node
// Recette du declencheur des gardes du code — elle le PROUVE EN LE CASSANT, dans les
// deux sens : ce qui doit rougir rougit, et ce qui doit rester gratuit ne lance rien.
//
// POURQUOI ELLE EXISTE. Le 2026-08-10, le declencheur venait d etre pose ; le 2026-08-11 on
// a constate qu un `git commit --amend` SANS RIEN REINDEXER laisse `git diff --cached` VIDE,
// que le pre-filtre n y voit alors aucun fichier sous garde, et qu il sort proprement a
// zero. Le commit resultant portait un contenu que rien n avait juge, et la seule chose que
// l on pouvait lire a l ecran etait « aucune application gardee dans ce commit » — une
// phrase FAUSSE sur un commit qui changeait bel et bien un fichier d application. C est la
// forme d echec que ce projet traque : une incapacite qui rend la meme sortie qu un succes.
//
// POURQUOI UNE RECETTE D INTEGRATION, ET PAS DES TESTS UNITAIRES. Ce que l on veut prouver
// n est pas une fonction, c est CE QUE GIT EXPOSE au declencheur au moment ou il tourne —
// et la mesure du 2026-08-11 dit que `commit-msg` ne recoit AUCUN argument, AUCUNE variable
// d environnement qui distingue un amendement d un commit ordinaire (les deux rendent
// « [.git/COMMIT_EDITMSG] [] [] »). Tester des fonctions internes reviendrait a tester une
// copie de cette croyance. Chaque cas construit donc un depot jetable, y installe le VRAI
// crochet et le VRAI declencheur, lance un VRAI `git commit`, et lit le code de sortie.
//
// LE PIEGE DE METHODE, rencontre pour de vrai : fabriquer l etat « commit jamais juge »
// avec `--no-verify` reviendrait a prouver le crochet en le desarmant. Les cas concernes
// posent donc leur commit A LA PLOMBERIE (`write-tree` / `commit-tree` / `update-ref`) :
// aucune garde n est desactivee, elle n est simplement jamais appelee — exactement l etat
// d un clone frais sans `core.hooksPath`, d un rebase, ou de l historique anterieur au
// crochet.
//
// ELLE PROUVE AUSSI QUE LE DECLENCHEUR REFERME SON ARBRE TEMPORAIRE (2026-08-23). Chaque cas
// tourne avec un repertoire temporaire ISOLE (TEMP/TMP/TMPDIR rediriges), et ROUGIT s il y
// reste un `gardes-au-commit-*` a la fin. Ce n est pas une coquetterie de disque : le
// repertoire temporaire est celui de l utilisateur, et il portait 41 arbres abandonnes —
// 14 vides, 27 materialises — alors que l effacement etait ecrit, et ecrit dans un
// `finally`. `process.exit()` n en deroule AUCUN. La mesure par execution a nomme QUATRE
// sorties qui l enjambaient, quand le releve d origine n en presumait qu une : le
// `process.exit(0)` du « aucun test ne couvre » — le plus frequent, et le seul a sortir a
// ZERO —, et les trois `abandonner()` poses sous le `try`. Les quatre derniers cas les
// forcent un a un. Le controle, lui, est lu sur TOUS les cas : une sortie neuve qui
// oublierait le filet rougira sans que personne n ait eu a y penser.
//
// Usage : node outils/gardes-au-commit.recette.mjs

import { execFileSync, spawnSync } from 'node:child_process';
import {
    copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DEPOT = dirname(ICI);
const DECLENCHEUR = join(ICI, 'gardes-au-commit.js');
const CROCHET = join(DEPOT, '.githooks', 'commit-msg');

/**
 * Installer TOUT `outils/*.js` dans le depot jetable, pas seulement le declencheur.
 *
 * POURQUOI PAS UNE LISTE DE NOMS. Le declencheur appelle desormais un second outil
 * (`liens-worktrees.js`, le pas « aucune jonction dans les worktrees »). Une liste ecrite a
 * la main ici divergerait au troisieme outil, et la panne serait MUETTE dans le sens le plus
 * traitre : le declencheur copie tomberait sur un `MODULE_NOT_FOUND`, chaque cas rougirait
 * pour une cause etrangere a ce qu il croit eprouver, et on chercherait la regression dans
 * la mauvaise moitie du depot. C est exactement ce qui s est produit en ajoutant ce pas.
 */
function installerOutils(d) {
    mkdirSync(join(d, 'outils'), { recursive: true });
    for (const f of readdirSync(ICI)) {
        if (f.endsWith('.js')) copyFileSync(join(ICI, f), join(d, 'outils', f));
    }
}

// ── Le miniature : une application `apps/web` reduite a un test et sa source ─────────────
// `APPS` du declencheur est ecrit en dur (`apps/web`, `apps/cms`) : le depot jetable porte
// donc ce nom-la. Le test IMPORTE sa source, ce qui exerce la derivation par graphe
// d imports — le chemin reel, pas une table ecrite a la main.
const SOURCE_SAINE = 'export const valeur = 1;\n';
const SOURCE_FAUTIVE = 'export const valeur = 2;\n';
const TEST = `import assert from 'node:assert/strict';
import test from 'node:test';
import { valeur } from '../src/sonde.ts';

test('la sonde vaut 1', () => {
  assert.equal(valeur, 1);
});
`;

function git(d, args, options = {}) {
    return execFileSync('git', args, { cwd: d, encoding: 'utf8', stdio: 'pipe', ...options });
}

/**
 * Lance une commande et rend { code, sortie } sans jamais lever.
 *
 * `spawnSync` et non `execFileSync` : ce dernier ne rend que la SORTIE STANDARD quand la
 * commande reussit, et le declencheur ecrit tout sur la sortie d erreur — y compris sa
 * ligne « gardes VERTES ». Un cas « passe, et les tests ont tourne » aurait donc echoue
 * pour un defaut de la recette, pas du declencheur. Mesure a la premiere execution.
 */
function tenter(d, commande, args, env) {
    const r = spawnSync(commande, args, {
        cwd: d,
        encoding: 'utf8',
        // LE REPERTOIRE TEMPORAIRE DU CAS, ET POURQUOI IL EST REDIRIGE. Chaque cas de cette
        // recette prouve AUSSI que le declencheur referme son arbre temporaire : le compte
        // se lit sur ce repertoire-la, apres coup. Le repertoire temporaire du poste porte
        // ~198 000 entrees — un comptage y serait ininterpretable, et c est exactement
        // pourquoi 41 arbres abandonnes y ont vecu sans que personne ne les voie.
        env: {
            ...process.env,
            TEMP: tempDuCas, TMP: tempDuCas, TMPDIR: tempDuCas,
            ...(env || {}),
        },
    });
    if (r.error) return { code: 99, sortie: String(r.error.message) };
    return { code: r.status ?? 1, sortie: String(r.stdout ?? '') + String(r.stderr ?? '') };
}

/** Le repertoire temporaire ISOLE du cas en cours — pose par la boucle d execution. */
let tempDuCas = null;

/**
 * Remplace une chaine EXACTE dans la COPIE installee du declencheur, ou rougit bruyamment.
 *
 * POURQUOI SABOTER PLUTOT QUE PROVOQUER. Deux des chemins de sortie a prouver ne sont
 * atteignables par AUCUN contenu de depot : `git ls-files` recoit des pathspecs ecrits en
 * dur, et git REFUSE de mettre a l index un chemin que `checkout-index` ne saurait pas
 * ecrire (« Invalid path », mesure du 2026-08-23). On sabote donc L ENTREE de la commande
 * — un pathspec, un prefixe de destination —, jamais le chemin de code : la VRAIE commande
 * echoue vraiment, et le VRAI `catch` prend.
 *
 * Si le motif disparait du source, ce n est pas un cas a ignorer : la recette ECHOUE en
 * nommant le motif absent, plutot que de virer au vert faute de matiere.
 */
function saboter(d, avant, apres) {
    const p = join(d, 'outils', 'gardes-au-commit.js');
    const s = readFileSync(p, 'utf8');
    if (!s.includes(avant)) {
        throw new Error('SABOTAGE IMPOSSIBLE — motif absent de gardes-au-commit.js : ' + avant);
    }
    writeFileSync(p, s.replace(avant, apres), 'utf8');
}

/** Un depot jetable, avec le vrai crochet, le vrai declencheur, et un commit initial. */
function depot() {
    const d = mkdtempSync(join(tmpdir(), 'recette-gardes-au-commit-'));
    git(d, ['init', '-q', '.']);
    git(d, ['config', 'user.email', 'recette@exemple.invalid']);
    git(d, ['config', 'user.name', 'recette']);
    // Explicite, et non herite : un `core.hooksPath` global pointerait ailleurs, et la
    // recette mesurerait alors un autre crochet que celui qu elle croit eprouver.
    git(d, ['config', 'core.hooksPath', '.githooks']);
    git(d, ['config', 'commit.gpgsign', 'false']);
    mkdirSync(join(d, '.githooks'), { recursive: true });
    mkdirSync(join(d, 'apps', 'web', 'tests'), { recursive: true });
    mkdirSync(join(d, 'apps', 'web', 'src'), { recursive: true });
    copyFileSync(CROCHET, join(d, '.githooks', 'commit-msg'));
    installerOutils(d);
    writeFileSync(join(d, 'apps', 'web', 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');
    writeFileSync(join(d, 'apps', 'web', 'tests', 'sonde.test.ts'), TEST, 'utf8');
    writeFileSync(join(d, 'apps', 'web', 'src', 'sonde.ts'), SOURCE_SAINE, 'utf8');
    writeFileSync(join(d, 'README.md'), 'depot jetable\n', 'utf8');
    // Le socle passe par la plomberie : le commit initial n a pas a etre juge, et un
    // `git commit` ici ferait dependre TOUS les cas du comportement qu on eprouve.
    git(d, ['add', '-A']);
    const arbre = git(d, ['write-tree']).trim();
    const commit = git(d, ['commit-tree', arbre, '-m', 'socle']).trim();
    git(d, ['update-ref', 'HEAD', commit]);
    return d;
}

function ecrireSource(d, contenu) {
    writeFileSync(join(d, 'apps', 'web', 'src', 'sonde.ts'), contenu, 'utf8');
}

/** Pose un commit SANS qu aucun crochet ne soit appele — a la plomberie, jamais --no-verify. */
function commitALaPlomberie(d, message) {
    git(d, ['add', '-A']);
    const arbre = git(d, ['write-tree']).trim();
    const parent = git(d, ['rev-parse', 'HEAD']).trim();
    const commit = git(d, ['commit-tree', arbre, '-p', parent, '-m', message]).trim();
    git(d, ['update-ref', 'HEAD', commit]);
    return commit;
}

// ── Les cas ─────────────────────────────────────────────────────────────────────────────
// `tests` : `lances` (au moins un fichier de test a tourne), `aucun` (rien n a tourne), ou
// undefined (indifferent). Le code de sortie SEUL ne suffirait pas : un cas « passe » reste
// vert qu il ait tout relance ou rien du tout, et c est precisement la difference entre un
// amendement gratuit et un amendement qui paie une suite entiere pour un mot corrige.
const CAS = [
    {
        nom: 'commit ordinaire, fichier sain sous garde — passe, et les tests ONT tourne',
        attendu: 'passe',
        tests: 'lances',
        jouer(d) {
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // retouche'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            return tenter(d, 'git', ['commit', '-m', 'retouche saine']);
        },
    },
    {
        nom: 'commit ordinaire, fichier fautif — REFUSE en nommant le test',
        attendu: 'refuse',
        sortieContient: 'tests/sonde.test.ts',
        jouer(d) {
            ecrireSource(d, SOURCE_FAUTIVE);
            git(d, ['add', 'apps/web/src/sonde.ts']);
            return tenter(d, 'git', ['commit', '-m', 'faute deliberee']);
        },
    },
    {
        nom: 'commit hors garde (README seul) — passe sans rien lancer',
        attendu: 'passe',
        tests: 'aucun',
        jouer(d) {
            writeFileSync(join(d, 'README.md'), 'texte\n', 'utf8');
            git(d, ['add', 'README.md']);
            return tenter(d, 'git', ['commit', '-m', 'doc']);
        },
    },
    {
        nom: 'amendement de MESSAGE SEUL apres un commit vert — passe SANS RIEN lancer',
        attendu: 'passe',
        tests: 'aucun',
        jouer(d) {
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // retouche'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            const premier = tenter(d, 'git', ['commit', '-m', 'retouche saine']);
            if (premier.code !== 0) return { code: 99, sortie: premier.sortie };
            return tenter(d, 'git', ['commit', '--amend', '-m', 'retouche saine, mieux dite']);
        },
    },
    {
        nom: 'amendement --no-edit de MESSAGE SEUL apres un commit vert — passe SANS RIEN lancer',
        attendu: 'passe',
        tests: 'aucun',
        jouer(d) {
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // retouche'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            const premier = tenter(d, 'git', ['commit', '-m', 'retouche saine']);
            if (premier.code !== 0) return { code: 99, sortie: premier.sortie };
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'LE TROU : amendement sans reindexer d un commit FAUTIF jamais juge — REFUSE',
        attendu: 'refuse',
        sortieContient: 'tests/sonde.test.ts',
        jouer(d) {
            ecrireSource(d, SOURCE_FAUTIVE);
            commitALaPlomberie(d, 'faute posee sans qu aucune garde ne soit appelee');
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'meme trou, variante -m : amendement de message d un commit FAUTIF jamais juge — REFUSE',
        attendu: 'refuse',
        sortieContient: 'tests/sonde.test.ts',
        jouer(d) {
            ecrireSource(d, SOURCE_FAUTIVE);
            commitALaPlomberie(d, 'faute posee sans qu aucune garde ne soit appelee');
            return tenter(d, 'git', ['commit', '--amend', '-m', 'message corrige']);
        },
    },
    {
        nom: 'PAS DE FAUX ROUGE : amendement sans reindexer d un commit SAIN jamais juge — passe',
        attendu: 'passe',
        tests: 'lances',
        jouer(d) {
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // saine'));
            commitALaPlomberie(d, 'contenu sain, pose sans crochet');
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'amendement qui REINDEXE un fichier fautif — REFUSE en nommant le test',
        attendu: 'refuse',
        sortieContient: 'tests/sonde.test.ts',
        jouer(d) {
            writeFileSync(join(d, 'README.md'), 'texte\n', 'utf8');
            git(d, ['add', 'README.md']);
            const premier = tenter(d, 'git', ['commit', '-m', 'doc']);
            if (premier.code !== 0) return { code: 99, sortie: premier.sortie };
            ecrireSource(d, SOURCE_FAUTIVE);
            git(d, ['add', 'apps/web/src/sonde.ts']);
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'amendement qui REINDEXE un fichier sain — passe, et les tests ONT tourne',
        attendu: 'passe',
        tests: 'lances',
        jouer(d) {
            writeFileSync(join(d, 'README.md'), 'texte\n', 'utf8');
            git(d, ['add', 'README.md']);
            const premier = tenter(d, 'git', ['commit', '-m', 'doc']);
            if (premier.code !== 0) return { code: 99, sortie: premier.sortie };
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // saine'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'amendement qui reindexe un fichier SOUS GARDE par-dessus une faute jamais jugee — REFUSE',
        attendu: 'refuse',
        sortieContient: 'tests/sonde.test.ts',
        jouer(d) {
            // Le cas que juger « ce que l index ajoute a HEAD » laisserait passer : l ajout
            // reindexe est sain, c est le contenu DEJA dans HEAD qui est fautif. Sans le
            // temoin, la faute ne serait dans le differentiel de personne.
            // Le premier commit doit LANCER des tests : c est ce qui pose le temoin. Un
            // commit dont aucun test ne couvre le fichier n en pose aucun — mesure de la
            // premiere execution de ce cas, ou l amendement retombait faute de temoin.
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // socle certifie'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            const premier = tenter(d, 'git', ['commit', '-m', 'socle certifie']);
            if (premier.code !== 0) return { code: 99, sortie: premier.sortie };
            ecrireSource(d, SOURCE_FAUTIVE);
            commitALaPlomberie(d, 'faute posee sans qu aucune garde ne soit appelee');
            writeFileSync(join(d, 'apps', 'web', 'src', 'annexe.ts'), 'export const a = 2;\n', 'utf8');
            git(d, ['add', 'apps/web/src/annexe.ts']);
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'LE TROU ASSUME : amendement qui reindexe un fichier HORS garde par-dessus une faute jamais jugee — passe',
        attendu: 'passe',
        tests: 'aucun',
        jouer(d) {
            // Ce cas est ECRIT POUR ETRE VERT, et c est la seule facon honnete de tenir une
            // limite : le pre-filtre en `sh` sort a zero sans demarrer node quand rien de
            // l ajout n est sous garde, et le temoin n est donc jamais consulte. Fermer ce
            // cas couterait un demarrage de node a chaque commit de documentation. Le jour
            // ou ce cas se met a rougir, ce n est pas une regression : c est que la
            // decision a change, et il faut alors le retirer d ici EN LE DISANT.
            ecrireSource(d, SOURCE_FAUTIVE);
            commitALaPlomberie(d, 'faute posee sans qu aucune garde ne soit appelee');
            writeFileSync(join(d, 'README.md'), 'texte\n', 'utf8');
            git(d, ['add', 'README.md']);
            return tenter(d, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'amendement du COMMIT RACINE (aucun parent) — juge quand meme, et rougit sur la faute',
        attendu: 'refuse',
        sortieContient: 'tests/sonde.test.ts',
        jouer(d) {
            // Depot neuf : un seul commit, fautif, pose a la plomberie. `HEAD^` n existe
            // pas — un declencheur qui lit le parent sans precaution echouerait ici, et un
            // crochet qui casse sur un cas legitime se fait desarmer dans la semaine.
            const e = mkdtempSync(join(tmpdir(), 'recette-gardes-racine-'));
            git(e, ['init', '-q', '.']);
            git(e, ['config', 'user.email', 'recette@exemple.invalid']);
            git(e, ['config', 'user.name', 'recette']);
            git(e, ['config', 'core.hooksPath', '.githooks']);
            git(e, ['config', 'commit.gpgsign', 'false']);
            mkdirSync(join(e, '.githooks'), { recursive: true });
            mkdirSync(join(e, 'apps', 'web', 'tests'), { recursive: true });
            mkdirSync(join(e, 'apps', 'web', 'src'), { recursive: true });
            copyFileSync(CROCHET, join(e, '.githooks', 'commit-msg'));
            installerOutils(e);
            writeFileSync(join(e, 'apps', 'web', 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');
            writeFileSync(join(e, 'apps', 'web', 'tests', 'sonde.test.ts'), TEST, 'utf8');
            writeFileSync(join(e, 'apps', 'web', 'src', 'sonde.ts'), SOURCE_FAUTIVE, 'utf8');
            git(e, ['add', '-A']);
            const arbre = git(e, ['write-tree']).trim();
            const commit = git(e, ['commit-tree', arbre, '-m', 'racine fautive']).trim();
            git(e, ['update-ref', 'HEAD', commit]);
            return tenter(e, 'git', ['commit', '--amend', '--no-edit']);
        },
    },
    {
        nom: 'hors commit (index propre, pas de commit en cours) — rend 0 sans rien lancer',
        attendu: 'passe',
        tests: 'aucun',
        jouer(d) {
            // Le pas d integration continue « le declencheur lui-meme se lance sans
            // erreur » l appelle exactement ainsi, sur un arbre propre et SANS
            // dependances installees : s il se mettait a lancer des tests ici, le job
            // rougirait pour une cause qui n est pas la sienne.
            return tenter(d, process.execPath, ['outils/gardes-au-commit.js'], {
                GIT_INDEX_FILE: undefined,
            });
        },
    },

    // ── LES QUATRE SORTIES QUI NE DEROULAIENT PAS LE `finally` ──────────────────────────
    //
    // Le 2026-08-23, le repertoire temporaire du poste portait 41 arbres
    // `gardes-au-commit-*` abandonnes — 14 vides, 27 materialises — alors que l effacement
    // etait bien ecrit, et bien dans un `finally`. `process.exit()` n en deroule aucun.
    //
    // CES QUATRE CAS SONT LA MESURE, PAS LA RELECTURE. Le releve d origine ne presumait
    // qu UN `process.exit()` sous le `try` ; l execution en a nomme QUATRE. Chacun force
    // SON chemin de sortie, et le compte des arbres survivants se lit sur le repertoire
    // temporaire isole du cas — c est la boucle d execution qui le fait, pour TOUS les cas.
    //
    // Ce que les cas ordinaires ci-dessus prouvent deja, du meme mouvement : la sortie
    // nominale et la sortie sur test rouge referment bien, elles n ont jamais fui.
    {
        nom: 'SOUS LE TRY — « aucun test ne couvre » sort a ZERO : l arbre est referme quand meme',
        attendu: 'passe',
        tests: 'aucun',
        sortieContient: 'aucun test ne couvre',
        jouer(d) {
            // Le plus frequent des quatre, et le seul a sortir a zero : il laissait un arbre
            // derriere chaque commit REUSSI qu aucun test ne couvrait, sans un mot. Un
            // fichier d application qu AUCUN test n importe suffit a l atteindre.
            writeFileSync(join(d, 'apps', 'web', 'src', 'orphelin.ts'), 'export const rien = 0;\n', 'utf8');
            git(d, ['add', 'apps/web/src/orphelin.ts']);
            return tenter(d, 'git', ['commit', '-m', 'source que rien ne couvre']);
        },
    },
    {
        nom: 'SOUS LE TRY — la jonction node_modules impossible : REFUSE, et l arbre est referme',
        attendu: 'refuse',
        tests: 'aucun',
        sortieContient: 'n a pas pu etre pose',
        jouer(d) {
            // `apps/web/node_modules/` SUIVI : `checkout-index` le materialise, et
            // `symlinkSync` tombe sur un chemin deja occupe. C est le seul des trois
            // `abandonner()` sous le `try` qu un contenu de depot suffise a atteindre.
            mkdirSync(join(d, 'apps', 'web', 'node_modules'), { recursive: true });
            writeFileSync(join(d, 'apps', 'web', 'node_modules', 'marqueur.txt'), 'occupe\n', 'utf8');
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // retouche'));
            git(d, ['add', '-A']);
            return tenter(d, 'git', ['commit', '-m', 'node_modules suivi']);
        },
    },
    {
        nom: 'SOUS LE TRY — `git ls-files` echoue : REFUSE, et l arbre est referme',
        attendu: 'refuse',
        tests: 'aucun',
        sortieContient: 'n a pas rendu la liste des fichiers suivis',
        jouer(d) {
            saboter(d, "'README.md', 'CREDITS.md',", "'README.md', 'CREDITS.md', ':(motif-invalide)x',");
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // retouche'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            return tenter(d, 'git', ['commit', '-m', 'ls-files sabote']);
        },
    },
    {
        nom: 'SOUS LE TRY — `git checkout-index` echoue : REFUSE, et l arbre est referme',
        attendu: 'refuse',
        tests: 'aucun',
        sortieContient: 'n a pas pu etre materialise',
        jouer(d) {
            // ON SABOTE L ENTREE STANDARD, PAS LE PREFIXE DE DESTINATION. Faire echouer la
            // commande par son prefixe demande un chemin que le systeme refuse d ecrire, et
            // il n en existe aucun qui vaille sur les deux plateformes : `Q:/…` est un
            // lecteur absent sous Windows, mais un chemin relatif ordinaire sur l ubuntu de
            // l integration continue ; viser un FICHIER du depot ne marche pas non plus,
            // `-f` le remplace par un repertoire sans broncher (mesure du 2026-08-23).
            // Un chemin hors index, lui, fait sortir git en 1 sur les deux — c est GIT qui
            // refuse, pas le systeme de fichiers.
            saboter(d, 'input: listeSuivie,', "input: Buffer.from('chemin/absent-de-l-index\\0'),");
            ecrireSource(d, SOURCE_SAINE.replace('1;', '1; // retouche'));
            git(d, ['add', 'apps/web/src/sonde.ts']);
            return tenter(d, 'git', ['commit', '-m', 'checkout-index sabote']);
        },
    },
];

// ── Execution ───────────────────────────────────────────────────────────────────────────
const seul = process.argv[2];
let echecs = 0;
const joues = CAS.filter((c) => seul === undefined || c.nom.includes(seul));

console.log(`Recette du declencheur des gardes du code — ${joues.length} cas\n`);

for (const cas of joues) {
    const d = depot();
    // Le repertoire temporaire ISOLE du cas : `tenter` le pose en TEMP/TMP/TMPDIR de tout
    // ce qu il lance, et c est LUI qu on compte apres coup. Il est cree A COTE du depot
    // jetable, jamais dedans : un arbre pose sous le depot serait vu par git.
    tempDuCas = d + '-temp';
    mkdirSync(tempDuCas, { recursive: true });
    const { code, sortie } = cas.jouer(d);
    const obtenu = code === 0 ? 'passe' : 'refuse';

    // « des tests ont tourne » se lit sur la ligne que le declencheur imprime quand un lot
    // s est execute — verte comme rouge. Un cas « passe » qui n a rien lance et un cas
    // « passe » qui a tout relance rendent le meme code de sortie : sans cette lecture, la
    // moitie « ne coute rien » de la preuve ne serait pas prouvee du tout.
    const aLance = /gardes VERTES|garde ROUGE|n ont PAS PU se lancer/.test(sortie);
    const bonneCharge =
        cas.tests === undefined || (cas.tests === 'lances' ? aLance : !aLance);
    const bonMotif = cas.sortieContient === undefined || sortie.includes(cas.sortieContient);

    // L ARBRE TEMPORAIRE EST-IL REFERME ? Lu sur CHAQUE cas, pas seulement sur les quatre
    // ecrits pour ca : un chemin de sortie neuf qui oublierait le filet rougirait ici sans
    // que personne n ait a y penser. On ne compte que les arbres que le declencheur
    // CONSTRUIT (`gardes-au-commit-*`) : git et node deposent leurs propres temporaires
    // dans ce meme repertoire, et ils ne sont pas de son ressort.
    const reliquats = readdirSync(tempDuCas).filter((x) => x.startsWith('gardes-au-commit-'));
    const bacReferme = reliquats.length === 0;

    const ok = obtenu === cas.attendu && bonneCharge && bonMotif && bacReferme;
    if (!ok) echecs++;

    const pourquoi = [
        obtenu === cas.attendu ? '' : ` — attendu ${cas.attendu}, obtenu ${obtenu} (code ${code})`,
        bonneCharge ? '' : ` — tests ${cas.tests} attendus, ${aLance ? 'des tests ont tourne' : 'rien n a tourne'}`,
        bonMotif ? '' : ` — motif absent de la sortie : ${JSON.stringify(cas.sortieContient)}`,
        bacReferme ? '' : ` — ${reliquats.length} arbre(s) temporaire(s) ABANDONNE(S) : ${reliquats.join(', ')}`,
    ].join('');
    console.log(`  ${ok ? 'ok    ' : 'ECHEC '} ${cas.nom}${pourquoi}`);
    if (!ok) {
        for (const l of sortie.replace(/\s+$/, '').split('\n').slice(-14)) console.log('           | ' + l);
    }
}

console.log(`\n${joues.length - echecs}/${joues.length} cas conformes`);
process.exit(echecs ? 1 : 0);
