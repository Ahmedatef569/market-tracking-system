# App Icon Badge Notifications

## 📱 Overview

The Market Tracking System now supports **app icon badge notifications** that display the number of unread notifications directly on the app icon on your mobile device's home screen or desktop.

---

## ✨ Features

- **Automatic Badge Updates**: Badge count updates automatically when you receive new notifications
- **Real-time Sync**: Badge clears when you mark notifications as read
- **Cross-Platform**: Works on:
  - ✅ Android (Chrome, Edge, Samsung Internet)
  - ✅ Windows (Chrome, Edge when installed as PWA)
  - ✅ macOS (Chrome, Edge when installed as PWA)
  - ⚠️ iOS/iPadOS (Limited support - requires iOS 16.4+)

---

## 🚀 How It Works

### Installation Required
For badge notifications to work, you must **install the app** on your device:

#### On Android:
1. Open the app in Chrome
2. Tap the menu (⋮) → "Install app" or "Add to Home screen"
3. Confirm installation
4. The app icon will appear on your home screen

#### On iOS (iPhone/iPad):
1. Open the app in Safari
2. Tap the Share button (□↑)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

#### On Desktop (Windows/Mac):
1. Open the app in Chrome or Edge
2. Click the install icon (⊕) in the address bar
3. Click "Install"

### Badge Behavior

- **New Notification**: Badge shows count (e.g., "3" for 3 unread notifications)
- **Mark as Read**: Badge count decreases or clears when you mark notifications as read
- **No Notifications**: Badge disappears completely

---

## 🔧 Technical Details

### Service Worker
The app uses a Service Worker (`sw.js`) to:
- Enable offline functionality
- Manage badge updates
- Cache app assets for faster loading

### Badge API
The system uses the modern **Badge API** which is supported by:
- Chrome 81+ (Android, Windows, macOS)
- Edge 81+ (Windows, macOS)
- Samsung Internet 13+
- Safari 16.4+ (limited support)

### Automatic Updates
Badge count updates automatically when:
- New notifications arrive
- You mark notifications as read
- You open the notifications panel

---

## ❓ Troubleshooting

### Badge Not Showing?

1. **Check Installation**: Make sure the app is installed (not just bookmarked)
2. **Check Permissions**: Ensure notifications are allowed in browser settings
3. **Restart App**: Close and reopen the installed app
4. **Clear Cache**: Clear browser cache and reinstall the app

### Badge Not Updating?

1. **Refresh**: Pull down to refresh the app
2. **Check Connection**: Ensure you have internet connection
3. **Reopen App**: Close and reopen the app

### iOS Issues?

- iOS has limited Badge API support
- Requires iOS 16.4 or later
- May not work in all scenarios
- Consider using Android or Desktop for full badge support

---

## 📝 For Developers

### Files Modified
- `sw.js` - Service Worker for badge management
- `js/badge.js` - Badge API utilities
- `js/admin.js` - Admin badge integration
- `js/employee.js` - Employee badge integration
- `js/manager.js` - Manager badge integration

### API Usage
```javascript
import { updateBadge, clearBadge } from './badge.js';

// Set badge count
await updateBadge(5); // Shows "5" on app icon

// Clear badge
await clearBadge(); // Removes badge from app icon
```

---

## 🎯 Summary

✅ **Install the app** on your device for badge notifications to work  
✅ Badge shows **unread notification count** on app icon  
✅ Works best on **Android and Desktop Chrome/Edge**  
✅ Automatically updates when notifications change  

Enjoy your enhanced notification experience! 🚀

