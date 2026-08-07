import { assurerLocales, LOCALES_ATTENDUES } from './locales';

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
   */
  async bootstrap({ strapi }: { strapi: any }) {
    const service = strapi.plugin('i18n').service('locales');
    const rapport = await assurerLocales(service);

    if (rapport.creees.length > 0) {
      strapi.log.info(`[locales] creees : ${rapport.creees.join(', ')}`);
    }
    if (rapport.defautPose) {
      strapi.log.info(`[locales] locale par defaut posee sur "${LOCALES_ATTENDUES[0].code}"`);
    }
  },
};
