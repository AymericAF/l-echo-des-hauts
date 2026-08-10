/**
 * Tests de la garde « en-tetes de securite servis » — la production sert-elle ENCORE la
 * politique qu on croit y avoir posee ?
 *
 * LE DEFAUT QUE CETTE GARDE FERME, et il est arrive. Le 2026-08-10, entre 04:09 et 08:28,
 * la valeur `custom_labels` de l application Coolify `echo-site` a ete remplacee par le
 * jeu que l outil engendre par defaut. Les quatre lignes qui definissaient le middleware
 * `echo-headers` et la ligne qui l APPLIQUAIT au routeur ont disparu ensemble. Depuis le
 * deploiement de 08:47, `https://echo.ayfiweb.fr/` repondait `200` sans aucun
 * `Content-Security-Policy`, sans `X-Content-Type-Options`, sans `Referrer-Policy` et sans
 * `Permissions-Policy`.
 *
 * CE QUI REND CE DEFAUT DIFFERENT DES AUTRES : IL N A FAIT AUCUN BRUIT. Le build a reussi,
 * les six verificateurs de ce depot sont restes verts — ils jugent la SORTIE CONSTRUITE,
 * et la sortie etait irreprochable. Le site a repondu 200 sur chaque URL. Les images se
 * sont affichees, les styles aussi : la disparition de la politique les AUTORISE toutes
 * les deux. Rien, nulle part, n a signale que la posture de securite du site venait de
 * tomber — et sans mesure fortuite, personne n aurait su ni quoi, ni depuis quand.
 *
 * POURQUOI ELLE JUGE LA REPONSE SERVIE, ET RIEN D AUTRE. L en-tete ne vit dans aucun
 * fichier de ce depot : il vit dans les labels Traefik de l application Coolify, en base
 * de l instance (`docs/runbook-provisionnement.md`, etape 27). Une garde qui relirait le
 * depot ne verrait donc jamais ce defaut — c est exactement ce qui s est passe. Seule la
 * reponse HTTP fait foi : `[[garantie-par-mecanisme-pas-convention]]`.
 *
 * POURQUOI ELLE PORTE UNE COPIE DE LA POLITIQUE, alors que ce projet interdit partout la
 * seconde source de verite. Parce qu il n en existait AUCUNE : la politique n etait ecrite
 * nulle part sous une forme comparable en machine, et c est precisement ce qui a rendu sa
 * disparition indetectable. Une attente declaree est le contraire d une duplication : sans
 * elle, il n y a rien a confronter. Le prix est nomme et assume — quand la politique change
 * volontairement (l ouverture de `/recherche` a Pagefind, par exemple), c est CE FICHIER
 * qu il faut changer, en le sachant, et le test rouge est la pour l imposer.
 *
 * LES DEUX SENS SONT EXERCES ICI : en-tete absent ou devie -> rouge en NOMMANT ce qui
 * manque ; en-tete conforme -> vert en ANNONCANT ce qui a ete verifie. Et une troisieme
 * issue existe, distincte des deux : quand la mesure n a PAS PU avoir lieu (reseau, statut
 * inattendu), la garde rend `2` et ne se fait jamais passer pour un vert.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POLITIQUE_ATTENDUE,
  directivesDe,
  inspecterEnTetes,
  jugerReponse,
  resumeEnTetes,
} from '../scripts/verifier-en-tetes.mjs';
import { ISSUES } from '../scripts/issues.mjs';

/** La reponse d une production conforme : tous les en-tetes attendus, a la lettre. */
function reponseConforme(url = 'https://echo.ayfiweb.fr/', ajouts: Record<string, string> = {}) {
  const enTetes: Record<string, string> = {};
  for (const [nom, regle] of Object.entries(POLITIQUE_ATTENDUE)) enTetes[nom] = regle.valeur;
  return { url, statut: 200, enTetes: { ...enTetes, ...ajouts } };
}

// --- Famille 1 : le sens VERT — la politique est servie ---------------------------------

test('une reponse qui sert les quatre en-tetes a la lettre ne produit aucun manquement', () => {
  const rapport = inspecterEnTetes([reponseConforme()]);
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.issue, ISSUES.CONFORME);
  assert.equal(rapport.reponses, 1);
});

test('le vert ANNONCE ce qui a ete verifie : les URL, les en-tetes, et le compte de directives', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    reponseConforme('https://echo.ayfiweb.fr/robots.txt'),
  ]);
  const resume = resumeEnTetes(rapport);
  // Les URL mesurees sont nommees : un vert muet ne dit pas SUR QUOI il porte.
  assert.match(resume, /https:\/\/echo\.ayfiweb\.fr\//);
  assert.match(resume, /robots\.txt/);
  // Les quatre en-tetes sont nommes, pas resumes en « en-tetes de securite ».
  for (const nom of Object.keys(POLITIQUE_ATTENDUE)) {
    assert.match(resume.toLowerCase(), new RegExp(nom.toLowerCase()));
  }
  // Le compte de directives CSP reellement confrontees, pour qu un vert sur une CSP
  // amputee de moitie ne ressemble pas a un vert sur la CSP entiere.
  const attendues = directivesDe(POLITIQUE_ATTENDUE['content-security-policy'].valeur, ';').size;
  assert.match(resume, new RegExp(`${attendues}\\s*directive`));
});

