import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LjJRTW4MzILBKhko01qXZQ_4j4gDmkM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://easysecurity.in/monitor' }
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}
