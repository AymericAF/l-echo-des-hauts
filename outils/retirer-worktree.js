#!/usr/bin/env node
/**
 * RETIRER UN WORKTREE SANS DÉTRUIRE CE QU'IL POINTE.
 *
 * LE FAIT, mesuré le 2026-08-16. `git worktree remove` a vidé `apps/cms/node_modules` et
 * `apps/web/node_modules` du dépôt principal — 0 paquet restant. Le worktree retiré portait
 * deux jonctions NTFS (`mklink /J`) vers ces répertoires : la suppression récursive de git
 * TRAVERSE la jonction et efface la CIBLE, pas le lien. Reproduit sur un témoin jetable
 * (5 fichiers → 0) par `outils/retirer-worktree.recette.mjs`, cas 1.
 *
 * POURQUOI UN OUTIL ET PAS UNE CONSIGNE. Le geste destructeur rend le code 0 et une sortie
 * VIDE — rigoureusement indiscernable d'un retrait réussi. Le dégât n'apparaît qu'à la suite
 * de tests suivante, sous la forme d'un `Cannot find module` qu'on impute d'abord à la
 * branche qu'on allait fusionner. Une note dans un fichier de procédure ne serait pas relue
 * au moment où l'on tape la commande ; un mécanisme, si.
 *
 * CE QU'IL FAIT, DANS CET ORDRE — et l'ordre est la garantie :
 *   1. refuse tout chemin que git ne connaît pas comme worktree (une incapacité se refuse,
 *      elle ne « fait pas de son mieux ») ;
 *   2. énumère les jonctions du worktree SANS y descendre ;
 *   3. compte ce que porte chaque cible AVANT ;
 *   4. retire chaque lien par `rmdir` — qui supprime le LIEN, jamais la cible ;
 *   5. recompte : si une cible a bougé, il S'ARRÊTE avant d'appeler git ;
 *   6. appelle `git worktree remove` ;
 *   7. recompte une dernière fois, et le dit.
 *
 * PORTÉE. Les jonctions sont propres à Windows/NTFS. Ailleurs, une suppression récursive
 * n'entre pas dans un lien symbolique : le défaut n'existe pas, et cet outil se contente
 * alors de déléguer à git.
 *
 * Usage : node outils/retirer-worktree.js <chemin-du-worktree> [--force]
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync } = require('node:fs');
const { join, resolve } = require('node:path');

/** Répertoires dans lesquels il est inutile de descendre pour trouver une jonction. */
const IGNORES = new Set(['.git']);

/** Compare deux chemins comme Windows les compare : casse et séparateurs indifférents. */
function memeChemin(a, b) {
    const n = (p) => {
        try {
            return realpathSync(p).replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
        } catch {
            return resolve(p).replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
        }
    };
    return n(a) === n(b);
}

/** Les worktrees que git déclare — la seule autorité sur « ceci est un worktree ». */
function worktreesConnus(cwd) {
    const sortie = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
    });
    return sortie
        .split('\n')
        .filter((l) => l.startsWith('worktree '))
        .map((l) => l.slice('worktree '.length).trim());
}

/**
 * Les jonctions et liens du worktree, en profondeur.
 *
 * ON NE DESCEND PAS DANS UN LIEN : le suivre ferait parcourir la cible entière (des
 * dizaines de milliers de fichiers pour un `node_modules`) et exposerait à des boucles.
 * `lstat` est employé partout — `stat` suivrait le lien et rendrait « répertoire ordinaire »
 * sur une jonction, ce qui les rendrait toutes invisibles.
 */
