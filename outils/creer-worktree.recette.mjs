#!/usr/bin/env node
// Recette de la création outillée de worktree — le CONFORT, jugé sur ce qu'il pose et sur ce
// qu'il répare, jamais sur ce qu'il promet.
//
// CE QU'ELLE GARDE. `outils/creer-worktree.js` existe pour une raison unique : tant qu'un
// worktree se crée à la main, `mklink /J` est le geste qui vient par réflexe — c'est celui
// de toute la documentation Windows — et chaque nouveau worktree réintroduit la jonction que
// la bascule du 2026-08-16 avait retirée des 31 existantes. Une jonction est traversée par
// `git worktree remove`, qui efface alors la CIBLE et pas le lien : c'est ainsi que
// `apps/*/node_modules` du dépôt principal sont tombés à 0 paquet.
//
// L'ORDRE COMPTE, ET IL EST INVERSE DE L'INTUITION. Cet outil n'est PAS la garantie : la
// garantie est `outils/liens-worktrees.js`, qui CONSTATE et refuse. Sans elle, ce script ne
// serait qu'une convention de plus — celle qu'on suit jusqu'au jour où l'on tape la commande
// à la main parce qu'on est pressé. C'est pourquoi plusieurs cas ci-dessous ne jugent pas la
// sortie de l'outil mais font TRANCHER LA GARDE sur ce qu'il a posé : le confort se prouve
// par le constat, pas par sa propre parole.
//
// LE PIÈGE DE MÉTHODE, hérité de `retirer-worktree.recette.mjs`. `cmd //c mklink /J` depuis
// bash : MSYS transforme `/J` en chemin, `mklink` répond « Option non valide », rien n'est
// posé, et le cas conclut que le danger n'existe pas. Chaque pose passe donc par
// `execFileSync('cmd.exe', …)` et se vérifie par `dir /AL` — un instrument indépendant de
// `fsutil`, celui de la garde.
//
// PORTÉE. Jonctions et `mklink` sont propres à Windows. Ailleurs, cette recette sort en
// code 2 (« non jouée »), distinct de 0 (conforme) et de 1 (échec). La CI tourne sur ubuntu
// et n'exerce donc que cette garde de plateforme.
//
// Usage : node outils/creer-worktree.recette.mjs [filtre]

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const OUTIL = join(ICI, 'creer-worktree.js');
const GARDE = join(ICI, 'liens-worktrees.js');

if (process.platform !== 'win32') {
    console.log('Recette de la création outillée de worktree — NON JOUÉE');
    console.log(`  mklink et les jonctions n'existent pas sur ${process.platform}.`);
    console.log('  Code 2 = non jouée. Elle ne se déclare pas conforme pour autant.');
    process.exit(2);
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
const fenetre = (p) => p.replace(/\//g, '\\');

/** L'instrument INDÉPENDANT : `dir /AL` dit la nature en clair, et sans traduire. */
function natureSelonDir(lien) {
    let sortie;
    try {
        sortie = execFileSync('cmd.exe', ['/c', 'dir', '/AL', fenetre(dirname(lien))], {
            encoding: 'latin1',
            stdio: 'pipe',
        });
    } catch {
        return 'ABSENT';
    }
    const nom = lien.split(/[\\/]/).pop();
    for (const l of sortie.split(/\r?\n/)) {
        if (!l.includes(nom)) continue;
        if (l.includes('<JUNCTION>')) return 'JUNCTION';
        if (l.includes('<SYMLINKD>')) return 'SYMLINKD';
        if (l.includes('<SYMLINK>')) return 'SYMLINK';
    }
    return 'ABSENT';
}

function poserJonction(lien, cible) {
    mkdirSync(dirname(lien), { recursive: true });
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', fenetre(lien), fenetre(cible)], {
        encoding: 'utf8',
        stdio: 'pipe',
    });
    if (!lstatSync(lien).isSymbolicLink()) throw new Error(`${lien} n est pas un lien`);
    const vue = natureSelonDir(lien);
    if (vue !== 'JUNCTION') throw new Error(`${lien} devait être une JUNCTION, dir /AL y voit ${vue}`);
}

