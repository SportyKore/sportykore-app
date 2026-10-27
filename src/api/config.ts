/**
 * Prefer `EXPO_PUBLIC_API_URL` (e.g. http://YOUR_LAN_IP:3333 from a physical device).
 * Android emulator reaches host machine via `adb reverse tcp:3333 tcp:3333` if using 127.0.0.1.
 */
export const API_BASE_URL = "https://backend.sportykore.com"
// export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://backend.sportykore.com"

