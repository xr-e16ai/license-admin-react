// Matches LicenseCode.GeneratorAlphabet in the Unity project: no I, L, O, 0 or 1, so a
// generated code has no lookalike pairs to misread off a screen.
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const GENERATED_LENGTH = 12;
export const GROUP = 4;

/**
 * One random code. crypto.getRandomValues is rejection-sampled onto the alphabet:
 * taking a raw byte modulo 31 would quietly favour the start of the alphabet.
 */
export function generateCode() {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let body = "";

  while (body.length < GENERATED_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_LENGTH));
    for (const byte of bytes) {
      if (byte < limit && body.length < GENERATED_LENGTH) {
        body += ALPHABET[byte % ALPHABET.length];
      }
    }
  }

  return body.match(new RegExp(`.{1,${GROUP}}`, "g")).join("-");
}

/** Same normalizing the Unity app does, so what is created is what can be typed. */
export function normalizeCode(raw) {
  const code = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9_-]{4,48}$/.test(code) ? code : "";
}

export function describeMinutes(minutes) {
  if (!minutes) return "-";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${+(minutes / 60).toFixed(1)}h`;
  if (minutes < 43200) return `${+(minutes / 1440).toFixed(1)}d`;
  return `${+(minutes / 43200).toFixed(1)}mo`;
}

/** A Date if the field holds a Firestore Timestamp, otherwise null. */
export function asDate(value) {
  return value && typeof value.toDate === "function" ? value.toDate() : null;
}

export function formatDeviceValue(key, value) {
  if (value === null || value === undefined || value === "") return "-";

  const date = asDate(value);
  if (date) return date.toLocaleString();

  // Unity reports memory in whole megabytes; GB is what the machine is sold as.
  if (key === "ramMb" && typeof value === "number" && value > 0) {
    return `${value} MB (${(value / 1024).toFixed(1)} GB)`;
  }

  return String(value);
}

/** Android reports a version; desktop leaves it "n/a" and the OS string says more. */
export function describePlatform(data) {
  const android = data.androidVersion && data.androidVersion !== "n/a"
    ? `Android ${data.androidVersion}`
    : "";
  return android || data.operatingSystem || data.manufacturer || "-";
}

export function matchesDevice(row, needle) {
  const d = row.data;
  return [
    d.username, d.email, d.deviceUid, d.deviceName, d.deviceModel, d.manufacturer,
    d.brand, d.operatingSystem, d.androidVersion, d.appVersion, d.publicIp, row.uid,
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

export function describeError(e, partial) {
  const prefix = partial ? `Stopped after ${partial} code(s): ` : "";

  if (e && e.code === "permission-denied") {
    return prefix + "Permission denied. This account is not in the admins collection, " +
           "or the published rules are out of date.";
  }

  if (e && e.code === "unavailable") {
    return prefix + "Could not reach Firestore. Check the connection and try again.";
  }

  console.error(e);
  return prefix + (e && e.message ? e.message : "Something went wrong.");
}

export function describeSignInError(e) {
  switch (e && e.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "That is not a valid email address.";
    case "auth/user-disabled":
      return "That account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a few minutes.";
    case "auth/network-request-failed":
      return "No connection to Firebase.";
    default:
      console.error(e);
      return e && e.message ? e.message : "Sign-in failed.";
  }
}

/**
 * Every field the Unity app writes to a device document, in the order an administrator
 * wants to read them. Mirrors FirestoreValue.BuildDeviceFields in the Unity project.
 * A field the app starts writing later still appears - see the leftovers pass in
 * DeviceDetails - so this list never silently hides anything.
 */
export const DEVICE_FIELDS = [
  ["username", "Username"],
  ["email", "Account email"],
  ["firebaseUid", "Firebase UID"],
  ["deviceUid", "Device unique id"],
  ["deviceName", "Device name"],
  ["deviceModel", "Model"],
  ["manufacturer", "Manufacturer"],
  ["brand", "Brand"],
  ["androidVersion", "Android version"],
  ["operatingSystem", "Operating system"],
  ["cpu", "CPU"],
  ["cpuCores", "CPU cores"],
  ["ramMb", "Memory"],
  ["gpu", "GPU"],
  ["screenResolution", "Screen"],
  ["appVersion", "App version"],
  ["language", "Language"],
  ["timeZone", "Time zone"],
  ["publicIp", "Public IP"],
  ["registeredAt", "First registered"],
  ["lastLoginAt", "Last login"],
  ["loginCount", "Logins"],
];

// Sorting by this instead of alphabetically puts used codes on top, then the still-
// spendable ones, then revoked at the bottom - no matter how long the list gets.
export const CODE_STATE_ORDER = { used: 0, unused: 1, revoked: 2 };
