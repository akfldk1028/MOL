/**
 * Supabase Admin Client (Express backend)
 * Uses Service Role key for server-side operations (storage, auth admin).
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = { supabaseAdmin };
