# Welcome Popup Customization Guide

## 📍 Overview

The welcome popup appears automatically when users log in to the system. It displays as a horizontal text strip with gradient colors that slides in from right to left, stays for 3 seconds, then slides out from left to right. The popup is fully responsive and adjusts its size and font on mobile devices.

---

## 🎨 How to Change the Welcome Message

### **File to Edit:**
```
js/welcomePopup.js
```

### **Function to Modify:**
Look for the `getWelcomeMessage()` function (starts at **line 27**)

### **What to Change:**

Inside the function, you'll find this HTML template:

```javascript
function getWelcomeMessage(roleName, fullName) {
    // ⚠️ EDIT THIS TEXT TO CHANGE THE WELCOME MESSAGE ⚠️
    return `
        <div class="welcome-popup-text">
            <div class="welcome-popup-greeting">👋 Welcome</div>
            <div class="welcome-popup-name">${fullName}</div>
        </div>
    `;
    // ⚠️ END OF EDITABLE SECTION ⚠️
}
```

---

## ✏️ Customization Examples

### **Example 1: Change the Greeting Text**

**Current (Default):**
```html
<div class="welcome-popup-greeting">Welcome</div>
```

**Change to:**
```html
<div class="welcome-popup-greeting">Good Morning</div>
```
or
```html
<div class="welcome-popup-greeting">Hello</div>
```

---

### **Example 2: Add Emoji**

```html
<div class="welcome-popup-greeting">Welcome 🎉</div>
```

or

```html
<div class="welcome-popup-greeting">Hello 👋</div>
```

---

### **Example 3: Add Role Back**

**Show role with name:**
```javascript
return `
    <div class="welcome-popup-text">
        <div class="welcome-popup-greeting">👋 Welcome</div>
        <div class="welcome-popup-name">${fullName}</div>
        <div class="welcome-popup-role">${roleName}</div>
    </div>
`;
```

---

### **Example 4: Change the Emoji**

**Current (Default):**
```html
<div class="welcome-popup-greeting">👋 Welcome</div>
```

**Change to other emojis:**
```html
<div class="welcome-popup-greeting">🎉 Welcome</div>
```
or
```html
<div class="welcome-popup-greeting">🚀 Welcome</div>
```
or
```html
<div class="welcome-popup-greeting">⭐ Welcome</div>
```

**You can use any emoji directly in the text!**

---

### **Example 5: Completely Custom Message**

```javascript
return `
    <div class="welcome-popup-text">
        <div class="welcome-popup-greeting">🚀 Ready to Track!</div>
        <div class="welcome-popup-name">${fullName}</div>
        <div class="welcome-popup-role">${roleName} Dashboard</div>
    </div>
`;
```

---

## ⏱️ How to Change the Display Duration

### **File to Edit:**
- `js/admin.js` (line ~151)
- `js/manager.js` (line ~152)
- `js/employee.js` (line ~143)

### **What to Change:**

**Original (3 seconds):**
```javascript
showWelcomePopup(state.session, 3000);
```

**Change to 5 seconds:**
```javascript
showWelcomePopup(state.session, 5000);
```

**Change to 2 seconds:**
```javascript
showWelcomePopup(state.session, 2000);
```

**Note:** Duration is in milliseconds (1000ms = 1 second)

---

## 🎨 How to Change Colors and Styling

### **File to Edit:**
```
css/app.css
```

### **Section to Modify:**
Look for the `WELCOME POPUP STYLES` section (starts at **line 1542**)

### **Key CSS Classes:**

1. **`.welcome-popup`** - Main popup container (background, position, shadow)
2. **`.welcome-popup-greeting`** - The "Welcome !!" text
3. **`.welcome-popup-role`** - The role text (Admin, Manager, Product Specialist)
4. **`.welcome-popup-name`** - The user's name
5. **`.welcome-popup-icon`** - The icon circle

---

## 📝 Important Notes

1. **Keep the variables:** Always keep `${roleName}` and `${fullName}` in your message - these are replaced with actual user data
2. **Test after changes:** After editing, refresh your browser and log in again to see the changes
3. **Clear cache:** If changes don't appear, try clearing your browser cache (Ctrl+Shift+Delete)
4. **Backup first:** Before making changes, consider backing up the original file

---

## 🔧 Technical Details

- **Popup appears:** Once per login session (won't show again until you log out and log back in)
- **Position:** Top right corner, below the page header
- **Style:** Horizontal text strip with gradient background
- **Animation:**
  - **Entry:** Slides in from right to left with bounce effect
  - **Exit:** Slides out from left to right (back to where it came from)
- **Auto-dismiss:** Automatically disappears after the specified duration
- **Responsive:** Fully responsive with automatic font size and padding adjustments on:
  - Desktop (1024px+): Full size
  - Tablet (768px-1024px): Medium size
  - Mobile (480px-768px): Small size
  - Extra small mobile (<480px): Extra small size with wrapped text

---

## 🆘 Need Help?

If you encounter any issues or need assistance with customization, refer to the code comments in `js/welcomePopup.js` for additional guidance.

