/**
 * Welcome Popup Module
 * Displays a visually appealing welcome message when user logs in
 * 
 * TO CUSTOMIZE THE WELCOME MESSAGE:
 * ===================================
 * Edit the getWelcomeMessage() function below (lines 10-30)
 * Change the text inside the template literal (backticks)
 * 
 * Examples:
 * - Change "Welcome !!" to "Good Morning !!" or "Hello !!"
 * - Add emoji: "Welcome 🎉!!"
 * - Change the entire message structure
 */

/**
 * Get the welcome message based on user role and name
 * 
 * TO CHANGE THE WELCOME MESSAGE:
 * Edit the text between the backticks (`) below
 * Keep the ${roleName} and ${fullName} variables to show user info
 * 
 * @param {string} roleName - User's role (Admin, Manager, Product Specialist)
 * @param {string} fullName - User's full name
 * @returns {string} HTML string for the welcome message
 */
function getWelcomeMessage(roleName, fullName) {
    // ⚠️ EDIT THIS TEXT TO CHANGE THE WELCOME MESSAGE ⚠️
    return `
        <div class="welcome-popup-text">
            <div class="welcome-popup-greeting">👋🏻 Welcome Back!!</div>
            <div class="welcome-popup-name">${fullName}</div>
        </div>
    `;
    // ⚠️ END OF EDITABLE SECTION ⚠️
}

/**
 * Show welcome popup for the logged-in user
 * @param {Object} session - User session object containing employee data
 * @param {number} duration - Duration in milliseconds (default: 3000ms = 3 seconds)
 */
export function showWelcomePopup(session, duration = 3000) {
    if (!session || !session.employee) return;

    // Get user info
    const fullName = session.employee.fullName || 'User';
    let roleName = 'User';
    
    // Map role to display name
    if (session.role === 'admin') {
        roleName = 'Admin';
    } else if (session.role === 'manager') {
        roleName = 'Manager';
    } else if (session.role === 'employee') {
        roleName = 'Product Specialist';
    }

    // Check if popup was already shown in this session
    const popupShownKey = `welcome_popup_shown_${session.userId}`;
    const sessionPopupShown = sessionStorage.getItem(popupShownKey);
    
    if (sessionPopupShown === 'true') {
        return; // Don't show popup again in the same session
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'welcome-popup';
    popup.innerHTML = getWelcomeMessage(roleName, fullName);

    // Add to page
    document.body.appendChild(popup);

    // Trigger animation after a brief delay (for CSS transition)
    setTimeout(() => {
        popup.classList.add('welcome-popup-show');
    }, 100);

    // Remove popup after duration with exit animation (slide to left)
    setTimeout(() => {
        popup.classList.remove('welcome-popup-show');
        popup.classList.add('welcome-popup-hide');

        // Remove from DOM after exit animation completes
        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, 500); // Match CSS transition duration
    }, duration);

    // Mark popup as shown for this session
    sessionStorage.setItem(popupShownKey, 'true');
}

