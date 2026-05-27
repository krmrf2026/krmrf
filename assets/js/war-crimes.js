document.addEventListener(
  "DOMContentLoaded",
  () => {

    const container =
      document.getElementById(
        "warCrimesList"
      );

    if (!container) {
      return;
    }

    fetch("/data/news.json", {
      cache: "no-cache"
    })

      .then(response => {

        if (!response.ok) {
          throw new Error(
            `news.json HTTP ${response.status}`
          );
        }

        return response.json();
      })

      .then(news => {

        if (!Array.isArray(news)) {
          throw new Error(
            "Неверный формат news.json"
          );
        }

        const warCrimes = news

          .filter(item =>
            item &&
            item.section === "warcrimes"
          )

          .sort((a, b) =>
            new Date(b.updated) -
            new Date(a.updated)
          );

        // пустой раздел

        if (!warCrimes.length) {

          container.innerHTML = `
            <p>
              Материалы раздела пока отсутствуют.
            </p>
          `;

          return;
        }

        // очистка

        container.innerHTML = "";

        // рендер

        warCrimes.forEach(item => {

          const article =
            document.createElement("article");

          article.className =
            "news-card";

          // ========================
          // LINK
          // ========================

          const link =
            document.createElement("a");

          link.className =
            "news-card-link";

          link.href =
            item.url || "#";

          // ========================
          // IMAGE
          // ========================

          const imageWrap =
            document.createElement("div");

          imageWrap.className =
            "news-card-image";

          if (item.image) {

            const img =
              document.createElement("img");

            img.src = item.image;

            img.alt =
              item.title ||
              "Изображение";

            img.loading = "lazy";

            imageWrap.appendChild(img);
          }

          // ========================
          // CONTENT
          // ========================

          const content =
            document.createElement("div");

          content.className =
            "news-card-content";

          // дата

          const updated =
            document.createElement("div");

          updated.className =
            "updated-time";

          updated.textContent =
            formatDate(item.updated);

          // title

          const h3 =
            document.createElement("h3");

          h3.textContent =
            item.title ||
            "Без названия";

          // excerpt

          const excerpt =
            document.createElement("p");

          excerpt.textContent =
            item.excerpt || "";

          // append

          content.appendChild(updated);
          content.appendChild(h3);
          content.appendChild(excerpt);

          link.appendChild(imageWrap);
          link.appendChild(content);

          article.appendChild(link);

          container.appendChild(article);
        });
      })

      .catch(error => {

        console.error(
          "Ошибка загрузки war crimes:",
          error
        );

        container.innerHTML = `
          <div class="card">
            <p>
              Не удалось загрузить материалы раздела.
            </p>

            <p>
              <a href="/archive/">
                Перейти в архив →
              </a>
            </p>
          </div>
        `;
      });
  }
);

function formatDate(dateString) {

  const date =
    new Date(dateString);

  return date.toLocaleDateString(
    "ru-RU",
    {
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );
}
