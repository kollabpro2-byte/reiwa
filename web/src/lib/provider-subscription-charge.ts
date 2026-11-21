/**
 * Сумма и период автосписания провайдера — одна формулировка на кабинет.
 *
 * «Способы оплаты» печатали её локально, а «Главная» показывает ту же сумму
 * в строке автосписания. Расчёт вынесен сюда, чтобы две страницы не разошлись
 * в написании («349 ₽ каждый месяц»).
 */
import type { ProviderSubscription } from "@/lib/api-client/payment-methods";

type Translator = (key: string, options?: Record<string, unknown>) => string;

/** «349 ₽» — сумма без периода, для строки на «Главной». */
export function chargeAmountLabel(
  charge: Pick<ProviderSubscription, "amount" | "currency">,
): string {
  const amount = Number(charge.amount);
  const sum = Number.isFinite(amount) ? amount.toLocaleString() : charge.amount;
  return `${sum} ${charge.currency === "RUB" ? "₽" : charge.currency}`;
}

/** «349 ₽ каждый месяц» — сумма с периодом, как в «Способах оплаты». */
export function formatCharge(
  charge: Pick<ProviderSubscription, "amount" | "currency" | "intervalUnit" | "intervalCount">,
  t: Translator,
): string {
  const sum = chargeAmountLabel(charge);
  const unit = ["day", "week", "month", "year"].includes(charge.intervalUnit)
    ? charge.intervalUnit
    : null;
  if (unit === null) return sum;
  const period =
    charge.intervalCount === 1
      ? t(`paymentMethods.providerSubscriptions.everyUnit.${unit}`)
      : t(`paymentMethods.providerSubscriptions.every${unit[0]!.toUpperCase()}${unit.slice(1)}`, {
          count: charge.intervalCount,
        });
  return `${sum} ${period}`;
}
