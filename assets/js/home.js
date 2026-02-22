fetch("data/news.json", { cache: "no-store" })
  .then((response) => response.json())
  .then((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("news.json пустой или неправильный формат");
    }

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

    // 🔹 Если есть paragraphs — выводим их
    if (Array.isArray(latest.paragraphs) && latest.paragraphs.length > 0) {
      latest.paragraphs.forEach((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        container.appendChild(p);
      });
    }
    // 🔹 Если нет paragraphs — выводим excerpt
    else if (latest.excerpt) {
      const p = document.createElement("p");
      p.textContent = latest.excerpt;
      container.appendChild(p);
    }

    // 🔹 Если есть отдельная страница — добавляем кнопку
    if (latest.url) {
      const link = document.createElement("a");
      link.href = new URL(latest.url, window.location.origin).pathname;
      link.textContent = "Открыть полную новость →";
      link.className = "news-link";
      container.appendChild(link);
    }
  })
  .catch((error) => {
    console.error("Ошибка загрузки news.json:", error);
  });
