import { listTenantProductModules } from '@expadio/postgres-runtime/product-module';
import { listTenantActiveIndustryPacks } from '@expadio/postgres-runtime/tenant-industry-pack';
import { EXPADIO_LINEAR, compileScopedThemeCss, parseProductModuleShellDescriptor, type ModuleShellDescriptor } from '@expadio/ui';
import { redirect } from 'next/navigation';
import { BrandContextError, diagnoseBrandAccess, resolveBrandContext, withBrandTransaction } from '../../lib/brand-context';
import { BrandAccessRecovery } from '../../components/BrandAccessRecovery';
import { BrandShellFrame } from '../../components/BrandShellFrame';
import { loadBrandEffectiveTheme } from '../../lib/effective-theme';
import styles from './workspace.module.css';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let context;
  try {
    context = await resolveBrandContext();
  } catch (error) {
    if (error instanceof BrandContextError) {
      if (error.code === 'UNAUTHENTICATED') {
        redirect('/sign-in');
      }
      if (error.code === 'NO_BRAND_MEMBERSHIP') {
        const diagnostic = await diagnoseBrandAccess();
        if (diagnostic?.reason === 'NO_MATCHING_MEMBERSHIP') {
          redirect('/onboarding');
        }
        return (
          <main className={styles.accessShell}>
            <section className={styles.accessCard}>
              <div className={styles.accessMark}>EXPADIO</div>
              <p className={styles.eyebrow}>Brand workspace access</p>
              <h1>Brand access unavailable</h1>
              <p>EXPADIO could not resolve an active Brand workspace for the Clerk identity currently signed into this browser.</p>
              {diagnostic ? <BrandAccessRecovery subjectId={diagnostic.subjectId} reason={diagnostic.reason} membershipStatus={diagnostic.status} validUntil={diagnostic.validUntil} /> : null}
            </section>
          </main>
        );
      }
    }
    throw error;
  }

  const state = await withBrandTransaction(context, async (client) => ({
    modules: await listTenantProductModules(client, context.tenantId),
    activePacks: await listTenantActiveIndustryPacks(client, context.tenantId),
    theme: await loadBrandEffectiveTheme(client, context),
  }));

  const descriptors: ModuleShellDescriptor[] = [];

  for (const module of state.modules) {
    if (module.availability !== 'ACTIVE') {
      continue;
    }

    if (module.moduleKey === 'product' && module.availability === 'ACTIVE' && state.activePacks.length > 0) {
      // Each active Industry Pack receives its own dedicated place in the sidebar menu!
      for (let i = 0; i < state.activePacks.length; i++) {
        const pack = state.activePacks[i]!;
        let iconKey = 'product';
        let friendlyName = pack.name;
        if (pack.packSlug === 'franchise_service') {
          iconKey = 'calendar';
          friendlyName = 'Services & Bookings';
        } else if (pack.packSlug === 'retail_d2c') {
          iconKey = 'product';
          friendlyName = 'Retail Products';
        } else if (pack.packSlug === 'financial_brokerage') {
          iconKey = 'contract';
          friendlyName = 'Insurance & Policies';
        } else if (pack.packSlug === 'digital_saas') {
          iconKey = 'code';
          friendlyName = 'Software & Licenses';
        }

        descriptors.push({
          key: `product:${pack.packSlug}`,
          name: friendlyName,
          description: pack.description,
          category: 'Commerce',
          iconKey,
          baseRoute: `/products/packs/${pack.packSlug}`,
          defaultPinned: true,
          order: 45 + i,
          sections: [
            {
              id: 'catalog',
              label: 'Catalog',
              href: `/products/packs/${pack.packSlug}`,
              placement: 'primary',
              requiredCapabilities: [],
            },
            {
              id: 'compose',
              label: '+ New Offering',
              href: `/products/packs/${pack.packSlug}/compose`,
              placement: 'primary',
              requiredCapabilities: [],
            },
            {
              id: 'approval-queue',
              label: 'Approval Queue',
              href: `/products/packs/${pack.packSlug}/approval-queue`,
              placement: 'more',
              requiredCapabilities: [],
            },
          ],
          quickActions: [
            {
              id: `compose-${pack.packSlug}`,
              label: `+ Create ${friendlyName}`,
              href: `/products/packs/${pack.packSlug}/compose`,
              requiredCapabilities: [],
            },
          ],
        });
      }
    } else {
      const shell = parseProductModuleShellDescriptor({
        moduleKey: module.moduleKey,
        displayName: module.displayName,
        description: module.description,
        manifest: module.manifest,
      });
      if (shell) {
        descriptors.push({
          ...shell,
          locked: false,
        });
      }
    }
  }

  // Inject CRMONIA Hierarchical Core Modules into Workspace Navigation
  descriptors.unshift(
    {
      key: 'crmonia:structure',
      name: 'Org Hierarchy & Mergers',
      description: 'N-tier organization tree and branch migration wizard',
      category: 'Governance',
      iconKey: 'network',
      baseRoute: '/admin/structure',
      defaultPinned: true,
      order: 1,
      sections: [{ id: 'tree', label: 'Org Tree', href: '/admin/structure', placement: 'primary', requiredCapabilities: [] }],
      quickActions: [{ id: 'move-entity', label: 'Move Entity', href: '/admin/structure', requiredCapabilities: [] }],
    },
    {
      key: 'crmonia:crm',
      name: 'CRM Kanban & Pipeline',
      description: 'Canonical 5-stage CRM deals and frontline inbox copilot',
      category: 'Sales',
      iconKey: 'pipelines',
      baseRoute: '/crm',
      defaultPinned: true,
      order: 2,
      sections: [{ id: 'kanban', label: '5-Stage Kanban', href: '/crm', placement: 'primary', requiredCapabilities: [] }],
      quickActions: [{ id: 'new-lead', label: '+ New Deal', href: '/crm', requiredCapabilities: [] }],
    },
    {
      key: 'crmonia:playbooks',
      name: 'GTM Playbooks & Senders',
      description: 'Plug-and-play outbound campaigns, mailbox pools, and analytics',
      category: 'GTM',
      iconKey: 'compliance',
      baseRoute: '/gtm',
      defaultPinned: true,
      order: 3,
      sections: [
        { id: 'playbooks', label: 'All Playbooks', href: '/gtm', placement: 'primary', requiredCapabilities: [] },
        { id: 'senders', label: 'Senders & Mailboxes', href: '/gtm/senders', placement: 'primary', requiredCapabilities: [] },
        { id: 'analytics', label: 'Executive Cockpit', href: '/gtm/analytics', placement: 'primary', requiredCapabilities: [] },
      ],
      quickActions: [{ id: 'new-playbook', label: '+ New Playbook', href: '/gtm/playbooks/new', requiredCapabilities: [] }],
    }
  );

  const themeProfile = state.theme.theme.key === EXPADIO_LINEAR.key ? state.theme.theme : EXPADIO_LINEAR;
  const themeCss = compileScopedThemeCss(themeProfile, 'brand');
  return (
    <>
      <style data-expadio-effective-theme="brand" dangerouslySetInnerHTML={{__html:themeCss}} />
      <BrandShellFrame
      tenantName={context.tenantName}
      organizationName={context.organizationName}
      workspaces={context.workspaces}
      selectedWorkspace={context.tenantId+':'+context.organizationId}
      modules={descriptors}
      >
        {children}
      </BrandShellFrame>
    </>
  );
}
