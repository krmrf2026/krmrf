fetch("data/news.json", { cache: "no-store" })
  .then((response) => response.json())
  .then((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("news.json пустой или неправильный формат");
    }

    // Берём первую запись массива
    const latest = items[0];

    document.getElementById("latestTitle").textContent =
      latest.title || "Последнее важное";

    document.getElementById("latestUpdated").textContent =
      "Обновлено: " + (latest.updated || "");

    const img = document.getElementById("latestImage");
    img.src = latest.image || "";
    img.alt = latest.title || "Изображение";

    const container = document.getElementById("latestText");
    container.innerHTML = "";

    (latest.paragraphs || []).forEach((text) => {
      const p = document.createElement("p");
      p.textContent = text;
      container.appendChild(p);
    });
  })
  .catch((error) => {
    console.error("Ошибка загрузки news.json:", error);
  });
