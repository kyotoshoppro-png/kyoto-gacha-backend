import supabase from "./_supabase.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.kyotoshop.fr");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Méthode non autorisée."
    });
  }

  try {
    const { gacha_id, customer_id } = req.body || {};

    if (!gacha_id || !customer_id) {
      return res.status(400).json({
        success: false,
        error: "gacha_id et customer_id sont obligatoires."
      });
    }

    const { data, error } = await supabase
      .from("gacha_draws")
      .select("prize_title, prize_rarity, tickets_used, is_last_one, created_at")
      .eq("gacha_id", String(gacha_id))
      .eq("shopify_customer_id", String(customer_id))
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      history: data || []
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
