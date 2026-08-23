/**
 * Tests de la garde « styles en ligne » — aucune regle de style n arrive DANS le HTML.
 *
 * MEME FAMILLE QUE LA GARDE T-01, AUTRE DIRECTIVE. Le 2026-08-08, le site en ligne
 * n affichait aucune image : `img-src 'self' data:` refusait des `<img>` qui pointaient le
 * CMS. Le correctif du 2026-08-09 a ramene les images — et la meme campagne de rendu a
 * montre que `normal` (CSP servie) et `rendues` (CSP contournee) DIFFERAIENT ENCORE sur 2
 * des 4 pages recettees, la page etant 80 px plus haute avec la CSP active. Cause : la
 * sortie portait un bloc `<style>` sur 65 de ses 86 pages et un attribut
 * `style="--encre:…"` sur les 86, que `style-src 'self'` REFUSE — sans `'unsafe-inline'`,
 * sans nonce, sans empreinte.
 *
 * CE N ETAIT PAS UNE DECOUVERTE NEUVE, et c est tout le motif de cette garde : les
 * rapports Lighthouse du 2026-08-08 portaient deja 18 occurrences de
 * « …style-src 'self''. Either the 'unsafe-i… ». Personne ne l a nomme — le defaut etait
 * noye sous celui des images, qui saignait plus fort. Un compte rendu que personne ne lit
 * n est pas une garde ; ce qui suit fait ECHOUER le build.
 *
 * CE QU ELLE TIENT, ET SUR QUOI ELLE S APPUIE. Elle ne recopie PAS la CSP — celle-ci vit
 * dans les labels Traefik de l application Coolify (`docs/runbook-provisionnement.md`,
 * etape 27) et n a aucun domicile dans ce depot. Elle tient la regle qui rend la page
 * conforme a n importe quelle CSP stricte : **toute regle de style est servie comme
 * fichier**, jamais posee dans le document. Un `<link rel="stylesheet">` de meme origine
 * satisfait `'self'` quelle que soit la formulation exacte de l en-tete.
 *
 * DEUX CLASSES, SEPAREES DANS LE MESSAGE, parce qu elles se corrigent a deux endroits
 * differents : le bloc `<style>` vient du reglage `build.inlineStylesheets` d Astro ;
 * l attribut `style=` vient d un composant qui l ecrit, et aucun reglage ne le retire.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspecterStylesEnLigne } from '../scripts/verifier-styles-en-ligne.mjs';

import { bacJetable, brancherLesBacs } from '../../../outils/bac-jetable.mjs';

/* Les bacs de ce fichier se referment : nettoyage dans `after()`, bac du cas fautif
   conservé avec sa raison. Cf. `outils/bac-jetable.mjs`. */
brancherLesBacs();

/** Fabrique un dist/ jetable : { 'chemin/relatif': 'contenu' }. */
function dist(fichiers: Record<string, string>): string {
  const racine = bacJetable('garde-styles-en-ligne');
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const complet = path.join(racine, relatif);
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, contenu);
  }
  return racine;
}

function page(tete: string, corps = ''): string {
  return `<!DOCTYPE html><html lang="fr"><head>${tete}</head><body>${corps}</body></html>`;
}

// --- Famille 1 : ce qui passe ----------------------------------------------------------

