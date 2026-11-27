import {
  PROJECT_STATUSES_ACTIVE,
  PROJECT_STATUSES_PAID,
  type AdminProjectPage,
  type AdminProjectQuery,
  type AdminStats,
  type CustomerPage,
  type ProductId,
  type ProjectListItem,
  type ProjectNote,
  type ProjectStatus,
} from '@px/contracts';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { BackOfficeQueries } from '../application/ports';
import type { Database } from './db/client';
import { contributions, projectNotes, projects } from './db/schema';

/** Digits of a phone as stored in `customer.phone` ("+77011234567" → "77011234567"). */
const phoneDigits = sql<string>`regexp_replace(${projects.customer}->>'phone', '\\D', '', 'g')`;
const total = sql<number>`(${projects.quote}->>'total')::int`;
const inList = (statuses: readonly ProjectStatus[]) => inArray(projects.status, [...statuses]);

/**
 * Read models of the studio back office: filtered order lists, dashboard numbers,
 * customers grouped by phone and internal notes. SQL aggregates, no business rules.
 */
export class DrizzleBackOfficeQueries implements BackOfficeQueries {
  constructor(private readonly db: Database) {}

  async projects(query: AdminProjectQuery): Promise<AdminProjectPage> {
    const conditions: SQL[] = [];
    if (query.status?.length) conditions.push(inList(query.status));
    if (query.productId) conditions.push(eq(projects.productId, query.productId));
    if (query.design) conditions.push(eq(projects.designMode, query.design));
    if (query.phone) conditions.push(eq(phoneDigits, query.phone.replace(/\D/g, '')));
    if (query.q) {
      const like = `%${query.q.replace(/[%_\\]/g, '\\$&')}%`;
      const digits = query.q.replace(/\D/g, '');
      conditions.push(
        or(
          ilike(projects.subject, like),
          ilike(sql`${projects.customer}->>'name'`, like),
          ...(digits.length >= 4 ? [sql`${phoneDigits} like ${`%${digits}%`}`] : []),
        )!,
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const order = {
      updated: [desc(projects.updatedAt)],
      created: [desc(projects.createdAt)],
      deadline: [sql`${projects.deadline} asc nulls last`, desc(projects.updatedAt)],
      total: [desc(total), desc(projects.updatedAt)],
    }[query.sort];

    const contributionCounts = this.db
      .select({ projectId: contributions.projectId, value: count().as('value') })
      .from(contributions)
      .groupBy(contributions.projectId)
      .as('contribution_counts');

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({ project: projects, contributionsCount: sql<number>`coalesce(${contributionCounts.value}, 0)::int` })
        .from(projects)
        .leftJoin(contributionCounts, eq(contributionCounts.projectId, projects.id))
        .where(where)
        .orderBy(...order)
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ value: count() }).from(projects).where(where),
    ]);

    return {
      total: counted?.value ?? 0,
      items: rows.map(({ project, contributionsCount }): ProjectListItem => ({
        id: project.id,
        productId: project.productId,
        subject: project.subject,
        status: project.status,
        customerName: project.customer.name,
        customerPhone: project.customer.phone,
        total: project.quote.total,
        paidAmount: project.paidAmount,
        contributionsCount,
        designMode: project.designMode,
        deadline: project.deadline ?? null,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
    };
  }

  async stats(): Promise<AdminStats> {
    const paidStatuses = sql.join(PROJECT_STATUSES_PAID.map((s) => sql`${s}`), sql`, `);
    const activeStatuses = sql.join(
      PROJECT_STATUSES_ACTIVE.filter((s) => s !== 'printing' && s !== 'shipped').map((s) => sql`${s}`),
      sql`, `,
    );
    const isPaid = sql`${projects.status} in (${paidStatuses})`;
    const thisMonth = sql`${projects.createdAt} >= date_trunc('month', now())`;
    const previousMonth = sql`${projects.createdAt} >= date_trunc('month', now()) - interval '1 month' and ${projects.createdAt} < date_trunc('month', now())`;
    const recent = sql`${projects.createdAt} >= now() - interval '90 days'`;

    const [byStatusRows, byProductRows, [totals]] = await Promise.all([
      this.db.select({ status: projects.status, value: count() }).from(projects).groupBy(projects.status),
      this.db
        .select({
          productId: projects.productId,
          orders: count(),
          paidOrders: sql<number>`count(*) filter (where ${isPaid})::int`,
          revenue: sql<number>`coalesce(sum(${projects.paidAmount}), 0)::int`,
        })
        .from(projects)
        .where(sql`${projects.status} <> 'cancelled'`)
        .groupBy(projects.productId)
        .orderBy(asc(projects.productId)),
      this.db
        .select({
          unpaid: sql<number>`count(*) filter (where ${projects.status} = 'draft' and ${projects.createdAt} < now() - interval '2 days')::int`,
          handoff: sql<number>`count(*) filter (where ${projects.status} = 'in_design' and ${projects.designMode} = 'studio')::int`,
          awaitingApproval: sql<number>`count(*) filter (where ${projects.status} = 'awaiting_approval')::int`,
          toPrint: sql<number>`count(*) filter (where ${projects.status} = 'paid')::int`,
          toShip: sql<number>`count(*) filter (where ${projects.status} = 'printing')::int`,
          deadlineSoon: sql<number>`count(*) filter (where ${projects.deadline} <= current_date + 14 and ${projects.status} in (${activeStatuses}))::int`,
          monthOrders: sql<number>`count(*) filter (where ${thisMonth})::int`,
          monthRevenue: sql<number>`coalesce(sum(${projects.paidAmount}) filter (where ${thisMonth}), 0)::int`,
          prevOrders: sql<number>`count(*) filter (where ${previousMonth})::int`,
          prevRevenue: sql<number>`coalesce(sum(${projects.paidAmount}) filter (where ${previousMonth}), 0)::int`,
          averageCheck: sql<number>`coalesce(round(avg(${total}) filter (where ${projects.paidAmount} > 0)), 0)::int`,
          funnelCreated: sql<number>`count(*) filter (where ${recent})::int`,
          funnelDeposit: sql<number>`count(*) filter (where ${recent} and ${projects.paidAmount} > 0)::int`,
          funnelPaid: sql<number>`count(*) filter (where ${recent} and ${isPaid})::int`,
        })
        .from(projects),
    ]);

    const t = totals!;
    return {
      attention: {
        unpaid: t.unpaid,
        handoff: t.handoff,
        awaitingApproval: t.awaitingApproval,
        toPrint: t.toPrint,
        toShip: t.toShip,
        deadlineSoon: t.deadlineSoon,
      },
      byStatus: Object.fromEntries(byStatusRows.map((r) => [r.status, r.value])) as AdminStats['byStatus'],
      byProduct: byProductRows.map((r) => ({ productId: r.productId as ProductId, orders: r.orders, paidOrders: r.paidOrders, revenue: r.revenue })),
      month: { orders: t.monthOrders, revenue: t.monthRevenue },
      previousMonth: { orders: t.prevOrders, revenue: t.prevRevenue },
      averageCheck: t.averageCheck,
      funnel: { created: t.funnelCreated, deposit: t.funnelDeposit, paid: t.funnelPaid },
    };
  }

  async customers(query: { q?: string; limit: number; offset: number }): Promise<CustomerPage> {
    const conditions: SQL[] = [];
    if (query.q) {
      const like = `%${query.q.replace(/[%_\\]/g, '\\$&')}%`;
      const digits = query.q.replace(/\D/g, '');
      conditions.push(
        or(ilike(sql`${projects.customer}->>'name'`, like), ...(digits.length >= 4 ? [sql`${phoneDigits} like ${`%${digits}%`}`] : []))!,
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const activeStatuses = sql.join(PROJECT_STATUSES_ACTIVE.map((s) => sql`${s}`), sql`, `);

    const grouped = this.db
      .select({
        phone: sql<string>`${phoneDigits}`.as('phone'),
        // The latest order's contact details win: people fix typos in their names.
        name: sql<string>`(array_agg(${projects.customer}->>'name' order by ${projects.createdAt} desc))[1]`.as('name'),
        email: sql<string | null>`(array_agg(${projects.customer}->>'email' order by ${projects.createdAt} desc) filter (where ${projects.customer}->>'email' is not null))[1]`.as('email'),
        orders: sql<number>`count(*)::int`.as('orders'),
        activeOrders: sql<number>`count(*) filter (where ${projects.status} in (${activeStatuses}))::int`.as('active_orders'),
        revenue: sql<number>`coalesce(sum(${projects.paidAmount}), 0)::int`.as('revenue'),
        productIds: sql<string[]>`array_agg(distinct ${projects.productId})`.as('product_ids'),
        firstOrderAt: sql<Date>`min(${projects.createdAt})`.as('first_order_at'),
        lastActivityAt: sql<Date>`max(${projects.updatedAt})`.as('last_activity_at'),
      })
      .from(projects)
      .where(where)
      .groupBy(phoneDigits)
      .as('customers');

    const [rows, [counted]] = await Promise.all([
      this.db.select().from(grouped).orderBy(desc(grouped.lastActivityAt)).limit(query.limit).offset(query.offset),
      this.db.select({ value: count() }).from(grouped),
    ]);
    return {
      total: counted?.value ?? 0,
      items: rows.map((r) => ({
        phone: `+${r.phone}`,
        name: r.name,
        email: r.email ?? null,
        orders: r.orders,
        activeOrders: r.activeOrders,
        revenue: r.revenue,
        productIds: r.productIds as ProductId[],
        firstOrderAt: new Date(r.firstOrderAt).toISOString(),
        lastActivityAt: new Date(r.lastActivityAt).toISOString(),
      })),
    };
  }

  async notes(projectId: string): Promise<ProjectNote[]> {
    const rows = await this.db.select().from(projectNotes).where(eq(projectNotes.projectId, projectId)).orderBy(desc(projectNotes.createdAt));
    return rows.map((r) => ({ id: r.id, text: r.text, author: r.author, createdAt: r.createdAt.toISOString() }));
  }

  async addNote(projectId: string, note: { text: string; author: string | null }): Promise<void> {
    await this.db.insert(projectNotes).values({ projectId, ...note });
  }
}
