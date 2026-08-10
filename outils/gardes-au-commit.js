// Declencheur CIBLE des gardes de ce depot — les tests.
//
// Lance par `.githooks/commit-msg`, qui l'appelle seulement si le commit touche
// `apps/<app>/…`, le crochet lui-meme, ou ce fichier (pre-filtre structurel, sans
// aucun nom de module).
//
// CE QU'IL FAIT, ET POURQUOI DANS CET ORDRE
//   1. Il lit les chemins REELLEMENT indexes (`git diff --cached`).
//   2. Il materialise le contenu de l'INDEX dans un dossier temporaire et
//      travaille AVEC CE DOSSIER POUR RACINE. C'est ce qui s'apprete a etre
//      commite qui est juge, jamais la copie de travail : sinon un `git add`
//      partiel — corriger le test ET la source, n'indexer que l'un des deux —
//      laisserait passer une regression, et le crochet certifierait un etat que
//      personne ne commit. Sur du CODE ce cas n'a rien de theorique : c'est le
//      geste ordinaire d'un `git add` chemin par chemin.
//   3. Il n'active que les tests dont une ENTREE est dans ce commit. Un test
//      dont rien n'a bouge ne tourne pas : sans ce ciblage, chaque commit
//      paierait les 566 tests des deux applications (~3,0 s mesurees), et le
//      crochet se ferait contourner — apres quoi on perdrait aussi ce qui
//      marchait.
//   4. Il rend 1 des qu'un test rougit, en NOMMANT le fichier de test et
//      l'entree qui l'a declenche.
//
// D'OU VIENT LA TABLE « quel fichier declenche quel test »
//   Elle n'est PAS ecrite a la main, et c'est deliberé : une table de 33 tests
//   face a ~150 modules divergerait en une semaine, et une entree oubliee est
//   un trou SILENCIEUX — le crochet dirait « 0 test lance » sur un commit qui
//   casse. Elle se DERIVE du graphe d'imports relatifs, lu dans l'index. Un
//   test suit donc automatiquement ce qu'il importe, meme indirectement.
//   Ne restent ecrits a la main que les fichiers qu'un test LIT PAR CHEMIN sans
//   les importer (`fs.readFileSync`) : le graphe d'imports ne peut pas les
//   voir. C'est la table LECTURES ci-dessous, et elle seule.
//
// EN CAS DE DOUTE, ON ELARGIT — jamais l'inverse. Un import relatif qu'on ne
// sait pas resoudre rend le test « toujours lance » au lieu de le retirer du
// lot : un declencheur qui se tait quand il ne comprend pas ne garde rien.
//
// CE QU'IL NE COUVRE PAS, ET QUI LE COUVRE. Le ciblage a par construction des
// trous (un fichier qu'aucun test n'atteint, un `--no-verify`, un clone frais
// sans `core.hooksPath`). C'est le role du second etage,
// `.github/workflows/gardes-du-code.yml`, qui lance TOUT a chaque push. Le
// crochet achete l'immediatete, l'integration achete la garantie.
//
// CODES DE SORTIE : 0 = aucun test concerne, ou tous verts ; 1 = un test rouge,
// ou un etat que ce script ne sait pas juger. Il n'existe aucun chemin qui
// rende 0 sans avoir compare.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

// ── Les applications gardees ─────────────────────────────────────────────────
// Chacune porte ses tests dans `tests/*.test.ts` et son `npm test`. Ajouter une
// application = ajouter une ligne ici, rien d'autre.
const APPS = ['apps/web', 'apps/cms'];

