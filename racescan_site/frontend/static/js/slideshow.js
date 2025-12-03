document.addEventListener('DOMContentLoaded', function () {
    const slideshowContainer = document.querySelector('.hero-slideshow');

    if (!slideshowContainer) {
        console.warn('🔍 slideshow.js: .hero-slideshow container not found; skipping init.');
        return;
    }

    const images = [
        '/static/images/slideshow_images/slide1.jpg',
        '/static/images/slideshow_images/slide2.jpg',
        '/static/images/slideshow_images/slide3.jpg',
        // Add more as needed
    ];

    if (!images.length) {
        console.warn("No slideshow images defined.");
        return;
    }

    const slides = images.map((imgSrc, index) => {
        const img = document.createElement('img');
        img.src = imgSrc;
        if (index === 0) img.classList.add('active');
        slideshowContainer.appendChild(img);
        return img;
    });

    if (slides.length > 1) {
        cycleSlides(slides);
    }

    function cycleSlides(slides) {
        let current = 0;

        setInterval(() => {
            slides[current].classList.remove('active');
            current = (current + 1) % slides.length;
            slides[current].classList.add('active');
        }, 6000);
    }
});
