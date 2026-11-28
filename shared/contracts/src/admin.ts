import { z } from 'zod';
import { Tenge } from './money';
import { ProductId } from './products';
import { DesignMode } from './layouts';
import { ProjectListItem, ProjectStatus } from './projects';

/**
 * Studio back office (CRM): queries and read models behind /admin.
 * Everything here is reachable only through the gateway with the admin token.
 */

/** Comma-separated statuses in a query string: "draft,deposit_paid". */
const StatusList = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(ProjectStatus));

export const ProjectSort = z.enum(['updated', 'created', 'deadline', 'total']);
export type ProjectSort = z.infer<typeof ProjectSort>;

export const AdminProjectQuery = z.object({
  status: StatusList.optional(),
  productId: ProductId.optional(),
  design: DesignMode.optional(),
  /** Hero, customer name or phone digits. */
  q: z.string().trim().max(80).optional(),
  /** Customer phone (digits, optional +): every order of one customer. */
  phone: z.string().trim().max(20).optional(),
  sort: ProjectSort.default('updated'),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AdminProjectQuery = z.infer<typeof AdminProjectQuery>;
export type AdminProjectQueryInput = z.input<typeof AdminProjectQuery>;

export const AdminProjectPage = z.object({
  items: z.array(ProjectListItem),
  total: z.number().int().nonnegative(),
});
export type AdminProjectPage = z.infer<typeof AdminProjectPage>;

/** Work that needs a person, counted for the dashboard and the sidebar. */
export const AttentionCounts = z.object({
  /** Created more than two days ago and still without the deposit: call or write. */
  unpaid: z.number().int().nonnegative(),
  /** Taken out of the automatic loop: a designer must lay it out by hand. */
  handoff: z.number().int().nonnegative(),
  /** A layout waits for the customer's decision. */
  awaitingApproval: z.number().int().nonnegative(),
  /** Fully paid: send to the printer. */
  toPrint: z.number().int().nonnegative(),
  /** Printed: hand over to delivery. */
  toShip: z.number().int().nonnegative(),
  /** The gift date is within 14 days and the issue is not printed yet. */
  deadlineSoon: z.number().int().nonnegative(),
});
export type AttentionCounts = z.infer<typeof AttentionCounts>;

/** Dashboard numbers of one product, or of the whole studio without `productId`. */
export const AdminStatsQuery = z.object({ productId: ProductId.optional() });
export type AdminStatsQuery = z.infer<typeof AdminStatsQuery>;

/** One day of the last 30 (Asia/Almaty): orders created that day and what they paid so far. */
export const StatsDay = z.object({ date: z.iso.date(), orders: z.number().int().nonnegative(), revenue: Tenge });
export type StatsDay = z.infer<typeof StatsDay>;

export const AdminStats = z.object({
  attention: AttentionCounts,
  byStatus: z.record(ProjectStatus, z.number().int().nonnegative()),
  byProduct: z.array(
    z.object({ productId: ProductId, orders: z.number().int(), paidOrders: z.number().int(), revenue: Tenge, active: z.number().int().nonnegative() }),
  ),
  /** Calendar month to date and the previous one, by order creation. */
  month: z.object({ orders: z.number().int(), revenue: Tenge }),
  previousMonth: z.object({ orders: z.number().int(), revenue: Tenge }),
  /** Average order value of orders with at least the deposit paid. */
  averageCheck: Tenge,
  /** Orders created in the last 90 days: how many paid the deposit, how many paid in full. */
  funnel: z.object({ created: z.number().int(), deposit: z.number().int(), paid: z.number().int() }),
  /** Orders in work (not delivered, not cancelled). */
  active: z.number().int().nonnegative(),
  /** The last 30 days, oldest first, every day present. */
  daily: z.array(StatsDay),
});
export type AdminStats = z.infer<typeof AdminStats>;

/** One customer, identified by phone, across all their orders. */
export const CustomerSummary = z.object({
  phone: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  orders: z.number().int().positive(),
  activeOrders: z.number().int().nonnegative(),
  revenue: Tenge,
  productIds: z.array(ProductId),
  firstOrderAt: z.iso.datetime(),
  lastActivityAt: z.iso.datetime(),
});
export type CustomerSummary = z.infer<typeof CustomerSummary>;

export const CustomerQuery = z.object({
  q: z.string().trim().max(80).optional(),
  /** Customers of one product; their numbers then count only that product's orders. */
  productId: ProductId.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CustomerQueryInput = z.input<typeof CustomerQuery>;

export const CustomerPage = z.object({
  items: z.array(CustomerSummary),
  total: z.number().int().nonnegative(),
});
export type CustomerPage = z.infer<typeof CustomerPage>;


export const AddNoteRequest = z.object({
  text: z.string().trim().min(1, 'Напишите заметку').max(2000),
  author: z.string().trim().max(60).optional(),
});
export type AddNoteRequest = z.infer<typeof AddNoteRequest>;
