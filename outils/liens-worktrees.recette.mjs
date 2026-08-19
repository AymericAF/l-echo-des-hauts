#!/usr/bin/env node
// Recette de la garde « aucune jonction dans les worktrees » — elle la PROUVE EN LA
// CASSANT, dans les deux sens : une VRAIE jonction doit la faire échouer, un lien
// symbolique doit passer.
//
// CE QU'ELLE GARDE, ET POURQUOI ELLE EXISTE. Le 2026-08-16, les 31 jonctions du parc sont
// devenues des liens symboliques et la garantie a été obtenue — sur le parc D'ALORS. Elle
// n'était garantie sur AUCUN worktree à venir : `outils/` ne portait aucun script de
// création, un worktree se créait donc à la main, et `mklink /J` est le geste qui vient par
// réflexe — celui de toute la documentation Windows. La garantie s'érodait worktree après
// worktree sans que rien ne le signale. Mesuré au moment d'écrire cette recette : le parc
// portait DÉJÀ une jonction neuve (`_wt/code-bascule-cms/apps/web/node_modules`), posée
// après la bascule. L'érosion n'était pas une hypothèse.
//
// LE PIÈGE DE MÉTHODE, hérité de `retirer-worktree.recette.mjs` et rencontré pour de vrai.
// Une première version y posait la jonction par `cmd //c mklink /J` depuis bash : MSYS a
// transformé `/J` en chemin, `mklink` a répondu « Option non valide », et le témoin est
// ressorti INTACT — preuve apparente que le danger n'existait pas, alors qu'AUCUNE jonction
// n'avait été posée. Ici, la conséquence serait pire encore : la garde serait déclarée
// « conforme » pour avoir refusé... rien. Chaque cas vérifie donc DEUX fois ce qu'il a posé,
// et AVANT de juger :
//   1. `lstatSync().isSymbolicLink()` — le lien existe bel et bien ;
//   2. `cmd /c dir /AL` — un instrument INDÉPENDANT de celui de la garde dit `<JUNCTION>`
//      ou `<SYMLINKD>`. La garde, elle, lit la balise de réanalyse par `fsutil`. Vérifier
//      la pose avec l'instrument même de la garde ne prouverait rien : un défaut commun
//      rendrait les deux faux ensemble.
//
// POURQUOI L'INSTRUMENT NE PEUT PAS ÊTRE `lstat` SEUL — c'est le fait central, mesuré :
// une jonction NTFS et un lien symbolique de répertoire rendent EXACTEMENT la même chose à
// `lstatSync()` (`isSymbolicLink() === true`, mode `0o120000`) et à `readlinkSync()` (le
// même chemin absolu). Rien dans l'API de node ne les distingue. Seule la balise de
// réanalyse les sépare : `0xa0000003` (point de montage = jonction) contre `0xa000000c`
// (lien symbolique). C'est ce que la garde lit, et c'est pourquoi elle appelle un
// instrument externe au lieu de se contenter de `fs`.
//
// PORTÉE, ET CE QU'ELLE NE COUVRE PAS. Les jonctions sont propres à Windows/NTFS. Lancée
// ailleurs, cette recette ne se déclare PAS conforme : elle sort en code 2 (« non jouée »),
// distinct de 0 (conforme) et de 1 (échec). La CI du dépôt tourne sur ubuntu et ne peut
// donc pas la porter — elle y exerce la garde de plateforme, pas la garde elle-même. La
// preuve est locale, et c'est une limite assumée, pas un oubli.
//
// Usage : node outils/liens-worktrees.recette.mjs [filtre]

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const OUTIL = join(ICI, 'liens-worktrees.js');

