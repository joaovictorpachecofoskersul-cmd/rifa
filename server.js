const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('views'));

// ============================================
// BANCO DE DADOS SQLITE
// ============================================
const db = new sqlite3.Database('rifa.db');

// Criar tabelas
db.serialize(() => {
  // Tabela de números
  db.run(`
    CREATE TABLE IF NOT EXISTS numeros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER UNIQUE,
      status TEXT DEFAULT 'disponivel',
      comprador_nome TEXT,
      comprador_telefone TEXT,
      comprador_email TEXT,
      comprovante_codigo TEXT,
      data_reserva DATETIME,
      data_confirmacao DATETIME
    )
  `);

  // Tabela de vendas
  db.run(`
    CREATE TABLE IF NOT EXISTS vendas (
      id TEXT PRIMARY KEY,
      numero INTEGER,
      nome TEXT,
      telefone TEXT,
      email TEXT,
      comprovante_codigo TEXT,
      qr_code TEXT,
      status_pagamento TEXT DEFAULT 'pendente',
      valor_pago REAL,
      data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_pagamento DATETIME
    )
  `);

  // Inicializar números 1 a 100
  for (let i = 1; i <= 100; i++) {
    db.run(`INSERT OR IGNORE INTO numeros (numero, status) VALUES (?, 'disponivel')`, [i]);
  }
});

// ============================================
// ROTAS PÚBLICAS
// ============================================

app.get('/api/numeros', (req, res) => {
  db.all(`SELECT numero, status FROM numeros ORDER BY numero`, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/reservar', async (req, res) => {
  const { numero, nome, telefone, email } = req.body;

  if (!numero || !nome || !telefone || !email) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  db.get(`SELECT status FROM numeros WHERE numero = ?`, [numero], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row || row.status !== 'disponivel') {
      return res.status(400).json({ error: 'Número já reservado ou vendido' });
    }

    const comprovanteId = uuidv4();
    const comprovanteCodigo = `RIFA-${numero}-${comprovanteId.slice(0, 8)}`.toUpperCase();
    const qrCodeDataUrl = await QRCode.toDataURL(comprovanteCodigo);
    
    db.serialize(() => {
      db.run(`BEGIN TRANSACTION`);
      
      db.run(`
        UPDATE numeros 
        SET status = 'reservado',
            comprador_nome = ?,
            comprador_telefone = ?,
            comprador_email = ?,
            comprovante_codigo = ?,
            data_reserva = CURRENT_TIMESTAMP
        WHERE numero = ?
      `, [nome, telefone, email, comprovanteCodigo, numero]);
      
      db.run(`
        INSERT INTO vendas (id, numero, nome, telefone, email, comprovante_codigo, qr_code, valor_pago, status_pagamento)
        VALUES (?, ?, ?, ?, ?, ?, ?, 10.00, 'pendente')
      `, [comprovanteId, numero, nome, telefone, email, comprovanteCodigo, qrCodeDataUrl]);
      
      db.run(`COMMIT`, (err) => {
        if (err) {
          db.run(`ROLLBACK`);
          return res.status(500).json({ error: 'Erro ao processar reserva' });
        }
        
        res.json({
          success: true,
          comprovante: comprovanteCodigo,
          qrCode: qrCodeDataUrl,
          numero: numero,
          valor: 10.00,
          chave_pix: 'admin@rifa.com',
          data: new Date().toISOString()
        });
      });
    });
  });
});

// ============================================
// ROTAS ADMIN
// ============================================

app.get('/api/admin/dashboard', (req, res) => {
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM numeros WHERE status = 'disponivel') as disponiveis,
      (SELECT COUNT(*) FROM numeros WHERE status = 'reservado') as reservados,
      (SELECT COUNT(*) FROM numeros WHERE status = 'pago') as pagos,
      (SELECT COUNT(*) FROM vendas WHERE status_pagamento = 'pendente') as pendentes,
      (SELECT COUNT(*) FROM vendas WHERE status_pagamento = 'confirmado') as confirmados,
      (SELECT COALESCE(SUM(valor_pago), 0) FROM vendas WHERE status_pagamento = 'confirmado') as total_arrecadado
  `, (err, stats) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(stats);
  });
});

app.get('/api/admin/vendas', (req, res) => {
  db.all(`
    SELECT v.*, n.status as numero_status
    FROM vendas v
    JOIN numeros n ON v.numero = n.numero
    WHERE v.status_pagamento = 'pendente'
    ORDER BY v.data_pedido DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/confirmar-pagamento', (req, res) => {
  const { venda_id, numero } = req.body;
  
  db.serialize(() => {
    db.run(`BEGIN TRANSACTION`);
    db.run(`UPDATE vendas SET status_pagamento = 'confirmado', data_pagamento = CURRENT_TIMESTAMP WHERE id = ?`, [venda_id]);
    db.run(`UPDATE numeros SET status = 'pago', data_confirmacao = CURRENT_TIMESTAMP WHERE numero = ?`, [numero]);
    db.run(`COMMIT`, (err) => {
      if (err) { db.run(`ROLLBACK`); return res.status(500).json({ error: 'Erro ao confirmar pagamento' }); }
      res.json({ success: true });
    });
  });
});

app.post('/api/admin/cancelar-venda', (req, res) => {
  const { venda_id, numero } = req.body;
  
  db.serialize(() => {
    db.run(`BEGIN TRANSACTION`);
    db.run(`UPDATE vendas SET status_pagamento = 'cancelado' WHERE id = ?`, [venda_id]);
    db.run(`UPDATE numeros SET status = 'disponivel', comprador_nome = NULL, comprador_telefone = NULL, comprador_email = NULL, comprovante_codigo = NULL, data_reserva = NULL WHERE numero = ?`, [numero]);
    db.run(`COMMIT`, (err) => {
      if (err) { db.run(`ROLLBACK`); return res.status(500).json({ error: 'Erro ao cancelar venda' }); }
      res.json({ success: true });
    });
  });
});

// ============================================
// SERVIDOR ESTÁTICO
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 SISTEMA DE RIFA - SERVIDOR RODANDO');
  console.log('='.repeat(50));
  console.log(`📱 Site do Cliente: http://localhost:${PORT}`);
  console.log(`👨‍💼 Painel Admin: http://localhost:${PORT}/admin`);
  console.log('='.repeat(50));
});

process.on('SIGINT', () => {
  console.log('\n📴 Encerrando servidor...');
  db.close(() => process.exit(0));
});
