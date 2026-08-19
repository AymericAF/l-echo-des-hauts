#!/usr/bin/env node
/**
 * CRÉER UN WORKTREE SANS RÉINTRODUIRE LA JONCTION — le confort, et rien de plus.
 *
 * CE QUE CET OUTIL N'EST PAS. Il n'est PAS la garantie. La garantie est
 * `outils/liens-worktrees.js`, qui CONSTATE et refuse le commit. Tant que ce script est
 * seul, il n'est qu'une convention de plus — celle qu'on suit jusqu'au jour où l'on tape
 * `mklink /J` à la main parce qu'on est pressé, et la documentation Windows ne propose que
 * celui-là. C'est pourquoi il a été écrit APRÈS la garde, délibérément.
 *
 * LE FAIT QU'IL ÉVITE. Le 2026-08-16, `git worktree remove` a vidé `apps/cms/node_modules`
 * et `apps/web/node_modules` du dépôt principal — 0 paquet restant. Le worktree retiré
 * portait deux jonctions NTFS : la suppression récursive de git TRAVERSE une jonction et
 * efface la CIBLE, pas le lien. Un lien symbolique de répertoire (`mklink /D`) n'a pas ce
 * défaut. Les 31 jonctions du parc ont été converties le jour même — mais un worktree créé
 * le lendemain à la main en reposait une, et c'est exactement ce qui s'est produit
 * (`_wt/code-bascule-cms/apps/web/node_modules`, trouvée par la garde).
 *
 * DEUX MODES, ET LE SECOND EST LE REMÈDE QUE LA GARDE NOMME :
 *   node outils/creer-worktree.js <nom> [--branche <b>] [--depuis <ref>]
 *   node outils/creer-worktree.js --reparer [<chemin-de-worktree>]
 *
 * LE RISQUE RÉEL DE LA RÉPARATION, et comment il est tenu. Réparer suppose de RETIRER un
 * lien — le geste même qui a tout détruit le 2026-08-16, si l'on s'y prend mal. Trois choses
 * le rendent sûr, et elles sont vérifiées, pas promises : le retrait passe par `rmdir` SANS
 * `/S`, qui supprime le point de réanalyse et jamais la cible ; la cible est COMPTÉE avant
 * et après, et un écart arrête tout ; et le pouvoir de créer un lien symbolique est ÉPROUVÉ
 * sur un témoin jetable AVANT qu'aucune jonction ne soit touchée — sinon on retirerait un
 * lien qu'on ne saurait pas remplacer.
 *
 * Codes : 0 = fait   1 = échec   2 = n a pas pu (environnement à corriger)
 */
'use strict';

const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, lstatSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, isAbsolute, join, resolve } = require('node:path');

const { liensDe, nature, enParallele, worktreesConnus } = require('./liens-worktrees.js');

