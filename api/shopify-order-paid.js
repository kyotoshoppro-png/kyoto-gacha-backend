import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) return true;

  const hash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return hash === hmacHeader;
}

function getTicketsFromProduct(title = "") {
  const cleanTitle = title.toLowerCase();

  if (
    cleanTitle.includes("x10") ||
    cleanTitle.includes("10 tirage")
  ) {
    if (
      cleanTitle.includes("+1") ||
      cleanTitle.includes("1 gratuit") ||
      cleanTitle.includes("+ 1")
    ) {
      return 11;
    }

    return 10;
  }

  if (cleanTitle.includes("x5") || cleanTitle.includes("5 tirage")) {
    return 5;
  }

  if (cleanTitle.includes("x1") || cleanTitle.includes("1 tirage")) {
    return 1;
  }

  return 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const rawBody = await getRawBody(req);
    const hmac = req.headers["x-shopify-hmac-sha256"];

    if (!verifyShopifyWebhook(rawBody, hmac)) {
      return res.status(401).json({ success: false, error: "Invalid webhook signature" });
    }

    const order = JSON.parse(rawBody);

    const shopifyOrderId = String(order.id || "");
    const customerId = String(order.customer?.id || "");
    const email = order.email || order.customer?.email || "";

    if (!shopifyOrderId || !customerId) {
      return res.status(200).json({
        success: false,
        error: "Commande sans client Shopify"
      });
    }

    let ticketsToAdd = 0;
    let productTitles = [];

    for (const item of order.line_items || []) {
      const title = item.title || "";
      const quantity = item.quantity || 1;
      const tickets = getTicketsFromProduct(title);

      if (tickets > 0) {
        ticketsToAdd += tickets * quantity;
        productTitles.push(`${title} x${quantity}`);
      }
    }

    if (ticketsToAdd <= 0) {
      return res.status(200).json({
        success: true,
        message: "Aucun produit ticket dans cette commande"
      });
    }

    const { data: existingTransaction } = await supabase
      .from("gacha_ticket_transactions")
      .select("id")
      .eq("shopify_order_id", shopifyOrderId)
      .maybeSingle();

    if (existingTransaction) {
      return res.status(200).json({
        success: true,
        message: "Commande déjà créditée"
      });
    }

    const { data: customer } = await supabase
      .from("gacha_customers")
      .select("*")
      .eq("shopify_customer_id", customerId)
      .maybeSingle();

    if (customer) {
      const newBalance = Number(customer.tickets_balance || 0) + ticketsToAdd;

      await supabase
        .from("gacha_customers")
        .update({
          tickets_balance: newBalance,
          email
        })
        .eq("shopify_customer_id", customerId);
    } else {
      await supabase
        .from("gacha_customers")
        .insert({
          shopify_customer_id: customerId,
          email,
          tickets_balance: ticketsToAdd
        });
    }

    await supabase
      .from("gacha_ticket_transactions")
      .insert({
        shopify_order_id: shopifyOrderId,
        shopify_customer_id: customerId,
        email,
        tickets_added: ticketsToAdd,
        product_title: productTitles.join(" / ")
      });

    return res.status(200).json({
      success: true,
      tickets_added: ticketsToAdd
    });

  } catch (error) {
    console.error("Webhook Shopify error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
