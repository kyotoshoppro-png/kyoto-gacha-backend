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
    const { gacha_id } = req.body || {};

    if (!gacha_id) {
      return res.status(400).json({
        success:false,
        error:"gacha_id obligatoire."
      });
    }

    const { data: prizes, error } = await supabase
      .from("gacha_prizes")
      .select("id, title, rarity, quantity_total, quantity_left, image_url, is_last_one")
      .eq("gacha_id", String(gacha_id))
      .order("created_at", { ascending:true });

    if (error) throw error;

    const normalPrizes = (prizes || []).filter(p => !p.is_last_one);

    const ticketsLeft = normalPrizes.reduce(
      (sum, p) => sum + Number(p.quantity_left || 0),
      0
    );

    return res.status(200).json({
      success:true,
      tickets_left:ticketsLeft,
      prizes:prizes || []
    });

  } catch (error) {
    return res.status(500).json({
      success:false,
      error:error.message
    });
  }
}
