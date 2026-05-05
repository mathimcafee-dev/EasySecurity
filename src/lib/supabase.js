import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LjJRTW4MzILBKhko01qXZQ_4j4gDmkM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// Email/password auth only — Google OAuth removed
export const signUp = (email, password, fullName) =>
  supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const resetPassword = (email) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })

export const updatePassword = (newPassword) =>
  supabase.auth.updateUser({ password: newPassword })

export const getCurrentUser = async () => {
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}

// Legacy — kept for compatibility but redirects to email auth
export const signInWithGoogle = () => {
  console.warn('Google OAuth removed. Use email/password.')
  return Promise.reject(new Error('Google OAuth has been disabled. Please use email/password.'))
}
