import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debugging check:
console.log("Supabase URL loaded:", supabaseUrl);
console.log("Supabase Key loaded:", supabaseAnonKey ? "KEY_EXISTS" : "KEY_MISSING");

let client = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
} else {
  console.warn("Supabase environment variables are missing.");
}

export const supabase = client;