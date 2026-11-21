/**
 * SubscriptionAutopay
 * ───────────────────
 * «Автосписание» одной строкой под карточкой подписки: срок следующего
 * списания виден сразу, кнопка «Отключить» — в диалоге по нажатию.
 *
 * Почему строкой под карточкой, а не пятой плиткой в ряду действий: плитки
 * отвечают на «что сделать с подпиской», эта строка — про деньги, и в ряду
 * уже четыре плитки, на узком экране пятая ломает сетку.
 *
 * Строка существует только когда провайдер действительно ведёт автосписание
 * по ЭТОЙ подписке (`providerSubscriptions` из `GET /payment-methods`) —
 * иначе клиенту нечего отключать. Пока идёт удаление подписки (`disabled`)
 * или подписка уже не активна, строка гаснет и не нажимается: списывать
 * нечего (владелец, 22.11.2026).
 *
 * Цвета — брендовые (`--brand-ink`, `--brand-foreground`), чтобы строка
 * совпадала с карточкой тарифа у любого оператора, а не с палитрой макета.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Lock, Repeat2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StadiumButton } from "@/components/ui/stadium-button";
import {
  cancelProviderSubscription,
  getPaymentMethods,
  type ProviderSubscription,
} from "@/lib/api-client";
import { gatewayLabel } from "@/lib/gateway-display";
import { useOperatorTimeZone } from "@/lib/operator-time-zone";
import { chargeAmountLabel, formatCharge } from "@/lib/provider-subscription-charge";
import { cn, formatDate } from "@/lib/utils";
import type { Subscription } from "@/types/api";

/** Statuses of a provider-side autopay that still charges the customer. */
const LIVE_STATUSES: ReadonlySet<ProviderSubscription["status"]> = new Set(["ACTIVE", "PAST_DUE"]);

/** How the provider takes the money, where it names the method. */
function methodLabel(provider: ProviderSubscription, t: (key: string) => string): string | null {
  if (provider.method === "SBP") return t("paymentMethods.types.sbp");
  if (provider.method === "CARD") return t("paymentMethods.types.bank_card");
  return null;
}

