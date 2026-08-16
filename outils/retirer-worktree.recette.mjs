#!/usr/bin/env node
// Recette du retrait sûr de worktree — elle le PROUVE EN LE CASSANT, dans les deux sens :
// le geste nu détruit une cible témoin, le geste outillé la laisse intacte.
//
// LE FAIT QUI L'A MOTIVÉE, mesuré le 2026-08-16. `git worktree remove` a vidé
// `apps/cms/node_modules` et `apps/web/node_modules` du dépôt principal — 0 paquet restant.
// Le worktree retiré portait deux jonctions NTFS (`mklink /J`) vers ces répertoires, et la
// suppression récursive de git TRAVERSE la jonction : elle efface la CIBLE, pas le lien.
//
// POURQUOI C'EST EXACTEMENT LA FORME D'ÉCHEC QUE CE DÉPÔT TRAQUE. Le geste destructeur ne
// dit RIEN : code de sortie 0, sortie vide — la même chose qu'un retrait réussi. Le dégât ne
// se manifeste qu'à la suite de tests SUIVANTE, sous la forme d'un `Cannot find module`
// qu'on impute d'abord à la branche qu'on allait fusionner. C'est ce qui s'est produit :
// 329 tests / 3 échecs au lieu de 370/370, et la branche a été suspectée avant l'outil.
//
// LE PIÈGE DE MÉTHODE, rencontré pour de vrai en écrivant cette recette. Une première
// version posait la jonction par `cmd //c mklink /J` depuis bash : MSYS a transformé `/J`
// en chemin, `mklink` a répondu « Option non valide », et le témoin est ressorti INTACT —
// preuve apparente que le danger n'existait pas, alors qu'AUCUNE jonction n'avait été
// posée. Chaque cas vérifie donc que la jonction EXISTE (`lstat().isSymbolicLink()`) avant
// de juger quoi que ce soit, et la pose passe par `execFileSync('cmd.exe', …)`, jamais par
// un shell POSIX. Sans cette vérification, la moitié « le danger est réel » de cette recette
// se contenterait de mesurer sa propre erreur.
//
// PORTÉE, ET CE QU'ELLE NE COUVRE PAS. Les jonctions sont propres à Windows/NTFS ; sur
// Linux, une suppression récursive ordinaire n'entre pas dans un lien symbolique, donc le
// défaut n'existe pas. Lancée ailleurs que sur Windows, cette recette ne se déclare PAS
// conforme : elle sort en code 2 (« non jouée »), distinct de 0 (conforme) et de 1 (échec).
// La CI du dépôt tourne sur ubuntu et ne peut donc pas la porter — la preuve est locale, et
// c'est une limite assumée, pas un oubli.
//
// Usage : node outils/retirer-worktree.recette.mjs [filtre]

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const OUTIL = join(ICI, 'retirer-worktree.js');

