fetch("data/assessment.json", { cache: "no-store" })
  .then(response => response.json())
  .then(data => {

    const title = document.getElementById("assessmentFooterTitle");
    const date = document.getElementById("assessmentFooterDate");
    const link = document.getElementById("assessmentFooterLink");

    if (!title || !date || !link) return;

    title.textContent = data.title || "Последняя оценка";
    date.textContent = "Дата: " + (data.date || "");
    link.href = data.url || "#";

  })
  .catch(err => {
    console.error("assessment load error", err);
  });
