import supabase from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const { gacha_id } = req.query;

    const { data: prizes, error } = await supabase
      .from("gacha_prizes")
      .select("*")

    if (error) throw error;

    return res.status(200).json({
      success: true,
      prizes
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
