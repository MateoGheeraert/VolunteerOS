import { BrandLogo } from '@/components/layout/brand-logo';

/** Login, signup, password reset, onboarding and invitations: one friendly card on the cream background. */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-brand-secondary/25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-20 size-64 rounded-full bg-brand-accent/20"
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6">
        <BrandLogo />
        <div className="w-full rounded-card bg-card p-6 shadow-soft sm:p-8">{children}</div>
      </div>
    </main>
  );
}