function jonctions(racine) {
    const trouvees = [];
    const parcourir = (dossier) => {
        let entrees;
        try {
            entrees = readdirSync(dossier, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entrees) {
            const complet = join(dossier, e.name);
            let st;
            try {
                st = lstatSync(complet);
            } catch {
                continue;
            }
            if (st.isSymbolicLink()) {
                let cible = null;
                try {
                    cible = readlinkSync(complet);
                } catch {
                    cible = null;
                }
                trouvees.push({ lien: complet, cible });
            } else if (st.isDirectory() && !IGNORES.has(e.name)) {
                parcourir(complet);
            }
        }
    };
    parcourir(racine);
    return trouvees;
}

/** Ce que porte un répertoire : `null` s'il a disparu, sinon son nombre d'entrées. */
function porte(chemin) {
    if (chemin === null) return null;
    try {
        return readdirSync(chemin).length;
    } catch {
        return null;
    }
}

function retirerLien(lien) {
    if (process.platform === 'win32') {
        // `rmdir` sans `/S` supprime le POINT DE RÉANALYSE et rien d'autre. Ni `rm -rf` ni
        // `fs.rmSync({recursive:true})` ne conviennent : les deux traversent.
        execFileSync('cmd.exe', ['/c', 'rmdir', lien.replace(/\//g, '\\')], {
            encoding: 'utf8',
            stdio: 'pipe',
        });
    } else {
        require('node:fs').unlinkSync(lien);
    }
}

function principal(argv) {
    const args = argv.filter((a) => a !== '--force');
    const force = argv.includes('--force');
    const cible = args[0];

    if (!cible) {
        console.error('Usage : node outils/retirer-worktree.js <chemin-du-worktree> [--force]');
        return 2;
    }

    const cwd = process.cwd();
    let connus;
    try {
        connus = worktreesConnus(cwd);
    } catch (e) {
        console.error(`REFUS : impossible de lire les worktrees depuis ${cwd}`);
        console.error(`  ${(e.stderr || e.message).toString().trim()}`);
        return 2;
    }

    // Le worktree principal est le premier de la liste : le retirer n'a pas de sens.
    if (memeChemin(cible, connus[0])) {
        console.error(`REFUS : ${cible} est le dépôt principal, pas un worktree secondaire.`);
        return 2;
    }
    if (!connus.slice(1).some((w) => memeChemin(cible, w))) {
        console.error(`REFUS : git ne connaît aucun worktree à ${cible}.`);
        console.error('  Un chemin que l outil ne comprend pas ne se supprime pas « au mieux » :');
        console.error('  il se refuse. Worktrees connus :');
        for (const w of connus.slice(1)) console.error(`    ${w}`);
        return 2;
    }

    // ── 1. Les liens, et ce que portent leurs cibles AVANT ───────────────────────────────
    const liens = jonctions(cible);
    if (liens.length === 0) {
        console.log('Aucune jonction dans ce worktree — rien à protéger.');
    } else {
        console.log(`${liens.length} jonction(s) à retirer avant que git ne parcoure l arbre :`);
        for (const j of liens) console.log(`  ${j.lien}\n    -> ${j.cible ?? '(cible illisible)'}`);
    }
    const avant = liens.map((j) => ({ ...j, compte: porte(j.cible) }));

    // ── 2. Retirer les LIENS, en vérifiant que les cibles ne bougent pas ─────────────────
    for (const j of avant) {
        try {
            retirerLien(j.lien);
        } catch (e) {
            console.error(`REFUS : la jonction ${j.lien} n a pas pu être retirée.`);
            console.error(`  ${(e.stderr || e.message).toString().trim()}`);
            console.error('  git n est PAS appelé : il traverserait cette jonction.');
            return 1;
        }
        const apres = porte(j.cible);
        if (j.compte !== null && apres !== j.compte) {
            console.error(`ARRÊT : la cible ${j.cible} est passée de ${j.compte} à ${apres ?? 'DISPARUE'}`);
            console.error('  entrées pendant le retrait du lien. git n est PAS appelé.');
            return 1;
        }
    }
    if (avant.length > 0) console.log('Liens retirés ; leurs cibles sont intactes.');

    // ── 3. Seulement maintenant, git ─────────────────────────────────────────────────────
    try {
        const sortie = execFileSync(
            'git',
            ['worktree', 'remove', ...(force ? ['--force'] : []), cible],
            { cwd, encoding: 'utf8', stdio: 'pipe' },
        );
        if (sortie.trim()) console.log(sortie.trim());
    } catch (e) {
        console.error('git worktree remove a refusé :');
        console.error(`  ${((e.stderr || '') + (e.stdout || '') || e.message).toString().trim()}`);
        console.error('  Les jonctions ont déjà été retirées : les cibles sont hors de danger,');
        console.error('  mais le worktree est toujours là. Traiter le motif ci-dessus, puis relancer.');
        return 1;
    }

    // ── 4. La vérification d après-coup, celle qui aurait vu le dégât du 2026-08-16 ──────
    let abime = false;
    for (const j of avant) {
        const apres = porte(j.cible);
        if (j.compte !== null && apres !== j.compte) {
            abime = true;
            console.error(`DÉGÂT : ${j.cible} est passée de ${j.compte} à ${apres ?? 'DISPARUE'} entrées.`);
        }
    }
    if (abime) {
        console.error('Le worktree a été retiré, mais une cible a été touchée — restaurer avant de continuer.');
        return 1;
    }

    console.log(`Worktree retiré : ${cible}`);
    if (avant.length > 0) {
        console.log(`Cibles vérifiées après coup : ${avant.map((j) => `${porte(j.cible)} entrées`).join(', ')} — inchangées.`);
    }
    if (existsSync(cible)) {
        console.log(`Note : ${cible} existe encore (git l a peut-être laissé) — à inspecter.`);
    }
    return 0;
}

process.exit(principal(process.argv.slice(2)));
