import * as SecureStore from "expo-secure-store";
import { createApiClient } from "../api/client.js";
import { createTokenStore } from "./secureTokenStore.js";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";

// expo-secure-store's namespace export already structurally matches the
// SecureStorageAdapter interface (getItemAsync/setItemAsync/deleteItemAsync)
// — no wrapper needed. This is the one place in the app that actually
// imports it; everything else depends on the interface (see
// secureTokenStore.ts's doc comment).
//
// Module-level singletons, outside React, because the headless notification
// task (notifications/headlessTask.ts) runs without the component tree and
// needs the same token store and client as the UI.
export const tokenStore = createTokenStore(SecureStore);
export const apiClient = createApiClient({ baseUrl: API_URL, tokenStore });
