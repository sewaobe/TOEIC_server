import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  // eslint-disable-next-line no-console
  console.warn("⚠️ Missing VAPID keys in .env");
}

webpush.setVapidDetails(
  "mailto:baonguyen02102004@gmail.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export { webpush, VAPID_PUBLIC_KEY };
