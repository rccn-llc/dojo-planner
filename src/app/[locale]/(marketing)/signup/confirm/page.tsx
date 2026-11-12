import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SignupConfirm } from '@/features/signup/SignupConfirm';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'SignupConfirm' });
  return {
    title: t('meta_title'),
    // A one-time link page: keep it out of search results, and send no
    // Referer from it (the URL carries the confirm token until the page
    // removes it).
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

// Static shell: the link's id and token are read in the browser, so this page
// stays statically rendered like the rest of (marketing).
export default async function SignupConfirmPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  return <SignupConfirm />;
}