if (process.platform !== 'win32') {
    console.log('Recette de la garde des liens de worktree — NON JOUÉE');
    console.log(`  Les jonctions NTFS n'existent pas sur ${process.platform} : le défaut visé`);
    console.log('  ne peut pas s\'y reproduire, donc cette recette ne prouverait rien.');
    console.log('  Code 2 = non jouée. Elle ne se déclare pas conforme pour autant.');
    process.exit(2);
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
const fenetre = (p) => p.replace(/\//g, '\\');

/**
 * L'INSTRUMENT INDÉPENDANT. `dir /AL` liste les points de réanalyse et écrit leur nature en
 * clair. Les étiquettes `<JUNCTION>` et `<SYMLINKD>` ne sont PAS traduites (vérifié sur ce
 * Windows en français, où `<DIR>` s'affiche pourtant `<REP>`) : elles se lisent donc à
 * l'identique quelle que soit la locale. C'est un chemin de lecture ENTIÈREMENT distinct de
 * celui de la garde, qui interroge la balise de réanalyse par `fsutil`.
 */
function natureSelonDir(lien) {
    const sortie = execFileSync('cmd.exe', ['/c', 'dir', '/AL', fenetre(dirname(lien))], {
        encoding: 'latin1',
        stdio: 'pipe',
    });
    const nom = lien.split(/[\\/]/).pop();
    for (const l of sortie.split(/\r?\n/)) {
        if (!l.includes(nom)) continue;
        if (l.includes('<JUNCTION>')) return 'JUNCTION';
        if (l.includes('<SYMLINKD>')) return 'SYMLINKD';
        if (l.includes('<SYMLINK>')) return 'SYMLINK';
    }
    return 'ABSENT';
}

/**
 * Poser un lien, et REFUSER de continuer s'il n'a pas été posé comme demandé.
 *
 * Sans ce refus, un cas mesurerait sa propre erreur : la garde « refuserait » un montage
 * vide, et la recette la déclarerait conforme.
 */
function poser(lien, cible, nature) {
    mkdirSync(dirname(lien), { recursive: true });
    const option = nature === 'JUNCTION' ? '/J' : '/D';
    // `execFileSync('cmd.exe', …)`, JAMAIS un shell POSIX : MSYS transformerait `/J` en
    // chemin et `mklink` répondrait « Option non valide » — sans rien poser.
    execFileSync('cmd.exe', ['/c', 'mklink', option, fenetre(lien), fenetre(cible)], {
        encoding: 'utf8',
        stdio: 'pipe',
    });
    if (!lstatSync(lien).isSymbolicLink()) {
        throw new Error(`${lien} n'est pas un lien : le cas ne prouverait rien`);
    }
    const vue = natureSelonDir(lien);
    if (vue !== nature) {
        throw new Error(`${lien} devait être une ${nature}, dir /AL y voit ${vue}`);
    }
}

/** Un dépôt jetable et son worktree — le montage réel en miniature. */
function montage({ liens = [] } = {}) {
    const base = mkdtempSync(join(tmpdir(), 'echo-liens-'));
    const cible = join(base, 'node_modules-reel');
    const depot = join(base, 'depot');
    const wt = join(base, 'wt');
    mkdirSync(cible, { recursive: true });
    writeFileSync(join(cible, 'paquet.txt'), 'x\n');
    mkdirSync(depot, { recursive: true });

    git(['init', '-q', '.'], depot);
    git(['config', 'user.email', 'recette@local.test'], depot);
    git(['config', 'user.name', 'recette'], depot);
    writeFileSync(join(depot, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(depot, 'fichier.txt'), 'contenu\n');
    git(['add', '-A'], depot);
    git(['commit', '-qm', 'base'], depot);
    git(['worktree', 'add', '-q', wt, '-b', 'jetable'], depot);

    for (const { ou, nature, cible: c } of liens) poser(join(wt, ou), c ?? cible, nature);
    return { base, cible, depot, wt };
}

function lancer(args, cwd) {
    try {
        const sortie = execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, sortie };
    } catch (e) {
        return { code: e.status ?? 1, sortie: (e.stdout || '') + (e.stderr || '') };
    }
}

const CAS = [
    {
        nom: 'LE DÉFAUT EST VU : une VRAIE jonction fait ÉCHOUER la garde, et elle la NOMME',
        jouer() {
            const m = montage({ liens: [{ ou: 'apps/web/node_modules', nature: 'JUNCTION' }] });
            const lien = join(m.wt, 'apps/web/node_modules');
            // La pose est déjà prouvée par `poser()` ; on le REDIT dans le verdict pour que
            // la sortie de la recette porte elle-même la preuve, et pas seulement le code.
            const vue = natureSelonDir(lien);
            const r = lancer([OUTIL], m.depot);
            const nomme = r.sortie.includes('node_modules') && /apps.web/.test(r.sortie);
            return {
                ok: vue === 'JUNCTION' && r.code === 1 && nomme,
                dit: `dir /AL voit ${vue} ; garde code ${r.code} (1 attendu), jonction ${nomme ? 'NOMMÉE' : 'NON NOMMÉE'}`,
            };
        },
    },
    {
        nom: 'LE NOMINAL : un lien symbolique de répertoire PASSE',
        jouer() {
            const m = montage({ liens: [{ ou: 'apps/web/node_modules', nature: 'SYMLINKD' }] });
            const vue = natureSelonDir(join(m.wt, 'apps/web/node_modules'));
            const r = lancer([OUTIL], m.depot);
            return {
                ok: vue === 'SYMLINKD' && r.code === 0,
                dit: `dir /AL voit ${vue} ; garde code ${r.code} (0 attendu)`,
            };
        },
    },
    {
        nom: 'LES DEUX SONT INDISCERNABLES À `lstat` : c est ce qui rend l instrument nécessaire',
        // Ce cas ne juge pas la garde, il juge la PRÉMISSE de la garde. S'il rougissait,
        // c'est que node distingue désormais les deux et que l'appel externe — le seul
        // coût de cette garde — ne se justifierait plus.
        jouer() {
            const m = montage({
                liens: [
                    { ou: 'apps/web/node_modules', nature: 'JUNCTION' },
                    { ou: 'apps/cms/node_modules', nature: 'SYMLINKD' },
                ],
            });
            const j = lstatSync(join(m.wt, 'apps/web/node_modules'));
            const s = lstatSync(join(m.wt, 'apps/cms/node_modules'));
            const memeVue = j.isSymbolicLink() === s.isSymbolicLink() && (j.mode & 0o170000) === (s.mode & 0o170000);
            return {
                ok: memeVue && j.isSymbolicLink(),
                dit: `isSymbolicLink : jonction ${j.isSymbolicLink()} / symlink ${s.isSymbolicLink()} — ${memeVue ? 'INDISCERNABLES, l instrument est nécessaire' : 'DISCERNABLES ?!'}`,
            };
        },
    },
    {
        nom: 'LE MÉLANGE : une seule jonction parmi des liens symboliques suffit à refuser',
        jouer() {
            const m = montage({
                liens: [
                    { ou: 'apps/web/node_modules', nature: 'SYMLINKD' },
                    { ou: 'apps/cms/node_modules', nature: 'JUNCTION' },
                ],
            });
            const r = lancer([OUTIL], m.depot);
            const nommeLaBonne = /apps.cms/.test(r.sortie);
            // Le lien sain ne doit PAS être dénoncé : une garde qui accuse tout le monde
            // ne dit plus rien, et on cesse de la lire.
            const accuseLeSain = /JONCTION[^\n]*apps.web/i.test(r.sortie);
            return {
                ok: r.code === 1 && nommeLaBonne && !accuseLeSain,
                dit: `code ${r.code}, la jonction apps/cms ${nommeLaBonne ? 'est nommée' : 'N EST PAS NOMMÉE'}, le lien sain ${accuseLeSain ? 'EST ACCUSÉ À TORT' : 'n est pas accusé'}`,
            };
        },
    },
    {
        nom: 'LE PIÈGE `existsSync` : une jonction CASSÉE est vue quand même (elle l est par `lstat`)',
        // C'est le piège exact qui a fait sauter un lien en silence lors de la bascule du
        // 2026-08-16 : `existsSync` SUIT le lien, donc il rend `false` sur un lien dont la
        // cible a disparu — et une énumération bâtie dessus saute précisément les liens les
        // plus douteux. Le cas EXERCE le piège au lieu de l'éviter : il vérifie d'abord que
        // `existsSync` est bien `false`, puis exige que la garde voie quand même la jonction.
        jouer() {
            const m = montage({ liens: [{ ou: 'apps/web/node_modules', nature: 'JUNCTION' }] });
            const lien = join(m.wt, 'apps/web/node_modules');
            rmSync(m.cible, { recursive: true, force: true }); // la CIBLE, pas le lien
            const piegeArme = existsSync(lien) === false && lstatSync(lien).isSymbolicLink();
            const r = lancer([OUTIL], m.depot);
            // Exiger le NOM et pas seulement le code : un module absent fait sortir node
            // en 1 lui aussi, et ce cas serait alors vert avant même que la garde existe.
            const nomme = /apps.web.node_modules/.test(r.sortie);
            return {
                ok: piegeArme && r.code === 1 && nomme,
                dit: `existsSync ${existsSync(lien)} / lstat isSymbolicLink ${lstatSync(lien).isSymbolicLink()} — piège ${piegeArme ? 'armé' : 'NON ARMÉ, le cas ne prouve rien'} ; garde code ${r.code} (1 attendu), lien ${nomme ? 'NOMMÉ' : 'NON NOMMÉ'}`,
            };
        },
    },
    {
        nom: 'RIEN À JUGER : un worktree sans aucun lien passe, et la garde le DIT',
        // Un « 0 jonction » sur un parc où la garde n'a rien énuméré serait un vert qui ne
        // prouve rien. Elle doit dire combien de liens elle a examinés.
        jouer() {
            const m = montage({ liens: [] });
            const r = lancer([OUTIL], m.depot);
            return {
                ok: r.code === 0 && /0 lien/.test(r.sortie),
                dit: `code ${r.code}, la sortie ${/0 lien/.test(r.sortie) ? 'dit qu elle a examiné 0 lien' : 'NE DIT PAS combien de liens elle a examinés'}`,
            };
        },
    },
    {
        nom: 'L INCAPACITÉ SE REFUSE : hors dépôt git, code 2 — jamais un vert',
        // Une garde qui rend 0 quand elle n'a pas pu lire les worktrees certifie un parc
        // qu'elle n'a pas regardé. C'est la forme d'échec que ce dépôt traque.
        jouer() {
            const nulle_part = mkdtempSync(join(tmpdir(), 'echo-hors-depot-'));
            const r = lancer([OUTIL], nulle_part);
            return {
                ok: r.code === 2,
                dit: `code ${r.code} (2 attendu : incapacité, distincte de 0 et de 1)`,
            };
        },
    },
    {
        nom: 'LA JONCTION PROFONDE est trouvée : `apps/cms/node_modules`, pas seulement la racine',
        // Le montage réel n'a jamais de lien à la racine du worktree : ils sont sous
        // `apps/<app>/node_modules`. Une énumération non récursive n'en verrait aucun et
        // rendrait « 0 jonction » — un vert sur un parc érodé.
        jouer() {
            const m = montage({ liens: [{ ou: 'apps/cms/node_modules', nature: 'JUNCTION' }] });
            const r = lancer([OUTIL], m.depot);
            return {
                ok: r.code === 1 && /apps.cms/.test(r.sortie),
                dit: `code ${r.code}, la jonction profonde ${/apps.cms/.test(r.sortie) ? 'est nommée' : 'N EST PAS NOMMÉE'}`,
            };
        },
    },
    {
        nom: 'LA GARDE NOMME SON REMÈDE : la sortie donne la commande qui répare',
        // Une garde qui refuse sans dire quoi faire se fait contourner. C'est ce qui pousse
        // au `--no-verify`, et alors on perd aussi ce qui marchait.
        jouer() {
            const m = montage({ liens: [{ ou: 'apps/web/node_modules', nature: 'JUNCTION' }] });
            const r = lancer([OUTIL], m.depot);
            const remede = /creer-worktree\.js --reparer/.test(r.sortie);
            return {
                ok: r.code === 1 && remede,
                dit: `code ${r.code}, le remède ${remede ? 'est nommé' : 'N EST PAS NOMMÉ'} dans la sortie`,
            };
        },
    },
];

const filtre = process.argv[2];
const joues = CAS.filter((c) => filtre === undefined || c.nom.includes(filtre));
console.log(`Recette de la garde des liens de worktree — ${joues.length} cas\n`);

let echecs = 0;
for (const cas of joues) {
    let r;
    try {
        r = cas.jouer();
    } catch (e) {
        r = { ok: false, dit: `le cas n a pas pu se jouer : ${e.message}` };
    }
    if (!r.ok) echecs++;
    console.log(`  ${r.ok ? 'ok    ' : 'ECHEC '} ${cas.nom}`);
    console.log(`           ${r.dit}`);
}

console.log(`\n${joues.length - echecs}/${joues.length} cas conformes`);
process.exit(echecs ? 1 : 0);
