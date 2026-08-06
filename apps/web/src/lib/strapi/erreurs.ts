/**
 * Les deux ruptures que le front doit voir CASSER, et jamais absorber.
 *
 * R4 du brief : « Strapi bouge pendant le projet […] Le mapping type de §4.3 est la
 * parade prevue ; encore faut-il qu il soit ecrit avant, pas apres. » Un champ qui
 * disparait d une reponse REST ne produit pas d erreur : il produit `undefined`, qui
 * traverse le mapping, le composant, puis sort en HTML sous la forme d une chaine vide
 * ou du mot « undefined ». Le build reste vert et le site ment. Ces deux erreurs sont
 * la pour que ce chemin n existe pas.
 */

/** Un champ attendu n est pas present dans la reponse : rupture de schema Strapi. */
export class ChampManquantError extends Error {
  readonly chemin: string;

  constructor(chemin: string, precision?: string) {
    super(
      `Champ absent de la reponse Strapi : « ${chemin} »` +
        (precision ? ` — ${precision}` : '') +
        '. Soit le populate de src/lib/strapi/requete.ts ne le demande plus, soit le schema Strapi a change.',
    );
    this.name = 'ChampManquantError';
    this.chemin = chemin;
  }
}

/** Le champ est present, mais sa valeur sort du contrat (type, enum, format). */
export class ValeurInattendueError extends Error {
  readonly chemin: string;

  constructor(chemin: string, precision: string) {
    super(`Valeur inattendue en « ${chemin} » : ${precision}.`);
    this.name = 'ValeurInattendueError';
    this.chemin = chemin;
  }
}
