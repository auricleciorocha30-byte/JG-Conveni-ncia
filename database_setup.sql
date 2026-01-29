-- 1. CRIAR TABELA DE CATEGORIAS
-- Adicionamos UNIQUE na coluna name para que a tabela de produtos possa referenciá-la
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. CRIAR TABELA DE PRODUTOS
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category TEXT REFERENCES categories(name) ON UPDATE CASCADE ON DELETE SET NULL,
  image TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. CRIAR TABELA DE MESAS E PEDIDOS
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY,
  status TEXT CHECK (status IN ('free', 'occupied')) DEFAULT 'free',
  current_order JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. CRIAR TABELA DE CUPONS
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  percentage NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  scope_type TEXT CHECK (scope_type IN ('all', 'category', 'product')),
  scope_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. CRIAR TABELA DE CONFIGURAÇÃO DA LOJA
CREATE TABLE IF NOT EXISTS store_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  tables_enabled BOOLEAN DEFAULT TRUE,
  delivery_enabled BOOLEAN DEFAULT TRUE,
  counter_enabled BOOLEAN DEFAULT TRUE,
  status_panel_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT one_row CHECK (id = 1)
);

-- 6. CRIAR TABELAS DE FIDELIDADE
CREATE TABLE IF NOT EXISTS loyalty_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_active BOOLEAN DEFAULT FALSE,
  spending_goal NUMERIC DEFAULT 100,
  scope_type TEXT DEFAULT 'all',
  scope_value TEXT,
  CONSTRAINT one_row_loyalty CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS loyalty_users (
  phone TEXT PRIMARY KEY,
  name TEXT,
  accumulated NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 7. INSERIR DADOS INICIAIS
INSERT INTO store_config (id, tables_enabled, delivery_enabled, counter_enabled, status_panel_enabled)
VALUES (1, true, true, true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loyalty_config (id, is_active, spending_goal, scope_type)
VALUES (1, false, 100, 'all')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name) VALUES 
('cat_1', 'Cafeteria'),
('cat_2', 'Bebidas'),
('cat_3', 'Lanches'),
('cat_4', 'Combos')
ON CONFLICT (id) DO NOTHING;

-- 8. CONFIGURAR POLÍTICAS DE ACESSO (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_users ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso público (ajustar em produção conforme necessário)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access') THEN
        CREATE POLICY "Allow All Access" ON products FOR ALL USING (true);
        CREATE POLICY "Allow All Access" ON categories FOR ALL USING (true);
        CREATE POLICY "Allow All Access" ON tables FOR ALL USING (true);
        CREATE POLICY "Allow All Access" ON store_config FOR ALL USING (true);
        CREATE POLICY "Allow All Access" ON coupons FOR ALL USING (true);
        CREATE POLICY "Allow All Access" ON loyalty_config FOR ALL USING (true);
        CREATE POLICY "Allow All Access" ON loyalty_users FOR ALL USING (true);
    END IF;
END $$;

-- 9. ATIVAR REALTIME
-- Execute estes comandos separadamente no console se houver erro de permissão no script
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE tables, products, store_config;