import supabase from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from("gacha_prizes")
      .select("*");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Kyoto Gacha Backend connecté à Supabase",
      prizes: data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