const fenetre = (p) => p.replace(/\//g, '\\');

/** Ce que porte un répertoire : `null` s'il a disparu, sinon son nombre d'entrées. */
function porte(chemin) {
    if (!chemin) return null;
    try {
        return readdirSync(chemin).length;
    } catch {
        return null;
    }
}

function mklink(option, lien, cible) {
    return execFileSync('cmd.exe', ['/c', 'mklink', option, fenetre(lien), fenetre(cible)], {
        encoding: 'utf8',
        stdio: 'pipe',
    });
}

/** `rmdir` SANS `/S` : il supprime le point de réanalyse, jamais ce qu'il pointe. */
function retirerLien(lien) {
    execFileSync('cmd.exe', ['/c', 'rmdir', fenetre(lien)], { encoding: 'utf8', stdio: 'pipe' });
}

/**
 * ÉPROUVER LE POUVOIR DE POSER UN LIEN SYMBOLIQUE, AVANT DE RETIRER QUOI QUE CE SOIT.
 *
 * `mklink /D` demande le privilège SeCreateSymbolicLink — accordé par le mode développeur
 * ou une élévation. `mklink /J` n'en demande aucun : c'est LA raison technique pour laquelle
 * la jonction s'est installée partout. Sans cette épreuve préalable, une réparation
 * retirerait la jonction puis échouerait à poser son remplaçant, et le worktree se
 * retrouverait sans `node_modules` du tout — un dégât causé par l'outil censé l'éviter.
 */
function pouvoirPoserUnSymlink() {
    const bac = mkdtempSync(join(tmpdir(), 'echo-pouvoir-'));
    const cible = join(bac, 'cible');
    const lien = join(bac, 'lien');
    try {
        mkdirSync(cible, { recursive: true });
        mklink('/D', lien, cible);
        return { ok: lstatSync(lien).isSymbolicLink() };
    } catch (e) {
        return { ok: false, pourquoi: ((e.stderr || '') + (e.stdout || '') || e.message).toString().trim() };
    } finally {
        try {
            retirerLien(lien);
        } catch {
            /* le témoin est jetable */
        }
        try {
            rmSync(bac, { recursive: true, force: true });
        } catch {
            /* idem */
        }
    }
}

/** Le dépôt principal : le premier worktree que git déclare. */
function principalDe(cwd) {
    const connus = worktreesConnus(cwd);
    if (connus.length === 0) throw new Error('git ne déclare aucun worktree');
    return connus[0];
}

/** Les applications du dépôt principal qui ont un `node_modules` RÉEL à présenter. */
function applicationsAvecPaquets(principal) {
    const racineApps = join(principal, 'apps');
    let entrees;
    try {
        entrees = readdirSync(racineApps, { withFileTypes: true });
    } catch {
        return [];
    }
    return entrees
        .filter((e) => e.isDirectory())
        .map((e) => ({ nom: e.name, paquets: join(racineApps, e.name, 'node_modules') }))
        .filter((a) => {
            // `lstatSync`, pas `existsSync` : si le dépôt principal portait lui-même un lien,
            // `existsSync` mentirait dès que sa cible aurait disparu.
            try {
                return lstatSync(a.paquets).isDirectory();
            } catch {
                return false;
            }
        });
}

async function creer(argv, cwd) {
    const nom = argv[0];
    const branche = valeur(argv, '--branche');
    const depuis = valeur(argv, '--depuis');

    let principal;
    try {
        principal = principalDe(cwd);
    } catch (e) {
        console.error(`REFUS : ${cwd} n est pas un dépôt git (${e.message}).`);
        return 2;
    }

    // `_wt` à côté du dépôt : c'est la convention du parc, et elle vaut mieux qu'un
    // répertoire dans l arbre de travail — un worktree DANS le dépôt se fait indexer.
    const chemin = nom.includes('/') || nom.includes('\\') || isAbsolute(nom)
        ? resolve(cwd, nom)
        : join(dirname(principal), '_wt', nom);

    if (existsSync(chemin) || estUnLien(chemin)) {
        console.error(`REFUS : ${chemin} existe déjà.`);
        console.error('  Un chemin occupé ne s écrase pas « au mieux » : il peut porter du travail.');
        return 1;
    }

    const pouvoir = pouvoirPoserUnSymlink();
    if (!pouvoir.ok) {
        console.error('REFUS : impossible de poser un lien symbolique de répertoire sur cette machine.');
        console.error(`  ${pouvoir.pourquoi || '(aucun motif rendu)'}`);
        console.error('  `mklink /D` demande le mode développeur ou une élévation ; `mklink /J` non —');
        console.error('  c est précisément pourquoi la jonction s était installée partout. On ne crée');
        console.error('  PAS le worktree plutôt que de le créer avec le lien dangereux.');
        return 2;
    }

    try {
        const args = ['worktree', 'add'];
        if (branche) args.push('-b', branche);
        args.push(chemin);
        if (depuis) args.push(depuis);
        const sortie = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
        if (sortie.trim()) console.log(sortie.trim());
    } catch (e) {
        console.error('REFUS : `git worktree add` a échoué —');
        console.error(`  ${((e.stderr || '') + (e.stdout || '') || e.message).toString().trim()}`);
        return 1;
    }

    const apps = applicationsAvecPaquets(principal);
    if (apps.length === 0) {
        console.log(`Worktree créé : ${chemin}`);
        console.log('  Aucune application du dépôt principal ne porte de `node_modules` réel :');
        console.log('  aucun lien à poser. Lancer `npm install` là où il le faut.');
        return 0;
    }

    const poses = [];
    for (const app of apps) {
        const lien = join(chemin, 'apps', app.nom, 'node_modules');
        try {
            mkdirSync(dirname(lien), { recursive: true });
            mklink('/D', lien, app.paquets);
        } catch (e) {
            console.error(`REFUS : le lien vers apps/${app.nom}/node_modules n a pas pu être posé —`);
            console.error(`  ${((e.stderr || '') + (e.stdout || '') || e.message).toString().trim()}`);
            return 1;
        }
        poses.push({ app: app.nom, lien });
    }

    // NE PAS SE CROIRE SUR PAROLE. `mklink` peut rendre 0 en ayant posé autre chose que ce
    // qu'on croit (l option avalée par un shell, un alias). On RELIT ce qui est là.
    const natures = await enParallele(poses, 4, (p) => nature(p.lien));
    const fautives = poses.filter((_, i) => natures[i].nature !== 'symlink');
    if (fautives.length > 0) {
        console.error('REFUS : des liens ont été posés, mais ils ne sont PAS des liens symboliques —');
        for (const f of fautives) console.error(`  ${f.lien}`);
        console.error('  Le worktree existe et porte des liens dangereux : lancer');
        console.error('      node outils/creer-worktree.js --reparer');
        return 1;
    }

    console.log(`Worktree créé : ${chemin}`);
    for (const p of poses) console.log(`  lien symbolique  apps/${p.app}/node_modules  ->  ${apps.find((a) => a.nom === p.app).paquets}`);
    console.log(`  ${poses.length} lien(s) symbolique(s) vérifié(s) — 0 jonction.`);
    return 0;
}

function estUnLien(p) {
    try {
        return lstatSync(p).isSymbolicLink();
    } catch {
        return false;
    }
}

const valeur = (argv, drapeau) => {
    const i = argv.indexOf(drapeau);
    return i === -1 ? undefined : argv[i + 1];
};

async function reparer(argv, cwd) {
    const restreint = argv.find((a) => !a.startsWith('--'));

    let worktrees;
    try {
        worktrees = worktreesConnus(cwd);
    } catch (e) {
        console.error(`REFUS : impossible de lire les worktrees depuis ${cwd}`);
        console.error(`  ${((e.stderr || '') + (e.message || '')).toString().trim()}`);
        return 2;
    }
    if (restreint) {
        const vise = resolve(cwd, restreint).replace(/\//g, '\\').toLowerCase();
        worktrees = worktrees.filter((w) => w.replace(/\//g, '\\').toLowerCase() === vise);
        if (worktrees.length === 0) {
            console.error(`REFUS : git ne connaît aucun worktree à ${restreint}.`);
            return 2;
        }
    }

    const liens = worktrees.flatMap((w) => liensDe(w));
    const natures = await enParallele(liens, 8, (l) => nature(l.lien));
    const illisibles = liens.filter((_, i) => natures[i].nature === null);
    if (illisibles.length > 0) {
        console.error(`REFUS : ${illisibles.length} lien(s) n ont pas pu être classés — réparer à l aveugle`);
        console.error('  reviendrait à retirer des liens sans savoir lesquels. Corriger l ENVIRONNEMENT.');
        for (const l of illisibles) console.error(`  ${l.lien}`);
        return 2;
    }

    const jonctions = liens.filter((_, i) => natures[i].nature === 'jonction');
    if (jonctions.length === 0) {
        console.log(`Réparation : ${liens.length} lien(s) examiné(s) — 0 jonction, rien à faire.`);
        return 0;
    }

    const pouvoir = pouvoirPoserUnSymlink();
    if (!pouvoir.ok) {
        console.error('REFUS : impossible de poser un lien symbolique de répertoire sur cette machine.');
        console.error(`  ${pouvoir.pourquoi || '(aucun motif rendu)'}`);
        console.error('  AUCUNE jonction n a été touchée : retirer un lien sans pouvoir le remplacer');
        console.error('  laisserait le worktree sans `node_modules` du tout.');
        return 2;
    }

    console.log(`Réparation : ${jonctions.length} jonction(s) à convertir sur ${liens.length} lien(s).`);
    let echecs = 0;
    for (const j of jonctions) {
        const cible = j.cible;
        const avant = porte(cible);
        try {
            retirerLien(j.lien);
        } catch (e) {
            console.error(`  ÉCHEC  ${j.lien} — le lien n a pas pu être retiré`);
            console.error(`         ${((e.stderr || '') || e.message).toString().trim()}`);
            echecs++;
            continue;
        }
        const apresRetrait = porte(cible);
        if (avant !== null && apresRetrait !== avant) {
            // Ce cas ne devrait pas exister — `rmdir` sans `/S` ne traverse pas. S il
            // arrivait, il faut S ARRÊTER : c est le dégât du 2026-08-16 en train de se
            // reproduire, et poursuivre l aggraverait worktree après worktree.
            console.error(`  ARRÊT  ${cible} est passée de ${avant} à ${apresRetrait ?? 'DISPARUE'} entrées`);
            console.error('         pendant le retrait du lien. Aucune autre jonction ne sera touchée.');
            return 1;
        }
        try {
            mklink('/D', j.lien, cible);
        } catch (e) {
            console.error(`  ÉCHEC  ${j.lien} — le lien symbolique n a pas pu être posé`);
            console.error(`         ${((e.stderr || '') || e.message).toString().trim()}`);
            try {
                mklink('/J', j.lien, cible);
                console.error('         la jonction a été REMISE : le worktree reste utilisable.');
            } catch {
                console.error('         et la jonction n a PAS pu être remise — ce worktree n a plus de lien.');
            }
            echecs++;
            continue;
        }
        const n = await nature(j.lien);
        const apres = porte(cible);
        if (n.nature !== 'symlink') {
            console.error(`  ÉCHEC  ${j.lien} — posé, mais ce n est pas un lien symbolique (${n.nature ?? n.pourquoi})`);
            echecs++;
            continue;
        }
        if (avant !== null && apres !== avant) {
            console.error(`  ARRÊT  ${cible} est passée de ${avant} à ${apres ?? 'DISPARUE'} entrées.`);
            return 1;
        }
        console.log(`  ok     ${j.lien}`);
        console.log(`         jonction -> lien symbolique ; cible ${apres ?? '?'} entrées, inchangée`);
    }

    if (echecs > 0) {
        console.error(`${echecs} jonction(s) n ont pas pu être converties.`);
        return 1;
    }
    console.log(`${jonctions.length} jonction(s) converties — les cibles sont intactes.`);
    return 0;
}

async function principal(argv) {
    const cwd = process.cwd();
    if (process.platform !== 'win32') {
        console.log(`Rien à faire sur ${process.platform} : la jonction NTFS est propre à Windows,`);
        console.log('  et `git worktree add` y pose déjà ce qu il faut.');
        return 0;
    }
    if (argv.includes('--reparer')) return reparer(argv.filter((a) => a !== '--reparer'), cwd);
    const positionnels = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--branche' || argv[i] === '--depuis') i++;
        else positionnels.push(argv[i]);
    }
    if (positionnels.length === 0) {
        console.error('Usage : node outils/creer-worktree.js <nom> [--branche <b>] [--depuis <ref>]');
        console.error('        node outils/creer-worktree.js --reparer [<chemin-de-worktree>]');
        return 2;
    }
    return creer([positionnels[0], ...argv.slice(1)], cwd);
}

if (require.main === module) {
    principal(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (e) => {
            console.error('REFUS : la création de worktree a échoué de façon imprévue.');
            console.error(`  ${e && e.stack ? e.stack : e}`);
            process.exit(2);
        }
    );
}

module.exports = { creer, reparer, pouvoirPoserUnSymlink };
