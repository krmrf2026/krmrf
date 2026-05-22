document.addEventListener("DOMContentLoaded", () => {

  const container =
  document.getElementById("warCrimesList");

  if (!container) {
    return;
  }

  fetch("/data/news.json", {
    cache: "no-store"
  })

  .then(response => {

    if (!response.ok) {
      throw new Error("Ошибка загрузки news.json");
    }

    return response.json();
  })

  .then(news => {

    const warCrimes = news

    .filter(item =>
      item.section === "warcrimes"
    )

    .sort((a, b) =>
      new Date(b.updated) -
      new Date(a.updated)
    );

    if (!warCrimes.length) {

      container.innerHTML = `
        <p>
        Материалы раздела пока отсутствуют.
        </p>
      `;

      return;
    }

    container.innerHTML = "";

    warCrimes.forEach(item => {

      const article =
      document.createElement("article");

      article.className = "news-card";

      article.innerHTML = `

        <a href="${item.url}" class="news-card-link">

          <div class="news-card-image">

            <img
              src="${item.image}"
              alt="${item.title}"
              loading="lazy">

          </div>

          <div class="news-card-content">

            <div class="updated-time">
              ${formatDate(item.updated)}
            </div>

            <h3>
              ${item.title}
            </h3>

            <p>
              ${item.excerpt || ""}
            </p>

          </div>

        </a>

      `;

      container.appendChild(article);

    });

  })

  .catch(error => {

    console.error(error);

    container.innerHTML = `
      <p>
      Не удалось загрузить материалы раздела.
      </p>
    `;

  });

});

function formatDate(dateString) {

  const date = new Date(dateString);

  return date.toLocaleDateString("ru-RU", {

    day: "numeric",
    month: "long",
    year: "numeric"

  });

}
