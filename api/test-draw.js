export default async function handler(req, res) {
  const response = await fetch(
    "https://project-gxf23.vercel.app/api/gacha-draw",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        gacha_id: "aot-masterlise",
        customer_id: "test-client-1",
        email: "test@kyotoshop.fr",
        draw_count: 1
      })
    }
  );

  const data = await response.json();

  return res.status(200).json(data);
}
