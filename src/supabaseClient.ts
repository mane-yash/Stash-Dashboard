import { createClient } from '@supabase/supabase-js';

// Get these from your Supabase Dashboard -> Project Settings -> API
const supabaseUrl = 'https://rxswplmwcfqfblfylrmy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4c3dwbG13Y2ZxZmJsZnlscm15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNDQxOSwiZXhwIjoyMDg4MTAwNDE5fQ.Qp_D3j7dcSkCd5ZuxnYtEPQErhIW7ONsAcrlhH-Lgvw';

export const supabase = createClient(supabaseUrl, supabaseKey);