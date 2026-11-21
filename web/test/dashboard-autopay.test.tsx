// @vitest-environment jsdom

/**
 * «Автосписание» на «Главной».
 *
 * Строка под карточкой подписки — единственное место, где клиент видит срок
 * следующего списания и может его отключить. Спека держит три обещания:
 * строка появляется только при живом автосписании этой подписки, отключение
 * зовёт провайдера тем же эндпоинтом, что «Способы оплаты», и удалённая
 * подписка гасит строку вместо того, чтобы предлагать отключение.
 */
import {
  defaultScheduler,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getPaymentMethods: vi.fn(),
  cancelProviderSubscription: vi.fn(),
}));
const toastApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/api-client", () => api);
vi.mock("sonner", () => ({ toast: toastApi }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined
        ? key
        : `${key}|${Object.entries(options)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(",")}`,
  }),
}));
// The dialog is Radix; the spec is about what the row promises, not about the
// portal, so it is flattened to plain elements like other dashboard specs do.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

import { SubscriptionAutopay } from "../src/features/dashboard/components/subscription-autopay";
import type { Subscription } from "../src/types/api";

const SUBSCRIPTION = {
  id: "sub_1",
  status: "ACTIVE",
  url: "https://example.test/sub",
  deviceLimit: 3,
  trafficLimit: 100,
  expiresAt: "2027-01-25T00:00:00.000Z",
  remnawaveId: "rw_1",
  plan: { name: "Свободный полет" },
} as unknown as Subscription;

const PROVIDER_SUBSCRIPTION = {
  id: "prov_1",
  gatewayType: "ANTILOPAY",
  status: "ACTIVE",
  amount: "349.00",
  currency: "RUB",
  intervalUnit: "month",
  intervalCount: 1,
  durationDays: 30,
  planName: "Свободный полет",
  subscriptionId: "sub_1",
  nextChargeAt: "2027-01-12T09:00:00.000Z",
  lastChargeAt: "2026-12-12T09:00:00.000Z",
  method: "SBP",
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle(ticks = 6): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

function text(): string {
  return container?.textContent ?? "";
}

function row(): HTMLButtonElement {
  const element = container?.querySelector<HTMLButtonElement>(
    '[data-testid="subscription-autopay"]',
  );
  if (!element) throw new Error("autopay row is not rendered");
  return element;
}

function render(subscription: Subscription | null, disabled = false): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <SubscriptionAutopay subscription={subscription} disabled={disabled} />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  api.getPaymentMethods.mockReset();
  api.cancelProviderSubscription.mockReset();
  toastApi.success.mockReset();
  api.getPaymentMethods.mockResolvedValue({
    methods: [],
    total: 0,
    providerSubscriptions: [PROVIDER_SUBSCRIPTION],
  });
  api.cancelProviderSubscription.mockResolvedValue({ cancelled: true });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  notifyManager.setScheduler(defaultScheduler);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});


describe("SubscriptionAutopay", () => {
  it("shows the next charge and the sum on the row", async () => {
    render(SUBSCRIPTION);
    await settle();

    expect(text()).toContain("dashboard.autopay.title");
    expect(text()).toContain("dashboard.autopay.onChip");
    // The row names the date and the gateway before the tap.
    expect(text()).toContain("dashboard.autopay.nextCharge|date=");
    expect(text()).toContain("gateway=AntiloPay");
    expect(text()).toContain("349");
  });

  it("cancels through the provider endpoint the «Способы оплаты» page uses", async () => {
    render(SUBSCRIPTION);
    await settle();

    await act(async () => row().click());

    expect(text()).toContain("dashboard.autopay.dialogTitle");
    expect(text()).toContain("dashboard.autopay.rowNext");

    const cancel = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "paymentMethods.providerSubscriptions.cancel",
    );
    expect(cancel).toBeTruthy();

    await act(async () => cancel?.click());
    await settle();

    expect(api.cancelProviderSubscription).toHaveBeenCalledWith("prov_1");
    expect(toastApi.success).toHaveBeenCalledWith(
      "paymentMethods.providerSubscriptions.cancelled",
    );
  });

  it("turns the row off for a deleted subscription instead of offering a cancel", async () => {
    render({ ...SUBSCRIPTION, status: "DELETED" } as Subscription);
    await settle();

    expect(row().disabled).toBe(true);
    expect(row().getAttribute("aria-disabled")).toBe("true");
    expect(text()).toContain("dashboard.autopay.unavailable");

    await act(async () => row().click());
    expect(text()).not.toContain("dashboard.autopay.dialogTitle");
  });

  it("renders nothing when the provider charges nothing for this subscription", async () => {
    api.getPaymentMethods.mockResolvedValue({ methods: [], total: 0, providerSubscriptions: [] });
    render(SUBSCRIPTION);
    await settle();

    expect(container?.querySelector('[data-testid="subscription-autopay"]')).toBeNull();
    expect(text()).toBe("");
  });
});

