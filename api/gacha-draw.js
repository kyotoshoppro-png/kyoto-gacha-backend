import supabase from "./_supabase.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.kyotoshop.fr");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function pickRandomPrize(prizes) {
  const pool = [];

  prizes.forEach((prize) => {
    const qty = Number(prize.quantity_left || 0);
    for (let i = 0; i < qty; i++) pool.push(prize);
  });

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Méthode non autorisée. Utilisez POST."
    });
  }

  try {
    const { gacha_id, customer_id, email, draw_count = 1 } = req.body || {};
    const count = Math.max(1, Math.min(Number(draw_count || 1), 10));

    if (!gacha_id || !customer_id) {
      return res.status(400).json({
        success: false,
        error: "gacha_id et customer_id sont obligatoires."
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from("gacha_customers")
      .select("*")
      .eq("shopify_customer_id", String(customer_id))
      .maybeSingle();

    if (customerError) throw customerError;

    if (!customer || Number(customer.tickets_balance || 0) < count) {
      return res.status(400).json({
        success: false,
        error: "Tickets insuffisants."
      });
    }

    const { data: normalPrizes, error: prizesError } = await supabase
      .from("gacha_prizes")
      .select("*")
      .eq("gacha_id", String(gacha_id))
      .eq("is_last_one", false)
      .gt("quantity_left", 0);

    if (prizesError) throw prizesError;

    if (!normalPrizes || !normalPrizes.length) {
      return res.status(400).json({
        success: false,
        error: "Aucun lot disponible."
      });
    }

    const totalTicketsLeftBefore = normalPrizes.reduce(
      (sum, p) => sum + Number(p.quantity_left || 0),
      0
    );

    const realDrawCount = Math.min(count, totalTicketsLeftBefore);
    const results = [];
    const currentPrizes = [...normalPrizes];

    for (let i = 0; i < realDrawCount; i++) {
      const prize = pickRandomPrize(currentPrizes);
      if (!prize) break;

      const prizeIndex = currentPrizes.findIndex((p) => p.id === prize.id);
      const newQuantityLeft = Number(currentPrizes[prizeIndex].quantity_left || 0) - 1;

      currentPrizes[prizeIndex].quantity_left = newQuantityLeft;

      const { error: updatePrizeError } = await supabase
        .from("gacha_prizes")
        .update({ quantity_left: newQuantityLeft })
        .eq("id", prize.id);

      if (updatePrizeError) throw updatePrizeError;

      results.push({
        id: prize.id,
        prize_id: prize.id,
        title: prize.title,
        prize_title: prize.title,
        rarity: prize.rarity,
        rate: prize.rate,
        image_url: prize.image_url,
        quantity_left: newQuantityLeft,
        is_last_one: false
      });
    }

    const totalTicketsLeftAfter =
      totalTicketsLeftBefore - results.filter((p) => !p.is_last_one).length;

    let lastOnePrize = null;

    if (totalTicketsLeftAfter <= 0) {
      const { data: lastOne, error: lastOneError } = await supabase
        .from("gacha_prizes")
        .select("*")
        .eq("gacha_id", String(gacha_id))
        .eq("is_last_one", true)
        .gt("quantity_left", 0)
        .maybeSingle();

      if (lastOneError) throw lastOneError;

      if (lastOne) {
        lastOnePrize = lastOne;

        const { error: updateLastOneError } = await supabase
          .from("gacha_prizes")
          .update({ quantity_left: 0 })
          .eq("id", lastOne.id);

        if (updateLastOneError) throw updateLastOneError;

        results.push({
          id: lastOne.id,
          prize_id: lastOne.id,
          title: lastOne.title,
          prize_title: lastOne.title,
          rarity: lastOne.rarity,
          rate: lastOne.rate,
          image_url: lastOne.image_url,
          quantity_left: 0,
          is_last_one: true
        });
      }
    }

    const ticketsUsed = results.filter((p) => !p.is_last_one).length;
    const newBalance = Math.max(Number(customer.tickets_balance || 0) - ticketsUsed, 0);

    const { error: updateCustomerError } = await supabase
      .from("gacha_customers")
      .update({
        tickets_balance: newBalance,
        email: email || customer.email || ""
      })
      .eq("shopify_customer_id", String(customer_id));

    if (updateCustomerError) throw updateCustomerError;

    const drawRows = results.map((prize) => ({
      gacha_id: String(gacha_id),
      shopify_customer_id: String(customer_id),
      email: email || customer.email || null,
      tickets_used: prize.is_last_one ? 0 : 1,
      prize_id: prize.id,
      prize_title: prize.title,
      prize_rarity: prize.rarity,
      image_url: prize.image_url || null,
      is_last_one: Boolean(prize.is_last_one)
    }));

    const { error: drawInsertError } = await supabase
      .from("gacha_draws")
      .insert(drawRows);

    if (drawInsertError) throw drawInsertError;

    return res.status(200).json({
      success: true,
      gacha_id: String(gacha_id),
      draw_count: results.length,
      results,
      customer_tickets: newBalance,
      tickets_left: totalTicketsLeftAfter,
      last_one_unlocked: Boolean(lastOnePrize)
    });

  } catch (err) {
    console.error("Gacha draw error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
