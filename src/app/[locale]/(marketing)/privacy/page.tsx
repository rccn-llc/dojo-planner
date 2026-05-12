import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'PrivacyPage' });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function PrivacyPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'PrivacyPage' });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Alert variant="warning" className="mb-8">
        {t('draft_banner')}
      </Alert>

      <h1 className="mb-2 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t('last_updated')}</p>

      <section className="space-y-6 leading-relaxed">
        <p>{t('intro')}</p>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('collection_title')}</h2>
          <p>{t('collection_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('use_title')}</h2>
          <p>{t('use_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('sharing_title')}</h2>
          <p>{t('sharing_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('retention_title')}</h2>
          <p>{t('retention_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('security_title')}</h2>
          <p>{t('security_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('rights_title')}</h2>
          <p>{t('rights_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('cookies_title')}</h2>
          <p>{t('cookies_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('children_title')}</h2>
          <p>{t('children_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('changes_title')}</h2>
          <p>{t('changes_body')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">{t('contact_title')}</h2>
          <p>{t('contact_body')}</p>
        </div>
      </section>
    </main>
  );
}
