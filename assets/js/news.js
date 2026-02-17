fetch("../data/news.json", { cache: "no-store" })
  .then((response) => response.json())
  .then((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("news.json пустой или неправильный формат");
    }

    const list = document.getElementById("newsList");
    list.innerHTML = "";

    const sorted = items
      .filter((x) => x && x.updated)
      .slice()
      .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));

    sorted.forEach((item) => {
      const details = document.createElement("details");
      details.className = "news-item";

      const summary = document.createElement("summary");
      summary.className = "news-summary";
      summary.textContent = (item.updated || "") + " - " + (item.title || "Без названия");

      const body = document.createElement("div");
      body.className = "news-body";

      if (item.excerpt) {
        const ex = document.createElement("div");
        ex.className = "news-excerpt";
        ex.textContent = item.excerpt;
        body.appendChild(ex);
      }

      if (item.image) {
        const img = document.createElement("img");
        img.className = "news-image";
        img.src = "../" + item.image;
        img.alt = item.title || "Изображение";
        body.appendChild(img);
      }

      (item.paragraphs || []).forEach((t) => {
        const p = document.createElement("p");
        p.textContent = t;
        body.appendChild(p);
      });

      details.appendChild(summary);
      details.appendChild(body);
      list.appendChild(details);
    });
  })
  .catch((error) => {
    console.error("Ошибка загрузки news.json:", error);
  });
