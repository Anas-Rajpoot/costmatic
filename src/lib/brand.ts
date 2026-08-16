/**
 * The name shown in the sidebar, on the login screen and in the browser tab.
 *
 * Inside the app the shop's own name (Settings → Shop Info) wins, so each
 * shop sees its own board rather than the software's. The login screen runs
 * before any session exists and cannot read settings, so it falls back to
 * VITE_APP_NAME — set that per deployment to keep one shop's name off
 * another shop's login page.
 */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME || 'Costmatic'
