import supabase from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from("gacha_products")
      .select("*");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      products: data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
