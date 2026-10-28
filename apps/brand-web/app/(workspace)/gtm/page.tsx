import Link from 'next/link';
import { loadTenantProductModule } from '@expadio/postgres-runtime/product-module';
import { resolveBrandContext, withBrandTransaction } from '../../../lib/brand-context';
import { BrandGtmDashboard } from '../../../components/gtm/BrandGtmDashboard';
import styles from '../workspace.module.css';

export const dynamic = 'force-dynamic';

async function requireGtmModule() {
  const context = await resolveBrandContext();
  const module = await withBrandTransaction(context, (client) =>
    loadTenantProductModule(client, {
      tenantId: context.tenantId,
      moduleKey: 'gtm',
    }),
  );
  return { context, module };
}

export default async function GtmPage() {
  const { module } = await requireGtmModule();

  if (module?.availability !== 'ACTIVE') {
    const availability = module?.availability ?? 'UNAVAILABLE';
    return (
      <>
        <section className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>Growth</p>
            <h1>Go-To-Market</h1>
            <p>
              Outbound sequences, ICP fit scoring, and enrollment observation — with Decision Fabric
              gates on publish and launch.
            </p>
          </div>
        </section>
        <div className={styles.notice}>
          <strong>Go-To-Market is not active for this tenant.</strong>
          <p>
            Availability: <code>{availability}</code>. Catalogue metadata never grants entitlement
            or activates the module by itself.
          </p>
          <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.5 }}>
            <li>
              <strong>LOCKED_BY_PLAN / READY_TO_ACTIVATE</strong> — activate from the Brand module
              launcher (Modules) once rollout policy allows this tenant.
            </li>
            <li>
              <strong>UNAVAILABLE</strong> — platform rollout may still be SELECTED without this
              tenant on the allow-list, or entitlement is missing.
            </li>
            <li>
              When ACTIVE, the shell shows <strong>Growth → Go-To-Market</strong> at{' '}
              <code>/gtm</code> (see product module shell manifest).
            </li>
          </ul>
          <p style={{ marginTop: 12 }}>
            <Link href="/">Return to workspace home</Link>
            {' · '}
            <Link href="/communications">Communications</Link>
            {' · '}
            <Link href="/leads">Leads</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <section className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Growth</p>
          <h1>Go-To-Market</h1>
          <p>
            Draft sequences and ICPs, enroll leads, observe fit and replies. Publish and launch stay
            Decision Fabric — GTM never sends mail itself.
          </p>
        </div>
      </section>
      <BrandGtmDashboard />
    </>
  );
}
