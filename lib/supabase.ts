
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabaseUrl = 'https://shokvvuaminfbwhvlyob.supabase.co';
const supabaseKey = 'sb_publishable_xOB4on842Oi_BTL49umHPQ_T12BjqyU';

export const supabase = createClient(supabaseUrl, supabaseKey);
