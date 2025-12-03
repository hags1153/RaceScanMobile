fetch('/static/partials/footer.html')
  .then(res => res.text())
  .then(html => {
    document.getElementById('footer-container').innerHTML = html;
  })
  .catch(err => {
    console.error("⚠️ Failed to load footer:", err);
  });
