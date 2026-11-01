import { createI18n } from "@t3tools/client-runtime/i18n";
import { describe, expect, it, vi } from "vite-plus/test";

import { formatDayAwareTimestamp, formatUpcomingTimestamp } from "~/timestampFormat";

function hostLocale(locale: string) {
  vi.resetModules();
  vi.stubGlobal("window", { desktopBridge: { getSystemLocale: () => locale } });
  return {
    [Symbol.dispose]() {
      vi.unstubAllGlobals();
      vi.resetModules();
    },
  };
}

describe("interface timestamp formatting", () => {
  it.each([
    ["en-US-u-hc-h23", "US", 0, false],
    ["de-DE-u-hc-h12", "DE", 1, true],
  ] as const)(
    "keeps regional preferences from the desktop system locale %s",
    async (locale, region, firstDay, hour12) => {
      using _host = hostLocale(locale);
      const format = await import("~/timestampFormat");
      for (const language of ["en", "de"] as const) {
        const displayLocale = new Intl.Locale(format.interfaceDateLocale(language));
        expect(displayLocale.language).toBe(language);
        expect(displayLocale.region).toBe(region);
        expect(displayLocale.hourCycle).toBe(hour12 ? "h12" : "h23");
      }
      expect(format.weekStartsOn).toBe(firstDay);
      expect(format.resolveHour12("locale")).toBe(hour12);
      expect(format.resolveHour12("12-hour")).toBe(true);
      expect(format.resolveHour12("24-hour")).toBe(false);
      expect(() => format.interfaceDateLocale("fr")).toThrow("Unsupported interface language");
    },
  );

  it("localizes month names and ordinals while retaining time format overrides", async () => {
    using _host = hostLocale("en-US-u-ca-islamic-hc-h23");
    const format = await import("~/timestampFormat");
    const instance = createI18n("en");
    const t = instance.getFixedT(null, "common");
    for (const [day, ordinal] of [
      [1, "1st"],
      [2, "2nd"],
      [3, "3rd"],
      [4, "4th"],
      [11, "11th"],
      [12, "12th"],
      [13, "13th"],
      [21, "21st"],
      [22, "22nd"],
      [23, "23rd"],
    ] as const) {
      const date = new Date(2026, 5, day, 17, 30).toISOString();
      expect(format.formatChatTimestampTooltip(date, "24-hour", t, "en")).toBe(
        `17:30, ${ordinal} June 2026`,
      );
    }
    const date = new Date(2026, 5, 2, 17, 30).toISOString();
    expect(format.formatChatTimestampTooltip(date, "12-hour", t, "en")).toBe(
      "5:30 PM, 2nd June 2026",
    );
    await instance.changeLanguage("de");
    expect(format.formatChatTimestampTooltip(date, "24-hour", t, "de")).toBe("17:30, 2. Juni 2026");
    expect(format.formatShortTimestamp(date, "24-hour")).toBe("17:30");
    await instance.changeLanguage("en");
    expect(format.formatChatTimestampTooltip(date, "24-hour", t, "en")).toBe(
      "17:30, 2nd June 2026",
    );
  });

  it("translates whole relative labels without changing day boundaries or elapsed precision", async () => {
    using _host = hostLocale("en-US-u-hc-h23");
    const format = await import("~/timestampFormat");
    const instance = createI18n("en");
    const t = instance.getFixedT(null, "common");
    const now = new Date(2026, 5, 3, 12).getTime();
    const yesterday = new Date(2026, 5, 2, 17, 30).toISOString();
    const tomorrow = new Date(2026, 5, 4, 17, 30).toISOString();
    expect(format.formatDayAwareTimestamp(yesterday, "24-hour", t, now)).toBe("yesterday at 17:30");
    expect(format.formatUpcomingTimestamp(tomorrow, "24-hour", t, now)).toBe("tomorrow at 17:30");
    expect(
      [0, 60_000, 3_600_000, 86_400_000].map((value) => format.formatRelativeElapsed(value, t)),
    ).toEqual(["just now", "1m ago", "1h ago", "1d ago"]);
    const minuteAgo = new Date(now - 60_000).toISOString();
    expect(format.formatCompactRelativeTimeLabel(minuteAgo, t, now)).toBe("1m");
    await instance.changeLanguage("de");
    expect(format.formatDayAwareTimestamp(yesterday, "24-hour", t, now)).toBe("gestern um 17:30");
    expect(format.formatUpcomingTimestamp(tomorrow, "24-hour", t, now)).toBe("morgen um 17:30");
    expect(
      [0, 60_000, 3_600_000, 86_400_000].map((value) => format.formatRelativeElapsed(value, t)),
    ).toEqual(["gerade eben", "vor 1 Min.", "vor 1 Std.", "vor 1 T."]);
    expect(format.formatCompactRelativeTimeLabel(minuteAgo, t, now)).toBe("1 Min.");
    expect(format.relativeTimeElapsedMs(new Date(now - 119_999).toISOString(), now)).toBe(60_000);
    expect(format.msUntilRelativeTimeChange(new Date(now - 119_999).toISOString(), now)).toBe(1);
  });

  it("retains compact expiry precision and localizes the complete sentence", async () => {
    using _host = hostLocale("en-US-u-hc-h23");
    const format = await import("~/timestampFormat");
    const instance = createI18n("en");
    const t = instance.getFixedT(null, "common");
    const now = new Date(2026, 5, 3, 12).getTime();
    for (const [seconds, expected] of [
      [0, "Expired"],
      [1, "Expires in a moment"],
      [5, "Expires in 5s"],
      [60, "Expires in 1m"],
      [61, "Expires in 1m 1s"],
      [3600, "Expires in 1h"],
      [3601, "Expires in 1h 1s"],
      [3660, "Expires in 1h 1m"],
      [3661, "Expires in 1h 1m 1s"],
      [86400, "Expires in 1d"],
      [86401, "Expires in 1d 1s"],
      [86460, "Expires in 1d 1m"],
      [86461, "Expires in 1d 1m 1s"],
      [90000, "Expires in 1d 1h"],
      [90001, "Expires in 1d 1h 1s"],
      [90060, "Expires in 1d 1h 1m"],
      [90061, "Expires in 1d 1h 1m 1s"],
    ] as const) {
      expect(
        format.formatExpiresInLabel(new Date(now + seconds * 1000).toISOString(), t, now),
      ).toBe(expected);
    }
    await instance.changeLanguage("de");
    expect(format.formatExpiresInLabel(new Date(now + 3661_000).toISOString(), t, now)).toBe(
      "Läuft in 1 Std. 1 Min. 1 Sek. ab",
    );
  });
});

describe("timestamps in an explicit time zone", () => {
  // 23:00 UTC on July 1 is 7 PM on July 1 in New York, whatever the host zone.
  const now = Date.parse("2026-07-01T23:00:00.000Z");
  const zone = "America/New_York";
  const t = createI18n("en").getFixedT(null, "common");

  it("picks relative days from the calendar in that zone", () => {
    expect(
      formatUpcomingTimestamp("2026-07-02T00:30:00.000Z", "12-hour", t, now, zone),
    ).not.toMatch(/tomorrow/);
    expect(formatUpcomingTimestamp("2026-07-02T05:30:00.000Z", "12-hour", t, now, zone)).toMatch(
      /^tomorrow at /,
    );
    expect(formatDayAwareTimestamp("2026-07-01T03:30:00.000Z", "12-hour", t, now, zone)).toMatch(
      /^yesterday at /,
    );
  });
});
