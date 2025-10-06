export const ADMIN_ROLES = {
  SUPER_ADMIN: "super-admin",
  ADMIN: "admin",
  EDITOR: "editor",
};

export const USER_PLANS = {
  FREE: "free",
  PREMIUM: "premium",
};

export const CONTENT_TYPES = {
  MOVIE: "movie",
  SERIES: "series",
};

export const CONTENT_CATEGORIES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Kids",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
];

export const SUBTITLE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "jp", label: "日本語" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
];

export const SUPPORTED_SUBTITLE_TYPES = ["text/vtt", "text/plain", "application/x-subrip"];

export const ADMIN_NAVIGATION = [
  {
    href: "/",
    label: "Dashboard",
    short: "Dash",
    title: "Dashboard Utama",
    description: "Ringkasan performa harian",
    icon: "📊",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR],
  },
  {
    href: "/content",
    label: "Konten",
    short: "Konten",
    title: "Manajemen Konten",
    description: "Kelola movie & series",
    icon: "🎬",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR],
  },
  {
    href: "/upload",
    label: "Upload",
    short: "Upload",
    title: "Upload & Metadata",
    description: "Tambah movie atau series baru",
    icon: "⬆️",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR],
  },
  {
    href: "/analytics",
    label: "Analytics",
    short: "Analitik",
    title: "Statistik Platform",
    description: "Analitik performa konten dan pengguna",
    icon: "📈",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN],
  },
  {
    href: "/users",
    label: "Pengguna",
    short: "User",
    title: "Pengelolaan Pengguna",
    description: "Kelola role, status, dan langganan",
    icon: "🧑‍🤝‍🧑",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN],
  },
  {
    href: "/logs",
    label: "Audit Log",
    short: "Log",
    title: "Riwayat Aksi Admin",
    description: "Pantau aktivitas admin",
    icon: "🗂️",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN],
  },
  {
    href: "/notifications",
    label: "Notifikasi",
    short: "Notif",
    title: "Notifikasi & Alert",
    description: "Status sistem dan alert penting",
    icon: "🔔",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR],
  },
  {
    href: "/settings",
    label: "Pengaturan",
    short: "Setting",
    title: "Konfigurasi Platform",
    description: "Kategori, banner, integrasi API",
    icon: "⚙️",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN],
  },
  {
    href: "/tools",
    label: "Tools",
    short: "Tools",
    title: "Export & Import",
    description: "Backup, export, dan import data",
    icon: "🧰",
    roles: [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN],
  },
];

export const FIRESTORE_COLLECTIONS = {
  MOVIES: "movies",
  SERIES: "series",
  ANALYTICS: "kstream-analytics",
  AUDIT_LOGS: "kstream-audit-logs",
  NOTIFICATIONS: "kstream-notifications",
  SETTINGS: "kstream-settings",
  ADMIN_USERS: "users",
};

export const ALERT_TYPES = {
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  INFO: "info",
};

export const EXPORT_TYPES = {
  MOVIES: "movies",
  SERIES: "series",
  CONTENT: "content",
  USERS: "users",
  ANALYTICS: "analytics",
};

// Role pelanggan (end-user) untuk gating langganan di Firestore rules
export const CUSTOMER_ROLE = "pelanggan";
