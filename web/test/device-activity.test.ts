import { describe, expect, it } from 'vitest'

import { deviceActivity } from '../src/lib/device-activity'

/**
 * Линия активности устройства: трафика по устройствам в связке нет (Remnawave
 * для HWID его не отдаёт), поэтому показываем свежесть последнего подключения.
 * Границы важны: по ним клиент решает, какое устройство удалить.
 */
const NOW = new Date('2026-11-22T12:00:00.000Z')

describe('deviceActivity', () => {
  it('сутки и свежее — «активно», полоса во всю ширину', () => {
    expect(deviceActivity('2026-11-22T11:59:00.000Z', NOW)).toEqual({ bucket: 'now', fraction: 1 })
    expect(deviceActivity('2026-11-21T12:00:00.000Z', NOW)).toEqual({ bucket: 'now', fraction: 1 })
  })

  it('до недели — «на этой неделе»', () => {
    expect(deviceActivity('2026-11-21T11:59:00.000Z', NOW)).toEqual({ bucket: 'week', fraction: 0.7 })
    expect(deviceActivity('2026-11-15T12:00:00.000Z', NOW)).toEqual({ bucket: 'week', fraction: 0.7 })
  })

  it('до месяца — «в этом месяце»', () => {
    expect(deviceActivity('2026-11-15T11:59:00.000Z', NOW)).toEqual({ bucket: 'month', fraction: 0.4 })
    expect(deviceActivity('2026-10-23T12:00:00.000Z', NOW)).toEqual({ bucket: 'month', fraction: 0.4 })
  })

  it('старше месяца — «давно не заходило», полоса короткая', () => {
    expect(deviceActivity('2026-10-23T11:59:00.000Z', NOW)).toEqual({ bucket: 'stale', fraction: 0.12 })
    expect(deviceActivity('2025-01-01T00:00:00.000Z', NOW)).toEqual({ bucket: 'stale', fraction: 0.12 })
  })

  it('пустая или битая дата — «не заходило»', () => {
    expect(deviceActivity(null, NOW)).toEqual({ bucket: 'never', fraction: 0.06 })
    expect(deviceActivity(undefined, NOW)).toEqual({ bucket: 'never', fraction: 0.06 })
    expect(deviceActivity('', NOW)).toEqual({ bucket: 'never', fraction: 0.06 })
    expect(deviceActivity('не дата', NOW)).toEqual({ bucket: 'never', fraction: 0.06 })
  })
})
