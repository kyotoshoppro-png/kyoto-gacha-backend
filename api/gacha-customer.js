import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { customer_id, email } = req.body || {};

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: "customer_id obligatoire",
        tickets: 0
      });
    }

    const { data, error } = await supabase
      .from("gacha_customers")
      .select("tickets_balance")
      .eq("shopify_customer_id", String(customer_id))
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      tickets: data ? Number(data.tickets_balance || 0) : 0
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      tickets: 0
    });
  }
}
