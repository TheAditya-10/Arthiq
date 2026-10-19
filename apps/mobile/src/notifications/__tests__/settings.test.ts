import { BankSmsParser } from "../providers/bankSmsParser.js";
import { NotificationProviderKey } from "@arthiq/types";
import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_VERSION,
  accountResolverFromSettings,
  defaultNotificationSettings,
  loadNotificationSettings,
  resolveEnabledPackages,
  saveNotificationSettings,
} from "../settings.js";
import { createInMemoryStorage } from "./testStorage.js";

const CONSENT = { version: DISCLOSURE_VERSION, at: "2026-10-13T00:00:00.000Z" };

describe("notification settings", () => {
  it("defaults to no providers enabled", async () => {
    const storage = createInMemoryStorage();
    expect(await loadNotificationSettings(storage)).toEqual(defaultNotificationSettings());
  });

  it("round-trips through storage", async () => {
    const storage = createInMemoryStorage();
    const settings = {
      accountByProvider: { [NotificationProviderKey.GOOGLE_PAY]: "acc-1" },
      genericPackages: ["com.somebank.app"],
      paused: false,
      consent: CONSENT,
    };
    await saveNotificationSettings(storage, settings);
    expect(await loadNotificationSettings(storage)).toEqual(settings);
  });

  it("falls back to defaults on corrupted storage rather than throwing", async () => {
    const storage = createInMemoryStorage();
    await storage.setItem("arthiq.notificationSettings.v1", "{not json");
    expect(await loadNotificationSettings(storage)).toEqual(defaultNotificationSettings());
  });

  it("resolveEnabledPackages only includes a named provider's packages once it has a mapped account", () => {
    const settings = {
      accountByProvider: { [NotificationProviderKey.PHONEPE]: "acc-1" },
      genericPackages: [],
      paused: false,
      consent: CONSENT,
    };
    const packages = resolveEnabledPackages(settings);
    expect(packages).toEqual(["com.phonepe.app"]);
  });

  it("resolveEnabledPackages includes genericPackages only once GENERIC_UPI has a mapped account", () => {
    const withoutAccount = resolveEnabledPackages({
      accountByProvider: {},
      genericPackages: ["com.somebank.app"],
      paused: false,
      consent: CONSENT,
    });
    expect(withoutAccount).toEqual([]);

    const withAccount = resolveEnabledPackages({
      accountByProvider: { [NotificationProviderKey.GENERIC_UPI]: "acc-1" },
      genericPackages: ["com.somebank.app"],
      paused: false,
      consent: CONSENT,
    });
    // GENERIC_UPI is also the "Bank SMS alerts" mapping, so it enables the
    // messaging-app packages alongside any user-added generic ones.
    expect(withAccount).toEqual([...BankSmsParser.packageNames, "com.somebank.app"]);
  });

  it("accountResolverFromSettings returns the mapped account or null", () => {
    const resolver = accountResolverFromSettings({
      accountByProvider: { [NotificationProviderKey.GOOGLE_PAY]: "acc-1" },
      genericPackages: [],
      paused: false,
      consent: CONSENT,
    });
    expect(resolver({ provider: NotificationProviderKey.GOOGLE_PAY, sourcePackage: "x" })).toBe(
      "acc-1",
    );
    expect(resolver({ provider: NotificationProviderKey.PAYTM, sourcePackage: "x" })).toBeNull();
  });

  it("reads nothing until the user has accepted the current disclosure", () => {
    const base = {
      accountByProvider: { [NotificationProviderKey.GOOGLE_PAY]: "acc-1" },
      genericPackages: [],
      paused: false,
    };
    expect(resolveEnabledPackages({ ...base, consent: null })).toEqual([]);
    expect(
      resolveEnabledPackages({ ...base, consent: { version: DISCLOSURE_VERSION - 1, at: "x" } }),
    ).toEqual([]);
    expect(resolveEnabledPackages({ ...base, consent: CONSENT }).length).toBeGreaterThan(0);
  });

  it("the master pause overrides every per-app choice", () => {
    const settings = {
      accountByProvider: { [NotificationProviderKey.GOOGLE_PAY]: "acc-1" },
      genericPackages: [],
      paused: true,
      consent: CONSENT,
    };
    expect(resolveEnabledPackages(settings)).toEqual([]);
  });

  it("loads settings saved before consent/pause existed as unconsented and unpaused", async () => {
    const storage = createInMemoryStorage();
    await storage.setItem(
      "arthiq.notificationSettings.v1",
      JSON.stringify({ accountByProvider: { GOOGLE_PAY: "acc-1" }, genericPackages: [] }),
    );
    const loaded = await loadNotificationSettings(storage);
    expect(loaded.consent).toBeNull();
    expect(loaded.paused).toBe(false);
    expect(resolveEnabledPackages(loaded)).toEqual([]);
  });
});
