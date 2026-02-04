
-- ... (existing tables) ...

-- 10. CRIAR TABELA DE OFERTAS DO DIA
CREATE TABLE IF NOT EXISTS daily_specials (
  day_of_week INTEGER PRIMARY KEY, -- 0 (Domingo) a 6 (Sábado)
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Habilitar RLS e Permissões
ALTER TABLE daily_specials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow All Access Specials" ON daily_specials FOR ALL USING (true);

-- Ativar Realtime para ofertas
ALTER PUBLICATION supabase_realtime ADD TABLE daily_specials;

-- Inserir registros vazios para os 7 dias
INSERT INTO daily_specials (day_of_week) 
SELECT generate_series(0,6)
ON CONFLICT (day_of_week) DO NOTHING;
