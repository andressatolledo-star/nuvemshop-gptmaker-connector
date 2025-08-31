import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const {
  PORT = 3000,
  BASE_URL = "https://seu-dominio.com",
  NUVEM_CLIENT_ID,
  NUVEM_CLIENT_SECRET,
  APP_SECRET = "troque-por-uma-chave"
} = process.env;

let storeCtx = { access_token: null, user_id: null };

app.get("/", (req, res) => res.send("OK / v1.0.0"));

app.get("/install", (req, res) => {
  const url = `https://www.tiendanube.com/apps/${NUVEM_CLIENT_ID}/authorize`;
  return res.redirect(url);
});

app.get("/oauth/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const r = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: NUVEM_CLIENT_ID,
        client_secret: NUVEM_CLIENT_SECRET,
        grant_type: "authorization_code",
        code
      })
    }).then(x => x.json());

    storeCtx.access_token = r?.access_token || null;
    storeCtx.user_id = r?.user_id || null;

    if (!storeCtx.access_token) return res.status(400).send("Não foi possível obter access_token.");
    return res.send("App instalado! Pode voltar ao GPT Maker.");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erro no callback OAuth");
  }
});

// LGPD
app.post("/webhooks/store-redact", (req, res) => { console.log("LGPD store-redact", req.body); res.sendStatus(200); });
app.post("/webhooks/customers-redact", (req, res) => { console.log("LGPD customers-redact", req.body); res.sendStatus(200); });
app.post("/webhooks/customers-data-request", (req, res) => { console.log("LGPD customers-data-request", req.body); res.sendStatus(200); });

// MCP inbound (GPT Maker)
app.post("/gptmaker/inbound", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.json({ reply: "Envie: SKU: <seu-sku>" });

    const m = /sku\s*:\s*([A-Za-z0-9._-]+)/i.exec(message);
    if (!m) return res.json({ reply: "Use: SKU: CONJ-BICOLOR-HOT-TAMANHO-COR" });
    const sku = m[1];

    if (!storeCtx.access_token || !storeCtx.user_id) {
      return res.json({ reply: "Instale o app na loja para gerar o access_token." });
    }

    const prods = await fetch(
      `https://api.nuvemshop.com.br/v1/${storeCtx.user_id}/products`,
      {
        headers: {
          "Authentication": `bearer ${storeCtx.access_token}`,
          "User-Agent": "AndressaBiquinis (andressatoledo@gmail.com)"
        }
      }
    ).then(r => r.json());

    const hit = (prods || []).find(p =>
      (p?.variants || []).some(v => (v?.sku || "").toLowerCase() === sku.toLowerCase())
    );

    if (!hit) return res.json({ reply: `Não encontrei o SKU ${sku}.` });

    const v = (hit.variants || []).find(v => (v?.sku || "").toLowerCase() === sku.toLowerCase());
    const foto = (hit?.images?.[0]?.src) || "";
    const nome = hit?.name?.pt || hit?.name?.es || hit?.name?.en || "Produto";
    const preco = v?.price || hit?.price;

    const reply =
      `*${nome}*\nSKU: ${sku}\nPreço: R$ ${Number(preco).toFixed(2)}\n` +
      `Estoque: ${v?.stock_management === false ? "ilimitado" : (v?.stock ?? "—")}\n` +
      (foto ? `Foto: ${foto}` : "");

    return res.json({ reply });
  } catch (err) {
    console.error(err);
    res.json({ reply: "Erro ao consultar o SKU. Tente novamente." });
  }
});

app.listen(PORT, () => console.log(`Conector rodando na porta ${PORT}`));
