/**
 * GEM Taskade · Supabase Realtime subscriptions
 *
 * subscribeTable(table, filter, handler) returns an unsubscribe function.
 * Pass a filter string in PostgREST form e.g. `owner_id=eq.${userId}`.
 */

export function subscribeTable(sb, table, filter, handler) {
  if (!sb) return () => {};
  const channel = sb.channel(`gem:${table}:${filter || 'all'}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table, filter: filter || undefined },
      (payload) => {
        try { handler(payload); } catch (err) { console.error(`[rt ${table}]`, err); }
      },
    )
    .subscribe();
  return () => { try { sb.removeChannel(channel); } catch {} };
}
