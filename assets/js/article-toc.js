(function () {
  const links = Array.from(document.querySelectorAll('.sidebar-toc a[href^="#"]'));
  const sections = links
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (!links.length || !sections.length) return;

  function setActive(id) {
    links.forEach((link) => {
      const active = link.getAttribute('href') === '#' + id;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function updateActive() {
    let current = sections[0].id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 130) current = section.id;
      else break;
    }
    setActive(current);
  }

  let scheduled = false;
  window.addEventListener('scroll', function () {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      updateActive();
      scheduled = false;
    });
  }, { passive: true });

  links.forEach((link) => {
    link.addEventListener('click', function () {
      setActive(this.getAttribute('href').slice(1));
    });
  });

  updateActive();
})();
