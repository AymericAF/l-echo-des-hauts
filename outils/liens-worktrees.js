#!/usr/bin/env node
/**
 * AUCUNE JONCTION DANS LES WORKTREES — LA GARDE QUI CONSTATE.
 *
 * LE FAIT. Le 2026-08-16, `git worktree remove` a vidé `apps/cms/node_modules` et
 * `apps/web/node_modules` du dépôt principal — 0 paquet restant. Le worktree retiré portait
 * deux jonctions NTFS (`mklink /J`) vers ces répertoires, et la suppression récursive de git
 * TRAVERSE une jonction : elle efface la CIBLE, pas le lien. Un lien symbolique (`mklink /D`)
 * n'a pas ce défaut. Les 31 jonctions du parc ont donc été converties le jour même.
 *
 * POURQUOI CETTE GARDE EXISTE MALGRÉ CETTE BASCULE. La bascule a fermé le défaut sur le parc
 * D'ALORS, pas sur les worktrees À VENIR : un worktree se crée à la main, et `mklink /J` est
 * le geste qui vient par réflexe — celui de toute la documentation Windows. La garantie
 * s'érode alors worktree après worktree, sans que rien ne le signale. Ce n'est pas une
 * hypothèse : au moment d'écrire cette garde, le parc portait DÉJÀ une jonction neuve
 * (`_wt/code-bascule-cms/apps/web/node_modules`), posée après la bascule. Une convention
 * — même écrite, même comprise — ne tient pas un geste qu'on refait tous les jours. Un
 * mécanisme, si.
 *
 * CE QU'ELLE FAIT, DANS CET ORDRE :
 *   1. demande à git la liste de SES worktrees (la seule autorité sur « ceci est un
 *      worktree ») — si git ne répond pas, elle REFUSE au lieu de certifier ;
 *   2. énumère les liens de chaque worktree jusqu'à la profondeur 3, SANS jamais descendre
 *      dans un lien ;
 *   3. lit la balise de réanalyse de chacun ;
 *   4. rend 1 en NOMMANT chaque jonction et le remède, 0 en disant combien de liens elle a
 *      examinés, 2 si elle n'a pas pu juger.
 *
 * `lstat`, JAMAIS `existsSync` — c'est le piège qui a fait sauter un lien EN SILENCE lors de
 * la bascule du 2026-08-16. `existsSync` SUIT le lien : il rend `false` dès que la cible a
 * disparu, donc une énumération bâtie dessus saute précisément les liens les plus douteux —
 * les cassés. `lstat` regarde le lien lui-même et le voit toujours. `stat` serait pire
 * encore : il rendrait « répertoire ordinaire » sur une jonction saine, et les rendrait
 * TOUTES invisibles.
 *
 * POURQUOI UN INSTRUMENT EXTERNE, ET PAS `fs` — mesuré, et c'est le coût assumé de cette
 * garde : une jonction et un lien symbolique de répertoire sont RIGOUREUSEMENT indiscernables
 * pour node. `lstatSync()` rend `isSymbolicLink() === true` et le mode `0o120000` pour les
 * deux ; `readlinkSync()` rend le même chemin absolu pour les deux. Seule la balise de
 * réanalyse les sépare : `0xa0000003` (IO_REPARSE_TAG_MOUNT_POINT, la jonction) contre
 * `0xa000000c` (IO_REPARSE_TAG_SYMLINK). `fsutil reparsepoint query` l'écrit ; l'étiquette
 * qui la précède est traduite, la valeur hexadécimale ne l'est pas — c'est elle qu'on lit,
 * et la garde survit donc à un Windows dans une autre langue.
 *
 * COÛT, mesuré sur le parc réel (41 worktrees, 2 363 entrées, 33 liens) : 40 ms d'énumération
 * et ~200 ms de classement à concurrence 8 (883 ms en série — d'où la concurrence). Ce
 * dépôt tient qu'un crochet qui coûte se fait contourner, après quoi on perd aussi ce qui
 * marchait : c'est la seule raison pour laquelle ce code est asynchrone.
 *
 * PORTÉE. Les jonctions sont propres à Windows/NTFS. Ailleurs, elles ne peuvent pas exister :
 * la garde le dit et rend 0. Ce n'est pas une exemption de complaisance — c'est un fait de
 * plateforme, et il est écrit dans la sortie plutôt que tu.
 *
 * Usage : node outils/liens-worktrees.js
 *   0 = aucune jonction   1 = au moins une jonction   2 = n a pas pu juger
 */
