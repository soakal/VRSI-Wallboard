import { useQuery } from '@tanstack/react-query';
import { getCalendars } from '../api/calendarApi';

export function useCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ['calendars'],
    queryFn: getCalendars,
    enabled,
    staleTime: 300000,
  });
}
