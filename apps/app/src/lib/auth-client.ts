import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL, APP_SCHEME } from "./config";

/*
 * On the phone the session is kept in the secure store and sent as a header.
 * On the website it is a normal cookie.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: "include" },
  plugins: [
    expoClient({ scheme: APP_SCHEME, storagePrefix: APP_SCHEME, storage: SecureStore }),
    emailOTPClient(),
  ],
});