'use strict';

const { execFile, execFileSync } = require('node:child_process');
const { lstatSync, readdirSync, readlinkSync } = require('node:fs');
const { join } = require('node:path');
const { promisify } = require('node:util');

const pexec = promisify(execFile);

/** Balises de réanalyse. Les valeurs sont des constantes Windows, jamais traduites. */
const TAG_JONCTION = '0xa0000003';
const TAG_SYMLINK = '0xa000000c';

/** Répertoires dans lesquels il est inutile de descendre pour trouver un lien. */
const IGNORES = new Set(['.git']);

/**
 * PROFONDEUR 3, et c'est un choix, pas une limite subie. Les liens de ce parc vivent en
 * `apps/<application>/node_modules` (profondeur 3) et parfois `node_modules` à la racine du
 * worktree (profondeur 1). Descendre plus bas ferait parcourir les arbres de sources de 41
 * worktrees pour chercher un lien que rien ne pose jamais là ; la CI, elle, juge le contenu
 * poussé. Élargir cette borne est sûr — le coût est du temps, jamais un faux vert.
 */
const PROFONDEUR = 3;

/** Combien de classements en vol. 8 : mesuré 883 ms en série contre ~200 ms ici. */
const CONCURRENCE = 8;

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
        .map((l) => l.slice('worktree '.length).trim())
        .filter(Boolean);
}

/**
 * Les liens d'un arbre, jusqu'à `PROFONDEUR`.
 *
 * ON NE DESCEND JAMAIS DANS UN LIEN : le suivre ferait parcourir la cible entière (des
 * dizaines de milliers de fichiers pour un `node_modules`) et exposerait à des boucles.
 */
function liensDe(racine) {
    const trouves = [];
    const parcourir = (dossier, profondeur) => {
        if (profondeur > PROFONDEUR) return;
        let entrees;
        try {
            entrees = readdirSync(dossier, { withFileTypes: true });
        } catch {
            // Un worktree que git déclare mais dont le répertoire a disparu (prunable) :
            // il n'y a rien à juger dedans, et ce n'est pas à cette garde de le dire.
            return;
        }
        for (const e of entrees) {
            const complet = join(dossier, e.name);
            let st;
            try {
                // `lstatSync`, jamais `existsSync` : voir l'en-tête. Un lien cassé DOIT
                // rester visible — c'est le plus suspect de tous.
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
                trouves.push({ lien: complet, cible });
            } else if (st.isDirectory() && !IGNORES.has(e.name)) {
                parcourir(complet, profondeur + 1);
            }
        }
    };
    parcourir(racine, 1);
    return trouves;
}

/** La nature d'un lien, lue dans sa balise de réanalyse : 'jonction', 'symlink' ou null. */
async function nature(lien) {
    let stdout;
    try {
        ({ stdout } = await pexec('fsutil', ['reparsepoint', 'query', lien], { encoding: 'utf8' }));
    } catch (e) {
        // Un lien cassé reste interrogeable (la balise vit dans le lien, pas dans la cible).
        // Ce qui tombe ici est une vraie incapacité : instrument absent, droits, volume.
        return { nature: null, pourquoi: (e.code === 'ENOENT' ? 'fsutil introuvable' : (e.stderr || e.message || '').toString().trim()) };
    }
    if (new RegExp(TAG_JONCTION, 'i').test(stdout)) return { nature: 'jonction' };
    if (new RegExp(TAG_SYMLINK, 'i').test(stdout)) return { nature: 'symlink' };
    const balise = (stdout.match(/0x[0-9a-f]{8}/i) || ['(aucune balise lue)'])[0];
    return { nature: null, pourquoi: `balise inattendue ${balise}` };
}

async function enParallele(items, n, fn) {
    const sortie = new Array(items.length);
    let curseur = 0;
    await Promise.all(
        Array.from({ length: Math.min(n, items.length) }, async () => {
            for (;;) {
                const i = curseur++;
                if (i >= items.length) return;
                sortie[i] = await fn(items[i]);
            }
        })
    );
    return sortie;
}

