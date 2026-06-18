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
    return res.status(405).json({ success:false, error:"Méthode non autorisée." });
  }

  try {
    const { gacha_id, customer_id } = req.body || {};

    if (!gacha_id || !customer_id) {
      return res.status(400).json({
        success:false,
        error:"gacha_id et customer_id sont obligatoires."
      });
    }

    const { data: draws, error } = await supabase
      .from("gacha_draws")
      .select("prize_id, prize_title, prize_rarity, tickets_used, is_last_one, created_at")
      .eq("gacha_id", String(gacha_id))
      .eq("shopify_customer_id", String(customer_id))
      .order("created_at", { ascending:false })
      .limit(50);

    if (error) throw error;

    const prizeIds = [...new Set((draws || []).map(d => d.prize_id).filter(Boolean))];

    let prizeImages = {};

    if (prizeIds.length > 0) {
      const { data: prizes, error: prizesError } = await supabase
        .from("gacha_prizes")
        .select("id, image_url")
        .in("id", prizeIds);

      if (prizesError) throw prizesError;

      prizeImages = Object.fromEntries(
        (prizes || []).map(p => [p.id, p.image_url])
      );
    }

    const history = (draws || []).map(item => ({
      ...item,
      image_url: prizeImages[item.prize_id] || null
    }));

    return res.status(200).json({
      success:true,
      history
    });

  } catch (error) {
    return res.status(500).json({
      success:false,
      error:error.message
    });
  }
}
