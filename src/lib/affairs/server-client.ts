import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
// React render-request scope only. No query/session result or cross-user cache.
export const getAffairsServerClient=cache(createClient);
