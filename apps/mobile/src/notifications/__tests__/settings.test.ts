import { NotificationProviderKey } from "@arthiq/types";
import { describe, expect, it } from "vitest";
import {
  accountResolverFromSettings,
  defaultNotificationSettings,
  loadNotificationSettings,
  resolveEnabledPackages,
  saveNotificationSettings,
} from "../settings.js";
import { createInMemoryStorage } from "./testStorage.js";

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
    };
    const packages = resolveEnabledPackages(settings);
    expect(packages).toEqual(["com.phonepe.app"]);
  });

  it("resolveEnabledPackages includes genericPackages only once GENERIC_UPI has a mapped account", () => {
    const withoutAccount = resolveEnabledPackages({
      accountByProvider: {},
      genericPackages: ["com.somebank.app"],
    });
    expect(withoutAccount).toEqual([]);

    const withAccount = resolveEnabledPackages({
      accountByProvider: { [NotificationProviderKey.GENERIC_UPI]: "acc-1" },
      genericPackages: ["com.somebank.app"],
    });
    expect(withAccount).toEqual(["com.somebank.app"]);
  });

  it("accountResolverFromSettings returns the mapped account or null", () => {
    const resolver = accountResolverFromSettings({
      accountByProvider: { [NotificationProviderKey.GOOGLE_PAY]: "acc-1" },
      genericPackages: [],
    });
    expect(resolver({ provider: NotificationProviderKey.GOOGLE_PAY, sourcePackage: "x" })).toBe(
      "acc-1",
    );
    expect(resolver({ provider: NotificationProviderKey.PAYTM, sourcePackage: "x" })).toBeNull();
  });
});
