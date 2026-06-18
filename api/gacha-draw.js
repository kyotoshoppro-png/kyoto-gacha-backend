import supabase from "./_supabase.js";

function pickRandomPrize(prizes) {
  const pool = [];

  prizes.forEach((prize) => {
    const qty = Number(prize.quantity_left || 0);
    for (let i = 0; i < qty; i++) {
      pool.push(prize);
    }
  });

  if (!pool.length) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}

export default async function handler(req, res) {
  try {
        res.setHeader("Access-Control-Allow-Origin", "https://www.kyotoshop.fr");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Méthode non autorisée. Utilisez POST."
      });
    }

    const {
      gacha_id,
      customer_id,
      email,
      draw_count = 1
    } = req.body;

    if (!gacha_id || !customer_id) {
      return res.status(400).json({
        success: false,
        error: "gacha_id et customer_id sont obligatoires."
      });
    }

    const count = Math.max(1, Math.min(Number(draw_count), 10));

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
      .eq("gacha_id", gacha_id)
      .eq("is_last_one", false)
      .gt("quantity_left", 0);

    if (prizesError) throw prizesError;

    if (!normalPrizes || !normalPrizes.length) {
      return res.status(400).json({
        success: false,
        error: "Aucun lot disponible."
      });
    }

    const { data: allPrizes, error: allPrizesError } = await supabase
      .from("gacha_prizes")
      .select("*")
      .eq("gacha_id", gacha_id);

    if (allPrizesError) throw allPrizesError;

    const totalTicketsLeftBefore = allPrizes
      .filter((p) => !p.is_last_one)
      .reduce((sum, p) => sum + Number(p.quantity_left || 0), 0);

    const realDrawCount = Math.min(count, totalTicketsLeftBefore);

    const results = [];

    for (let i = 0; i < realDrawCount; i++) {
      const prize = pickRandomPrize(normalPrizes);

      if (!prize) break;

      results.push(prize);

      const prizeIndex = normalPrizes.findIndex((p) => p.id === prize.id);
      normalPrizes[prizeIndex].quantity_left =
        Number(normalPrizes[prizeIndex].quantity_left || 0) - 1;

      const { error: updatePrizeError } = await supabase
        .from("gacha_prizes")
        .update({
          quantity_left: normalPrizes[prizeIndex].quantity_left
        })
        .eq("id", prize.id);

      if (updatePrizeError) throw updatePrizeError;
    }

    const totalTicketsLeftAfter = totalTicketsLeftBefore - results.length;

    let lastOnePrize = null;

    if (totalTicketsLeftAfter <= 0) {
      const { data: lastOne, error: lastOneError } = await supabase
        .from("gacha_prizes")
        .select("*")
        .eq("gacha_id", gacha_id)
        .eq("is_last_one", true)
        .gt("quantity_left", 0)
        .maybeSingle();

      if (lastOneError) throw lastOneError;

      if (lastOne) {
        lastOnePrize = lastOne;
        results.push(lastOne);

        const { error: updateLastOneError } = await supabase
          .from("gacha_prizes")
          .update({
            quantity_left: 0
          })
          .eq("id", lastOne.id);

        if (updateLastOneError) throw updateLastOneError;
      }
    }

    const newBalance = Number(customer.tickets_balance || 0) - results.length + (lastOnePrize ? 1 : 0);

    const { error: updateCustomerError } = await supabase
      .from("gacha_customers")
      .update({
        tickets_balance: Math.max(newBalance, 0)
      })
      .eq("shopify_customer_id", String(customer_id));

    if (updateCustomerError) throw updateCustomerError;

   const drawRows = results.map((prize) => ({
  gacha_id,
  shopify_customer_id: String(customer_id),
  email: email || customer.email || null,
  tickets_used: prize.is_last_one ? 0 : 1,
  prize_id: prize.id,
  prize_title: prize.title,
  prize_rarity: prize.rarity,
  is_last_one: Boolean(prize.is_last_one)
}));

    const { error: drawInsertError } = await supabase
      .from("gacha_draws")
      .insert(drawRows);

    if (drawInsertError) throw drawInsertError;

    return res.status(200).json({
      success: true,
      gacha_id,
      draw_count: results.length,
      tickets_left: totalTicketsLeftAfter,
      last_one_unlocked: Boolean(lastOnePrize),
      results
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