test('une feuille de style SERVIE en fichier ne remonte rien : c est exactement ce que style-src self autorise', () => {
  const html = page('<link rel="stylesheet" href="/_astro/site.css">', '<p>Bonjour</p>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.pages, 1);
  assert.equal(rapport.blocs, 0);
  assert.equal(rapport.attributs, 0);
});

test('un attribut dont le NOM contient « style » sans etre `style` passe', () => {
  // `data-style`, `text-style`, `styles` : la CSP ne les regarde pas, la garde non plus.
  const html = page('', '<div data-style="sombre" styles="x" text-style="gras">a</div>');
  assert.deepEqual(inspecterStylesEnLigne(dist({ 'index.html': html })).manquements, []);
});

test('le mot `style="` ECHAPPE dans du texte ne compte pas : ce n est pas un attribut', () => {
  // Un article qui cite du HTML ecrit `&lt;p style="…"&gt;` ; le navigateur n y voit que du
  // texte, et la CSP non plus. Une garde qui grepperait la chaine brute rougirait a tort.
  const html = page('', '<p>Exemple : &lt;p style="color:red"&gt;rouge&lt;/p&gt;</p>');
  assert.deepEqual(inspecterStylesEnLigne(dist({ 'index.html': html })).manquements, []);
});

test('les fichiers qui ne sont pas du HTML sont ignores', () => {
  const rapport = inspecterStylesEnLigne(
    dist({
      'index.html': page(''),
      'rss.xml': '<item><description>&lt;style&gt;a{}&lt;/style&gt;</description></item>',
    }),
  );
  assert.deepEqual(rapport.manquements, []);
  assert.equal(rapport.pages, 1);
});

test('une feuille de style .css de la sortie n est pas inspectee : elle EST le bon endroit', () => {
  const rapport = inspecterStylesEnLigne(
    dist({ 'index.html': page(''), '_astro/site.css': '.a{color:red}' }),
  );
  assert.deepEqual(rapport.manquements, []);
});

// --- Famille 2 : le bloc <style>, defaut du reglage Astro -------------------------------

test('un bloc <style> dans le head est REFUSE', () => {
  const html = page('<style>.a{color:red}</style>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.blocs, 1);
  assert.match(rapport.manquements[0], /style-src/);
});

test('un bloc <style> PORTANT DES ATTRIBUTS est vu aussi', () => {
  const html = page('<style type="text/css" media="screen">.a{color:red}</style>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.blocs, 1);
});

test('un <style> DANS un <svg> est refuse : la CSP ne fait pas la difference', () => {
  const html = page('', '<svg><style>.b{fill:red}</style><path d="M0 0"/></svg>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.blocs, 1);
});

test('plusieurs blocs <style> sur une page sont comptes un par un', () => {
  const html = page('<style>.a{}</style><style>.b{}</style>', '<style>.c{}</style>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.blocs, 3);
  assert.equal(rapport.manquements.length, 3);
});

// --- Famille 3 : l attribut style=, qu aucun reglage ne retire --------------------------

test('un attribut style= est REFUSE', () => {
  const html = page('', '<a href="/x" style="--encre:#000000">x</a>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.attributs, 1);
});

test('un attribut style= en apostrophes simples ne passe pas au travers', () => {
  const html = page('', "<a href='/x' style='color:red'>x</a>");
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.attributs, 1);
});

test('un attribut style= SANS guillemets ne passe pas au travers', () => {
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': page('', '<b style=color:red>x</b>') }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.attributs, 1);
});

test('STYLE= en majuscules ne passe pas au travers', () => {
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': page('', '<b STYLE="color:red">x</b>') }));
  assert.equal(rapport.manquements.length, 1);
});

// --- Famille 4 : le message doit etre exploitable a 86 pages ---------------------------

test('le manquement NOMME la page, la position et un extrait de ce qu il refuse', () => {
  const html = page('', '<a href="/x" style="--encre:#212121;--encre-sombre:#ffffff">y</a>');
  const rapport = inspecterStylesEnLigne(dist({ 'article/x/index.html': html }));
  assert.match(rapport.manquements[0], /article\/x\/index\.html/);
  assert.match(rapport.manquements[0], /style=/);
  assert.match(rapport.manquements[0], /--encre:#212121/);
  assert.match(rapport.manquements[0], /<a\b/);
});

test('le manquement d un bloc <style> nomme la page et un extrait de ses regles', () => {
  const html = page('<style>.accueil__surtitre{margin:0 0 var(--espace-2)}</style>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.match(rapport.manquements[0], /index\.html/);
  assert.match(rapport.manquements[0], /accueil__surtitre/);
});

test('les DEUX classes se distinguent dans le message : elles ne se corrigent pas au meme endroit', () => {
  const html = page('<style>.a{}</style>', '<b style="color:red">x</b>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  assert.equal(rapport.manquements.length, 2);
  const bloc = rapport.manquements.find((m: string) => /inlineStylesheets/.test(m));
  const attribut = rapport.manquements.find((m: string) => /style=/.test(m) && !/inlineStylesheets/.test(m));
  assert.ok(bloc, 'le bloc <style> doit renvoyer au reglage Astro qui le produit');
  assert.ok(attribut, "l attribut style= doit renvoyer au composant qui l ecrit, pas au reglage");
});

test('aucun message ne propose d elargir style-src : ce serait defaire le §5.5', () => {
  const html = page('<style>.a{}</style>', '<b style="color:red">x</b>');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html }));
  for (const manquement of rapport.manquements) {
    assert.match(manquement, /NE PAS/);
    assert.doesNotMatch(manquement, /ajouter 'unsafe-inline'|autoriser 'unsafe-inline'/);
  }
});

test('TOUTES les pages sont inspectees, /recherche et /en comprises', () => {
  const fautive = page('<style>.a{}</style>');
  const rapport = inspecterStylesEnLigne(
    dist({
      'index.html': fautive,
      'recherche/index.html': fautive,
      'en/index.html': fautive,
      'article/x/index.html': fautive,
    }),
  );
  assert.equal(rapport.manquements.length, 4);
  assert.equal(rapport.pages, 4);
});

// --- Famille 5 : les bords -------------------------------------------------------------

test('une sortie absente est un manquement, pas un silence vert', () => {
  const rapport = inspecterStylesEnLigne(path.join(os.tmpdir(), 'garde-styles-inexistante'));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.pages, 0);
});

test('une sortie SANS AUCUNE page HTML est un manquement : zero page inspectee n est pas une preuve', () => {
  // Le mode d echec de la garde elle-meme : pointer le mauvais dossier rendrait vert sur
  // rien du tout. C est ce que `fileURLToPath` corrige cote integration ; ici on refuse.
  const rapport = inspecterStylesEnLigne(dist({ 'rss.xml': '<rss/>' }));
  assert.equal(rapport.manquements.length, 1);
  assert.match(rapport.manquements[0], /aucune page/i);
});

test('un attribut style= VIDE compte quand meme : la CSP le refuse aussi', () => {
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': page('', '<b style="">x</b>') }));
  assert.equal(rapport.manquements.length, 1);
});

test('un bloc <style> VIDE compte : c est le bloc que la CSP refuse, pas son contenu', () => {
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': page('<style></style>') }));
  assert.equal(rapport.manquements.length, 1);
  assert.equal(rapport.blocs, 1);
});

test('le resume au vert dit ce qui a ete inspecte, pas seulement « OK »', async () => {
  const { resumeStylesEnLigne } = await import('../scripts/verifier-styles-en-ligne.mjs');
  const html = page('<link rel="stylesheet" href="/_astro/site.css">');
  const rapport = inspecterStylesEnLigne(dist({ 'index.html': html, 'en/index.html': html }));
  assert.match(resumeStylesEnLigne(rapport), /2 page/);
});
