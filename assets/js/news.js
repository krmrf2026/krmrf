fetch("../data/news.json", {
  cache: "no-cache"
})

  .then((response) => {

    if (!response.ok) {
      throw new Error(
        `news.json HTTP ${response.status}`
      );
    }

    return response.json();
  })

  .then((items) => {

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new Error(
        "news.json пустой или неправильный формат"
      );
    }

    const list =
      document.getElementById("newsList");

    if (!list) {
      throw new Error(
        "Не найден #newsList"
      );
    }

    list.innerHTML = "";

    // ========================
    // GROUPS
    // ========================

    const grouped = {
      warcrimes: [],
      svo: [],
      kremennaya: [],
      politics: [],
      law: []
    };

    items
      .filter(
        (x) =>
          x &&
          x.updated &&
          x.section
      )
      .forEach((item) => {

        if (grouped[item.section]) {
          grouped[item.section].push(item);
        }
      });

    // ========================
    // SORT
    // ========================

    Object.keys(grouped).forEach((key) => {

      grouped[key].sort(
        (a, b) =>
          (b.updated || "")
            .localeCompare(a.updated || "")
      );
    });

    // ========================
    // RENDER SECTION
    // ========================

    const renderSection = (
      title,
      key
    ) => {

      if (
        !grouped[key] ||
        grouped[key].length === 0
      ) {
        return;
      }

      const h2 =
        document.createElement("h2");

      h2.textContent = title;

      h2.className =
        "news-section-title";

      list.appendChild(h2);

      // только 5 последних
      grouped[key]
        .slice(0, 5)
        .forEach((item) => {

          const details =
            document.createElement("details");

          details.className =
            "news-item";

          // ========================
          // SUMMARY
          // ========================

          const summary =
            document.createElement("summary");

          summary.className =
            "news-summary";

          summary.textContent =
            `${item.updated || ""} - ${item.title || "Без названия"}`;

          // ========================
          // BODY
          // ========================

          const body =
            document.createElement("div");

          body.className =
            "news-body";

          // excerpt

          if (item.excerpt) {

            const ex =
              document.createElement("div");

            ex.className =
              "news-excerpt";

            ex.textContent =
              item.excerpt;

            body.appendChild(ex);
          }

          // image

          if (item.image) {

            const img =
              document.createElement("img");

            img.className =
              "news-image";

            img.src = item.image;

            img.alt =
              item.title ||
              "Изображение";

            img.loading = "lazy";

            body.appendChild(img);
          }

          // paragraphs

          (item.paragraphs || [])
            .forEach((t) => {

              const p =
                document.createElement("p");

              p.textContent = t;

              body.appendChild(p);
            });

          // link

          if (item.url) {

            const link =
              document.createElement("a");

            link.href =
              new URL(
                item.url,
                window.location.origin
              ).pathname;

            link.textContent =
              "Открыть полную новость →";

            link.className =
              "news-link";

            body.appendChild(link);
          }

          details.appendChild(summary);

          details.appendChild(body);

          list.appendChild(details);
        });
    };

    // ========================
    // RENDER ALL
    // ========================

    renderSection(
      "Военные преступления",
      "warcrimes"
    );

    renderSection(
      "СВО",
      "svo"
    );

    renderSection(
      "Кременная",
      "kremennaya"
    );

    renderSection(
      "Политика",
      "politics"
    );

    renderSection(
      "Юридическая помощь",
      "law"
    );
  })

  .catch((error) => {

    console.error(
      "Ошибка загрузки news.json:",
      error
    );

    const list =
      document.getElementById("newsList");

    if (list) {

      list.innerHTML = `
        <div class="card">
          <p>Не удалось загрузить новости.</p>
          <p>
            <a href="/archive/">
              Перейти в архив →
            </a>
          </p>
        </div>
      `;
    }
  });
