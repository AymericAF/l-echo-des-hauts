/**
 * Erreurs nommees du seed.
 *
 * Elles existent pour que l'echec soit LISIBLE et ATTRIBUABLE : le seed sert
 * a reconstruire l'environnement depuis le depot apres une perte, et personne
 * ne sera la pour interpreter une pile d'appels.
 */

/** Le corpus versionne est invalide. Rien n'a ete ecrit dans Strapi. */
export class ErreurCorpus extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurCorpus';
  }
}

/** Un fichier media reference par le corpus est absent du disque. */
export class MediaIntrouvable extends ErreurCorpus {
  constructor(cheminRelatif: string, cheminAbsolu: string) {
    super(
      `media introuvable : ${cheminRelatif}\n` +
        `  attendu ici : ${cheminAbsolu}\n` +
        `  le corpus est versionne : ce fichier doit exister dans le depot.`
    );
    this.name = 'MediaIntrouvable';
  }
}

/** L'API Strapi a refuse une requete. */
export class ErreurStrapi extends Error {
  readonly methode: string;
  readonly url: string;
  readonly statut: number;
  readonly corps: string;

  constructor(methode: string, url: string, statut: number, corps: string) {
    super(`${methode} ${url} -> HTTP ${statut}\n${corps}`);
    this.name = 'ErreurStrapi';
    this.methode = methode;
    this.url = url;
    this.statut = statut;
    this.corps = corps;
  }
}
