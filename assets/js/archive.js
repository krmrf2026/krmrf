async function loadArchive() {
  const newsRes = await fetch('/data/news.json', { cache: 'no-store' });
  const assessmentRes = await fetch('/data/assessment.json', { cache: 'no-store' });

  const news = await newsRes.json();
  const assessment = await assessmentRes.json();

  renderArchive(news, document.getElementById('archiveNews'));
  renderArchive(assessment, document.getElementById('archiveAssessment'));
}

function renderArchive(items, container) {
  if (!Array.isArray(items) || items.length === 0) return;

  // сортировка по дате
  items.sort((a, b) => b.updated.localeCompare(a.updated));

  const grouped = {};

  items.forEach(item => {
    const month = item.updated.slice(0, 7); // YYYY-MM
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(item);
  });

  Object.keys(grouped).forEach(month => {
    const block = document.createElement('div');
    block.className = 'archive-month';

    const title = document.createElement('h3');
    title.textContent = formatMonth(month);

    const list = document.createElement('ul');

    grouped[month].forEach(item => {
      const li = document.createElement('li');

      const link = document.createElement('a');
      link.href = item.url;
      link.textContent = `${item.updated} - ${item.title}`;

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
