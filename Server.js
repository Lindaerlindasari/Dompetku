const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Gagal terhubung ke database SQLite:', err.message);
    } else {
        console.log('Terhubung ke database SQLite.');
    }
});

// Buat Tabel (Users, Transactions, Budgets)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        category TEXT,
        amount REAL,
        description TEXT,
        date TEXT,
        month TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        category TEXT,
        amount REAL,
        month TEXT,
        UNIQUE(user_id, category, month)
    )`);
});

// --- API AUTHENTICATION ---
// Register Akun
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi!' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                return res.status(400).json({ error: 'Username sudah digunakan!' });
            }
            res.json({ success: true, userId: this.lastID, username });
        });
    } catch (e) {
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});

// Login Akun
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'Username atau password salah!' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            res.json({ success: true, userId: user.id, username: user.username });
        } else {
            res.status(400).json({ error: 'Username atau password salah!' });
        }
    });
});

// --- API TRANSAKSI & BUDGET (Berdasarkan User & Bulan) ---
// Ambil Data Berdasarkan User dan Bulan (Format Bulan: "YYYY-MM")
app.get('/api/data', (req, res) => {
    const { userId, month } = req.query;
    if (!userId || !month) return res.status(400).json({ error: 'Parameter tidak lengkap' });

    db.all(`SELECT * FROM transactions WHERE user_id = ? AND month = ?`, [userId, month], (err, transactions) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(`SELECT category, amount FROM budgets WHERE user_id = ? AND month = ?`, [userId, month], (err, budgetRows) => {
            if (err) return res.status(500).json({ error: err.message });

            const budgets = {
                "Primer": 0,
                "Tersier": 0,
                "Tabungan dan Dana Darurat": 0,
                "Dan Lain-lain": 0
            };
            budgetRows.forEach(b => {
                budgets[b.category] = b.amount;
            });

            res.json({ transactions, budgets });
        });
    });
});

// Tambah Transaksi
app.post('/api/transactions', (req, res) => {
    const { userId, type, category, amount, description, date, month } = req.body;
    db.run(
        `INSERT INTO transactions (user_id, type, category, amount, description, date, month) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, type, category, amount, description, date, month],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Hapus Transaksi
app.delete('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM transactions WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Set / Atur Budget Bulanan
app.post('/api/budgets', (req, res) => {
    const { userId, category, amount, month } = req.body;
    db.run(
        `INSERT INTO budgets (user_id, category, amount, month) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, category, month) DO UPDATE SET amount = ?`,
        [userId, category, amount, month, amount],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Hapus/Reset Budget Kategori Bulanan
app.delete('/api/budgets', (req, res) => {
    const { userId, category, month } = req.body;
    db.run(`DELETE FROM budgets WHERE user_id = ? AND category = ? AND month = ?`, [userId, category, month], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