test('la casse du NOM d en-tete est sans effet : HTTP ne la distingue pas', () => {
  const reponse = { url: 'https://echo.ayfiweb.fr/', statut: 200, enTetes: {} as Record<string, string> };
  for (const [nom, regle] of Object.entries(POLITIQUE_ATTENDUE)) {
    reponse.enTetes[nom.toUpperCase()] = regle.valeur;
  }
  assert.deepEqual(inspecterEnTetes([reponse]).manquements, []);
});

test("l ORDRE des directives CSP et les espaces surnumeraires ne rougissent pas : la politique est la meme", () => {
  const attendue = POLITIQUE_ATTENDUE['content-security-policy'].valeur;
  const melangee = attendue
    .split(';')
    .map((d) => d.trim())
    .reverse()
    .join(' ;   ');
  const rapport = inspecterEnTetes([reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': melangee })]);
  assert.deepEqual(rapport.manquements, []);
});

test('un en-tete SUPPLEMENTAIRE hors politique ne rougit pas : la garde tient une attente, pas une liste fermee', () => {
  const rapport = inspecterEnTetes([reponseConforme('https://echo.ayfiweb.fr/', { 'x-frame-options': 'DENY' })]);
  assert.deepEqual(rapport.manquements, []);
});

// --- Famille 2 : le sens ROUGE — la politique a disparu ou devie -------------------------

test("l en-tete ABSENT rougit en le NOMMANT — c est le defaut du 2026-08-10, reproduit", () => {
  // La production servait exactement ceci : 200, et rien d autre que les en-tetes de nginx.
  const reponse = {
    url: 'https://echo.ayfiweb.fr/',
    statut: 200,
    enTetes: { server: 'nginx/1.31.3', 'content-type': 'text/html' },
  };
  const rapport = inspecterEnTetes([reponse]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 4);
  const texte = rapport.manquements.join('\n');
  for (const nom of Object.keys(POLITIQUE_ATTENDUE)) {
    assert.match(texte.toLowerCase(), new RegExp(`${nom.toLowerCase()}[^\\n]*absent`));
  }
  // L URL est nommee dans chaque manquement : quatre lignes sans adresse n envoient nulle part.
  for (const manquement of rapport.manquements) assert.match(manquement, /https:\/\/echo\.ayfiweb\.fr\//);
});

test('une directive CSP RETIREE est nommee, et la garde dit laquelle', () => {
  const ampute = POLITIQUE_ATTENDUE['content-security-policy'].valeur
    .split(';')
    .map((d) => d.trim())
    .filter((d) => !d.startsWith('script-src'))
    .join('; ');
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': ampute }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /script-src/);
  assert.match(rapport.manquements[0], /manquante|absente/i);
});

test("une directive RELACHEE est nommee AVEC les deux valeurs : c est le cas qu on ne doit jamais laisser passer", () => {
  const relachee = POLITIQUE_ATTENDUE['content-security-policy'].valeur.replace(
    "script-src 'none'",
    "script-src 'self' 'unsafe-inline'",
  );
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': relachee }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  const texte = rapport.manquements.join('\n');
  assert.match(texte, /script-src/);
  assert.match(texte, /'none'/);
  assert.match(texte, /unsafe-inline/);
});

test('une directive CSP AJOUTEE est signalee : une politique elargie en silence est le defaut, pas la correction', () => {
  const elargie = `${POLITIQUE_ATTENDUE['content-security-policy'].valeur}; frame-src https://www.youtube-nocookie.com`;
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'content-security-policy': elargie }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /frame-src/);
});

test('un en-tete simple dont la VALEUR devie rougit avec les deux valeurs', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'x-content-type-options': 'sniff' }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements[0], /nosniff/);
  assert.match(rapport.manquements[0], /sniff/);
});

test('Permissions-Policy se compare DIRECTIVE PAR DIRECTIVE, sur la virgule et non sur le point-virgule', () => {
  const attendue = POLITIQUE_ATTENDUE['permissions-policy'].valeur;
  // Meme politique, autre ordre, autres espaces : conforme.
  const melangee = attendue
    .split(',')
    .map((d) => d.trim())
    .reverse()
    .join(',  ');
  assert.deepEqual(
    inspecterEnTetes([reponseConforme('https://echo.ayfiweb.fr/', { 'permissions-policy': melangee })]).manquements,
    [],
  );
  // Une permission REOUVERTE est nommee.
  const rouverte = attendue.replace('camera=()', 'camera=(self)');
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/', { 'permissions-policy': rouverte }),
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /camera/);
});

