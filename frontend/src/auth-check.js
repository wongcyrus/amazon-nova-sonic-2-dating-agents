// Check authentication before loading the main app
(function () {
    function checkAuth() {
        const accessToken = localStorage.getItem('accessToken');

        if (!accessToken) {
            // No token, redirect to login
            window.location.href = '/login.html';
            return false;
        }

        try {
            // Check if token is expired
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);

            if (payload.exp <= currentTime) {
                // Token expired, clear storage and redirect to login
                localStorage.clear();
                window.location.href = '/login.html';
                return false;
            }

            return true;
        } catch (error) {
            // Invalid token, clear storage and redirect to login
            localStorage.clear();
            window.location.href = '/login.html';
            return false;
        }
    }

    // Add logout functionality
    function addLogoutButton() {
        const controls = document.getElementById('controls');
        if (controls) {
            const logoutButton = document.createElement('button');
            logoutButton.textContent = 'Logout';
            logoutButton.className = 'button';
            logoutButton.style.marginLeft = '10px';
            logoutButton.onclick = function () {
                localStorage.clear();
                window.location.href = '/login.html';
            };
            controls.appendChild(logoutButton);
        }
    }

    // Check auth when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (checkAuth()) {
                addLogoutButton();
            }
        });
    } else {
        if (checkAuth()) {
            addLogoutButton();
        }
    }
})();