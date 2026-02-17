fetch("data/latest.json", { cache: "no-store" })
  .then(response => response.json())
  .then(data => {

    // Заголовок
    document.getElementById("latestTitle").textContent = data.title;

    // Картинка
    document.getElementById("latestImage").src = data.image;

    // Текст
    const container = document.getElementById("latestText");
    container.innerHTML = "";

    data.paragraphs.forEach(text => {
      const p = document.createElement("p");
      p.textContent = text;
      container.appendChild(p);
    });

    // === Автоматическая дата (текущее время загрузки) ===
    const now = new Date();

    const formatted =
      now.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }) +
      " " +
      now.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      });

    document.getElementById("latestUpdated").textContent =
      "Обновлено: " + formatted;

  })
  .catch(error => {
    console.error("Ошибка загрузки latest.json:", error);
  });
