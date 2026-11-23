/**
 * Насколько устройство живое — по последнему выходу в сеть.
 *
 * Трафика по устройствам в этой связке нет: Remnawave для HWID отдаёт только
 * модель, ОС, IP и даты (`createdAt`, `updatedAt`), а расход считается по
 * пользователю и по нодам (Xray знает только «пользователь», не «устройство»).
 * Поэтому «активность» — это свежесть: когда устройство последний раз
 * подключалось. По ней и видно, что удалять: полоса короче и краснее — тем
 * дольше устройство молчит.
 */
export type DeviceActivityBucket = 'now' | 'week' | 'month' | 'stale' | 'never';

export interface DeviceActivity {
  readonly bucket: DeviceActivityBucket;
  /** 0..1 — длина полосы: 1 у только что подключившегося, 0.06 у молчащего. */
  readonly fraction: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Разбирает дату последнего выхода в сеть.
 *
 * Границы: сутки — «активно», неделя — «на этой неделе», месяц — «в этом
 * месяце», дальше — «давно не заходило»; пустая или битая дата — «не заходило».
 */
export function deviceActivity(
  lastSeenAt: string | null | undefined,
  now: Date = new Date(),
): DeviceActivity {
  if (lastSeenAt === null || lastSeenAt === undefined || lastSeenAt.trim().length === 0) {
    return { bucket: 'never', fraction: 0.06 };
  }
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return { bucket: 'never', fraction: 0.06 };

  const age = now.getTime() - seen;
  if (age <= DAY_MS) return { bucket: 'now', fraction: 1 };
  if (age <= 7 * DAY_MS) return { bucket: 'week', fraction: 0.7 };
  if (age <= 30 * DAY_MS) return { bucket: 'month', fraction: 0.4 };
  return { bucket: 'stale', fraction: 0.12 };
}
