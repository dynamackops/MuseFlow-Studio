"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export const ALLOWED_EMAIL = "jasminegm100@gmail.com";

export const supabaseBrowser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