// ── Fichiers LUS PAR CHEMIN, que le graphe d'imports ne peut pas voir ────────
// Cle : le test. Valeur : des prefixes de chemin (un `/` final = tout le
// sous-arbre). Tout ce qui est atteint par `import` est deja couvert et n'a
// rien a faire ici.
const LECTURES = {
    'apps/web/tests/astro-config.test.ts': [
        // Il IMPORTE `astro.config.mjs` — donc tout ce que le tableau
        // `integrations:` atteint est deja couvert par le graphe. Ce qu'il lit
        // en PLUS, et que le graphe ne peut pas voir : le DOSSIER
        // `integrations/` en entier, parcouru pour verifier qu'aucun module
        // livre n'a ete debranche. Sans cette ligne, ajouter un module SANS le
        // brancher ne declencherait rien — exactement le cas que ce test existe
        // pour attraper.
        'apps/web/integrations/',
    ],
    'apps/web/tests/requete.test.ts': [
        // Il PARCOURT src/ en entier a la recherche d'un populate etoile :
        // n'importe quel fichier de src/ peut le faire rougir.
        'apps/web/src/',
    ],
    'apps/web/tests/repartiteur-blocs.test.ts': [
        'apps/web/src/lib/domaine.ts',
        'apps/web/src/lib/strapi/mapping.ts',
        'apps/web/src/components/blocs/',
    ],
    'apps/web/tests/glyphes-sociaux.test.ts': ['apps/web/src/components/LiensSociaux.astro'],
    'apps/web/tests/nixpacks-fontes.test.ts': [
        'apps/web/nixpacks.toml',
        'apps/web/src/lib/seo/gabarit-og.ts',
    ],
    'apps/web/tests/mapping.test.ts': ['apps/web/tests/fixtures/'],
    // Il lit les DOUZE fixtures par chemin (six par locale) et n'en importe
    // aucune. Sans cette ligne, retirer `configuration-en.json` ou vider ses
    // `reseaux` ne declencherait AUCUN test au commit — c'est-a-dire le trou
    // meme que ce fichier de test existe pour fermer.
    'apps/web/tests/fixtures-locales.test.ts': ['apps/web/tests/fixtures/'],
    'apps/cms/tests/modele-donnees.test.ts': ['apps/cms/src/api/', 'apps/cms/src/components/'],
    'apps/cms/tests/seed-code-sortie.test.ts': ['apps/cms/scripts/seed/', 'apps/cms/data/'],
    'apps/cms/tests/seed-corpus.test.ts': ['apps/cms/data/'],
    'apps/cms/tests/seed-idempotence.test.ts': ['apps/cms/data/'],
};

// Toucher le declenchement lui-meme relance TOUT : c'est la regle qui a bouge,
// et une regle de declenchement qui ne s'exerce pas est une convention de plus.
const DECLENCHEURS_GLOBAUX = ['.githooks/commit-msg', 'outils/gardes-au-commit.js'];

// Le `test` de package.json ENUMERE les fichiers a lancer : le retoucher peut
// retirer un test du lot sans supprimer une ligne de code. On relance donc
// toute l'application concernee.
const declencheurAppEntiere = (app) => app + '/package.json';

// ── Utilitaires ──────────────────────────────────────────────────────────────
function abandonner(message) {
    console.error('');
    console.error('COMMIT REFUSE — gardes du code : ' + message);
    console.error('');
    process.exit(1);
}

function git(args, options) {
    return execFileSync('git', args, Object.assign({ maxBuffer: 256 * 1024 * 1024 }, options));
}

// ── 1. Ce que ce commit porte ────────────────────────────────────────────────
let indexes;
try {
    indexes = git(['diff', '--cached', '--name-only', '--diff-filter=ACMRD'], { encoding: 'utf8' })
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter(Boolean);
} catch (e) {
    abandonner('git n a pas rendu la liste des fichiers indexes (' + e.message + ').');
}
const dansLeCommit = new Set(indexes);
const global = DECLENCHEURS_GLOBAUX.some((p) => dansLeCommit.has(p));

// ── 2. Quelles applications sont concernees ──────────────────────────────────
const appsConcernees = APPS.filter(
    (app) => global || indexes.some((p) => p === app || p.startsWith(app + '/'))
);

if (appsConcernees.length === 0) {
    console.error('gardes du code : aucune application gardee dans ce commit — 0 test lance');
    process.exit(0);
}

// ── 3. Materialiser l INDEX, pas la copie de travail ─────────────────────────
const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'gardes-au-commit-'));
const jonctions = [];
let code = 0;

