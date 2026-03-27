// Shared API configuration for all Next.js proxy routes
export const API_BASE = process.env.GOODMOLT_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.MOLTBOOK_API_URL || 'https://api.goodmolt.app/api/v1';
export const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'dev-internal-secret';
