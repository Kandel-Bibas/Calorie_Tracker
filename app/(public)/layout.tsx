/**
 * Minimal layout for unauthenticated public routes: marketing splash, login,
 * and the 7-step onboarding flow. No tab bar, no sidebar — just a chrome-less
 * full-screen container so each page owns its visual treatment.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