async function principal() {
    const cwd = process.cwd();

    if (process.platform !== 'win32') {
        // Ce n'est pas une exemption : sur un système de fichiers POSIX, la jonction NTFS
        // n'existe pas, et une suppression récursive n'entre pas dans un lien symbolique.
        // Le défaut visé ne peut donc pas s'y produire. On le DIT plutôt que de rendre le
        // silence d'un travail fait.
        console.log(`Liens des worktrees : rien à juger sur ${process.platform} —`);
        console.log('  la jonction NTFS est propre à Windows, et le défaut qu elle porte avec elle.');
        return 0;
    }

    let worktrees;
    try {
        worktrees = worktreesConnus(cwd);
    } catch (e) {
        console.error(`REFUS : impossible de lire les worktrees depuis ${cwd}`);
        console.error(`  ${((e.stderr || '') + (e.message || '')).toString().trim()}`);
        console.error('  Une garde qui rend « conforme » sans avoir rien lu certifie un parc');
        console.error('  qu elle n a pas regardé. Corriger l ENVIRONNEMENT, puis relancer.');
        return 2;
    }

    const liens = worktrees.flatMap((w) => liensDe(w));
    if (liens.length === 0) {
        console.log(`Liens des worktrees : ${worktrees.length} worktree(s), 0 lien examiné — rien à juger.`);
        return 0;
    }

    const natures = await enParallele(liens, CONCURRENCE, (l) => nature(l.lien));
    const jonctions = [];
    const illisibles = [];
    liens.forEach((l, i) => {
        if (natures[i].nature === 'jonction') jonctions.push(l);
        else if (natures[i].nature === null) illisibles.push({ ...l, pourquoi: natures[i].pourquoi });
    });

    // L INCAPACITÉ AVANT LE VERDICT. Un lien qu'on n'a pas su classer n'est pas un lien sain :
    // le compter comme tel rendrait « 0 jonction » sur un parc qu'on n'a pas su lire.
    if (illisibles.length > 0) {
        console.error(`REFUS : ${illisibles.length} lien(s) n ont pas pu être classés — le verdict serait faux.`);
        for (const l of illisibles) console.error(`  ${l.lien}\n    ${l.pourquoi}`);
        console.error('  Corriger l ENVIRONNEMENT (fsutil fait partie de Windows), puis relancer.');
        return 2;
    }

    if (jonctions.length > 0) {
        console.error('');
        console.error(`REFUS : ${jonctions.length} JONCTION(S) dans les worktrees, sur ${liens.length} lien(s) examiné(s).`);
        for (const j of jonctions) {
            console.error(`  JONCTION  ${j.lien}`);
            console.error(`            -> ${j.cible ?? '(cible illisible)'}`);
        }
        console.error('');
        console.error('  Une suppression récursive TRAVERSE une jonction : `git worktree remove`');
        console.error('  y effacerait la CIBLE, pas le lien — c est le dégât du 2026-08-16, où');
        console.error('  `apps/*/node_modules` du dépôt principal sont tombés à 0 paquet.');
        console.error('');
        console.error('  Remède, sans risque pour la cible (elle est comptée avant et après) :');
        console.error('      node outils/creer-worktree.js --reparer');
        console.error('');
        return 1;
    }

    console.log(
        `Liens des worktrees : ${liens.length} lien(s) examiné(s) sur ${worktrees.length} worktree(s) — 0 jonction.`
    );
    return 0;
}

// CE QUE `creer-worktree.js` REPREND ICI, ET POURQUOI IL NE LE RECOPIE PAS. Le classement
// d'un lien est le SEUL endroit du dépôt qui sait distinguer une jonction d'un lien
// symbolique. Deux copies de cette connaissance divergeraient — l'outil de confort poserait
// alors des liens que la garde refuse, ou l'inverse, et le désaccord ne se verrait qu'au
// prochain `git worktree remove`.
module.exports = { liensDe, nature, enParallele, worktreesConnus, TAG_JONCTION, TAG_SYMLINK };

if (require.main === module) {
    principal().then(
        (code) => process.exit(code),
        (e) => {
            console.error('REFUS : la garde des liens de worktree a échoué de façon imprévue.');
            console.error(`  ${e && e.stack ? e.stack : e}`);
            process.exit(2);
        }
    );
}
