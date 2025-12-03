document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Fetching session data...');
        const sessionResponse = await fetch('/api/session', { credentials: 'include' });
        const sessionData = await sessionResponse.json();
        console.log('Session Data:', sessionData);

        const navbarPath = sessionData.loggedIn ? '/static/partials/navbar_authed.html' : '/static/partials/navbar.html';
        console.log('Loading navbar from:', navbarPath);

        const navbarResponse = await fetch(navbarPath, { credentials: 'include' });
        document.getElementById('navbar-container').innerHTML = await navbarResponse.text();

        // ✅ Bind mobile menu toggle AFTER navbar is inserted
        const menuButton = document.querySelector('.mobile-menu');
        const navLinks = document.querySelector('.nav-links');
        const authSection = document.querySelector('.auth-section');  // NOTE: You had auth-buttons — should be auth-section

        if (menuButton && navLinks && authSection) {
            menuButton.addEventListener('click', () => {
                navLinks.classList.toggle('active');
                authSection.classList.toggle('active');
            });

            document.addEventListener('click', (event) => {
                if (
                    !menuButton.contains(event.target) &&
                    !navLinks.contains(event.target) &&
                    !authSection.contains(event.target)
                ) {
                    navLinks.classList.remove('active');
                    authSection.classList.remove('active');
                }
            });
        }

        // ✅ Optional: update username if available
        if (sessionData.loggedIn) {
            const usernameElement = document.querySelector('#username');
            if (usernameElement) {
                usernameElement.textContent = `Welcome, ${sessionData.firstName}`;
            }
        }

        // ✅ Bind logout
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                try {
                    const response = await fetch('/logout', { method: 'POST', credentials: 'include' });
                    if (response.ok) {
                        history.replaceState(null, "", window.location.pathname);
                        window.location.reload();
                    }
                } catch (error) {
                    console.error('Logout failed:', error);
                }
            });
        }

    } catch (error) {
        console.error('Navbar loading error:', error);
    }
});