try {
    let listeSuivie;
    try {
        listeSuivie = git(['ls-files', '-z', '--'].concat(appsConcernees), { encoding: 'buffer' });
    } catch (e) {
        abandonner('git n a pas rendu la liste des fichiers suivis (' + e.message + ').');
    }
    try {
        git(['checkout-index', '-z', '--stdin', '-f', '--prefix=' + racine.replace(/\\/g, '/') + '/'], {
            input: listeSuivie,
        });
    } catch (e) {
        abandonner(
            'l index n a pas pu etre materialise — rien ne peut etre verifie (' + e.message + ').'
        );
    }

    // `node_modules` n'est pas versionne : il n'existe donc pas dans l index.
    // On le presente a l arbre temporaire par un lien (jonction sous Windows,
    // qui ne demande aucun privilege). On ne COPIE pas : ce serait plusieurs
    // centaines de mega-octets a chaque commit. Le lien est retire en sortie —
    // et le retirer n efface JAMAIS sa cible, c est le point important.
    for (const app of appsConcernees) {
        const reel = path.resolve(app, 'node_modules');
        if (!fs.existsSync(reel)) continue;
        const lien = path.join(racine, app, 'node_modules');
        try {
            fs.symlinkSync(reel, lien, 'junction');
            jonctions.push(lien);
        } catch (e) {
            abandonner(
                'le lien vers ' +
                    app +
                    '/node_modules n a pas pu etre pose (' +
                    e.message +
                    ') — les tests ne pourraient pas resoudre leurs dependances, et leur ' +
                    'echec ne prouverait rien.'
            );
        }
    }

    // ── 4. Deriver le graphe d imports, dans le contenu INDEXE ───────────────
    const RESOLUTIONS = ['', '.ts', '.mjs', '.js', '.astro', '/index.ts', '/index.js'];

    // Les fichiers de test portent des SOURCES FABRIQUEES dans des gabarits
    // (`const REPARTITEUR_FABRIQUE = ` … `import X from './Y.astro'` … `),
    // qu'un scan naif prend pour de vrais imports. Ils ne se resolvent jamais,
    // et le test serait alors elargi a CHAQUE commit — un declencheur qui
    // s'allume toujours ne cible plus rien. On retire donc gabarits et
    // commentaires avant de lire les imports. Un faux negatif introduit ici est
    // rattrape par l'integration, qui lance tout.
    const sansGabarits = (s) =>
        s
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
            .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``');

    /** Chemins repo-relatifs importes directement par `fichier` (repo-relatif). */
    function importsDirects(fichier) {
        let source;
        try {
            source = sansGabarits(fs.readFileSync(path.join(racine, fichier), 'utf8'));
        } catch {
            return { cibles: [], irresolus: [fichier] };
        }
        const cibles = [];
        const irresolus = [];
        const motif = /(?:from|import|require)\s*\(?\s*['"](\.[^'"]*)['"]/g;
        let m;
        while ((m = motif.exec(source)) !== null) {
            const brut = m[1];
            const base = path.posix.join(path.posix.dirname(fichier), brut);
            const trouve = RESOLUTIONS.map((s) => base + s).find((c) => {
                try {
                    return fs.statSync(path.join(racine, c)).isFile();
                } catch {
                    return false;
                }
            });
            if (trouve === undefined) irresolus.push(brut);
            else cibles.push(trouve);
        }
        return { cibles, irresolus };
    }

    /** Fermeture transitive des imports d un test, plus ses lectures declarees. */
    function entreesDe(test) {
        const vus = new Set([test]);
        const pile = [test];
        let elargir = false;
        while (pile.length) {
            const courant = pile.pop();
            const { cibles, irresolus } = importsDirects(courant);
            // Un import relatif qu on ne sait pas resoudre : on ELARGIT.
            if (irresolus.length) elargir = true;
            for (const c of cibles) {
                if (!vus.has(c)) {
                    vus.add(c);
                    pile.push(c);
                }
            }
        }
        return { entrees: [...vus], prefixes: LECTURES[test] || [], elargir };
    }

    // ── 5. Quels tests lancer ────────────────────────────────────────────────
    const lots = [];
    for (const app of appsConcernees) {
        const dossier = path.join(racine, app, 'tests');
        if (!fs.existsSync(dossier)) continue;
        const tests = fs
            .readdirSync(dossier)
            .filter((f) => f.endsWith('.test.ts'))
            .sort()
            .map((f) => app + '/tests/' + f);

        const appEntiere = global || dansLeCommit.has(declencheurAppEntiere(app));
        const choisis = [];
        for (const t of tests) {
            if (appEntiere) {
                choisis.push({
                    test: t,
                    par: global
                        ? DECLENCHEURS_GLOBAUX.filter((p) => dansLeCommit.has(p))
                        : [declencheurAppEntiere(app)],
                });
                continue;
            }
            const { entrees, prefixes, elargir } = entreesDe(t);
            const par = entrees.filter((p) => dansLeCommit.has(p));
            for (const pre of prefixes) {
                for (const p of indexes) {
                    if (p === pre || (pre.endsWith('/') && p.startsWith(pre))) par.push(p);
                }
            }
            if (elargir && par.length === 0) par.push('(import irresolu — elargissement)');
            if (par.length) choisis.push({ test: t, par: [...new Set(par)] });
        }
        if (choisis.length) lots.push({ app, choisis, total: tests.length });
    }

    if (lots.length === 0) {
        console.error(
            'gardes du code : aucun test ne couvre ' +
                indexes.filter((p) => APPS.some((a) => p.startsWith(a + '/'))).join(', ') +
                ' — 0 test lance'
        );
        process.exit(0);
    }

    // ── 6. Lancer, et nommer ce qui rougit ───────────────────────────────────
    for (const lot of lots) {
        const fichiers = lot.choisis.map((c) => path.posix.relative(lot.app, c.test));
        const debut = Date.now();
        const r = spawnSync(process.execPath, ['--test'].concat(fichiers), {
            cwd: path.join(racine, lot.app),
            encoding: 'utf8',
        });
        const ms = Date.now() - debut;

        if (r.error) {
            code = 1;
            console.error('');
            console.error('COMMIT REFUSE — les tests de ' + lot.app + ' n ont PAS PU se lancer :');
            console.error('  ' + r.error.message);
            continue;
        }
        if (r.status === 0) {
            // Une ligne par application, pas une par test : un crochet bavard se
            // lit comme du bruit, et ce qu'on veut savoir tient en trois nombres.
            const causes = [...new Set(lot.choisis.flatMap((c) => c.par))];
            console.error(
                'gardes VERTES — ' +
                    lot.app +
                    ' : ' +
                    fichiers.length +
                    '/' +
                    lot.total +
                    ' fichiers de test — ' +
                    ms +
                    ' ms  (declenches par ' +
                    (causes.length > 4 ? causes.length + ' fichiers indexes' : causes.join(', ')) +
                    ')'
            );
            if (fichiers.length <= 8) {
                for (const c of lot.choisis) {
                    console.error('    ' + path.posix.relative(lot.app, c.test));
                }
            }
            continue;
        }

        code = 1;
        const sortie = (r.stdout || '') + (r.stderr || '');
        // Les fichiers que node nomme comme ayant echoue. On les remonte en
        // tete : « un test a casse » sans dire lequel oblige a relire toute la
        // sortie, et c est ce qui pousse au --no-verify.
        // node ne nomme le FICHIER en echec que dans les lignes
        // « test at tests\x.test.ts:110:3 » de sa section « failing tests ».
        // C'est cette ligne qu'on lit : « un test a casse » sans dire lequel
        // oblige a relire toute la sortie, et c'est ce qui pousse au
        // --no-verify.
        const rouges = [
            ...new Set(
                [...sortie.matchAll(/^test at ([^\n:]+\.test\.ts):/gm)].map((m) =>
                    m[1].replace(/\\/g, '/')
                )
            ),
        ];
        console.error('');
        console.error('COMMIT REFUSE — garde ROUGE dans ' + lot.app + ' (code ' + r.status + ')');
        console.error(
            '  test(s) en echec  : ' + (rouges.length ? rouges.join(', ') : '(voir la sortie)')
        );
        for (const c of lot.choisis) {
            const nom = path.posix.relative(lot.app, c.test);
            if (rouges.includes(nom)) {
                console.error('    ' + nom + '  declenche par : ' + c.par.join(', '));
            }
        }
        console.error('  juge sur          : le contenu INDEXE, pas la copie de travail');
        console.error('  --- sortie des tests --------------------------------------------');
        for (const l of sortie.replace(/\s+$/, '').split('\n')) console.error('  ' + l);
        console.error('  -----------------------------------------------------------------');
        console.error(
            '  Rejouable a l identique : cd ' +
                lot.app +
                ' && node --test ' +
                fichiers.join(' ')
        );
    }
} finally {
    // Retirer les liens AVANT l arbre : `fs.rmSync` sur une jonction pourrait
    // suivre la cible, et effacer le node_modules reel du depot partage.
    for (const l of jonctions) {
        try {
            fs.unlinkSync(l);
        } catch {
            try {
                fs.rmdirSync(l);
            } catch {
                /* un lien qui survit ne fausse aucun verdict */
            }
        }
    }
    try {
        fs.rmSync(racine, { recursive: true, force: true });
    } catch {
        /* un temporaire qui survit ne fausse aucun verdict */
    }
}

if (code !== 0) {
    console.error('');
    console.error(
        'Corrige la regression, ou relance `git commit` une fois le test remis au vert. ' +
            'Ne contourne pas avec --no-verify : ce commit touche precisement ce que ce ' +
            'test protege.'
    );
    console.error('');
}
process.exit(code);
