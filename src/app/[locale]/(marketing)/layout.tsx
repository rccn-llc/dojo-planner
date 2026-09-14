import { setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/features/landing/SiteFooter';

// Server component with no cookies()/headers() reads, so the marketing routes
// stay statically rendered. Verify with `npm run build`: /[locale],
// /[locale]/privacy and /[locale]/terms must remain static, not ƒ (dynamic).
export default async function MarketingLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{props.children}</div>
      <SiteFooter />
    </div>
  );
}
