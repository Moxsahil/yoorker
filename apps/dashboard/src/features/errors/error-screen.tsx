import { Link } from "@/kit/framework";
import { buttonVariants } from "@/components/ui/button";
import { BrandLogo } from "@/components/yoorker/brand-logo";
import { StatusPage } from "@/kit/states/status-page";

/**
 * A full-page error outside the shell: the brand mark, the Kit's StatusPage,
 * and a way home. Used for unknown addresses.
 */
export function ErrorScreen({
  code,
  title,
  description,
}: {
  code: React.ReactNode;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-svh flex-col bg-background">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] opacity-50 [mask-image:radial-gradient(ellipse_50%_45%_at_50%_45%,black,transparent)]"
      />
      <header className="px-4 py-6 sm:px-8">
        <Link href="/" className="w-fit">
          <BrandLogo />
        </Link>
      </header>
      <main className="flex flex-1 flex-col">
        <StatusPage
          code={code}
          title={title}
          description={description}
          actions={
            <Link href="/" className={buttonVariants({ size: "lg" })}>
              Go to the dashboard
            </Link>
          }
        />
      </main>
    </div>
  );
}