/** Un dépôt jetable avec ses deux applications et leurs `node_modules` RÉELS. */
function montage() {
    const base = mkdtempSync(join(tmpdir(), 'echo-creer-'));
    const depot = join(base, 'depot');
    mkdirSync(depot, { recursive: true });
    git(['init', '-q', '.'], depot);
    git(['config', 'user.email', 'recette@local.test'], depot);
    git(['config', 'user.name', 'recette'], depot);
    writeFileSync(join(depot, '.gitignore'), 'node_modules/\n');
    for (const app of ['apps/web', 'apps/cms']) {
        mkdirSync(join(depot, app, 'node_modules'), { recursive: true });
        writeFileSync(join(depot, app, 'package.json'), '{"name":"' + app + '"}\n');
        for (let i = 1; i <= 5; i++) writeFileSync(join(depot, app, 'node_modules', `p-${i}.txt`), `${i}\n`);
    }
    git(['add', '-A'], depot);
    git(['commit', '-qm', 'base'], depot);
    return { base, depot };
}

/** Ce que porte un répertoire : `null` s'il a disparu, sinon son nombre d'entrées. */
const porte = (p) => {
    try {
        return readdirSync(p).length;
    } catch {
        return null;
    }
};

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
        nom: 'LA CRÉATION POSE DES LIENS SYMBOLIQUES, jamais des jonctions',
        jouer() {
            const m = montage();
            const r = lancer([OUTIL, 'neuf'], m.depot);
            const wt = join(m.base, '_wt', 'neuf');
            const natures = ['apps/web', 'apps/cms'].map((a) => natureSelonDir(join(wt, a, 'node_modules')));
            return {
                ok: r.code === 0 && natures.every((n) => n === 'SYMLINKD'),
                dit: `code ${r.code} ; dir /AL voit ${natures.join(' et ')} (SYMLINKD attendu deux fois)`,
            };
        },
    },
    {
        nom: 'LA GARDE TRANCHE sur ce que la création a posé — le confort se prouve par le constat',
        // Ce cas ne croit pas l'outil sur parole : il fait juger son travail par la garde.
        jouer() {
            const m = montage();
            const c = lancer([OUTIL, 'neuf'], m.depot);
            const g = lancer([GARDE], m.depot);
            return {
                ok: c.code === 0 && g.code === 0,
                dit: `création code ${c.code}, garde code ${g.code} (0 attendu) — ${g.sortie.trim().split('\n')[0]}`,
            };
        },
    },
    {
        nom: 'LE WORKTREE EXISTE VRAIMENT : git le déclare, et sa branche est celle demandée',
        // Un outil qui poserait de jolis liens dans un répertoire que git ignore serait vert
        // et inutile.
        jouer() {
            const m = montage();
            const r = lancer([OUTIL, 'neuf', '--branche', 'p2/essai'], m.depot);
            const liste = git(['worktree', 'list', '--porcelain'], m.depot);
            const wt = join(m.base, '_wt', 'neuf');
            const declare = liste.replace(/\//g, '\\').includes(wt.replace(/\//g, '\\'));
            const surLaBranche = git(['rev-parse', '--abbrev-ref', 'HEAD'], wt).trim() === 'p2/essai';
            return {
                ok: r.code === 0 && declare && surLaBranche,
                dit: `code ${r.code}, git ${declare ? 'déclare' : 'NE DÉCLARE PAS'} le worktree, branche ${surLaBranche ? 'p2/essai' : 'INATTENDUE'}`,
            };
        },
    },
    {
        nom: 'LA RÉPARATION convertit une VRAIE jonction en lien symbolique',
        jouer() {
            const m = montage();
            lancer([OUTIL, 'neuf'], m.depot);
            const wt = join(m.base, '_wt', 'neuf');
            const lien = join(wt, 'apps/web/node_modules');
            const cible = join(m.depot, 'apps/web/node_modules');
            // On DÉFAIT ce que l'outil a fait, pour remettre le parc dans l'état érodé.
            execFileSync('cmd.exe', ['/c', 'rmdir', fenetre(lien)], { stdio: 'pipe' });
            poserJonction(lien, cible);
            const avant = natureSelonDir(lien);
            const r = lancer([OUTIL, '--reparer'], m.depot);
            const apres = natureSelonDir(lien);
            return {
                ok: avant === 'JUNCTION' && r.code === 0 && apres === 'SYMLINKD',
                dit: `avant ${avant}, réparation code ${r.code}, après ${apres} (SYMLINKD attendu)`,
            };
        },
    },
    {
        nom: 'LA CIBLE SURVIT À LA RÉPARATION : elle est comptée avant et après',
        // C'est le seul risque réel de cet outil : il RETIRE un lien. Si `rmdir` traversait,
        // il détruirait exactement ce que la garde protège.
        jouer() {
            const m = montage();
            lancer([OUTIL, 'neuf'], m.depot);
            const wt = join(m.base, '_wt', 'neuf');
            const lien = join(wt, 'apps/web/node_modules');
            const cible = join(m.depot, 'apps/web/node_modules');
            execFileSync('cmd.exe', ['/c', 'rmdir', fenetre(lien)], { stdio: 'pipe' });
            poserJonction(lien, cible);
            const avant = porte(cible);
            lancer([OUTIL, '--reparer'], m.depot);
            const apres = porte(cible);
            return {
                ok: avant === 5 && apres === 5,
                dit: `cible : ${avant} entrées avant, ${apres === null ? 'DISPARUE' : apres} après (5 et 5 attendus)`,
            };
        },
    },
    {
        nom: 'APRÈS RÉPARATION, LA GARDE PASSE — et c est elle qui le dit, pas l outil',
        jouer() {
            const m = montage();
            lancer([OUTIL, 'neuf'], m.depot);
            const wt = join(m.base, '_wt', 'neuf');
            const lien = join(wt, 'apps/cms/node_modules');
            execFileSync('cmd.exe', ['/c', 'rmdir', fenetre(lien)], { stdio: 'pipe' });
            poserJonction(lien, join(m.depot, 'apps/cms/node_modules'));
            const rouge = lancer([GARDE], m.depot);
            lancer([OUTIL, '--reparer'], m.depot);
            const vert = lancer([GARDE], m.depot);
            return {
                ok: rouge.code === 1 && vert.code === 0,
                dit: `garde avant réparation ${rouge.code} (1 attendu), après ${vert.code} (0 attendu)`,
            };
        },
    },
    {
        nom: 'RIEN À RÉPARER : sur un parc sain, la réparation ne touche rien et le DIT',
        jouer() {
            const m = montage();
            lancer([OUTIL, 'neuf'], m.depot);
            const r = lancer([OUTIL, '--reparer'], m.depot);
            return {
                ok: r.code === 0 && /0 jonction|aucune jonction/i.test(r.sortie),
                dit: `code ${r.code}, la sortie ${/0 jonction|aucune jonction/i.test(r.sortie) ? 'dit qu il n y avait rien à faire' : 'NE DIT PAS ce qu elle a trouvé'}`,
            };
        },
    },
    {
        nom: 'L INCAPACITÉ SE REFUSE : hors dépôt git, code 2 — jamais un vert',
        jouer() {
            const nulle_part = mkdtempSync(join(tmpdir(), 'echo-hors-depot-'));
            const r = lancer([OUTIL, '--reparer'], nulle_part);
            return { ok: r.code === 2, dit: `code ${r.code} (2 attendu)` };
        },
    },
    {
        nom: 'UN NOM DÉJÀ PRIS EST REFUSÉ, et le worktree existant reste intact',
        // « Faire de son mieux » sur un chemin occupé, c'est écraser le travail de quelqu'un.
        jouer() {
            const m = montage();
            lancer([OUTIL, 'neuf'], m.depot);
            const wt = join(m.base, '_wt', 'neuf');
            writeFileSync(join(wt, 'travail-en-cours.txt'), 'ne pas perdre\n');
            const r = lancer([OUTIL, 'neuf'], m.depot);
            const intact = existsSync(join(wt, 'travail-en-cours.txt'));
            return {
                ok: r.code !== 0 && intact,
                dit: `code ${r.code} (non nul attendu), le travail en cours ${intact ? 'est intact' : 'A ÉTÉ PERDU'}`,
            };
        },
    },
];

const filtre = process.argv[2];
const joues = CAS.filter((c) => filtre === undefined || c.nom.includes(filtre));
console.log(`Recette de la création outillée de worktree — ${joues.length} cas\n`);

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
