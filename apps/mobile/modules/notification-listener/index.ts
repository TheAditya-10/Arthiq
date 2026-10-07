import { requireNativeModule, NativeModule, type EventSubscription } from "expo-modules-core";
import type { RawNotification } from "../../src/notifications/types.js";

type AccessStatus = "granted" | "denied" | "unknown";

interface NativeNotificationEvent {
  packageName: string;
  title: string;
  text: string;
  postTime: number;
}

type NotificationListenerEvents = {
  onNotificationPosted: (event: NativeNotificationEvent) => void;
};

declare class NativeNotificationListenerModule extends NativeModule<NotificationListenerEvents> {
  start(): void;
  stop(): void;
  setEnabledPackages(packages: string[]): void;
  getAccessStatus(): AccessStatus;
  getStatus(): ListenerStatus;
  openSettings(): void;
}

export interface ListenerStatus {
  serviceConnected: boolean;
  processingEnabled: boolean;
  allowedPackages: string;
  seenCount: number;
  forwardedCount: number;
  lastSeenPackage: string;
}

// Android-only native module. On any other platform (including the Metro
// bundler's Jest/Vitest environment) requiring it throws, so callers must go
// through the exported functions below rather than importing this directly —
// they're the only things unit-tested outside of a device/emulator.
const nativeModule = requireNativeModule<NativeNotificationListenerModule>(
  "ArthiqNotificationListener",
);

/** Enables forwarding of allow-listed notifications from native to JS. */
export function start(): void {
  nativeModule.start();
}

/** Disables forwarding without revoking the OS-level notification access grant. */
export function stop(): void {
  nativeModule.stop();
}

/** Syncs the enabled-provider package allow-list checked natively before any bridging occurs. */
export function setEnabledPackages(packages: string[]): void {
  nativeModule.setEnabledPackages(packages);
}

/** Whether the user has granted this app the special "Notification access" permission. */
export function getAccessStatus(): AccessStatus {
  return nativeModule.getAccessStatus();
}

/** Native-side counters for diagnosing why nothing is captured. */
export function getListenerStatus(): ListenerStatus {
  return nativeModule.getStatus();
}

/** Deep-links to Settings > Notifications > Notification access, since this grant has no runtime permission dialog. */
export function openSettings(): void {
  nativeModule.openSettings();
}

/** Subscribes to allow-listed notifications as they're posted. Raw text never touches disk here — see docs/MOBILE_ARCHITECTURE.md. */
export function addNotificationListener(
  listener: (notification: RawNotification) => void,
): EventSubscription {
  return nativeModule.addListener("onNotificationPosted", (event) => {
    listener({
      packageName: event.packageName,
      title: event.title,
      text: event.text,
      postTime: event.postTime,
    });
  });
}
