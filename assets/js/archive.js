async function loadArchive() {
  try {
    const [newsRes, assessmentRes] = await Promise.all([
      fetch('/data/news.json', { cache: 'no-store' }),
      fetch('/data/assessment.json', { cache: 'no-store' })
    ]);

    const news = await newsRes.json();
    const assessment = await assessmentRes.json();

    renderArchive(news, document.getElementById('archiveNews'));
    renderArchive(assessment, document.getElementById('archiveAssessment'));

  } catch (e) {
    console.error('Ошибка загрузки архива:', e);
  }
}

function renderArchive(items, container) {
  if (!Array.isArray(items) || items.length === 0 || !container) return;

  // очистка контейнера
  container.innerHTML = '';

  // сортировка по дате (новые сверху)
  const sorted = [...items].sort((a, b) => b.updated.localeCompare(a.updated));

  const grouped = {};

  sorted.forEach(item => {
    if (!item.updated || !item.url || !item.title) return;

    const month = item.updated.slice(0, 7); // YYYY-MM
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(item);
  });

  Object.keys(grouped).forEach(month => {
    const block = document.createElement('div');
    block.className = 'archive-month';

    // месяц
    const title = document.createElement('h4');
    title.textContent = formatMonth(month);

    const list = document.createElement('ul');

    grouped[month].forEach(item => {
      const li = document.createElement('li');

      const link = document.createElement('a');
      link.href = item.url;

      // дата отдельно (под CSS)
      link.innerHTML = `<span class="date">${item.updated}</span>${item.title}`;

      li.appendChild(link);
      list.appendChild(li);
    });

    block.appendChild(title);
    block.appendChild(list);
    container.appendChild(block);
  });
}

function formatMonth(month) {
  const [year, m] = month.split('-');
  const names = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
  ];
  return `${names[parseInt(m, 10) - 1]} ${year}`;
}

loadArchive();
