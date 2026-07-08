import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to read database
function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Erro ao ler db.json:", err);
  }
  return { clients: [], supportPhone: "(18) 99999-5555" };
}

// Helper to write database
function writeDb(dbData: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Erro ao salvar db.json:", err);
    return false;
  }
}

// API Routes
app.get("/api/clients", (req, res) => {
  const db = readDb();
  res.json(db.clients || []);
});

app.post("/api/clients", (req, res) => {
  try {
    const clients = req.body;
    if (!Array.isArray(clients)) {
      return res.status(400).json({ error: "Dados inválidos. Esperava um array de clientes." });
    }
    const db = readDb();
    db.clients = clients;
    if (writeDb(db)) {
      res.json({ success: true, count: clients.length });
    } else {
      res.status(500).json({ error: "Falha ao salvar no banco de dados." });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/support-phone", (req, res) => {
  const db = readDb();
  res.json({ supportPhone: db.supportPhone || "(18) 99999-5555" });
});

app.post("/api/support-phone", (req, res) => {
  try {
    const { supportPhone } = req.body;
    if (!supportPhone) {
      return res.status(400).json({ error: "Telefone de suporte é obrigatório." });
    }
    const db = readDb();
    db.supportPhone = supportPhone;
    if (writeDb(db)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: "Falha ao salvar telefone de suporte." });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ------------------------------------------
// VITE DEV SERVER OR STATIC SERVING IN PRODUCTION
// ------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[MASTER CNC] Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
