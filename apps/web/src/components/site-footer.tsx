import { REPOSITORY_URL } from './site-links';

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="text-muted mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>CartForge is a portfolio project under active development.</p>
        <a href={REPOSITORY_URL} className="hover:text-foreground underline underline-offset-4">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