test('UNE SEULE URL fautive parmi plusieurs suffit a rougir, et elle est nommee', () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    { url: 'https://echo.ayfiweb.fr/medias/logo.svg', statut: 200, enTetes: { server: 'nginx/1.31.3' } },
  ]);
  assert.equal(rapport.issue, ISSUES.ANOMALIE);
  assert.match(rapport.manquements.join('\n'), /medias\/logo\.svg/);
  assert.equal(
    rapport.manquements.every((m: string) => m.includes('/medias/logo.svg')),
    true,
    'la reponse conforme ne doit produire aucun manquement',
  );
});

// --- Famille 3 : l INCAPACITE — ce qui n a pas pu etre mesure ----------------------------

test('zero reponse rend VERIFICATION_IMPOSSIBLE, jamais le vert : une garde branchee sur le vide ne prouve rien', () => {
  const rapport = inspecterEnTetes([]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /aucune reponse/i);
});

test('une erreur RESEAU est une incapacite, pas une absence d en-tete', () => {
  // Le piege exact : « je n ai pas pu joindre le site » et « le site ne sert plus la CSP »
  // enverraient corriger deux objets differents. Les confondre coute une demi-journee.
  const rapport = inspecterEnTetes([
    { url: 'https://echo.ayfiweb.fr/', erreur: 'getaddrinfo ENOTFOUND echo.ayfiweb.fr' },
  ]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements[0], /ENOTFOUND/);
  assert.match(rapport.manquements[0], /https:\/\/echo\.ayfiweb\.fr\//);
});

test('un STATUT inattendu est une incapacite : on ne conclut pas sur la politique d une page qu on n a pas eue', () => {
  const rapport = inspecterEnTetes([{ url: 'https://echo.ayfiweb.fr/', statut: 503, enTetes: {} }]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
  assert.match(rapport.manquements[0], /503/);
});

test("l incapacite d UNE SEULE URL suffit : un vert partiel se ferait passer pour un vert entier", () => {
  const rapport = inspecterEnTetes([
    reponseConforme('https://echo.ayfiweb.fr/'),
    { url: 'https://echo.ayfiweb.fr/robots.txt', erreur: 'socket hang up' },
  ]);
  assert.equal(rapport.issue, ISSUES.VERIFICATION_IMPOSSIBLE);
});

// --- Famille 4 : les briques de comparaison ---------------------------------------------

test('directivesDe decoupe, normalise les espaces, et ignore les separateurs vides', () => {
  const d = directivesDe("default-src 'self';  script-src   'none' ;; ", ';');
  assert.deepEqual([...d.keys()], ['default-src', 'script-src']);
  assert.equal(d.get('default-src'), "'self'");
  assert.equal(d.get('script-src'), "'none'");
});

test('directivesDe garde le NOM en minuscules et la VALEUR telle quelle : `self` et `SELF` ne sont pas le meme jeton', () => {
  const d = directivesDe("Default-Src 'SELF'", ';');
  assert.equal(d.get('default-src'), "'SELF'");
});

test('jugerReponse rend AUSSI la liste de ce qui a ete verifie, pas seulement ce qui manque', () => {
  const { manquements, verifies } = jugerReponse(reponseConforme());
  assert.deepEqual(manquements, []);
  assert.equal(verifies.length, Object.keys(POLITIQUE_ATTENDUE).length);
  assert.match(verifies.join('\n').toLowerCase(), /content-security-policy/);
});

test('la politique attendue porte les quatre en-tetes du §5.5, et AUCUN autre', () => {
  // Un ajout silencieux ici change ce que la production doit servir : il doit se voir.
  assert.deepEqual(Object.keys(POLITIQUE_ATTENDUE).sort(), [
    'content-security-policy',
    'permissions-policy',
    'referrer-policy',
    'x-content-type-options',
  ]);
});

test("la CSP attendue reste FERMEE sur les trois directives qui portent des verdicts de la campagne", () => {
  // `script-src 'none'` fonde le « 0 octet de JS » ; `connect-src 'none'` explique le
  // verdict SEO ; `img-src 'self' data:` est l arbitrage T-01, qui n a pas bouge. Les
  // relacher est une DECISION, jamais un effet de bord d une retouche de ce fichier.
  const d = directivesDe(POLITIQUE_ATTENDUE['content-security-policy'].valeur, ';');
  assert.equal(d.get('script-src'), "'none'");
  assert.equal(d.get('connect-src'), "'none'");
  assert.equal(d.get('img-src'), "'self' data:");
  assert.equal(d.get('frame-ancestors'), "'none'");
});
