fetch("../data/news.json", { cache: "no-store" })
  .then((response) => response.json())
  .then((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("news.json пустой или неправильный формат");
    }

    const list = document.getElementById("newsList");
    list.innerHTML = "";

    // --- группируем по разделам ---
    const grouped = {
      warcrimes: [],
      svo: [],
      kremennaya: [],
      politics: [],
      law: []
    };

    items
      .filter((x) => x && x.updated)
      .forEach((item) => {
        if (grouped[item.section]) {
          grouped[item.section].push(item);
        }
      });

    // --- сортировка по дате (новые сверху) ---
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) =>
        (b.updated || "").localeCompare(a.updated || "")
      );
    });

    // --- функция рендера раздела ---
    const renderSection = (title, key) => {
      if (!grouped[key] || grouped[key].length === 0) return;

      const h2 = document.createElement("h2");
      h2.textContent = title;
      h2.className = "news-section-title";
      list.appendChild(h2);

      // ВАЖНО: берём только 5 последних
      grouped[key].slice(0, 5).forEach((item) => {
        const details = document.createElement("details");
        details.className = "news-item";

        const summary = document.createElement("summary");
        summary.className = "news-summary";
        summary.textContent =
          (item.updated || "") + " - " + (item.title || "Без названия");

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
          img.src = item.image;
          img.alt = item.title || "Изображение";
          body.appendChild(img);
        }

        (item.paragraphs || []).forEach((t) => {
          const p = document.createElement("p");
          p.textContent = t;
          body.appendChild(p);
        });

        if (item.url) {
          const link = document.createElement("a");
          link.href = new URL(item.url, window.location.origin).pathname;
          link.textContent = "Открыть полную новость →";
          link.className = "news-link";
          body.appendChild(link);
        }

        details.appendChild(summary);
        details.appendChild(body);
        list.appendChild(details);
      });
    };

    renderSection("Военные преступления", "warcrimes");
    renderSection("СВО", "svo");
    renderSection("Кременная", "kremennaya");
    renderSection("Политика", "politics");
    renderSection("Юридическая помощь", "law");
  })
  .catch((error) => {
    console.error("Ошибка загрузки news.json:", error);
  });
