document.addEventListener("DOMContentLoaded", async () => {

  try {
    // универсальный путь (работает и с главной, и с /assessment/)
    const basePath = window.location.pathname.includes("/assessment/")
      ? "../data/assessment.json"
      : "data/assessment.json";

    const res = await fetch(basePath, { cache: "no-store" });
    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error("assessment.json должен быть массивом");
    }

    // сортировка (новые сверху)
    data.sort((a, b) => b.date.localeCompare(a.date));

    // ===== СПИСОК (только на /assessment/) =====
    const container = document.getElementById("assessmentList");

    if (container) {
      container.innerHTML = data.map(item => `
        <article class="assessment-card">
          <h3>
            <a href="${item.url}">${item.title}</a>
          </h3>

          <time datetime="${item.date}">
            ${formatDate(item.date)}
          </time>

          ${item.summary ? `<p>${item.summary}</p>` : ""}
        </article>
      `).join("");
    }

    // ===== ГЛАВНАЯ (footer блок) =====
    const latest = data[0];

    const title = document.getElementById("assessmentFooterTitle");
    const date = document.getElementById("assessmentFooterDate");
    const link = document.getElementById("assessmentFooterLink");

    if (latest && title && date && link) {
      title.textContent = latest.title || "Последняя оценка";
      date.textContent = "Дата: " + formatDate(latest.date);
      link.href = latest.url || "#";
    }

  } catch (err) {
    console.error("assessment load error", err);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

});
