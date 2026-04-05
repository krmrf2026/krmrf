document.addEventListener("DOMContentLoaded", async () => {

  try {
    // универсальный путь (главная / assessment)
    const basePath = window.location.pathname.includes("/assessment/")
      ? "../data/assessment.json"
      : "data/assessment.json";

    const res = await fetch(basePath, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();

    // поддержка и массива, и одного объекта
    const data = Array.isArray(raw) ? raw : [raw];

    if (!data.length) throw new Error("assessment.json пуст");

    // сортировка (новые сверху)
    data.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // =========================
    // АРХИВ (/assessment/)
    // =========================
    const container = document.getElementById("assessmentList");

    if (container) {
      container.innerHTML = data.map(item => `
        <article class="update">

          <div class="update-content">

            ${item.image ? `
              <div class="update-image">
                <img src="${item.image}" alt="${item.title}" loading="lazy">
              </div>
            ` : ""}

            <div class="update-text">

              <h3>
                <a href="${normalizeUrl(item.url)}">${item.title}</a>
              </h3>

              <div class="updated-time">
                ${formatDate(item.date)}
              </div>

              ${item.summary ? `<p>${item.summary}</p>` : ""}

              <p>
                <a href="${normalizeUrl(item.url)}" class="news-link">
                  Читать оценку →
                </a>
              </p>

            </div>

          </div>

        </article>
      `).join("");
    }

    // =========================
    // ГЛАВНАЯ
    // =========================
    const latest = data[0];

    const title = document.getElementById("assessmentFooterTitle");
    const date = document.getElementById("assessmentFooterDate");
    const link = document.getElementById("assessmentFooterLink");
    const summary = document.getElementById("assessmentFooterSummary");
    const img = document.getElementById("assessmentFooterImage");

    if (latest) {

      if (title) {
        title.textContent = latest.title || "Последняя оценка";
      }

      if (date) {
        date.textContent = "Дата: " + formatDate(latest.date);
      }

      if (link) {
        link.href = normalizeUrl(latest.url);
      }

      if (summary && latest.summary) {
        summary.textContent = latest.summary;
      }

      if (img && latest.image) {
        img.src = latest.image;
        img.alt = latest.title || "Оценка фронта";
      }

    }

  } catch (err) {
    console.error("assessment load error", err);
  }

  // =========================
  // UTILS
  // =========================

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;

    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function normalizeUrl(url) {
    if (!url) return "#";
    if (url.startsWith("http") || url.startsWith("/")) return url;
    return "/" + url.replace(/^\/+/, "");
  }

});
