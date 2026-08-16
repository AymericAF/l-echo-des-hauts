import { poserLocales } from './locales';
import { poserReglagesMedias } from './reglages-medias';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * Pose les locales du projet : `fr` par defaut, `en` en miroir.
   *
   * Une instance Strapi fraiche ne connait que `en`, et `en` est la locale par
   * defaut. Comme la creation d'une locale n'est pas exposee sur l'API de
   * contenu (routes `admin` du plugin i18n), le seed ne peut pas s'en charger :
   * c'est ici, ou nulle part. Voir `src/locales.ts` pour le detail.
   *
   * CE FICHIER NE CONTIENT PLUS AUCUNE LOGIQUE, ET C'EST VOULU (2026-08-12,
   * tache f30fc73e). Le defaut corrige vivait ICI, dans deux `if` qui
   * n'ecrivaient au journal que si quelque chose avait ete cree ou pose : sur une
   * instance deja conforme, le bootstrap ne laissait AUCUNE trace, donc « il a
   * tourne sans rien changer » et « il n'a jamais tourne » rendaient la meme
   * sortie. Or `index.ts` n'est atteignable par aucun test — Strapi l'importe
   * sans extension, ce que le lanceur de tests de Node ne resout pas. Toute
   * logique posee ici serait donc GARDEE PAR RIEN. `poserLocales` vit dans
   * `./locales`, ou elle est exercee. Ne rien ramener ici.
   */
  async bootstrap({ strapi }: { strapi: any }) {
    await poserLocales(strapi);
    await poserReglagesMedias(strapi);
  },
};
