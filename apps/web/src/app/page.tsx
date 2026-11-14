import { REPOSITORY_URL } from '@/components/site-links';

const plannedFeatures = [
  {
    name: 'Catalog',
    description: 'Browse products by category with search, filtering, sorting, and pagination.',
  },
  {
    name: 'Accounts',
    description:
      'Registration and login backed by server-side sessions and Argon2id password hashing.',
  },
  {
    name: 'Cart',
    description: 'A per-user cart stored in PostgreSQL, with totals always computed on the server.',
  },
  {
    name: 'Checkout and orders',
    description:
      'Stock is reserved inside a database transaction so concurrent buyers cannot oversell.',
  },
  {
    name: 'Payments',
    description:
      'Stripe test-mode payments in INR, confirmed only by verified, idempotent webhooks.',
  },
  {
    name: 'Admin',
    description: 'Product, stock, and order management restricted to administrator accounts.',
  },
];

const stack = [
  { area: 'Web', items: ['Next.js App Router', 'React', 'TypeScript', 'Tailwind CSS'] },
  { area: 'API', items: ['Node.js', 'Express', 'TypeScript', 'Zod'] },
  { area: 'Data', items: ['PostgreSQL', 'Prisma', 'Redis', 'Stripe test mode'] },
  { area: 'Tooling', items: ['pnpm workspaces', 'Docker Compose', 'Vitest', 'GitHub Actions'] },
];

const milestones = [
  { name: 'Planning and architecture', done: true },
  { name: 'Monorepo foundation', done: true },
  { name: 'Database and product catalog', done: false },
  { name: 'Authentication and users', done: false },
  { name: 'Admin product and inventory management', done: false },
  { name: 'Cart', done: false },
  { name: 'Checkout and orders', done: false },
  { name: 'Stripe payments', done: false },
  { name: 'Caching and hardening', done: false },
  { name: 'End-to-end tests, containers, and release documentation', done: false },
];

const sectionClass = 'mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20';
const sectionHeadingClass = 'text-2xl font-semibold tracking-tight sm:text-3xl';

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
        <p className="text-accent font-mono text-sm">In development · Milestone 1 of 9 complete</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          A full-stack e-commerce application, built one milestone at a time.
        </h1>
        <p className="text-muted mt-6 max-w-2xl text-lg leading-relaxed">
          CartForge is a storefront and admin application covering the catalog, cart, checkout,
          payments, and order management. The project foundation is in place. Store features are
          added milestone by milestone.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#roadmap"
            className="bg-accent text-accent-foreground rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            View roadmap
          </a>
          <a
            href={REPOSITORY_URL}
            className="border-border hover:bg-surface rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Read the source
          </a>
        </div>
      </section>

      <section id="overview" className="border-border border-t">
        <div className={sectionClass}>
          <h2 className={sectionHeadingClass}>Planned scope</h2>
          <p className="text-muted mt-3 max-w-2xl">
            None of these features are available yet. Each one is delivered and tested in its own
            milestone.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plannedFeatures.map((feature) => (
              <li key={feature.name} className="border-border bg-surface rounded-lg border p-6">
                <h3 className="font-medium">{feature.name}</h3>
                <p className="text-muted mt-2 text-sm leading-relaxed">{feature.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="stack" className="border-border border-t">
        <div className={sectionClass}>
          <h2 className={sectionHeadingClass}>Stack</h2>
          <dl className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {stack.map((group) => (
              <div key={group.area}>
                <dt className="text-muted font-mono text-xs tracking-widest uppercase">
                  {group.area}
                </dt>
                <dd className="mt-3">
                  <ul className="space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="roadmap" className="border-border border-t">
        <div className={sectionClass}>
          <h2 className={sectionHeadingClass}>Roadmap</h2>
          <ol className="border-border divide-border mt-10 divide-y rounded-lg border">
            {milestones.map((milestone, index) => (
              <li key={milestone.name} className="flex items-center gap-4 px-4 py-4 sm:px-6">
                <span className="text-muted w-8 shrink-0 font-mono text-sm">M{index}</span>
                <span className="flex-1">{milestone.name}</span>
                <span
                  className={
                    milestone.done
                      ? 'bg-accent text-accent-foreground rounded-full px-2.5 py-0.5 text-xs font-medium'
                      : 'border-border text-muted rounded-full border px-2.5 py-0.5 text-xs font-medium'
                  }
                >
                  {milestone.done ? 'Done' : 'Planned'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
