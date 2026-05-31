import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-6xl">🔥</div>
      <h1 className="text-4xl font-bold tracking-tight max-w-md">
        Track what you eat. Effortlessly.
      </h1>
      <p className="text-base text-[color:var(--color-text-secondary)] max-w-md">
        Snap a photo. Say what it is. We figure out the rest.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/onboarding"
          className="bg-[color:var(--color-text-primary)] text-white py-3 rounded-2xl font-semibold"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="text-[color:var(--color-text-secondary)] py-3 font-medium"
        >
          I already have an account
        </Link>
      </div>
    </main>
  );
}
