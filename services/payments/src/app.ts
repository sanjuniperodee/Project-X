import { AppError, createService, OutboxRelay, type EventBus, type Logger } from '@px/service-kit';
import { CashierService } from './application/cashier-service';
import { PaymentService } from './application/payment-service';
import { PaymentRuleViolation } from './domain/payment';
import { registerRoutes } from './http/routes';
import type { Database } from './infrastructure/db/client';
import { DrizzleOutboxStore, DrizzlePaymentRepository } from './infrastructure/payment-repository';
import type { PaymentProvider } from './providers';

export interface PaymentsAppDeps {
  db: Database;
  connectBus: (log: Logger) => Promise<EventBus>;
  provider: PaymentProvider;
  /** Kaspi cashier connection; without it the admin endpoints report "not enabled". */
  cashier?: CashierService;
  logLevel?: string;
  prettyLogs?: boolean;
}

export async function buildPaymentsApp(deps: PaymentsAppDeps) {
  const service = createService({
    name: 'payments',
    logLevel: deps.logLevel,
    prettyLogs: deps.prettyLogs,
    mapError: (error) => (error instanceof PaymentRuleViolation ? AppError.conflict(error.message) : undefined),
  });

  const bus = await deps.connectBus(service.app.log);
  service.onShutdown(() => bus.close());
  service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });

  const payments = new PaymentService(new DrizzlePaymentRepository(deps.db), deps.provider);
  const cashier = deps.cashier ?? new CashierService({ get: async () => null, set: async () => {} }, null);
  registerRoutes(service.app, payments, cashier);

  const relay = new OutboxRelay({ store: new DrizzleOutboxStore(deps.db), bus, log: service.app.log });
  return { service, payments, relay };
}
