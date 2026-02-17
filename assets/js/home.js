fetch("data/news.json", { cache: "no-store" })
  .then((response) => response.json())
  .then((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("news.json пустой или неправильный формат");
    }

    // 1) Берём закреп (pinned), если он есть
    // 2) Если нет - берём самый свежий по updated
    const pinned = items.find((x) => x && x.pinned === true);

    const sorted = items
      .filter((x) => x && x.updated)
      .slice()
      .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));

    const latest = pinned || sorted[0];

    // Заголовок
    document.getElementById("latestTitle").textContent = latest.title || "Последнее важное";

    // Дата - строго из JSON
    document.getElementById("latestUpdated").textContent =
      "Обновлено: " + (latest.updated || "");

    // Картинка
    const img = document.getElementById("latestImage");
    img.src = latest.image || "";
    img.alt = latest.title || "Изображение";

    // Текст
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