if (process.platform !== 'win32') {
    console.log('Recette du retrait sûr de worktree — NON JOUÉE');
    console.log(`  Les jonctions NTFS n'existent pas sur ${process.platform} : le défaut visé`);
    console.log('  ne peut pas s\'y reproduire, donc cette recette ne prouverait rien.');
    console.log('  Code 2 = non jouée. Elle ne se déclare pas conforme pour autant.');
    process.exit(2);
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

/** Un dépôt jetable, son témoin garni, et un worktree — le montage réel en miniature. */
function montage({ jonctions = ['lien'], garnir = 5 } = {}) {
    const base = mkdtempSync(join(tmpdir(), 'echo-retrait-'));
    const temoin = join(base, 'temoin');
    const depot = join(base, 'depot');
    const wt = join(base, 'wt');
    mkdirSync(temoin, { recursive: true });
    mkdirSync(depot, { recursive: true });
    for (let i = 1; i <= garnir; i++) writeFileSync(join(temoin, `paquet-${i}.txt`), `${i}\n`);

    git(['init', '-q', '.'], depot);
    git(['config', 'user.email', 'recette@local.test'], depot);
    git(['config', 'user.name', 'recette'], depot);
    // Les liens sont ignorés, fidèlement au réel : `node_modules` l'est, ce qui fait que le
    // worktree n'est pas « sale » et que `git worktree remove` accepte sans `--force`.
    writeFileSync(join(depot, '.gitignore'), jonctions.map((j) => `${j.split('/').pop()}/\n`).join(''));
    writeFileSync(join(depot, 'fichier.txt'), 'contenu\n');
    git(['add', '-A'], depot);
    git(['commit', '-qm', 'base'], depot);
    git(['worktree', 'add', '-q', wt, '-b', 'jetable'], depot);

    for (const relatif of jonctions) {
        const lien = join(wt, relatif);
        mkdirSync(dirname(lien), { recursive: true });
        execFileSync('cmd.exe', ['/c', 'mklink', '/J', lien.replace(/\//g, '\\'), temoin.replace(/\//g, '\\')], {
            encoding: 'utf8',
            stdio: 'pipe',
        });
        // LA VÉRIFICATION SANS LAQUELLE LE CAS MESURERAIT SA PROPRE ERREUR.
        if (!lstatSync(lien).isSymbolicLink()) {
            throw new Error(`la jonction ${relatif} n a PAS ete posee : le cas ne prouverait rien`);
        }
    }
    return { base, temoin, depot, wt };
}

/** Ce que porte le témoin : `null` s'il a disparu, sinon son nombre de fichiers. */
const temoinPorte = (t) => (existsSync(t) ? readdirSync(t).length : null);

function lancer(cmd, args, cwd) {
    try {
        const sortie = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, sortie };
    } catch (e) {
        return { code: e.status ?? 1, sortie: (e.stdout || '') + (e.stderr || '') };
    }
}

const CAS = [
    {
        nom: 'LE DANGER EST RÉEL : `git worktree remove` nu VIDE la cible de la jonction',
        // Sans ce cas, rien ne prouverait que l'outil sert à quelque chose. C'est la
        // contre-épreuve : elle doit CONSTATER la destruction, pas s'en protéger.
        jouer() {
            const m = montage();
            const avant = temoinPorte(m.temoin);
            const r = lancer('git', ['worktree', 'remove', m.wt], m.depot);
            const apres = temoinPorte(m.temoin);
            return {
                ok: avant === 5 && apres !== 5,
                dit: `avant ${avant}, après ${apres === null ? 'DISPARU' : apres} (le geste nu a rendu le code ${r.code} sans un mot)`,
            };
        },
    },
    {
        nom: 'LE NOMINAL : l outil retire le worktree et LAISSE la cible intacte',
        jouer() {
            const m = montage();
            const r = lancer(process.execPath, [OUTIL, m.wt], m.depot);
            const apres = temoinPorte(m.temoin);
            const parti = !existsSync(m.wt);
            return {
                ok: r.code === 0 && apres === 5 && parti,
                dit: `code ${r.code}, témoin ${apres === null ? 'DISPARU' : apres}/5, worktree ${parti ? 'retiré' : 'TOUJOURS LÀ'}`,
            };
        },
    },
    {
        nom: 'LA JONCTION PROFONDE est trouvée : `apps/cms/node_modules`, pas seulement la racine',
        // Le montage réel n'a jamais de jonction à la racine du worktree : elles sont sous
        // `apps/<app>/node_modules`. Une énumération non récursive n'en verrait aucune et
        // rendrait « rien à retirer » — un vert qui détruirait quand même.
        jouer() {
            const m = montage({ jonctions: ['apps/cms/node_modules'] });
            const r = lancer(process.execPath, [OUTIL, m.wt], m.depot);
            const apres = temoinPorte(m.temoin);
            return {
                ok: r.code === 0 && apres === 5 && /apps.cms.node_modules/.test(r.sortie),
                dit: `code ${r.code}, témoin ${apres === null ? 'DISPARU' : apres}/5, la jonction ${/apps.cms.node_modules/.test(r.sortie) ? 'est nommée' : 'N EST PAS NOMMÉE'} dans la sortie`,
            };
        },
    },
    {
        nom: 'DEUX JONCTIONS vers la même cible : aucune ne doit l emporter',
        jouer() {
            const m = montage({ jonctions: ['apps/cms/node_modules', 'apps/web/node_modules'] });
            const r = lancer(process.execPath, [OUTIL, m.wt], m.depot);
            const apres = temoinPorte(m.temoin);
            return {
                ok: r.code === 0 && apres === 5,
                dit: `code ${r.code}, témoin ${apres === null ? 'DISPARU' : apres}/5`,
            };
        },
    },
    {
        nom: 'LE CAS ORDINAIRE ne casse pas : un worktree SANS jonction se retire normalement',
        jouer() {
            const m = montage({ jonctions: [] });
            const r = lancer(process.execPath, [OUTIL, m.wt], m.depot);
            return {
                ok: r.code === 0 && !existsSync(m.wt),
                dit: `code ${r.code}, worktree ${existsSync(m.wt) ? 'TOUJOURS LÀ' : 'retiré'}`,
            };
        },
    },
    {
        nom: 'L INCAPACITÉ SE REFUSE : un chemin qui n est pas un worktree est REFUSÉ, pas supprimé',
        // Un outil qui « fait de son mieux » sur un chemin qu'il ne comprend pas est pire
        // que pas d'outil : il donnerait la confiance sans la garantie.
        jouer() {
            const m = montage();
            const inconnu = join(m.base, 'pas-un-worktree');
            mkdirSync(inconnu, { recursive: true });
            writeFileSync(join(inconnu, 'a.txt'), 'x\n');
            const r = lancer(process.execPath, [OUTIL, inconnu], m.depot);
            return {
                ok: r.code !== 0 && existsSync(inconnu),
                dit: `code ${r.code} (non nul attendu), le répertoire ${existsSync(inconnu) ? 'est intact' : 'A ÉTÉ SUPPRIMÉ'}`,
            };
        },
    },
];

const filtre = process.argv[2];
const joues = CAS.filter((c) => filtre === undefined || c.nom.includes(filtre));
console.log(`Recette du retrait sûr de worktree — ${joues.length} cas\n`);

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
