-- La función del trigger no debe poder llamarse por la API (solo la usa el trigger)
revoke execute on function public.log_watch_events() from anon, authenticated, public;
