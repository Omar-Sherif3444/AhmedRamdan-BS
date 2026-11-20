// Offline stand-in for the Supabase client, used only to film the app.
const chain: any = { on: () => chain, subscribe: () => chain }
export const supabase: any = {
  auth: {
    onAuthStateChange: (cb: (e: string) => void) => {
      setTimeout(() => cb('INITIAL_SESSION'))
      return { data: { subscription: { unsubscribe() {} } } }
    },
    getSession: async () => ({ data: { session: null } }),
    signOut: async () => ({}),
  },
  channel: () => chain,
  removeChannel: () => {},
}