export function SubscriptionAutopay({
  subscription,
  disabled,
}: {
  subscription: Subscription | null;
  /** A transient presentation (deletion) owns the card — so does the row. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const dateZone = useOperatorTimeZone();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // The same query «Способы оплаты» already make: one answer feeds both pages.
  const { data } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: getPaymentMethods,
    enabled: subscription !== null,
    staleTime: 30_000,
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: (providerSubscriptionId: string) => cancelProviderSubscription(providerSubscriptionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      toast.success(t("paymentMethods.providerSubscriptions.cancelled"));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setOpen(false);
    },
    // Nothing was cancelled (the provider may be unreachable): the row stays,
    // and so does the button.
    onError: () => toast.error(t("paymentMethods.providerSubscriptions.cancelError")),
  });

  const provider = (data?.providerSubscriptions ?? []).find(
    (candidate) =>
      subscription !== null &&
      candidate.subscriptionId === subscription.id &&
      LIVE_STATUSES.has(candidate.status),
  );

  if (subscription === null || provider === undefined) return null;

  const inactive = disabled === true || subscription.status !== "ACTIVE";
  const pastDue = provider.status === "PAST_DUE";
  const method = methodLabel(provider, t);
  const gateway = gatewayLabel(provider.gatewayType);
  const nextCharge = provider.nextChargeAt ? formatDate(provider.nextChargeAt, dateZone) : null;
  const endsAt = subscription.expiresAt ? formatDate(subscription.expiresAt, dateZone) : null;

  const chip = inactive
    ? t("dashboard.autopay.unavailableChip")
    : pastDue
      ? t("dashboard.autopay.pastDueChip")
      : t("dashboard.autopay.onChip");

  const secondLine = inactive
    ? t("dashboard.autopay.unavailable")
    : pastDue
      ? t("paymentMethods.providerSubscriptions.pastDue")
      : nextCharge
        ? t("dashboard.autopay.nextCharge", { date: nextCharge, gateway })
        : method
          ? t("paymentMethods.providerSubscriptions.via")
          : t("dashboard.autopay.noNext");

  return (
    <div className="px-5 pt-3">
      <button
        type="button"
        data-testid="subscription-autopay"
        aria-disabled={inactive}
        disabled={inactive}
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
          inactive
            ? "cursor-default border-dashed border-[var(--color-border-soft)] bg-[var(--color-surface)] opacity-70"
            : "border-(--brand-ink)/30 bg-(--brand-ink)/10 hover:border-(--brand-ink)/50 active:scale-[0.995]",
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            inactive
              ? "border-[var(--color-border-soft)] text-[var(--brand-muted-foreground)]"
              : "border-(--brand-ink)/25 bg-(--brand-ink)/15 text-(--brand-ink)",
          )}
        >
          <Repeat2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-semibold",
                inactive
                  ? "text-[var(--brand-muted-foreground)]"
                  : "text-[var(--brand-foreground)]",
              )}
            >
              {t("dashboard.autopay.title")}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                inactive
                  ? "bg-white/5 text-[var(--brand-muted-foreground)]"
                  : pastDue
                    ? "bg-amber-500/15 text-amber-300"
                    : "bg-(--brand-ink)/15 text-(--brand-ink)",
              )}
            >
              {chip}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--brand-muted-foreground)]">
            {secondLine}
          </span>
        </span>
        {inactive ? (
          <Lock className="h-4 w-4 shrink-0 text-[var(--brand-muted-foreground)]" />
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-[var(--brand-muted-foreground)]">
            <span className="text-xs font-semibold text-[var(--brand-foreground)]">
              {chargeAmountLabel(provider)}
            </span>
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </button>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-(--brand-ink)/15 text-(--brand-ink)">
              <Repeat2 className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">{t("dashboard.autopay.dialogTitle")}</DialogTitle>
            <DialogDescription className="text-center">
              {t("dashboard.autopay.dialogSub", {
                plan: subscription.plan?.name ?? t("subscription.planFallback"),
              })}
            </DialogDescription>
          </DialogHeader>

          <dl className="mt-2 divide-y divide-[var(--color-border-soft)] border-y border-[var(--color-border-soft)] text-sm">
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[var(--brand-muted-foreground)]">
                {t("dashboard.autopay.rowNext")}
              </dt>
              <dd className="text-right font-semibold text-[var(--brand-foreground)]">
                {nextCharge ?? t("dashboard.autopay.noNext")}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[var(--brand-muted-foreground)]">
                {t("dashboard.autopay.rowAmount")}
              </dt>
              <dd className="text-right font-semibold text-[var(--brand-foreground)]">
                {formatCharge(provider, t)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[var(--brand-muted-foreground)]">
                {t("dashboard.autopay.rowMethod")}
              </dt>
              <dd className="text-right font-semibold text-[var(--brand-foreground)]">
                {method === null ? gateway : `${method} · ${gateway}`}
              </dd>
            </div>
            {provider.endsAt ? (
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="text-[var(--brand-muted-foreground)]">
                  {t("dashboard.autopay.rowEnds")}
                </dt>
                <dd className="text-right font-semibold text-[var(--brand-foreground)]">
                  {formatDate(provider.endsAt, dateZone)}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-2.5 text-[11px] leading-snug text-[var(--brand-muted-foreground)]">
            {endsAt
              ? t("dashboard.autopay.note", { date: endsAt })
              : t("dashboard.autopay.noteNoDate")}
          </p>

          <div className="mt-3 flex gap-2">
            <StadiumButton
              variant="ghost"
              className="flex-1"
              disabled={cancelMutation.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common.close")}
            </StadiumButton>
            <StadiumButton
              className="flex-1 bg-red-600 hover:bg-red-500"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(provider.id)}
            >
              {cancelMutation.isPending
                ? t("paymentMethods.providerSubscriptions.cancelling")
                : t("paymentMethods.providerSubscriptions.cancel")}
            </StadiumButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

